#!/usr/bin/env bash

# Dragonfly Raspberry Pi install script
# This sets up system packages, PostgreSQL, Python venv, and builds the frontend.
# Tested on Raspberry Pi OS / Debian-based distros.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_BIN="${PYTHON_BIN:-python3}"
DB_USER="${DB_USER:-dragonfly}"
DB_PASS="${DB_PASS:-dragonfly}"
DB_NAME="${DB_NAME:-dragonfly}"
HOST_ADDR="${HOST_ADDR:-0.0.0.0}"
WEB_PORT="${WEB_PORT:-1337}"
WS_PORT="${WS_PORT:-8765}"

echo "==> Updating apt packages"
sudo apt update
sudo apt upgrade -y

echo "==> Installing system dependencies (Python, build tools, Node.js, PostgreSQL)"
sudo apt install -y \
  python3 python3-venv python3-pip python3-dev \
  build-essential libpq-dev git curl \
  postgresql postgresql-contrib \
  nodejs npm

echo "==> Ensuring PostgreSQL is running"
sudo systemctl enable postgresql
sudo systemctl start postgresql

echo "==> Creating PostgreSQL role/database if missing"
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
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
SQL

cd "$PROJECT_DIR"

echo "==> Creating Python virtual environment"
$PYTHON_BIN -m venv venv
source venv/bin/activate
pip install --upgrade pip

echo "==> Installing Python dependencies"
pip install -r requirements.txt

echo "==> Writing .env (if not present)"
ENV_FILE="$PROJECT_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  cat > "$ENV_FILE" <<EOF
HOST=${HOST_ADDR}
PORT=${WEB_PORT}
WEBSOCKET_PORT=${WS_PORT}
DATABASE_URL=postgresql+asyncpg://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}
LOG_LEVEL=INFO
EOF
  echo "Created $ENV_FILE"
else
  echo "$ENV_FILE already exists; leaving unchanged"
fi

echo "==> Installing frontend dependencies"
pushd frontend >/dev/null
npm install
echo "==> Building frontend"
npm run build
popd >/dev/null

echo "==> Setup complete."
echo "To run:"
echo "  source venv/bin/activate"
echo "  DATABASE_URL=postgresql+asyncpg://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME} python main.py"


