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

# Create fresh venv
echo "Creating fresh venv..."
python3 -m venv venv

# Activate it
echo "Activating venv..."
source venv/bin/activate

# Upgrade pip
echo "Upgrading pip..."
pip install --upgrade pip

# Install requirements
echo "Installing requirements..."
pip install -r requirements.txt

echo ""
echo "Done! Now run: source venv/bin/activate && nohup python main.py > server.log 2>&1 &"
