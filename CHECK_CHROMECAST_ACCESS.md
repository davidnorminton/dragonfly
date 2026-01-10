# Check if Chromecast is Accessing Video URL

## Backend Logs to Monitor

When Chromecast tries to play a video, it will make HTTP requests to your server.

### 1. Start Fresh Terminal for Backend Logs

```bash
cd /Users/davidnorminton/Code/dragonfly
python main.py
```

### 2. What to Look For

When you cast a video, you should see these logs in the terminal:

```
INFO:     192.168.7.XXX:XXXXX - "HEAD /api/video/stream/90 HTTP/1.1" 200 OK
INFO:     192.168.7.XXX:XXXXX - "GET /api/video/stream/90 HTTP/1.1" 206 Partial Content
```

- **HEAD request** = Chromecast checking video metadata
- **GET request with 206** = Chromecast downloading video chunks
- **IP should be Chromecast's IP** (not your computer's 192.168.7.190)

### 3. If You See NO Requests

This means:
- ❌ Cast session is NOT establishing
- ❌ Chromecast never received the video URL
- ❌ Our media load command isn't working

### 4. If You See Requests But Video Doesn't Play

Check for:
- `404 errors` = Wrong URL
- `500 errors` = Server error
- `403 errors` = Permission/CORS issue

### 5. Current Issue

Based on the console logs showing `casting: false` after clicking Cast button:
- The Cast SDK popup appears ✅
- You can select your Chromecast ✅
- But `SESSION_STATE_CHANGED` event is NOT firing ❌
- Session is never established ❌

This suggests the Cast SDK itself is having an issue connecting to your Chromecast, NOT our code.

## Possible Reasons

1. **Firewall blocking Cast SDK communication**
2. **Chromecast on different VLAN/network segment**
3. **Cast SDK needs SSL (HTTPS) for some Chromecasts**
4. **Chrome browser issue** - try different browser or Chrome update

## Next Test

After rebuilding, try casting again and look for:
```
🔔 SESSION_STATE_CHANGED EVENT FIRED!
📡 SESSION_STARTING - Connecting to Chromecast...
✅ SESSION_STARTED - Connected to Chromecast!
```

OR errors:
```
❌ SESSION_START_FAILED - Could not connect
❌ Error code: ...
```

The error code will tell us exactly what's wrong!
