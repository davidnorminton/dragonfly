# Chromecast SDK Debugging Guide

## What to Check Now

### 1. Open Incognito Mode (IMPORTANT!)
```
Cmd+Shift+N (Chrome)
```

### 2. Open Developer Console
```
Cmd+Option+J (Mac)
Ctrl+Shift+J (Windows)
```

### 3. Go to Videos Page
```
http://192.168.7.190:1337
Click Videos → Play any movie
```

### 4. Check Console Logs

Look for these specific logs in order:

#### ✅ GOOD Signs (SDK Loading):
```
🔍 useChromecast hook mounted
🔍 window.chrome: Object
🔍 Checking for Cast API...
🎬 Initializing Google Cast SDK
🔍 Cast context: Object
✅ Cast SDK initialized successfully!
✅ Cast button should now appear in video player
🎬 VideoPlayer render - castAvailable: true, casting: false
```

#### ❌ BAD Signs (SDK NOT Loading):
```
⏳ Cast framework not loaded yet (attempt 1/30), waiting...
⏳ Cast framework not loaded yet (attempt 2/30), waiting...
...keeps repeating...
❌ Cast SDK failed to load after 30 seconds
```

OR:

```
🔍 window.chrome: undefined
🔍 window.chrome?.cast: undefined
```

---

## Problems & Solutions

### Problem 1: "Cast SDK failed to load after 30 seconds"

**Solution:** The Cast SDK script is blocked or not loading

1. Check Network tab in DevTools
2. Look for: `https://www.gstatic.com/cv/js/sender/v1/cast_sender.js`
3. If it's red/failed:
   - Check if gstatic.com is blocked by firewall
   - Check internet connection
   - Try different browser

### Problem 2: "Cast framework not loaded yet" keeps repeating

**Solution:** Script tag might be wrong or missing

1. In Console, type: `window.chrome.cast`
2. If it says `undefined`:
   - The script didn't load
   - Check HTML has: `<script src="https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1"></script>`

### Problem 3: SDK loads but button doesn't appear

**Solution:** Check component rendering

1. Look for: `🎬 VideoPlayer render - castAvailable: true`
2. If castAvailable is `false`, SDK didn't initialize
3. If castAvailable is `true` but no button:
   - Check CSS (button might be hidden)
   - Inspect element where fullscreen button is

### Problem 4: Button appears but clicking does nothing

**Solution:** Check Cast session

When you click the Cast button, look for:
```
🎬 Casting video: Movie Title
📡 Requesting Cast session...
🎬 Loading media to Chromecast: http://...
✅ Media loaded to Chromecast
```

If you see errors instead, that's the issue.

---

## Manual Tests

### Test 1: Is SDK Script Loading?

In Console, paste this:
```javascript
console.log('Chrome.cast:', window.chrome?.cast);
console.log('Cast.framework:', window.cast?.framework);
```

**Expected:** Both should be `Object {...}`, not `undefined`

### Test 2: Is Cast Context Available?

In Console, paste this:
```javascript
try {
  const context = window.cast.framework.CastContext.getInstance();
  console.log('Cast context works!', context);
} catch(e) {
  console.error('Cast context failed:', e);
}
```

**Expected:** "Cast context works!" message

### Test 3: Are Devices Detected?

In Console, paste this:
```javascript
const context = window.cast.framework.CastContext.getInstance();
console.log('Cast state:', context.getCastState());
```

**Expected:** One of these:
- `NO_DEVICES_AVAILABLE` = No Chromecasts on network
- `NOT_CONNECTED` = Chromecasts found, not connected
- `CONNECTING` = Connecting to Chromecast
- `CONNECTED` = Connected to Chromecast

---

## What to Report Back

Copy and paste these results:

1. **First 10 console logs** after opening video player
2. **Result of Test 1** (Chrome.cast and Cast.framework)
3. **Result of Test 2** (Cast context)
4. **Result of Test 3** (Cast state)
5. **Network tab** - is cast_sender.js loading? (Status 200?)
6. **Does Cast button appear?** Yes/No
7. **Browser:** Chrome? Version?
8. **Same network?** Is your computer on same WiFi as Chromecast?

---

## Quick Check Checklist

- [ ] Using Incognito mode (Cmd+Shift+N)
- [ ] Developer Console open (Cmd+Option+J)
- [ ] Went to http://192.168.7.190:1337 (NOT localhost)
- [ ] Computer and Chromecast on same WiFi network
- [ ] Chromecast is powered on
- [ ] Using Chrome browser (not Safari/Firefox)
- [ ] Can see console logs starting with 🔍
- [ ] Checked Network tab for cast_sender.js

---

## Expected Flow (When Working)

1. Page loads → Cast SDK script loads
2. `__onGCastApiAvailable` fires
3. `useChromecast` hook initializes
4. Cast context created
5. `castAvailable` set to `true`
6. VideoPlayer renders with Cast button visible
7. Click Cast button → Popup shows Chromecasts
8. Select Chromecast → Video plays on TV

If ANY step fails, we need to know which one!
