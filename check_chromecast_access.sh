#!/bin/bash

echo "🔍 Chromecast Connectivity Check"
echo "================================"
echo ""

# Get local IP
LOCAL_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1)

if [ -z "$LOCAL_IP" ]; then
    echo "❌ Could not detect local IP address"
    echo "   Try: System Preferences → Network to find your IP"
    exit 1
fi

echo "🌐 Your local IP: $LOCAL_IP"
echo ""

# Check if server is running
echo "1️⃣  Checking if server is running..."
if curl -s http://localhost:8000/api/system/stats > /dev/null 2>&1; then
    echo "   ✅ Server running on localhost"
else
    echo "   ❌ Server NOT running"
    echo "   Start it with: python main.py"
    exit 1
fi

echo ""
echo "2️⃣  Checking if server accessible from network IP..."
if curl -s --connect-timeout 3 http://$LOCAL_IP:8000/api/system/stats > /dev/null 2>&1; then
    echo "   ✅ Server accessible on network ($LOCAL_IP:8000)"
else
    echo "   ❌ Server NOT accessible from network IP"
    echo "   This is the problem! Chromecast can't reach your server."
    echo ""
    echo "   Fix: Check your firewall settings"
    echo "   macOS: System Preferences → Security & Privacy → Firewall"
    echo "   Allow incoming connections for Python"
    exit 1
fi

echo ""
echo "3️⃣  Getting a test video..."
VIDEO_ID=$(cd /Users/davidnorminton/Code/dragonfly && python3 -c "
import asyncio
from database.base import AsyncSessionLocal
from database.models import VideoMovie
from sqlalchemy import select

async def get_id():
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(VideoMovie).limit(1))
        movie = result.scalar_one_or_none()
        if movie:
            print(movie.id)
        else:
            print('')

asyncio.run(get_id())
" 2>/dev/null)

if [ -z "$VIDEO_ID" ]; then
    echo "   ❌ No videos in database"
    exit 1
fi

echo "   📽️  Using video ID: $VIDEO_ID"

echo ""
echo "4️⃣  Testing video stream endpoint..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://$LOCAL_IP:8000/api/video/stream/$VIDEO_ID)

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "206" ]; then
    echo "   ✅ Video endpoint working! (HTTP $HTTP_CODE)"
else
    echo "   ❌ Video endpoint failed (HTTP $HTTP_CODE)"
    exit 1
fi

echo ""
echo "5️⃣  Testing HEAD request (required by Chromecast)..."
HTTP_CODE=$(curl -s -I -o /dev/null -w "%{http_code}" http://$LOCAL_IP:8000/api/video/stream/$VIDEO_ID)

if [ "$HTTP_CODE" = "200" ]; then
    echo "   ✅ HEAD request working! (HTTP $HTTP_CODE)"
else
    echo "   ⚠️  HEAD request returned $HTTP_CODE (expected 200)"
fi

echo ""
echo "================================"
echo "✅ All checks passed!"
echo ""
echo "📺 Chromecast should be able to access:"
echo "   http://$LOCAL_IP:8000/api/video/stream/$VIDEO_ID"
echo ""
echo "Next steps:"
echo "  1. Make sure Chromecast is on same WiFi network"
echo "  2. Open Chrome browser on this computer"
echo "  3. Go to: http://localhost:8000"
echo "  4. Play a video"
echo "  5. Click the Cast icon in Chrome"
echo "  6. Select your Chromecast"
echo ""
echo "🐛 Debug: If casting still fails, check Chrome console (F12)"
