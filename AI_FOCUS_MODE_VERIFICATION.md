# AI Focus Mode - Text-to-Speech Streaming Verification

## Overview
This document verifies the complete streaming flow from AI generation through Fish Audio to the user in AI Focus Mode.

## Complete Streaming Flow

### 1. AI Text Generation (Backend)
**Location**: `services/ai_service.py`
- AI receives system prompt with TTS instructions:
  - "All text will be converted to speech"
  - "Do not use contractions or shortened forms"
  - "Always expand words fully (e.g., 'I'm' → 'I am', 'you're' → 'you are')"
- Max tokens set to **220** for AI Focus Mode
- **Context filtering**: Only previous assistant answers are included (user questions excluded)

### 2. Text Streaming to Frontend
**Location**: `frontend/src/pages/AIFocus.jsx` (lines 347-448)
- Frontend calls `aiAPI.askQuestionStream()` with session_id and persona
- Text chunks are received and displayed in real-time
- Full response text is accumulated in `responseText` variable

### 3. Text to Audio Conversion
**Location**: `frontend/src/pages/AIFocus.jsx` (line 524-528)
```javascript
const response = await fetch('/api/ai/text-to-audio-stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: responseText })
});
```

### 4. Backend Audio Streaming Endpoint
**Location**: `web/main.py` (lines 1437-1534)
- Receives complete text
- Splits text into sentences via `text_chunk_generator()`
- Calls `tts.generate_audio_stream()` with text chunks
- Streams audio chunks back to frontend via `StreamingResponse`

### 5. TTS Service Processing
**Location**: `services/tts_service.py` (lines 94-156)
- Receives text chunks from async generator
- **CRITICAL**: Calls `clean_text_for_tts()` on each chunk before sending to Fish Audio
- Accumulates text by sentences (min 100 chars)
- Generates audio via `generate_audio_simple()` for each sentence

### 6. Text Cleaning for TTS
**Location**: `utils/text_cleaner.py` (lines 5-73)
- **Expands all contractions**:
  - "I'm" → "I am"
  - "you're" → "you are"  
  - "won't" → "will not"
  - "can't" → "cannot"
  - And 40+ more common contractions
- **Removes all apostrophes**: `'` and `'` (curly apostrophe)
- Removes markdown formatting: `**`, `*`, `_`, `` ` ``
- Removes HTML tags
- Removes special characters that can't be spoken
- Logs verification that apostrophes are removed

### 7. Fish Audio API Call
**Location**: `services/tts_service.py` (lines 53-92)
- Cleaned text is sent to Fish Audio API
- **Logging added**:
  - Original vs cleaned text length
  - Confirmation that apostrophes are removed
  - Audio bytes received
- Audio bytes are returned and streamed back

### 8. Frontend Audio Streaming
**Location**: `frontend/src/pages/AIFocus.jsx` (lines 536-630)
- Uses **MediaSource API** for progressive audio playback
- Creates `sourceBuffer` for audio/mpeg format
- Reads audio chunks from response stream
- Appends chunks to buffer as they arrive
- **Starts playback after 8KB** of data (near-instant start)
- Continues buffering while playing

## Key Features

### Apostrophe Removal
✅ **Double protection**:
1. AI system prompt instructs to avoid contractions
2. `clean_text_for_tts()` expands any remaining contractions and removes apostrophes

### Streaming Performance
✅ **Progressive playback**:
- Text appears immediately as AI generates it
- Audio generation starts as soon as first sentence is complete
- Audio playback starts after 8KB buffered (typically < 1 second)
- Remaining audio continues streaming while user hears beginning

### Context Management
✅ **AI Focus Mode context**:
- Only previous **assistant** responses are included in context
- User questions are **excluded** from context
- Max tokens: **220**
- This keeps responses concise and conversational

## Testing

### Test Apostrophe Removal
```python
from utils.text_cleaner import clean_text_for_tts

test = "I'm testing this. You're doing great! It's working well."
cleaned = clean_text_for_tts(test)
# Result: "I am testing this. you are doing great! it is working well."
```

### Monitor Logs
Check `server.log` for:
```
[TTS] Text cleaned for TTS - Original length: X, Cleaned length: Y
[TTS] ✓ Confirmed: No apostrophes in cleaned text sent to Fish Audio
[TTS STREAM] ✓ No apostrophes in cleaned chunk sent to Fish Audio
```

## Files Modified

1. **services/ai_service.py**
   - Added conversation history filtering (assistant messages only)
   - Set max_tokens to 220 for AI Focus Mode
   - Applied to all 3 methods: `execute`, `stream_execute`, `async_stream_execute`

2. **utils/text_cleaner.py**
   - Added 40+ contraction expansions
   - Added apostrophe removal
   - Added verification logging

3. **services/tts_service.py**
   - Added detailed logging for text cleaning
   - Logs apostrophe removal confirmation
   - Tracks audio generation metrics

## Verification Checklist

- [x] AI system prompt includes TTS expansion instructions
- [x] AI Focus Mode uses 220 max tokens
- [x] Only assistant responses in context (no user questions)
- [x] Text is streamed from AI to frontend
- [x] Full text is sent to `/api/ai/text-to-audio-stream`
- [x] Text is split into sentence chunks
- [x] Each chunk is cleaned via `clean_text_for_tts()`
- [x] Contractions are expanded (I'm → I am, etc.)
- [x] Apostrophes are removed
- [x] Cleaned text is sent to Fish Audio API
- [x] Audio chunks are streamed back to frontend
- [x] MediaSource API enables progressive playback
- [x] Audio starts playing after 8KB buffered
- [x] Detailed logging confirms each step

## Status: ✅ VERIFIED

All text sent to Fish Audio has apostrophes removed and contractions expanded.
Audio is properly streamed to the user with progressive playback.
Context filtering and token limits are correctly applied to AI Focus Mode.
