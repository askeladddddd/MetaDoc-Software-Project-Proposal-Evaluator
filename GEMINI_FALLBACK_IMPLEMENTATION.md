# Gemini API Multi-Model Fallback Implementation

## Overview

Your Gemini API now automatically falls back to alternative free models when the primary model hits its rate limit. This ensures uninterrupted service and prevents failures during high-traffic periods.

## What Changed

### 1. Configuration Updates

**File:** `backend/config.py`

- **Primary Model:** `GEMINI_MODEL` - Changed to `gemini-2.0-flash` (latest, recommended)
- **Fallback Models:** `GEMINI_FALLBACK_MODELS` - New configuration for model list

```python
GEMINI_MODEL = os.environ.get('GEMINI_MODEL') or 'gemini-2.0-flash'
GEMINI_FALLBACK_MODELS = _split_csv(
    os.environ.get('GEMINI_FALLBACK_MODELS'),
    'gemini-2.5-flash,gemini-2.5-flash-lite,gemini-1.5-flash'
)
```

### 2. Environment Configuration

**File:** `backend/.env.example`

Updated to support multiple fallback models:

```env
# Google Gemini AI
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.0-flash
# Comma-separated list of fallback models to try when rate limit is hit
GEMINI_FALLBACK_MODELS=gemini-2.5-flash,gemini-2.5-flash-lite,gemini-1.5-flash
COLLAB_AI_MODE=gemini
```

### 3. NLP Service Enhancements

**File:** `backend/app/services/nlp_service.py`

#### New Methods Added

**`_get_available_models()`**
- Returns the complete model list (primary + fallbacks) in order
- Ensures primary model is tried first

**`_call_gemini_with_fallback(prompt, system_instruction="", max_retries_per_model=2, timeout_seconds=30)`**
- Core fallback mechanism
- Features:
  - Tries each model in sequence
  - Implements exponential backoff (5s, 20s, 45s) per retry
  - Differentiates between quota errors and other errors
  - Logs which model is being used
  - Returns (response_text, model_used, error_message)

#### Updated Methods

All Gemini API calls now use the fallback mechanism:

1. **`generate_ai_summary()`** - Generates AI summaries with fallback
2. **`evaluate_with_rubric()`** - Evaluates submissions against rubrics
3. **`generate_rubric_criteria()`** - Generates evaluation criteria
4. **`generate_rubric_system_prompt()`** - Generates system instructions

## Available Free Gemini Models

Model Priority (in order):
1. **gemini-2.0-flash** - Latest, fastest, recommended primary
2. **gemini-2.5-flash** - High performance, good for complex tasks
3. **gemini-2.5-flash-lite** - Lightweight, good for simple tasks
4. **gemini-1.5-flash** - Older but still capable

All are free tier eligible with standard rate limits.

## How It Works

### Fallback Flow

```
Request to Gemini API
    ↓
Try Primary Model (gemini-2.0-flash)
    ↓
If Rate Limited (429 error):
    - Wait 5 seconds (exponential backoff)
    - Retry up to 2 times on same model
    - If max retries exhausted → Fall back to next model
    ↓
Try Fallback Model 1 (gemini-2.5-flash)
    - Repeat retry logic
    ↓
Try Fallback Model 2 (gemini-2.5-flash-lite)
    - Repeat retry logic
    ↓
Try Fallback Model 3 (gemini-1.5-flash)
    - Repeat retry logic
    ↓
If All Models Exhausted:
    - Return error: "All Gemini models exhausted rate limits"
```

### Exponential Backoff Strategy

Per model, retry delays increase exponentially:
- **Retry 1:** 5 seconds (5 × 1²)
- **Retry 2:** 20 seconds (5 × 2²)
- (Total per model: ~25 seconds for 2 retries)

This allows quota windows to reset while staying patient.

### Error Handling

The system distinguishes between:
- **Quota Errors (429, "resource exhausted"):** Triggers fallback to next model
- **Other Errors (invalid key, model not found):** Returns immediately without retrying

## Usage Example

### Environment Setup

```bash
# In your .env file
GEMINI_API_KEY=your_api_key_here
GEMINI_MODEL=gemini-2.0-flash
GEMINI_FALLBACK_MODELS=gemini-2.5-flash,gemini-2.5-flash-lite,gemini-1.5-flash
```

### Code Usage

The fallback is automatic - no code changes needed:

```python
from app.services.nlp_service import NLPService

nlp = NLPService()

# This automatically tries fallback models if rate limited
evaluation, error = nlp.evaluate_with_rubric(text, rubric)

if error:
    print(f"Evaluation failed: {error}")
else:
    print(f"Evaluation successful: {evaluation['score']}")
```

### Logging Output

The system logs each model attempt:

```
INFO: Attempting Gemini call with model: gemini-2.0-flash (retry 0/2)
WARNING: Rate limit hit with gemini-2.0-flash. Retry 1/2 in 5s...
INFO: Attempting Gemini call with model: gemini-2.5-flash (retry 0/2)
INFO: ✓ Gemini successful with model: gemini-2.5-flash
INFO: Summary generated with model: gemini-2.5-flash
```

## Benefits

✅ **Automatic Failover** - No manual intervention needed
✅ **Uninterrupted Service** - Users get results even during rate limits
✅ **Cost Efficient** - Uses only free models
✅ **Smart Retry Logic** - Exponential backoff prevents thundering herd
✅ **Better Logging** - Track which model is being used
✅ **Latest Models** - Updated to gemini-2.0-flash as primary

## Configuration Options

You can customize the fallback behavior:

### Change Primary Model

```env
GEMINI_MODEL=gemini-2.5-flash
```

### Add More Fallback Models

```env
GEMINI_FALLBACK_MODELS=gemini-2.5-flash,gemini-2.5-flash-lite,gemini-1.5-flash,gemini-1.5-pro
```

### Single Model (No Fallback)

```env
GEMINI_FALLBACK_MODELS=
# Uses default: gemini-2.5-flash,gemini-2.5-flash-lite,gemini-1.5-flash
```

## Troubleshooting

### "All Gemini models exhausted rate limits"

This means all configured models hit their rate limit simultaneously. Solutions:

1. **Wait and Retry** - Rate limits reset after ~60 seconds
2. **Add More Models** - Configure additional fallback models
3. **Check API Key** - Ensure GEMINI_API_KEY is valid
4. **Monitor Usage** - Check your Gemini API dashboard for quota details

### Model Not Working

If a specific model fails:

1. Verify it's available at [Google AI Studio](https://aistudio.google.com)
2. Check API key has access to that model
3. Remove it from `GEMINI_FALLBACK_MODELS` if deprecated
4. Review logs for specific error messages

### Rate Limiting Still Happening

Consider:
- Reducing request frequency
- Implementing caching for similar requests
- Using batch processing for bulk submissions
- Contacting Google for quota increase (if eligible)

## Technical Details

### Rate Limit Detection

The system identifies rate limit errors by checking for:
- HTTP 429 status code
- "quota" in error message (case-insensitive)
- "resource exhausted" in error message
- "rate limit" in error message

### Retry Strategy Per Model

- **Max Retries:** 2 (configurable)
- **Backoff:** Exponential (5s, 20s, ...)
- **Total Time Per Model:** ~25 seconds

### Model List Resolution

1. Primary model from `GEMINI_MODEL` config
2. Fallback models from `GEMINI_FALLBACK_MODELS` (comma-separated)
3. Removes duplicates (if primary is in fallback list)
4. Tries in order until success

## Implementation Files Changed

1. **backend/config.py** - Added model list configuration
2. **backend/.env.example** - Updated with fallback models
3. **backend/app/services/nlp_service.py**
   - Added `_get_available_models()` method
   - Added `_call_gemini_with_fallback()` method
   - Updated `generate_ai_summary()` to use fallback
   - Updated `evaluate_with_rubric()` to use fallback
   - Updated `generate_rubric_criteria()` to use fallback
   - Updated `generate_rubric_system_prompt()` to use fallback

## Next Steps

1. ✅ Update your `.env` file with the new configuration
2. ✅ Restart your backend service
3. ✅ Monitor logs for successful fallback operations
4. ✅ Test with high-volume requests to verify fallback works

## Support

For issues or questions:
1. Check logs for error messages
2. Verify GEMINI_API_KEY is set correctly
3. Review rate limit status at [Google AI Dashboard](https://console.cloud.google.com)
4. Ensure models in fallback list are available and supported

---

**Version:** 1.0  
**Last Updated:** April 27, 2026  
**Status:** Production Ready
