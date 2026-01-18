# Dragonfly Linux Installation Guide

Complete guide for installing Dragonfly Home Assistant on Linux systems (Debian/Ubuntu, Fedora/RHEL, Arch Linux).

---

## 📋 Prerequisites

- Linux distribution (Debian/Ubuntu, Fedora/RHEL/CentOS, or Arch Linux)
- Root/sudo access for package installation
- Internet connection for downloading dependencies
- At least 2GB RAM (4GB+ recommended)
- 5GB+ free disk space

---

## 🚀 Quick Installation

### Automated Installation (Recommended)

Run the installation script:

```bash
chmod +x install_linux.sh
./install_linux.sh
```

The script will:
- Detect your Linux distribution
- Install all required system packages
- Set up PostgreSQL database
- Create Python virtual environment
- Install Python dependencies
- Build the frontend
- Set up Faster Whisper (automatic model download on first use)
- Create configuration files

**Installation time**: 10-30 minutes depending on your system and internet speed.

---

## 📦 Manual Installation

If you prefer to install manually or the script fails, follow these steps:

### 1. System Dependencies

#### Debian/Ubuntu:
```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y \
    python3 python3-venv python3-pip python3-dev \
    build-essential libpq-dev git curl wget \
    postgresql postgresql-contrib \
    ffmpeg libasound2-dev unzip \
    libffi-dev libssl-dev \
    nodejs npm
```

#### Fedora/RHEL/CentOS:
```bash
sudo dnf update -y
sudo dnf install -y \
    python3 python3-pip python3-devel \
    gcc gcc-c++ make git curl wget \
    postgresql postgresql-server postgresql-contrib postgresql-devel \
    ffmpeg alsa-lib-devel unzip \
    libffi-devel openssl-devel

# Install Node.js
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs
```

#### Arch Linux:
```bash
sudo pacman -Syu
sudo pacman -S --noconfirm \
    python python-pip git curl wget \
    base-devel postgresql \
    ffmpeg alsa-lib unzip \
    libffi openssl \
    nodejs npm
```

### 2. PostgreSQL Setup

#### Start PostgreSQL:
```bash
# Debian/Ubuntu
sudo systemctl enable postgresql
sudo systemctl start postgresql

# Fedora/RHEL (first time only)
sudo postgresql-setup --initdb
sudo systemctl enable postgresql
sudo systemctl start postgresql

# Arch Linux (first time only)
sudo -u postgres initdb -D /var/lib/postgres/data
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

#### Create Database:
```bash
sudo -u postgres psql <<SQL
CREATE ROLE dragonfly WITH LOGIN PASSWORD 'dragonfly';
CREATE DATABASE dragonfly OWNER dragonfly;
GRANT ALL PRIVILEGES ON DATABASE dragonfly TO dragonfly;
\q
SQL
```

### 3. Python Environment

```bash
cd /path/to/dragonfly

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Upgrade pip
pip install --upgrade pip setuptools wheel

# Install dependencies
pip install -r requirements.txt
```

### 4. Frontend Build

```bash
cd frontend
npm install
npm run build
cd ..
```

### 5. Configuration

Create `.env` file in project root:

```bash
cat > .env <<EOF
HOST=0.0.0.0
PORT=1337
WEBSOCKET_PORT=8765
DATABASE_URL=postgresql+asyncpg://dragonfly:dragonfly@localhost:5432/dragonfly
LOG_LEVEL=INFO
LOG_FILE=server.log
EOF
```

### 6. Transcription Service (Faster Whisper)

Dragonfly uses **Faster Whisper** as the primary transcription service:

- **Automatic**: Models are downloaded automatically on first use (~140MB)
- **Faster**: 2x faster than previous transcription services (250-500ms)
- **Accurate**: 95% accuracy
- **No setup required**: Just start using the application

**Optional - Vosk Fallback**: If you want Vosk as a backup fallback:

```bash
mkdir -p models/vosk
cd models/vosk
wget https://alphacephei.com/vosk/models/vosk-model-en-us-0.22.zip
unzip vosk-model-en-us-0.22.zip
cd ../..
```

Note: Vosk is only used if Faster Whisper fails. Faster Whisper should work out of the box.

---

## 🗄️ Database Management

### Dump Database

Create a backup of your database:

```bash
chmod +x scripts/dump_database.sh
./scripts/dump_database.sh
```

This creates a compressed SQL dump in `database_dumps/` directory with timestamp.

**Manual dump:**
```bash
pg_dump -h localhost -U dragonfly -d dragonfly --clean --if-exists --create > dump.sql
gzip dump.sql
```

### Restore Database

Restore from a dump file:

```bash
chmod +x scripts/restore_database.sh
./scripts/restore_database.sh database_dumps/dragonfly_dump_YYYYMMDD_HHMMSS.sql.gz
```

**Manual restore:**
```bash
gunzip -c dump.sql.gz | psql -h localhost -U dragonfly -d postgres
```

### Database Connection String Format

```
postgresql+asyncpg://USER:PASSWORD@HOST:PORT/DATABASE
```

Example:
```
postgresql+asyncpg://dragonfly:dragonfly@localhost:5432/dragonfly
```

---

## 🏃 Running the Application

### Development Mode

```bash
source venv/bin/activate
python main.py
```

Or use the run script:
```bash
./run.sh
```

### Production Mode (Systemd Service)

1. Create systemd service file:
```bash
sudo nano /etc/systemd/system/dragonfly.service
```

2. Add service:
```ini
[Unit]
Description=Dragonfly Home Assistant
After=network.target postgresql.service

[Service]
Type=simple
User=your_username
WorkingDirectory=/path/to/dragonfly
Environment="PATH=/path/to/dragonfly/venv/bin"
ExecStart=/path/to/dragonfly/venv/bin/python /path/to/dragonfly/main.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

3. Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable dragonfly
sudo systemctl start dragonfly
sudo systemctl status dragonfly
```

---

## 🔧 Configuration

### Environment Variables (.env)

Edit `.env` file to configure:

```bash
# Server
HOST=0.0.0.0              # Bind address
PORT=1337                  # Web server port
WEBSOCKET_PORT=8765       # WebSocket port

# Database
DATABASE_URL=postgresql+asyncpg://user:pass@host:port/dbname

# Logging
LOG_LEVEL=INFO             # DEBUG, INFO, WARNING, ERROR
LOG_FILE=server.log        # Log file path (optional)

# AI (set after installation)
AI_API_KEY=your_key_here
AI_MODEL=claude-sonnet-4-5-20250929
```

### API Keys

Add API keys via the web interface (Settings page) or edit `config/api_keys.json`:

```json
{
  "anthropic": {
    "api_key": "your_anthropic_key"
  },
  "fish_audio": {
    "api_key": "your_fish_audio_key"
  }
}
```

---

## 📊 System Requirements

### Minimum:
- **CPU**: 2 cores
- **RAM**: 2GB
- **Storage**: 5GB
- **OS**: Linux (Debian/Ubuntu, Fedora/RHEL, Arch)

### Recommended:
- **CPU**: 4+ cores
- **RAM**: 4GB+
- **Storage**: 20GB+ (for audio files, models, database)
- **OS**: Ubuntu 22.04 LTS or Debian 12

### For AI Processing:
- **RAM**: 8GB+ (for Faster Whisper model)
- **Storage**: 10GB+ (for models and audio cache)

---

## 🔍 Troubleshooting

### PostgreSQL Connection Issues

**Error**: `connection refused` or `authentication failed`

**Solution**:
```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Check PostgreSQL configuration
sudo nano /etc/postgresql/*/main/pg_hba.conf
# Ensure: local all all md5

# Restart PostgreSQL
sudo systemctl restart postgresql
```

### Python Dependencies Fail

**Error**: `Failed building wheel` or `No module named X`

**Solution**:
```bash
# Install build dependencies
sudo apt install -y python3-dev libpq-dev build-essential  # Debian/Ubuntu
sudo dnf install -y python3-devel postgresql-devel gcc      # Fedora

# Upgrade pip and rebuild
source venv/bin/activate
pip install --upgrade pip setuptools wheel
pip install -r requirements.txt --no-cache-dir
```

### Frontend Build Fails

**Error**: `npm ERR!` or build errors

**Solution**:
```bash
# Clear npm cache
npm cache clean --force

# Remove node_modules and reinstall
rm -rf frontend/node_modules frontend/package-lock.json
cd frontend
npm install
npm run build
```

### Port Already in Use

**Error**: `Address already in use`

**Solution**:
```bash
# Find process using port 1337
sudo lsof -i :1337
# or
sudo netstat -tulpn | grep 1337

# Kill the process or change port in .env
```

### Permission Denied

**Error**: Permission errors on files/directories

**Solution**:
```bash
# Fix ownership
sudo chown -R $USER:$USER /path/to/dragonfly

# Fix permissions
chmod +x install_linux.sh
chmod +x run.sh
chmod +x scripts/*.sh
```

---

## 📝 Post-Installation Checklist

- [ ] PostgreSQL is running (`sudo systemctl status postgresql`)
- [ ] Database created and accessible
- [ ] Python virtual environment activated
- [ ] All Python dependencies installed
- [ ] Frontend built successfully
- [ ] `.env` file configured
- [ ] API keys added (via Settings page)
- [ ] Application starts without errors
- [ ] Web interface accessible
- [ ] Database dump script tested

---

## 🔄 Migration from macOS/Windows

### 1. Export Database

On your current system:
```bash
# If using PostgreSQL
pg_dump -h localhost -U dragonfly -d dragonfly --clean --if-exists --create > dump.sql
gzip dump.sql

# If using SQLite (if applicable)
sqlite3 database.db .dump > dump.sql
```

### 2. Transfer Files

```bash
# Copy project files (excluding venv, node_modules, __pycache__)
rsync -av --exclude='venv' --exclude='node_modules' --exclude='__pycache__' \
    --exclude='*.pyc' --exclude='.env' \
    /path/to/dragonfly/ user@linux-server:/path/to/dragonfly/
```

### 3. Install on Linux

```bash
./install_linux.sh
```

### 4. Restore Database

```bash
./scripts/restore_database.sh dump.sql.gz
```

### 5. Configure

- Edit `.env` with correct paths and settings
- Add API keys via Settings page
- Test the application

---

## 🛠️ Maintenance

### Update Dependencies

```bash
source venv/bin/activate
pip install --upgrade -r requirements.txt

cd frontend
npm update
npm run build
```

### Backup Database Regularly

Add to crontab:
```bash
crontab -e
# Add: 0 2 * * * /path/to/dragonfly/scripts/dump_database.sh
```

### View Logs

```bash
# Application logs
tail -f server.log

# Systemd service logs
sudo journalctl -u dragonfly -f
```

---

## 📚 Additional Resources

- **Project README**: See `README.md` for feature documentation
- **Database Models**: See `database/models.py` for schema
- **API Documentation**: Available at `http://localhost:1337/docs` when running
- **Troubleshooting**: Check logs in `server.log` or systemd journal

---

## ✅ Verification

After installation, verify everything works:

```bash
# 1. Check PostgreSQL
psql -h localhost -U dragonfly -d dragonfly -c "SELECT version();"

# 2. Check Python environment
source venv/bin/activate
python --version
pip list | grep fastapi

# 3. Check Node.js
node --version
npm --version

# 4. Start application
python main.py

# 5. Access web interface
# Open browser to http://localhost:1337
```

---

## 🆘 Support

If you encounter issues:

1. Check the logs: `tail -f server.log`
2. Verify all services are running
3. Review the troubleshooting section above
4. Check GitHub issues for similar problems

---

**Installation Date**: $(date)
**Script Version**: 1.0.0
