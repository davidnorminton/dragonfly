#!/usr/bin/env bash

# Dragonfly Linux Installation Script
# Supports Debian/Ubuntu, Fedora/RHEL, and Arch Linux
# This script installs all required system packages, PostgreSQL, Python dependencies, and builds the frontend.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_BIN="${PYTHON_BIN:-python3}"
DB_USER="${DB_USER:-dragonfly}"
DB_PASS="${DB_PASS:-dragonfly}"
DB_NAME="${DB_NAME:-dragonfly}"
HOST_ADDR="${HOST_ADDR:-0.0.0.0}"
WEB_PORT="${WEB_PORT:-1337}"
WS_PORT="${WS_PORT:-8765}"
VOSK_MODEL_URL="${VOSK_MODEL_URL:-https://alphacephei.com/vosk/models/vosk-model-en-us-0.22.zip}"
VOSK_MODEL_DIR="${VOSK_MODEL_DIR:-vosk-model-en-us-0.22}"

# Detect Linux distribution
detect_distro() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        DISTRO=$ID
        VERSION=$VERSION_ID
    elif [ -f /etc/debian_version ]; then
        DISTRO="debian"
    elif [ -f /etc/fedora-release ]; then
        DISTRO="fedora"
    elif [ -f /etc/arch-release ]; then
        DISTRO="arch"
    else
        echo "Error: Unsupported Linux distribution"
        exit 1
    fi
    echo "Detected distribution: $DISTRO"
}

# Install system packages based on distribution
install_system_packages() {
    case $DISTRO in
        ubuntu|debian)
            echo "==> Updating apt packages"
            sudo apt update
            sudo apt upgrade -y
            
            echo "==> Installing system dependencies"
            sudo apt install -y \
                python3 python3-venv python3-pip python3-dev \
                build-essential libpq-dev git curl wget \
                postgresql postgresql-contrib \
                ffmpeg libasound2-dev unzip \
                libffi-dev libssl-dev
            ;;
        fedora|rhel|centos)
            echo "==> Updating dnf packages"
            sudo dnf update -y
            
            echo "==> Installing system dependencies"
            sudo dnf install -y \
                python3 python3-pip python3-devel \
                gcc gcc-c++ make git curl wget \
                postgresql postgresql-server postgresql-contrib \
                postgresql-devel \
                ffmpeg alsa-lib-devel unzip \
                libffi-devel openssl-devel
            
            # Install Node.js from NodeSource for Fedora
            if ! command -v node &> /dev/null; then
                curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
                sudo dnf install -y nodejs
            fi
            ;;
        arch|manjaro)
            echo "==> Updating pacman packages"
            sudo pacman -Syu --noconfirm
            
            echo "==> Installing system dependencies"
            sudo pacman -S --noconfirm \
                python python-pip git curl wget \
                base-devel postgresql \
                ffmpeg alsa-lib unzip \
                libffi openssl
            
            # Install Node.js
            if ! command -v node &> /dev/null; then
                sudo pacman -S --noconfirm nodejs npm
            fi
            ;;
        *)
            echo "Error: Unsupported distribution: $DISTRO"
            exit 1
            ;;
    esac
}

# Install Node.js (if not already installed)
install_nodejs() {
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version)
        echo "Node.js already installed: $NODE_VERSION"
        return
    fi
    
    echo "==> Installing Node.js"
    case $DISTRO in
        ubuntu|debian)
            curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
            sudo apt install -y nodejs
            ;;
        arch|manjaro)
            sudo pacman -S --noconfirm nodejs npm
            ;;
    esac
    
    NODE_VERSION=$(node --version)
    echo "Node.js installed: $NODE_VERSION"
}

# Setup PostgreSQL
setup_postgresql() {
    echo "==> Setting up PostgreSQL"
    
    case $DISTRO in
        ubuntu|debian)
            sudo systemctl enable postgresql
            sudo systemctl start postgresql
            ;;
        fedora|rhel|centos)
            if [ ! -d /var/lib/pgsql/data ]; then
                sudo postgresql-setup --initdb
            fi
            sudo systemctl enable postgresql
            sudo systemctl start postgresql
            ;;
        arch|manjaro)
            if [ ! -d /var/lib/postgres/data ]; then
                sudo -u postgres initdb -D /var/lib/postgres/data
            fi
            sudo systemctl enable postgresql
            sudo systemctl start postgresql
            ;;
    esac
    
    # Wait for PostgreSQL to be ready
    echo "Waiting for PostgreSQL to start..."
    sleep 3
    
    # Create database user and database
    echo "==> Creating PostgreSQL role/database if missing"
    sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL || true
DO \$\$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
      EXECUTE format('CREATE ROLE %I WITH LOGIN PASSWORD %L', '${DB_USER}', '${DB_PASS}');
   END IF;
END
\$\$;

DO \$\$
BEGIN
   IF NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}') THEN
      EXECUTE format('CREATE DATABASE %I OWNER %I', '${DB_NAME}', '${DB_USER}');
   END IF;
END
\$\$;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
SQL
}

# Setup Python virtual environment
setup_python_env() {
    cd "$PROJECT_DIR"
    
    echo "==> Creating Python virtual environment"
    if [ ! -d "venv" ]; then
        $PYTHON_BIN -m venv venv
    fi
    
    source venv/bin/activate
    pip install --upgrade pip setuptools wheel
    
    echo "==> Installing Python dependencies"
    pip install -r requirements.txt
}

# Setup frontend
setup_frontend() {
    cd "$PROJECT_DIR"
    
    echo "==> Installing frontend dependencies"
    pushd frontend >/dev/null
    
    if [ ! -d "node_modules" ]; then
        npm install
    else
        npm install  # Update if needed
    fi
    
    echo "==> Building frontend"
    npm run build
    
    popd >/dev/null
}

# Download Vosk model (optional fallback - not required)
download_vosk_model() {
    cd "$PROJECT_DIR"
    
    echo "==> Note: Faster Whisper is the primary transcription service (automatic model download)"
    echo "==> Vosk model is optional and only used as fallback if Faster Whisper fails"
    echo "==> Skipping Vosk model download (not required)"
    
    # Uncomment below if you want Vosk as a fallback
    # mkdir -p "$PROJECT_DIR/models/vosk"
    # if [[ ! -d "$PROJECT_DIR/models/vosk/$VOSK_MODEL_DIR" ]]; then
    #     echo "Downloading Vosk model from $VOSK_MODEL_URL..."
    #     tmpzip="$(mktemp /tmp/vosk.XXXX.zip)"
    #     curl -L "$VOSK_MODEL_URL" -o "$tmpzip"
    #     unzip -o "$tmpzip" -d "$PROJECT_DIR/models/vosk"
    #     rm -f "$tmpzip"
    #     echo "Vosk model downloaded successfully"
    # else
    #     echo "Vosk model already exists, skipping download"
    # fi
}

# Create .env file
create_env_file() {
    cd "$PROJECT_DIR"
    
    ENV_FILE="$PROJECT_DIR/.env"
    if [[ ! -f "$ENV_FILE" ]]; then
        echo "==> Creating .env file"
        cat > "$ENV_FILE" <<EOF
# Server Configuration
HOST=${HOST_ADDR}
PORT=${WEB_PORT}
WEBSOCKET_PORT=${WS_PORT}

# Database Configuration
DATABASE_URL=postgresql+asyncpg://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}

# Logging
LOG_LEVEL=INFO
LOG_FILE=server.log

# AI Configuration (set these after installation)
# AI_API_KEY=your_anthropic_api_key_here
# AI_MODEL=claude-sonnet-4-5-20250929
EOF
        echo "Created $ENV_FILE"
        echo "Please edit .env to add your API keys and configuration"
    else
        echo "$ENV_FILE already exists; leaving unchanged"
    fi
}

# Create systemd service file (optional)
create_systemd_service() {
    cd "$PROJECT_DIR"
    
    SERVICE_FILE="/tmp/dragonfly.service"
    cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Dragonfly Home Assistant
After=network.target postgresql.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$PROJECT_DIR
Environment="PATH=$PROJECT_DIR/venv/bin"
ExecStart=$PROJECT_DIR/venv/bin/python $PROJECT_DIR/main.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
    
    echo ""
    echo "==> Systemd service file created at $SERVICE_FILE"
    echo "To install as a system service, run:"
    echo "  sudo cp $SERVICE_FILE /etc/systemd/system/dragonfly.service"
    echo "  sudo systemctl daemon-reload"
    echo "  sudo systemctl enable dragonfly"
    echo "  sudo systemctl start dragonfly"
}

# Main installation
main() {
    echo "=========================================="
    echo "Dragonfly Home Assistant - Linux Installer"
    echo "=========================================="
    echo ""
    
    detect_distro
    install_system_packages
    install_nodejs
    setup_postgresql
    setup_python_env
    setup_frontend
    download_vosk_model
    create_env_file
    create_systemd_service
    
    echo ""
    echo "=========================================="
    echo "Installation Complete!"
    echo "=========================================="
    echo ""
    echo "Next steps:"
    echo "1. Edit .env file to configure API keys and settings"
    echo "2. Activate virtual environment: source venv/bin/activate"
    echo "3. Run the application: python main.py"
    echo ""
    echo "Or use the run script: ./run.sh"
    echo ""
    echo "Database connection:"
    echo "  Host: localhost"
    echo "  Database: ${DB_NAME}"
    echo "  User: ${DB_USER}"
    echo "  Password: ${DB_PASS}"
    echo ""
    echo "To dump the database, run: ./scripts/dump_database.sh"
    echo ""
}

# Run main function
main "$@"
