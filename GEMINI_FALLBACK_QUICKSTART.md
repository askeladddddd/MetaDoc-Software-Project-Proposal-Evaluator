# Gemini API Fallback - Quick Start Guide

## 🚀 Quick Setup (2 minutes)

### Step 1: Update `.env` File

```env
GEMINI_API_KEY=your_google_api_key_here
GEMINI_MODEL=gemini-2.0-flash
GEMINI_FALLBACK_MODELS=gemini-2.5-flash,gemini-2.5-flash-lite,gemini-1.5-flash
```

### Step 2: Restart Backend

```bash
# Stop current process
# Start backend
python backend/run.py
```

### Step 3: Done! ✅

That's it! Your Gemini API now automatically uses fallback models.

---

## 📊 What Happens When Rate Limited?

```
User Request → gemini-2.0-flash (FULL)
              ↓
              → gemini-2.5-flash (TRY NEXT)
              ↓
              → gemini-2.5-flash-lite (TRY NEXT)
              ↓
              → gemini-1.5-flash (TRY NEXT)
              ↓
         Success! ✓
```

---

## 🔍 Monitor It Working

### Check Logs

Look for these patterns in your logs:

```
✓ Gemini successful with model: gemini-2.5-flash
Summary generated with model: gemini-2.5-flash
Rubric evaluation completed with model: gemini-2.0-flash
```

Or if fallback triggered:

```
Rate limit hit with gemini-2.0-flash. Retry 1/2 in 5s...
Attempting Gemini call with model: gemini-2.5-flash (retry 0/2)
✓ Gemini successful with model: gemini-2.5-flash
```

---

## ⚙️ Customize (Optional)

### Use Only One Model (No Fallback)

```env
GEMINI_FALLBACK_MODELS=
```

### Add More Fallback Models

```env
GEMINI_FALLBACK_MODELS=gemini-2.5-flash,gemini-2.5-flash-lite,gemini-1.5-flash,gemini-1.5-pro
```

### Try Pro Model First (if you have access)

```env
GEMINI_MODEL=gemini-1.5-pro
GEMINI_FALLBACK_MODELS=gemini-2.0-flash,gemini-2.5-flash,gemini-2.5-flash-lite
```

---

## 🆘 Troubleshooting

| Problem | Solution |
|---------|----------|
| Still getting "quota exceeded" | All models are rate limited. Wait 60 seconds and retry. |
| Model not found error | Remove invalid model from `GEMINI_FALLBACK_MODELS`. |
| API key not working | Check `GEMINI_API_KEY` is valid in Google AI Studio. |
| No fallback happening | Check `.env` is loaded correctly, restart backend. |

---

## 🎯 Best Practices

✅ **Keep 3-4 Fallback Models** - Redundancy without complexity
✅ **Use Latest as Primary** - `gemini-2.0-flash` is recommended
✅ **Monitor Logs Regularly** - Spot patterns in rate limiting
✅ **Test Before Deploying** - Try high-volume requests locally

---

## 📝 Configuration Reference

| Config | Default | Purpose |
|--------|---------|---------|
| `GEMINI_MODEL` | gemini-2.0-flash | Primary model to try first |
| `GEMINI_FALLBACK_MODELS` | gemini-2.5-flash,<br/>gemini-2.5-flash-lite,<br/>gemini-1.5-flash | Models to try if rate limited |

---

## 📚 Learn More

See `GEMINI_FALLBACK_IMPLEMENTATION.md` for detailed technical documentation.

---

**Version:** 1.0  
**Last Updated:** April 27, 2026
