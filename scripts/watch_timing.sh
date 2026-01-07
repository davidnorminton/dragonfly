#!/bin/bash
# Watch timing logs in real-time

echo "🔍 Watching AI Focus Mode Performance Logs..."
echo "================================================"
echo "Ask a question in AI Focus mode, and timing will appear below:"
echo ""

tail -f /tmp/dragonfly.log | grep --line-buffered -E "AI FAST|AI ASK STREAM|Generating audio|Generated audio"

