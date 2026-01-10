# 🔍 CHROMECAST DEBUGGING - FINAL CHECKLIST

## The Problem You're Having:
Chromecast shows black flicker, then nothing plays.

## The Root Cause We Found:
Video URLs were using `localhost` instead of your network IP `192.168.7.190`.
Chromecast can't access "localhost" - it needs the actual IP address.

## The Fix We Applied:
1. ✅ Added `/api/system/network-info` endpoint that returns: `192.168.7.190`
2. ✅ Updated VideoPlayer component to fetch network IP
3. ✅ Changed video URLs from `localhost` to `192.168.7.190`
4. ✅ Rebuilt frontend
5. ✅ Restarted server

## CRITICAL: Browser Cache Issue

**YOUR BROWSER IS SERVING OLD CODE!**

Even with Cmd+Shift+R, the React app bundle might be cached.

### Solution 1: Clear ALL Cache
```
1. Chrome → Settings
2. Search: "Clear browsing data"
3. Check: "Cached images and files"
4. Time range: "All time"
5. Clear data
6. Close ALL Chrome tabs
7. Restart Chrome
8. Go to: http://localhost:1337
```

### Solution 2: Incognito Mode (Fastest Test)
```
1. Cmd+Shift+N (new incognito window)
2. Go to: http://localhost:1337
3. Videos → Play a movie
4. F12 → Console
5. Look for: "Network IP: 192.168.7.190"
```

### Solution 3: Use Network IP Directly
```
Instead of: http://localhost:1337
Use: http://192.168.7.190:1337

This guarantees you're not hitting cached localhost version.
```

## DIAGNOSTIC TEST PAGE

Open this to see exactly what's happening:
**http://localhost:1337/test_chromecast.html**

This page shows:
- ❌ Wrong URL with localhost
- ✅ Correct URL with network IP
- Whether video loads
- All error messages

## What You Should See in Console:

### ✅ CORRECT (Fix Working):
```
🎬 VideoPlayer mounted: {videoId: 96, ...}
🌐 Network IP: 192.168.7.190
📍 Video URL for Chromecast: http://192.168.7.190:1337/api/video/stream/96
📍 This URL will work with Chromecast (uses network IP, not localhost)
```

### ❌ WRONG (Old Code Cached):
```
🎬 VideoPlayer mounted: {videoId: 96, ...}
📍 Video URL (full): http://localhost:1337/api/video/stream/96
```

If you see `localhost`, the old code is still cached!

## Server Verification:

Test the endpoint:
```bash
curl http://localhost:1337/api/system/network-info
```

Should return:
```json
{
  "hostname": "davids-MacBook-Air.local",
  "local_ip": "127.0.0.1",
  "network_ip": "192.168.7.190",
  "port": 1337
}
```

## Final Test Steps:

1. **Open Incognito**: Cmd+Shift+N
2. **Go to**: http://192.168.7.190:1337 (use IP, not localhost!)
3. **Videos** → Select movie → **Play**
4. **F12** → Console tab
5. **Verify**: You see "Network IP: 192.168.7.190"
6. **Cast**: Click Cast icon
7. **Select**: Your Chromecast
8. **Watch**: Video should play immediately!

## If STILL Not Working After Cache Clear:

Send me:
1. Screenshot of browser console (F12) when you click Play
2. What URL are you accessing? (localhost or 192.168.7.190?)
3. What does the console show for "Video URL"?
4. Any red errors in console?

## Quick Reference:

| Issue | Solution |
|-------|----------|
| Video uses `localhost` | Clear cache or use incognito |
| "Network IP: 192.168.7.190" | Fix is working! Try casting |
| No console logs at all | Video player not loading - check for errors |
| Video plays in browser but not Chromecast | Network/firewall issue |

## Nuclear Option - Force Fresh Install:

```bash
# Clear ALL built files
rm -rf web/static/assets/*

# Rebuild
cd frontend
npm run build

# Restart server
pkill -9 -f "python.*main.py"
cd ..
python main.py
```

Then access via: http://192.168.7.190:1337 (NOT localhost!)

---

**TL;DR: Try incognito mode first - it bypasses all cache!**
**Access: http://192.168.7.190:1337 (use IP, not localhost)**
