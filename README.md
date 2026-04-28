# MetaDoc: Software Project Proposal Evaluator

> **⚡ Quick Start?** See [QUICK_START.md](QUICK_START.md) for a 10-minute setup guide!

MetaDoc is a comprehensive **document analysis and evaluation platform** designed for academic institutions. It streamlines student proposal submissions, performs intelligent metadata extraction, executes deep NLP analysis, and leverages Google Gemini AI for qualitative insights.

---

## ✨ Key Features

### 📤 **Unified Submission System**
- Google OAuth 2.0 authentication for students and professors
- Whitelist gatekeeping integrated with Class Records
- Google Drive link submission with permission handling
- Flexible deadline management (hard/soft deadlines)
- Multi-folder organization by deadline

### 🔬 **Intelligent Document Analysis**
- Automatic metadata extraction (authors, dates, revision counts)
- Identity deduplication with smart name/email normalization
- Real-time NLP analysis (readability, sentiment, named entities)
- Google Gemini AI-powered qualitative evaluation
- Rule-based timeliness and contribution insights

### 👨‍🏫 **Professor Dashboard**
- Real-time system overview and statistics
- Submission and deliverable management
- Reports page for all submitted files in one glance
- "View File" support for opening the original Google Drive file link
- Collaborative Effort Report with deterministic fallback when AI labeling is unavailable
- Class Record management (student and team data)
- Batch operations for submissions

---

## 🏗️ System Architecture

### Backend (3-Layer Design)
```
API Layer (Flask Routes) 
    ↓
Service Layer (Business Logic) 
    ↓
Persistence Layer (SQLAlchemy ORM)
```

**Key Components:**
- **Flask REST API** - 8+ blueprints for different features
- **Service Layer** - 12 specialized service classes
- **SQLAlchemy ORM** - Database abstraction for SQLite/PostgreSQL
- **Google APIs** - Drive, OAuth, and Gemini integration

### Frontend (React + Vite)
```
Pages & Components (React)
    ↓
State Management (AuthContext)
    ↓
API Services (Axios)
```

**Key Features:**
- Component-based architecture with reusable UI
- React Context for state management
- Responsive design (works on desktop & mobile)
- Real-time loading states and error handling
- Role-based access control

---

## 🚀 Quick Start

### Prerequisites

- **Python 3.10+** (Tested on 3.13)
- **Node.js 18+** and npm
- **Git** for version control
- **Google Cloud Account** (for OAuth and Gemini API)

### Installation (3 Steps)

**1. Clone Repository**
```bash
git clone <repository-url>
cd MetaDoc-Software-Project-Proposal-Evaluator
```

**2. Setup Backend**
```bash
cd backend
python -m venv venv

# Activate virtual environment
# Windows PowerShell:
.\venv\Scripts\Activate.ps1

# Linux/Mac:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure
copy .env.example .env  # Windows
# cp .env.example .env  # Linux/Mac

# Initialize database
python scripts/reset_database.py

# Start server
python run.py
```

✅ Backend running at: `http://localhost:5000`

**3. Setup Frontend** (in new terminal)
```bash
cd frontend/metadoc
npm install
npm run dev
```

✅ Frontend running at: `http://localhost:5173`

---

## ⚙️ Configuration

### Required: Google OAuth & Gemini API

Create `backend/.env` file with:

```env
# Authentication (REQUIRED)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:5000/api/v1/auth/callback

# Gemini AI (Optional - for qualitative analysis)
GEMINI_API_KEY=your-api-key-from-aistudio.google.com

# Database (Default: SQLite - no setup needed)
DATABASE_URL=sqlite:///metadoc.db

# File Storage
UPLOAD_FOLDER=uploads
MAX_FILE_SIZE=52428800  # 50MB
```

See [SETUP_INSTRUCTIONS.md](SETUP_INSTRUCTIONS.md) for detailed configuration.

## 🚢 Deployment

The backend already reads `DATABASE_URL`, so moving to PostgreSQL does not require a schema rewrite. The cleanest production setup is:

1. Provision a PostgreSQL database on Neon, Supabase, AWS RDS, or a similar host.
2. Set `DATABASE_URL` to the PostgreSQL connection string, for example `postgresql://user:password@host:5432/metadoc`.
3. Set `CORS_ORIGINS` or `FRONTEND_ORIGIN` to the deployed frontend URL.
4. Install backend dependencies and apply migrations:

```bash
cd backend
pip install -r requirements.txt
flask db upgrade
```

5. Start the backend with a WSGI server:

```bash
gunicorn wsgi:app
```

6. Build the frontend and deploy it separately:

```bash
cd frontend/metadoc
npm install
npm run build
```

If the frontend and backend are on different domains and you rely on cookie-based auth, make sure your cookie and CORS settings match that cross-origin setup.

---

## 📂 Project Structure

### Backend
```
backend/
├── app/
│   ├── api/              # Route handlers (auth, submission, analysis, etc.)
│   ├── services/         # Business logic (12 service classes)
│   ├── models/           # Database models (User, Submission, Deadline, Analysis, etc.)
│   ├── schemas/          # Request/response DTOs
│   └── core/             # Config, extensions, utilities
├── scripts/              # Admin tools (reset DB, migrations)
├── requirements.txt      # Python dependencies (21 packages)
└── run.py               # Entry point
```

### Frontend
```
frontend/metadoc/src/
├── pages/                # Main screens (Dashboard, Submission, etc.)
├── components/           # Reusable React components
├── services/             # API client (Axios)
├── contexts/             # Global state (AuthContext)
└── styles/              # CSS stylesheets
```

---

## 🛠️ Technology Stack

| Layer | Technology |
|-------|-----------|
| **Backend Framework** | Flask 3.0.0 |
| **Database** | SQLite / PostgreSQL (SQLAlchemy ORM) |
| **Authentication** | Google OAuth 2.0 |
| **AI/NLP** | Google Gemini, SpaCy, NLTK, TextStat |
| **Reports** | Dashboard submission list, filters, and file preview workflows |
| **Frontend** | React 18, Vite, Axios |
| **Styling** | CSS3, Responsive Design |

---

## 📊 API Endpoints Overview

| Feature | Endpoint | Method |
|---------|----------|--------|
| **Authentication** | `GET /api/v1/auth/login` | GET |
| **Dashboard** | `GET /api/v1/dashboard/overview` | GET |
| **Submissions** | `POST /api/v1/submission/drive-link` | POST |
| **Deadlines** | `GET /api/v1/dashboard/deadlines` | GET |
| **Analysis** | `POST /api/v1/insights/analyze/:id` | POST |
| **Metadata** | `GET /api/v1/metadata/result/:id` | GET |
| **Reports** | `GET /api/v1/dashboard/submissions` | GET |

See [backend/README.md](backend/README.md) for complete API documentation.

---

## 🎯 Main Features Explained

### 1. **Authentication & Authorization**
- Secure Google OAuth 2.0 login
- Session-based authentication
- Role-based access control (Professor/Student)
- Whitelist integration with Class Records

### 2. **Document Submission**
- Accept Google Drive document links (DOCX workflow)
- Validate file permissions
- Organize by deadline and category
- Track submission timeline

### 3. **Analysis Engine**
- Extract metadata (authors, dates, revision info)
- Perform NLP analysis (readability, sentiment)
- Generate AI insights using Gemini
- Deduplicate identity data

### 4. **Reports & File Review**
- View all submitted files in one glance from the Reports page
- Filter and sort submissions by title, team code, and date
- Open submission details and use "View File" to open the original Google Drive file
- Review analysis results and metrics per submission
- Export supported report files through the Reports workflow (CSV/PDF)

### 5. **Collaborative Effort Report**
- Works best with native Google Docs (`application/vnd.google-apps.document`)
- Requires professor Google Sign-In session with Drive access
- If Gemini labeling is unavailable, the system returns deterministic contribution summaries instead of hard-failing

### 6. **Deadline & Submission Intelligence**
- Classify submissions as on-time or late
- Monitor upcoming deliverables and active deadlines
- Review per-submission metadata and contribution snapshots
- Track submission health across overview, deliverables, and reports

---

## 🚨 Troubleshooting

### Backend Issues

**"pip install" fails**
```bash
pip install --upgrade pip
pip install -r requirements.txt
```

**"ModuleNotFoundError" when running app**
```bash
# Ensure virtual environment is activated
# Windows: .\venv\Scripts\Activate.ps1
# Linux/Mac: source venv/bin/activate
```

**Database errors**
```bash
# Reset database
python scripts/reset_database.py
```

### Frontend Issues

**"npm install" fails**
```bash
npm cache clean --force
npm install
```

**Cannot connect to backend**
npm run dev
```

✅ Frontend running at: `http://localhost:5173`

---

## ⚙️ Configuration

### Required: Google OAuth & Gemini API

Create `backend/.env` file with:

```env
# Authentication (REQUIRED)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:5000/api/v1/auth/callback

# Gemini AI (Optional - for qualitative analysis)
GEMINI_API_KEY=your-api-key-from-aistudio.google.com

# Database (Default: SQLite - no setup needed)
DATABASE_URL=sqlite:///metadoc.db

# File Storage
UPLOAD_FOLDER=uploads
MAX_FILE_SIZE=52428800  # 50MB
```

See [SETUP_INSTRUCTIONS.md](SETUP_INSTRUCTIONS.md) for detailed configuration.

## 🚢 Deployment

The backend already reads `DATABASE_URL`, so moving to PostgreSQL does not require a schema rewrite. The cleanest production setup is:

1. Provision a PostgreSQL database on Neon, Supabase, AWS RDS, or a similar host.
2. Set `DATABASE_URL` to the PostgreSQL connection string, for example `postgresql://user:password@host:5432/metadoc`.
3. Set `CORS_ORIGINS` or `FRONTEND_ORIGIN` to the deployed frontend URL.
4. Install backend dependencies and apply migrations:

```bash
cd backend
pip install -r requirements.txt
flask db upgrade
```

5. Start the backend with a WSGI server:

```bash
gunicorn wsgi:app
```

6. Build the frontend and deploy it separately:

```bash
cd frontend/metadoc
npm install
npm run build
```

If the frontend and backend are on different domains and you rely on cookie-based auth, make sure your cookie and CORS settings match that cross-origin setup.

---

## 📂 Project Structure

### Backend
```
backend/
├── app/
│   ├── api/              # Route handlers (auth, submission, analysis, etc.)
│   ├── services/         # Business logic (12 service classes)
│   ├── models/           # Database models (User, Submission, Deadline, Analysis, etc.)
│   ├── schemas/          # Request/response DTOs
│   └── core/             # Config, extensions, utilities
├── scripts/              # Admin tools (reset DB, migrations)
├── requirements.txt      # Python dependencies (21 packages)
└── run.py               # Entry point
```

### Frontend
```
frontend/metadoc/src/
├── pages/                # Main screens (Dashboard, Submission, etc.)
├── components/           # Reusable React components
├── services/             # API client (Axios)
├── contexts/             # Global state (AuthContext)
└── styles/              # CSS stylesheets
```

---

## 🛠️ Technology Stack

| Layer | Technology |
|-------|-----------|
| **Backend Framework** | Flask 3.0.0 |
| **Database** | SQLite / PostgreSQL (SQLAlchemy ORM) |
| **Authentication** | Google OAuth 2.0 |
| **AI/NLP** | Google Gemini, SpaCy, NLTK, TextStat |
| **Reports** | Dashboard submission list, filters, and file preview workflows |
| **Frontend** | React 18, Vite, Axios |
| **Styling** | CSS3, Responsive Design |

---

## 📊 API Endpoints Overview

| Feature | Endpoint | Method |
|---------|----------|--------|
| **Authentication** | `GET /api/v1/auth/login` | GET |
| **Dashboard** | `GET /api/v1/dashboard/overview` | GET |
| **Submissions** | `POST /api/v1/submission/drive-link` | POST |
| **Deadlines** | `GET /api/v1/dashboard/deadlines` | GET |
| **Analysis** | `POST /api/v1/insights/analyze/:id` | POST |
| **Metadata** | `GET /api/v1/metadata/result/:id` | GET |
| **Reports** | `GET /api/v1/dashboard/submissions` | GET |

See [backend/README.md](backend/README.md) for complete API documentation.

---

## 🎯 Main Features Explained

### 1. **Authentication & Authorization**
- Secure Google OAuth 2.0 login
- Session-based authentication
- Role-based access control (Professor/Student)
- Whitelist integration with Class Records

### 2. **Document Submission**
- Accept Google Drive document links (DOCX workflow)
- Validate file permissions
- Organize by deadline and category
- Track submission timeline

### 3. **Analysis Engine**
- Extract metadata (authors, dates, revision info)
- Perform NLP analysis (readability, sentiment)
- Generate AI insights using Gemini
- Deduplicate identity data

### 4. **Reports & File Review**
- View all submitted files in one glance from the Reports page
- Filter and sort submissions by title, team code, and date
- Open submission details and use "View File" to open the original Google Drive file
- Review analysis results and metrics per submission
- Export supported report files through the Reports workflow (CSV/PDF)

### 5. **Collaborative Effort Report**
- Works best with native Google Docs (`application/vnd.google-apps.document`)
- Requires professor Google Sign-In session with Drive access
- If Gemini labeling is unavailable, the system returns deterministic contribution summaries instead of hard-failing

### 6. **Deadline & Submission Intelligence**
- Classify submissions as on-time or late
- Monitor upcoming deliverables and active deadlines
- Review per-submission metadata and contribution snapshots
- Track submission health across overview, deliverables, and reports

---

## 🚨 Troubleshooting

### Backend Issues

**"pip install" fails**
```bash
pip install --upgrade pip
pip install -r requirements.txt
```

**"ModuleNotFoundError" when running app**
```bash
# Ensure virtual environment is activated
# Windows: .\venv\Scripts\Activate.ps1
# Linux/Mac: source venv/bin/activate
```

**Database errors**
```bash
# Reset database
python scripts/reset_database.py
```

### Frontend Issues

**"npm install" fails**
```bash
npm cache clean --force
npm install
```

**Cannot connect to backend**
- Verify backend is running: http://localhost:5000
- Check CORS settings in .env

---

## 👥 Development Team

**Developers:**
- Edgar B. Quiandao Jr.
- Paul G. Abellana
- Miguel Ray A. Veloso
- Mark Christian Q. Garing

**Advisers:**
- Mr. Ralph Laviste
- Dr. Cheryl Pantaleon

---

## 📝 Project Status

✅ **Production Ready**
- Fully functional and tested
- All core features implemented
- Performance optimized
- Security best practices applied

**Last Updated:** April 2026

---

## 🤝 Contributing

When developing:

1. Create virtual environment: `python -m venv venv`
2. Activate it before coding
3. Install dependencies: `pip install -r requirements.txt`
4. Create `.env` file with API keys
5. Run backend and frontend simultaneously
6. Test changes thoroughly before committing

---

## 📞 Support

For issues or questions:
1. Check [QUICK_START.md](QUICK_START.md)
2. Review the troubleshooting sections
3. Contact development team

---

## 📄 License

See LICENSE file for details.

---

**Ready to get started?** → 👉 [QUICK_START.md](QUICK_START.md)
