# Migration Guide: macOS/Windows to Linux

Complete guide for migrating Dragonfly Home Assistant from macOS or Windows to Linux.

---

## 📋 Pre-Migration Checklist

Before starting migration:

- [ ] Current system is working correctly
- [ ] All API keys are documented or accessible
- [ ] Database is accessible
- [ ] Important data is backed up
- [ ] Linux system is ready (see LINUX_INSTALLATION.md)

---

## 🔄 Migration Steps

### Step 1: Export Database

#### If using PostgreSQL:

```bash
# On your current system (macOS/Windows)
pg_dump -h localhost -U dragonfly -d dragonfly \
    --clean --if-exists --create \
    --format=plain \
    > dragonfly_dump.sql

# Compress the dump
gzip dragonfly_dump.sql
```

#### If using SQLite (if applicable):

```bash
# On your current system
sqlite3 database.db .dump > dragonfly_dump.sql
gzip dragonfly_dump.sql
```

**Alternative**: Use the dump script:
```bash
./scripts/dump_database.sh
```

### Step 2: Backup Configuration Files

```bash
# Backup important config files
tar -czf dragonfly_config_backup.tar.gz \
    config/api_keys.json \
    config/location.json \
    config/personas/ \
    .env \
    config/router_config.json
```

### Step 3: Backup Data Files (Optional)

```bash
# Backup audio files, transcripts, etc.
tar -czf dragonfly_data_backup.tar.gz \
    data/audio/ \
    data/transcripts/ \
    models/vosk/
```

### Step 4: Transfer Files to Linux

#### Option A: Using rsync (Recommended)

```bash
# From your current system
rsync -av --progress \
    --exclude='venv' \
    --exclude='node_modules' \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    --exclude='.git' \
    --exclude='database_dumps' \
    /path/to/dragonfly/ \
    user@linux-server:/path/to/dragonfly/
```

#### Option B: Using scp

```bash
# Transfer project directory
scp -r /path/to/dragonfly user@linux-server:/path/to/

# Transfer database dump
scp dragonfly_dump.sql.gz user@linux-server:/path/to/dragonfly/

# Transfer config backup
scp dragonfly_config_backup.tar.gz user@linux-server:/path/to/dragonfly/
```

#### Option C: Using Git

```bash
# Commit and push all changes
git add .
git commit -m "Pre-migration backup"
git push

# On Linux system
git clone https://github.com/yourusername/dragonfly.git
cd dragonfly
```

### Step 5: Install on Linux

```bash
# SSH into Linux system
ssh user@linux-server

# Navigate to project directory
cd /path/to/dragonfly

# Run installation script
chmod +x install_linux.sh
./install_linux.sh
```

### Step 6: Restore Database

```bash
# Restore from dump
./scripts/restore_database.sh dragonfly_dump.sql.gz
```

**Or manually:**
```bash
gunzip -c dragonfly_dump.sql.gz | psql -h localhost -U dragonfly -d postgres
```

### Step 7: Restore Configuration

```bash
# Extract config backup
tar -xzf dragonfly_config_backup.tar.gz

# Restore data files (if backed up)
tar -xzf dragonfly_data_backup.tar.gz
```

### Step 8: Update Configuration

Edit `.env` file for Linux paths:

```bash
nano .env
```

Update if needed:
- Database connection string
- File paths (if different)
- Port numbers
- Host addresses

### Step 9: Verify Installation

```bash
# Activate virtual environment
source venv/bin/activate

# Test database connection
python -c "from database.base import engine; import asyncio; asyncio.run(engine.connect())"

# Start application
python main.py
```

### Step 10: Test Functionality

- [ ] Web interface loads
- [ ] Database queries work
- [ ] API endpoints respond
- [ ] AI services work (if API keys configured)
- [ ] TTS works (if configured)
- [ ] Transcription works
- [ ] File uploads work

---

## 🔧 Post-Migration Tasks

### 1. Update File Permissions

```bash
# Fix ownership
sudo chown -R $USER:$USER /path/to/dragonfly

# Fix script permissions
chmod +x *.sh
chmod +x scripts/*.sh
chmod +x scripts/*.py
```

### 2. Configure System Service (Optional)

```bash
# Create systemd service
sudo nano /etc/systemd/system/dragonfly.service
# (See LINUX_INSTALLATION.md for service file content)

sudo systemctl daemon-reload
sudo systemctl enable dragonfly
sudo systemctl start dragonfly
```

### 3. Set Up Automatic Backups

```bash
# Add to crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * /path/to/dragonfly/scripts/dump_database.sh >> /var/log/dragonfly_backup.log 2>&1
```

### 4. Configure Firewall (if needed)

```bash
# Ubuntu/Debian
sudo ufw allow 1337/tcp
sudo ufw allow 8765/tcp

# Fedora/RHEL
sudo firewall-cmd --permanent --add-port=1337/tcp
sudo firewall-cmd --permanent --add-port=8765/tcp
sudo firewall-cmd --reload
```

---

## ⚠️ Common Migration Issues

### Database Connection Errors

**Problem**: Cannot connect to PostgreSQL

**Solution**:
```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Check connection
psql -h localhost -U dragonfly -d dragonfly

# Verify .env DATABASE_URL
cat .env | grep DATABASE_URL
```

### Path Differences

**Problem**: File paths are different on Linux

**Solution**:
- Update paths in `.env`
- Check `config/settings.py` for hardcoded paths
- Use relative paths where possible

### Permission Issues

**Problem**: Permission denied errors

**Solution**:
```bash
# Fix ownership
sudo chown -R $USER:$USER /path/to/dragonfly

# Fix permissions
find /path/to/dragonfly -type d -exec chmod 755 {} \;
find /path/to/dragonfly -type f -exec chmod 644 {} \;
chmod +x /path/to/dragonfly/*.sh
```

### Missing Dependencies

**Problem**: Import errors or missing modules

**Solution**:
```bash
# Reinstall Python dependencies
source venv/bin/activate
pip install -r requirements.txt --force-reinstall

# Rebuild frontend
cd frontend
rm -rf node_modules
npm install
npm run build
```

---

## 📊 Migration Checklist

- [ ] Database exported and compressed
- [ ] Configuration files backed up
- [ ] Data files backed up (optional)
- [ ] Files transferred to Linux system
- [ ] Linux installation completed
- [ ] Database restored successfully
- [ ] Configuration files restored
- [ ] `.env` file updated
- [ ] Application starts without errors
- [ ] All features tested and working
- [ ] Systemd service configured (optional)
- [ ] Automatic backups configured
- [ ] Firewall configured (if needed)

---

## 🔄 Rollback Plan

If migration fails, you can rollback:

1. **Keep original system running** until migration is verified
2. **Test on Linux** before decommissioning old system
3. **Keep backups** of both systems
4. **Document** any issues encountered

---

## 📝 Migration Notes

Document any issues or customizations:

- Database size and migration time
- Any manual steps required
- Configuration changes made
- Issues encountered and solutions
- Performance differences

---

**Migration Date**: Record when migration was completed
**Source System**: macOS/Windows version
**Target System**: Linux distribution and version
