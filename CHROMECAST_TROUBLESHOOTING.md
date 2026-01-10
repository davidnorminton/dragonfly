# 📺 Chromecast Video Streaming Troubleshooting

## Issue: TV flickers black but video doesn't play

### ✅ Fixes Applied:

1. **Added CORS headers** for Chromecast compatibility
   - `Access-Control-Allow-Origin: *`
   - `Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges`

2. **Added OPTIONS endpoint** for preflight requests

3. **Fixed MIME types** for Chromecast
   - Forcing `video/mp4` for .mp4 and .m4v files

4. **Optimized video element**
   - Changed `preload="metadata"` to `preload="auto"`
   - Removed crossOrigin attribute (can cause issues)

### 🔧 To Apply Fixes:

**Restart your server:**
```bash
# Stop current server (Ctrl+C)
cd /Users/davidnorminton/Code/dragonfly
source venv/bin/activate
python main.py
```

**Then test casting:**
1. Open http://localhost:8000 in Chrome
2. Go to Videos page
3. Click Play on a movie
4. Click the Cast icon in the video player or Chrome toolbar
5. Select your Chromecast

### 🎬 Your Library Status:

- ✅ All 17 movies are .mp4 (Chromecast compatible!)
- ✅ 26/27 episodes are .mp4
- ⚠️  1 episode is .mkv (won't work on Chromecast)

### 🔍 Common Chromecast Issues:

| Issue | Cause | Solution |
|-------|-------|----------|
| **Black flicker, no play** | CORS headers missing | ✅ Fixed - restart server |
| **Format not supported** | MKV/AVI file | Convert to MP4 in Settings |
| **Codec not supported** | HEVC/H.265 codec | Need H.264 codec |
| **Network error** | Server not accessible | Check firewall/network |

### 📱 Chromecast Requirements:

**Supported formats:**
- ✅ MP4 container
- ✅ H.264 video codec (Main/High profile, Level 4.1 or lower)
- ✅ AAC or MP3 audio codec

**NOT supported:**
- ❌ MKV container
- ❌ AVI container  
- ❌ HEVC/H.265 codec (on older Chromecasts)
- ❌ VP9 codec (unless specifically supported)

### 🧪 Test Commands:

**Check if server is accessible from network:**
```bash
# Get your local IP
ipconfig getifaddr en0

# Test from another device:
curl http://YOUR_IP:8000/api/system/stats
```

**Check video codec:**
```bash
ffprobe -v quiet -print_format json -show_streams /path/to/video.mp4
```

### 🚀 Next Steps:

1. **Restart your server** with the new code
2. **Test casting** to see if black flicker is fixed
3. **Check server logs** when casting:
   ```
   INFO: Streaming movie: 2001: A Space Odyssey
   INFO: Range request: 0-1023/2558024294
   ```
4. **If still failing:**
   - Check Chrome console (F12) for errors
   - Check server terminal for errors
   - Verify Chromecast and computer are on same network
   - Try a different movie

### 💡 Pro Tips:

- **Network**: Make sure your computer and Chromecast are on the same WiFi network
- **Firewall**: Some firewalls block casting - try temporarily disabling
- **Chrome**: Only Chrome browser supports casting HTML5 video elements
- **HTTPS**: If using HTTPS, Chromecast may have certificate issues

### 🔗 Network Access:

Your server needs to be accessible from Chromecast. By default it runs on:
- `http://0.0.0.0:8000` (accessible from network)
- `http://localhost:8000` (only local machine)

Chromecast will access: `http://YOUR_LOCAL_IP:8000/api/video/stream/{id}`

**Find your local IP:**
```bash
# macOS
ipconfig getifaddr en0

# Linux
hostname -I | awk '{print $1}'
```

### ❓ Still Not Working?

Run this diagnostic:
```bash
cd /Users/davidnorminton/Code/dragonfly
python test_video_streaming.py
```

Then share:
1. Server terminal output when you try to cast
2. Chrome console errors (F12)
3. Chromecast model/generation
