#!/bin/bash

echo "🔄 Restarting Dragonfly Server for Chromecast Fix"
echo "=================================================="
echo ""

# Kill existing server
echo "1️⃣  Stopping any running server..."
pkill -f "python.*main.py" 2>/dev/null
sleep 2

if pgrep -f "python.*main.py" > /dev/null; then
    echo "   ⚠️  Forcing kill..."
    pkill -9 -f "python.*main.py"
    sleep 1
fi

echo "   ✅ Server stopped"
echo ""

# Verify build
echo "2️⃣  Checking frontend build..."
if [ -d "web/static/assets" ]; then
    ASSET_COUNT=$(ls web/static/assets/*.js 2>/dev/null | wc -l)
    echo "   ✅ Found $ASSET_COUNT JS files in web/static/assets/"
else
    echo "   ❌ web/static/assets not found!"
    exit 1
fi

echo ""
echo "3️⃣  Starting server..."
source venv/bin/activate
nohup python main.py > server.log 2>&1 &
SERVER_PID=$!

echo "   Server PID: $SERVER_PID"
echo "   Waiting for startup..."
sleep 5

# Check if server is running
if curl -s http://localhost:1337/api/system/stats > /dev/null 2>&1; then
    echo "   ✅ Server is running!"
    
    # Get local IP
    LOCAL_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1)
    
    echo ""
    echo "=================================================="
    echo "✅ Server Started Successfully!"
    echo ""
    echo "📍 Access URLs:"
    echo "   Local:   http://localhost:1337"
    echo "   Network: http://$LOCAL_IP:1337"
    echo ""
    echo "📺 For Chromecast:"
    echo "   1. Open Chrome browser"
    echo "   2. Go to http://localhost:1337"
    echo "   3. Navigate to Videos page"
    echo "   4. Click Play on a movie"
    echo "   5. Press F12 and check console for:"
    echo "      '📍 Video URL (full): http://$LOCAL_IP:1337/api/video/stream/XX'"
    echo "   6. Click Cast icon and select Chromecast"
    echo ""
    echo "📋 Server logs: tail -f server.log"
    echo "🛑 Stop server: pkill -f 'python.*main.py'"
    echo ""
else
    echo "   ❌ Server failed to start!"
    echo "   Check server.log for errors"
    tail -20 server.log
    exit 1
fi
