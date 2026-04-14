# 📚 MetaDoc - Quick Setup Guide

**Get MetaDoc running in 10 minutes!**

---

## 🎯 Prerequisites

Verify you have these installed:

```bash
python --version          # Should be 3.10 or higher
node --version           # Should be 18 or higher
npm --version            # Should come with Node.js
git --version            # For version control
```

If any are missing, download from:
- Python: https://www.python.org/downloads/
- Node.js: https://nodejs.org/

---

## ⚡ 3-Step Installation

### Step 1: Clone & Navigate (1 minute)

```bash
git clone <repository-url>
cd MetaDoc-Software-Project-Proposal-Evaluator
```

### Step 2: Setup Backend (5 minutes)

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate it
# Windows PowerShell:
.\venv\Scripts\Activate.ps1

# Linux/Mac:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Copy environment file
copy .env.example .env    # Windows
# cp .env.example .env    # Linux/Mac

# Initialize database
python scripts/reset_database.py

# Start backend server
python run.py
```

✅ Backend ready at: **http://localhost:5000**

### Step 3: Setup Frontend (4 minutes)

**Open NEW terminal** (keep backend running):

```bash
# From repository root:
# cd MetaDoc-Software-Project-Proposal-Evaluator
cd frontend/metadoc

npm install
npm run dev
```

✅ Frontend ready at: **http://localhost:5173**

---

## 🔧 Configuration

Edit `backend/.env` with your settings:

```env
# Google OAuth (Get from Google Cloud Console)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:5000/api/v1/auth/callback

# Gemini API (Optional - Get from AI Studio)
GEMINI_API_KEY=your-api-key

# Database (Default: SQLite - no setup needed)
DATABASE_URL=sqlite:///metadoc.db
```

---

## ✅ Verify Installation

- [ ] Backend running: http://localhost:5000
- [ ] Frontend running: http://localhost:5173
- [ ] Can see login page in browser
- [ ] No errors in terminal

**Success!** MetaDoc is ready to use! 🎉

---

## 🆘 Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| **"Command not found: python"** | Install Python 3.10+ from python.org |
| **PowerShell execution error** | Run: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser` |
| **Port 5000 already in use** | Kill process: `Get-Process -Id (Get-NetTCPConnection -LocalPort 5000).OwningProcess \| Stop-Process` |
| **pip install fails** | Try: `pip install --upgrade pip` then retry |
| **Frontend won't load** | Make sure backend is running on port 5000 |
| **Collaborative Effort Report fails** | Sign in as professor using Google OAuth (not basic login), and ensure file is a native Google Doc |

---

## 📚 For More Details

- **[Backend Setup](SETUP_INSTRUCTIONS.md)** - Detailed configuration
- **[System Summary](METADOC_FINAL_SUMMARY.md)** - Architecture & features
- **[Sidebar Toggle](SIDEBAR_TOGGLE_IMPLEMENTATION.md)** - UI features

---

**That's it!** You're ready to develop. 🚀
