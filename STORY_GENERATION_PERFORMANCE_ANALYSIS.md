# Story Generation Performance Analysis

## Summary
Analysis of the story generation flow to identify performance bottlenecks. **DO NOT FIX YET** - Analysis only.

## Flow Overview

### Frontend (`CreateStory.jsx` - `handleGenerateScreenplay`)

1. **Persona Context Collection** (Lines 1161-1185)
   - **BOTTLENECK #1**: Sequential API calls
   - Loops through each selected persona with `for...of` loop
   - Each iteration makes an `await` call to `personaAPI.getPersonaContext(personaName)`
   - **Impact**: If 5 personas selected, that's 5 sequential HTTP requests
   - **Estimated Time**: 100-500ms per persona = 500-2500ms total
   - **Status**: Contexts are cached in `personaContexts` state, but only if previously loaded

2. **Prompt Construction** (Lines 1187-1230)
   - Builds large prompt including:
     - Plot text
     - All persona contexts (could be lengthy system prompts)
     - System prompt with formatting rules
   - **Impact**: Large input prompt, but minimal processing time
   - **Estimated Time**: <50ms

3. **API Call to Generate Screenplay** (Line 1240)
   - Calls `aiAPI.generateScreenplay()` with:
     - Large prompt (could be 2000-5000 tokens)
     - System prompt (~800 tokens)
     - `max_tokens: 4096`
   - **Impact**: Single async call - frontend just waits
   - **Estimated Time**: Depends entirely on backend/API

### Backend (`web/main.py` - `/api/ai/generate-screenplay`)

1. **Endpoint Handler** (Lines 12805-12859)
   - Receives request
   - Extracts payload
   - Creates `AIService()` instance (lightweight)
   - Calls `ai_service.execute_with_system_prompt()`
   - **Estimated Time**: <10ms (just routing)

2. **AI Service** (`services/ai_service.py` - `execute_with_system_prompt`)

   a. **API Key Loading** (Line 261)
      - Checks if key already loaded
      - **Impact**: Minimal if cached, could be 10-50ms if loading from DB
      - **Estimated Time**: 0-50ms

   b. **Anthropic API Call** (Lines 274-282)
      - **BOTTLENECK #2**: Main performance bottleneck
      - Single blocking call to `async_client.messages.create()`
      - Parameters:
        - `model`: From settings (e.g., "claude-3-5-sonnet-20241022")
        - `max_tokens: 4096` - **Large output required**
        - `system`: System prompt (~800 tokens)
        - `messages`: User prompt (2000-5000 tokens)
      - **Impact**: Claude needs to generate up to 4096 tokens of JSON
      - **Estimated Time**: **5-30+ seconds** (depends on model, prompt size, API load)
      - This is where most of the delay occurs

3. **Response Processing**
   - Extract text from response
   - Return to frontend
   - **Estimated Time**: <10ms

### Persona Context Fetching (`/api/personas/{persona_name}/context`)

1. **Endpoint Handler** (Lines 12861-12912)
   - URL decode persona name
   - Load persona config from database via `load_persona_config()`
   - **BOTTLENECK #3**: Database query per persona
   - If persona not found, lists all personas (expensive query)
   - Extract context from nested JSON structure
   - **Estimated Time**: 50-200ms per persona
   - **Total Impact**: 250-1000ms for 5 personas (sequential)

### Database Operations

1. **`load_persona_config()`** (from `config/persona_loader.py`)
   - Queries `PersonaConfig` table
   - Loads JSONB `config_data` column
   - **Impact**: JSON parsing and database query
   - **Estimated Time**: 20-100ms per query

2. **Story Auto-Save** (After generation)
   - Creates/updates `Story` record
   - Creates `StoryScreenplayVersion` record
   - Creates `StoryCast` records
   - **Impact**: Multiple database writes
   - **Estimated Time**: 100-300ms

## Identified Bottlenecks (Ranked by Impact)

### 🔴 CRITICAL - Bottleneck #1: Anthropic API Call (5-30+ seconds)
**Location**: `services/ai_service.py:274` - `async_client.messages.create()`

**Why Slow**:
- Generating 4096 tokens of structured JSON takes time
- Claude needs to ensure valid JSON structure
- Model inference is inherently slow
- Network latency to Anthropic API
- API rate limiting/throttling

**Impact**: **90-95% of total generation time**

**Options to Address** (NOT IMPLEMENTING YET):
1. Reduce `max_tokens` (e.g., to 2048 or 3072) - faster but may truncate screenplays
2. Use streaming response - doesn't speed up generation, but improves perceived performance
3. Use faster model (e.g., haiku) - faster but lower quality
4. Cache responses for similar prompts - complex, may not help much
5. Batch generation - generate multiple versions in parallel

### 🟡 MEDIUM - Bottleneck #2: Sequential Persona Context Fetching (500-2500ms)
**Location**: `frontend/src/pages/CreateStory.jsx:1164` - `for...of` loop

**Why Slow**:
- Each persona requires separate HTTP request
- Requests are sequential (await in loop)
- Each request involves database query

**Impact**: **5-10% of total generation time** (but noticeable to user)

**Options to Address** (NOT IMPLEMENTING YET):
1. Parallel fetch with `Promise.all()` - fetch all personas simultaneously
2. Batch endpoint - single endpoint that fetches multiple persona contexts
3. Pre-load contexts when personas are selected (proactive loading)
4. Cache contexts in frontend localStorage/sessionStorage

### 🟡 MEDIUM - Bottleneck #3: Persona Context Database Queries (50-200ms each)
**Location**: `web/main.py:12876` - `load_persona_config()`

**Why Slow**:
- Database query per persona
- JSONB parsing
- If persona not found, additional expensive query to list all personas

**Impact**: **1-3% of total generation time** (minor but adds up with multiple personas)

**Options to Address** (NOT IMPLEMENTING YET):
1. Batch database query - fetch all persona configs in single query
2. Cache persona configs in memory (Redis/cache)
3. Pre-load all persona configs on app startup

### 🟢 LOW - Bottleneck #4: Large Prompt Size (minimal impact)
**Location**: Prompt construction in `CreateStory.jsx`

**Why Slow**:
- Large prompts take longer for Claude to process
- More tokens = more processing time

**Impact**: **Minor** - maybe 1-2 seconds on 5000 token prompt vs 2000 token prompt

**Options to Address** (NOT IMPLEMENTING YET):
1. Summarize persona contexts before adding to prompt
2. Limit context length per persona
3. Use only essential persona information

### 🟢 LOW - Bottleneck #5: Auto-Save After Generation (100-300ms)
**Location**: `CreateStory.jsx:1311` - `handleSaveStory()` after generation

**Why Slow**:
- Multiple database writes
- Story, screenplay version, cast records

**Impact**: **Negligible** - happens after user already sees result

**Options to Address** (NOT IMPLEMENTING YET):
1. Make save async/non-blocking
2. Batch database writes
3. Defer save until user explicitly requests it

## Performance Metrics (Estimated)

### Current Performance (Typical)
- **Persona Context Fetching**: 500-2500ms (for 5 personas)
- **Prompt Construction**: <50ms
- **Anthropic API Call**: 5000-30000ms (5-30 seconds) ⭐ **MAIN BOTTLENECK**
- **Response Processing**: <10ms
- **Auto-Save**: 100-300ms (background)
- **Total**: ~6-33 seconds

### Potential Improvements

**Scenario 1: Optimize Persona Fetching Only**
- Parallel persona fetching: 100-500ms (instead of 500-2500ms)
- **New Total**: ~5.6-31.5 seconds (saves ~400-2000ms)

**Scenario 2: Reduce max_tokens to 2048**
- Anthropic API: 3000-15000ms (3-15 seconds) instead of 5-30 seconds
- **New Total**: ~3.6-18 seconds (saves ~2-15 seconds)
- **Trade-off**: May truncate longer screenplays

**Scenario 3: Use Streaming + Reduce tokens**
- Anthropic API: First token arrives faster, but generation still takes 3-15 seconds
- **Perceived Performance**: Better (user sees progress)
- **Actual Time**: Similar to Scenario 2

**Scenario 4: All Optimizations Combined**
- Parallel persona fetching: 100-500ms
- Reduced tokens (2048): 3000-15000ms
- Batch database queries: saves 50-100ms
- **New Total**: ~3.3-16 seconds (saves ~2.7-17 seconds)

## Recommendations (NOT IMPLEMENTING)

### Immediate Impact (Easy Wins)
1. ⚡ **Parallel Persona Context Fetching** - Save 400-2000ms, easy to implement
2. ⚡ **Reduce max_tokens to 3072** - Balance between speed and quality
3. ⚡ **Add loading indicator with progress** - Better UX even if time unchanged

### Medium Impact (Moderate Effort)
1. ⚡ **Implement streaming response** - Better perceived performance
2. ⚡ **Batch persona context endpoint** - Single request for all contexts
3. ⚡ **Cache persona contexts in frontend** - Avoid re-fetching

### Long-term Impact (Complex)
1. ⚡ **Pre-generate screenplay templates** - Not applicable here
2. ⚡ **Use faster model with lower quality** - Trade-off decision needed
3. ⚡ **Implement response caching** - Complex, limited benefit

## Code Locations

### Frontend
- `frontend/src/pages/CreateStory.jsx:1146` - `handleGenerateScreenplay()` entry point
- `frontend/src/pages/CreateStory.jsx:1164` - Sequential persona fetching loop
- `frontend/src/pages/CreateStory.jsx:1240` - API call to generate screenplay
- `frontend/src/services/api.js:226` - `getPersonaContext()` API call

### Backend
- `web/main.py:12805` - `/api/ai/generate-screenplay` endpoint
- `web/main.py:12861` - `/api/personas/{persona_name}/context` endpoint
- `services/ai_service.py:248` - `execute_with_system_prompt()` method
- `services/ai_service.py:274` - Anthropic API call (main bottleneck)

## Notes

- The Anthropic API call is the dominant factor (90-95% of time)
- Sequential persona fetching is noticeable but minor compared to API call
- User experience could be improved with better loading indicators
- Consider showing progress or estimated time remaining
- Streaming could help even if it doesn't reduce total time
