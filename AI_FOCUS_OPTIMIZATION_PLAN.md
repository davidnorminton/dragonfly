# AI Focus Mode - Latency Optimization Plan

## Current Bottlenecks Analysis

### Measured Delays:
1. **Silence Detection**: 2000ms wait after user stops speaking (line 231)
2. **Sequential Processing**: Wait for complete AI response before TTS starts (line 451)
3. **Audio Buffer**: Wait for 8KB before playback starts (line 601)
4. **Message Save Delay**: 1500ms artificial delay (line 521)

### Total Estimated Latency:
- Silence detection: **2.0s**
- Transcription: **~0.5-1.0s**
- AI first chunk: **~0.5-1.0s** (already fast)
- AI complete response: **~2-4s** (220 tokens)
- TTS first audio chunk: **~1-2s**
- Audio buffer: **~0.5s**
- **TOTAL: ~7-11 seconds**

---

## Optimization Strategies

### 🚀 PRIORITY 1: Parallel Text-to-Speech Generation (BIGGEST WIN)
**Current**: Wait for complete AI response → then start TTS
**Optimized**: Start TTS generation as soon as we have a complete sentence

**Impact**: Reduce latency by 2-4 seconds

#### Implementation:
```javascript
// Start TTS pipeline immediately when streaming text
let audioStreamStarted = false;
const sentenceQueue = [];
let currentSentence = '';

// In the streaming callback:
if (data.chunk) {
  responseText += data.chunk;
  currentSentence += data.chunk;
  
  // Check for sentence boundaries
  if (/[.!?]\s/.test(currentSentence) && currentSentence.length > 30) {
    const sentence = currentSentence.trim();
    sentenceQueue.push(sentence);
    currentSentence = '';
    
    // Start audio stream on first sentence
    if (!audioStreamStarted && sentenceQueue.length > 0) {
      audioStreamStarted = true;
      startParallelAudioGeneration(sentenceQueue); // Non-blocking
    }
  }
}
```

**Backend Support Needed**:
- New endpoint: `/api/ai/stream-text-to-audio` that accepts streaming sentences
- Generate audio for each sentence as it arrives
- Stream audio chunks immediately

---

### 🚀 PRIORITY 2: Reduce Silence Detection Time
**Current**: 2000ms silence threshold (line 231)
**Optimized**: 1200-1500ms

**Impact**: Save 500-800ms

```javascript
// Line 231 in AIFocus.jsx
if (now - silenceStart > 1200) { // Reduced from 2000ms
  stopRecording();
  return;
}
```

**Tradeoff**: May cut off users who speak slowly. Consider:
- Adaptive threshold based on speaking pace
- Visual indicator showing when recording will stop
- Manual stop button

---

### 🚀 PRIORITY 3: Reduce Audio Buffer Threshold
**Current**: 8192 bytes (~8KB) before playback (line 601)
**Optimized**: 4096 bytes (~4KB)

**Impact**: Save 250-500ms

```javascript
// Line 601 in AIFocus.jsx
if (!audioStarted && totalBytes > 4096) { // Reduced from 8192
  audioStarted = true;
  await audio.play();
}
```

**Tradeoff**: Increased risk of buffering if network is slow. Consider:
- Device capability detection
- Network speed test on startup
- Adaptive threshold

---

### 🚀 PRIORITY 4: Remove Artificial Delays
**Current**: 1500ms delay before saving audio (line 521)
**Optimized**: Use Promise-based sequencing

**Impact**: Save up to 1500ms

```javascript
// Instead of setTimeout, use async/await
const result = await aiFocusAPI.saveMessage(...);
if (result.success && result.message_id) {
  savedMessageId = result.message_id;
  // Immediately save audio file (no delay)
  const audioResult = await aiFocusAPI.saveAudio(responseText, savedMessageId);
}
```

---

### 🚀 PRIORITY 5: Faster Transcription Service
**Current**: Using /api/transcribe (likely Whisper)
**Options**:
1. Use Whisper Turbo model
2. Use faster transcription service (Deepgram, AssemblyAI)
3. Stream transcription (incremental results)

**Impact**: Save 200-500ms

---

### 🚀 PRIORITY 6: Predictive Filler Audio
**Current**: Generic filler sound
**Optimized**: Context-aware acknowledgment

**Impact**: Better perceived responsiveness

```javascript
// Play different filler sounds based on question type
const fillerType = detectQuestionType(transcript); // "thinking", "searching", "calculating"
playFillerAudio(fillerType);
```

---

### 🚀 PRIORITY 7: Pre-warm TTS Connection
**Current**: Create TTS connection on demand
**Optimized**: Keep connection alive

**Impact**: Save 100-300ms on first request

```javascript
// On AIFocus page mount, warm up TTS service
useEffect(() => {
  // Pre-warm TTS connection with empty request
  fetch('/api/ai/warmup-tts', { method: 'POST' });
}, []);
```

---

### 🚀 PRIORITY 8: Optimize AI Token Generation
**Current**: 220 max tokens
**Options**:
1. Keep at 220 (already optimized)
2. Use streaming with early stop
3. Use faster Claude model (if available)

**Impact**: Minimal (already using streaming)

---

### 🚀 PRIORITY 9: Parallel Message Saving
**Current**: Sequential saves
**Optimized**: Save message and generate TTS in parallel

```javascript
// Start both operations simultaneously
const [messageResult, audioStream] = await Promise.all([
  aiFocusAPI.saveMessage(...),
  fetch('/api/ai/text-to-audio-stream', {...})
]);
```

**Impact**: Save 200-500ms

---

## Recommended Implementation Order

### Phase 1: Quick Wins (1-2 hours)
1. ✅ Reduce silence detection: 2000ms → 1200ms
2. ✅ Reduce audio buffer: 8KB → 4KB  
3. ✅ Remove artificial 1500ms delay
4. ✅ Parallel message saving

**Expected improvement**: 2-3 seconds faster

### Phase 2: Medium Effort (4-6 hours)
5. ✅ Parallel TTS generation (stream sentences during AI response)
6. ✅ Pre-warm TTS connection
7. ✅ Better filler audio

**Expected improvement**: Additional 2-4 seconds faster

### Phase 3: Advanced (8-12 hours)
8. ⏳ Faster transcription service integration
9. ⏳ Adaptive thresholds based on network/device
10. ⏳ Streaming transcription

**Expected improvement**: Additional 500ms-1s faster

---

## Expected Results

### Current Performance:
- Question → Audio: **7-11 seconds**

### After Phase 1:
- Question → Audio: **5-8 seconds** (30-40% faster)

### After Phase 2:
- Question → Audio: **3-4 seconds** (60-70% faster)

### After Phase 3:
- Question → Audio: **2-3 seconds** (75-80% faster)

---

## Technical Requirements

### New Backend Endpoint:
```python
@app.post("/api/ai/stream-text-to-audio")
async def stream_text_to_audio(request: Request):
    """
    Accept streaming sentences and generate audio in real-time.
    Unlike /api/ai/text-to-audio-stream which receives complete text,
    this endpoint receives sentences as they're generated by AI.
    """
    # Implementation details...
```

### Frontend WebSocket Alternative:
Consider WebSocket for bidirectional streaming:
- Client sends: AI text chunks as they arrive
- Server responds: Audio chunks as they're generated
- Lower latency than HTTP streaming

---

## Monitoring & Metrics

Add detailed timing logs:
```javascript
const timings = {
  silenceDetected: 0,
  transcriptionStart: 0,
  transcriptionEnd: 0,
  firstAIChunk: 0,
  firstSentence: 0,
  firstAudioGenerated: 0,
  firstAudioPlayed: 0,
  totalTime: 0
};
```

Log to console and optionally send to analytics.

---

## A/B Testing Recommendations

1. Test silence detection thresholds: 1000ms, 1200ms, 1500ms
2. Test audio buffer sizes: 2KB, 4KB, 6KB, 8KB
3. Test with/without parallel TTS generation
4. Measure user satisfaction scores

---

## Risk Mitigation

### Parallel TTS Generation:
- Risk: Out-of-order audio chunks
- Mitigation: Sequence numbers + reordering buffer

### Reduced Buffers:
- Risk: Audio stuttering on slow connections
- Mitigation: Detect network speed, fallback to larger buffers

### Shorter Silence Detection:
- Risk: Cut off slow speakers
- Mitigation: Visual countdown, manual stop button

---

## Priority Implementation

**START HERE** (Biggest impact, least effort):
1. Parallel TTS generation during AI streaming
2. Reduce silence detection to 1200ms
3. Reduce audio buffer to 4KB
4. Remove 1500ms artificial delay

These 4 changes alone should reduce latency by **4-6 seconds**.
