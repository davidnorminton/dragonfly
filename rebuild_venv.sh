#!/bin/bash
# Complete venv rebuild script for Linux

cd ~/Code/dragonfly

# Stop server
echo "Stopping server..."
pkill -f 'python.*main.py'
sleep 2

# Remove old venv completely
echo "Removing old venv..."
rm -rf venv

# Clear pip cache
echo "Clearing pip cache..."
rm -rf ~/.cache/pip

# Create fresh venv
echo "Creating fresh venv..."
python3 -m venv venv

# Activate it
echo "Activating venv..."
source venv/bin/activate

# Upgrade pip and setuptools
echo "Upgrading pip and setuptools..."
pip install --upgrade pip setuptools wheel

# Install requirements (no cache)
echo "Installing requirements..."
pip install --no-cache-dir -r requirements.txt

echo ""
echo "Done! Now run: source venv/bin/activate && nohup python main.py > server.log 2>&1 &"
