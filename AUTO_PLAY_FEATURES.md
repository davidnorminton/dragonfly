# Auto-Play & Progress Tracking Features

## ✅ Features Implemented

### 1. **Auto-Play Next Episode**
When casting TV episodes to Chromecast, the system automatically plays the next episode when the current one ends.

**How it works:**
- Detects when current episode finishes playing
- Automatically looks up the next episode in the season
- If it's the last episode of a season, jumps to the first episode of the next season
- Loads and starts playback automatically with a 2-second delay
- Works for both local playback and Chromecast casting

### 2. **Playback Progress Tracking**
Remembers where you left off watching any video (movie or episode).

**How it works:**
- Automatically saves your position every 10 seconds during playback
- Saves final position when video ends
- Marks video as "completed" if you watch more than 90%
- Automatically resumes from last position (if >10 seconds and not completed)
- Works for both local playback and Chromecast casting

---

## 🗄️ Database

### New Table: `video_playback_progress`

| Column | Type | Description |
|--------|------|-------------|
| `id` | Integer | Primary key |
| `video_type` | String | 'movie' or 'episode' |
| `video_id` | Integer | ID of the movie or episode |
| `position` | Float | Current playback position (seconds) |
| `duration` | Float | Total video duration (seconds) |
| `last_played` | DateTime | Last playback timestamp |
| `completed` | Boolean | True if watched >90% |
| `created_at` | DateTime | Record creation time |

**Unique constraint:** `(video_type, video_id)` - one progress record per video

---

## 🔌 API Endpoints

### GET `/api/video/progress/{video_type}/{video_id}`
Get saved playback progress for a video.

**Response:**
```json
{
  "position": 1234.5,
  "duration": 3600.0,
  "completed": false,
  "last_played": "2026-01-10T18:00:00"
}
```

### POST `/api/video/progress`
Save current playback progress.

**Request:**
```json
{
  "video_type": "episode",
  "video_id": 123,
  "position": 1234.5,
  "duration": 3600.0
}
```

**Response:**
```json
{
  "success": true,
  "completed": false
}
```

### GET `/api/video/next-episode/{episode_id}`
Get the next episode to play after current episode.

**Response:**
```json
{
  "next_episode": {
    "id": 124,
    "title": "Episode Title",
    "episode_number": 2,
    "season_number": 1,
    "show_id": 5
  }
}
```

Returns `{"next_episode": null}` if no next episode exists.

---

## 💻 Frontend Implementation

### New Hook: `useChromecast()`
Now returns additional properties:
- `playbackInfo` - Current Chromecast playback state
- `currentMedia` - Reference to current media session

### New Service: `videoProgressAPI`
```javascript
import { videoProgressAPI } from '../services/videoProgress';

// Get progress
const progress = await videoProgressAPI.getProgress('episode', 123);

// Save progress
await videoProgressAPI.saveProgress('episode', 123, 1234.5, 3600.0);

// Get next episode
const result = await videoProgressAPI.getNextEpisode(123);
```

### Video Player Updates
- Auto-loads saved progress on mount
- Saves progress every 10 seconds during playback
- Detects video end and auto-plays next episode
- Works for both local and Chromecast playback

---

## 🎬 User Experience

### Watching TV Shows:
1. Start playing any episode
2. Video automatically resumes from where you left off
3. When episode ends:
   - 2-second pause
   - Next episode automatically loads
   - Playback continues seamlessly
4. Progress is tracked continuously

### Watching Movies:
1. Start playing a movie
2. Video resumes from last position if partially watched
3. Pause and come back later - it remembers
4. Marks as completed once you watch >90%

### On Chromecast:
- All features work identically
- Progress syncs between local and cast playback
- Auto-play works seamlessly during casting sessions

---

## 🔧 Configuration

### Resume Threshold
Videos resume from saved position if:
- Position > 10 seconds (skip very beginning)
- Not marked as completed (>90% watched)

### Auto-Save Interval
Progress saves every 10 seconds during active playback.

### Completion Threshold
Video marked as "completed" when watched > 90% of duration.

### Auto-Play Delay
2-second delay between episodes for smooth transition.

---

## 📊 Progress Tracking Details

### When Progress is Saved:
1. Every 10 seconds during active playback
2. When video ends naturally
3. When switching to Chromecast (saves local position)
4. When Chromecast player updates (every 1 second)

### When Progress is Loaded:
1. On video player mount
2. Before starting Chromecast session
3. When resuming playback

### Progress is Shared:
- Same progress for local and Chromecast playback
- One record per video across all devices
- Real-time updates during casting

---

## 🎯 Next Episode Logic

### For TV Episodes:

1. **Check same season:**
   - Episode N → Episode N+1 in same season

2. **Check next season:**
   - Last episode of Season N → First episode of Season N+1

3. **End of series:**
   - Last episode of last season → No next episode

### Priority Order:
1. Next episode number in current season
2. Episode 1 of next season
3. null (no more episodes)

---

## 🚀 Usage Example

```javascript
// User clicks play on "Breaking Bad S01E03"
// Player auto-resumes from 23:45 (last saved position)
// User watches to end
// System automatically loads "Breaking Bad S01E04"
// Playback continues seamlessly
// Progress tracked throughout
```

---

## ✅ Features Summary

- ✅ Auto-resume from last position
- ✅ Auto-play next episode (same season)
- ✅ Auto-play first episode of next season
- ✅ Progress tracking every 10 seconds
- ✅ Completion tracking (>90%)
- ✅ Works with local playback
- ✅ Works with Chromecast
- ✅ Seamless episode transitions
- ✅ Database persistence
- ✅ Per-video progress tracking

**Ready to binge-watch your favorite shows!** 🍿📺
