import os
from datetime import timedelta
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    # Optional: warn that python-dotenv is not installed
    pass


def _normalize_database_url(database_url):
    if not database_url:
        return None

    if database_url.startswith('postgres://'):
        return database_url.replace('postgres://', 'postgresql+psycopg2://', 1)

    if database_url.startswith('postgresql://'):
        return database_url.replace('postgresql://', 'postgresql+psycopg2://', 1)

    return database_url


def _split_csv(value, default_value):
    source = value or default_value
    return [item.strip() for item in source.split(',') if item.strip()]

# Get backend directory path
_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))

# Configure database URL
_DB_URL = _normalize_database_url(os.environ.get('DATABASE_URL'))
if not _DB_URL:
    raise RuntimeError('DATABASE_URL is required. Set it to your PostgreSQL connection string.')

class Config:
    """Base configuration class"""
    
    # Flask Configuration
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-key-change-in-production'
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY') or 'jwt-dev-key'
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=1)
    
    # Database Configuration
    SQLALCHEMY_DATABASE_URI = _DB_URL
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ECHO = False
    
    # File Upload Configuration
    UPLOAD_FOLDER = os.environ.get('UPLOAD_FOLDER') or './uploads'
    TEMP_STORAGE_PATH = os.environ.get('TEMP_STORAGE_PATH') or './temp_files'
    MAX_CONTENT_LENGTH = int(os.environ.get('MAX_CONTENT_LENGTH') or 52428800)  # 50MB
    
    # Google API Configuration
    
    GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID')
    GOOGLE_CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET')
    GOOGLE_REDIRECT_URI = os.environ.get('GOOGLE_REDIRECT_URI')
    GOOGLE_SERVICE_ACCOUNT_FILE = os.environ.get('GOOGLE_SERVICE_ACCOUNT_FILE')
    
    # Gemini AI Configuration
    GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
    GEMINI_MODEL = os.environ.get('GEMINI_MODEL') or 'gemini-2.5-flash'
    GEMINI_FALLBACK_MODEL = os.environ.get('GEMINI_FALLBACK_MODEL') or 'gemini-2.5-flash-lite'
    COLLAB_AI_MODE = 'gemini'
    COLLAB_AI_TIMEOUT_SECONDS = int(os.environ.get('COLLAB_AI_TIMEOUT_SECONDS') or 25)
    COLLAB_SESSION_WINDOW_MINUTES = int(os.environ.get('COLLAB_SESSION_WINDOW_MINUTES') or 30)
    COLLAB_SINGLE_REVISION_DEFAULT_MINUTES = int(os.environ.get('COLLAB_SINGLE_REVISION_DEFAULT_MINUTES') or 5)
    COLLAB_MAX_REVISION_PAGES = int(os.environ.get('COLLAB_MAX_REVISION_PAGES') or 50)
    COLLAB_MICRO_EDIT_REVISION_THRESHOLD = int(os.environ.get('COLLAB_MICRO_EDIT_REVISION_THRESHOLD') or 50)
    COLLAB_MICRO_EDIT_MINUTES_THRESHOLD = float(os.environ.get('COLLAB_MICRO_EDIT_MINUTES_THRESHOLD') or 10)
    COLLAB_MASSIVE_PASTE_WPM_THRESHOLD = float(os.environ.get('COLLAB_MASSIVE_PASTE_WPM_THRESHOLD') or 80)
    COLLAB_HIGH_IDLE_MINUTES_THRESHOLD = float(os.environ.get('COLLAB_HIGH_IDLE_MINUTES_THRESHOLD') or 180)
    COLLAB_HIGH_IDLE_WORDCOUNT_THRESHOLD = int(os.environ.get('COLLAB_HIGH_IDLE_WORDCOUNT_THRESHOLD') or 500)
    COLLAB_UNVERIFIED_RATIO_THRESHOLD = float(os.environ.get('COLLAB_UNVERIFIED_RATIO_THRESHOLD') or 0.40)

    # Redis Configuration
    REDIS_URL = os.environ.get('REDIS_URL') or 'redis://localhost:6379/0'
    
    # Institution Configuration
    ALLOWED_EMAIL_DOMAINS = os.environ.get('ALLOWED_EMAIL_DOMAINS', 'cit.edu').split(',')
    INSTITUTION_NAME = os.environ.get('INSTITUTION_NAME') or 'Cebu Institute of Technology - University'
    
    # NLP Configuration
    NLP_MODEL_PATH = os.environ.get('NLP_MODEL_PATH') or './models'
    DEFAULT_LANGUAGE = os.environ.get('DEFAULT_LANGUAGE') or 'en'
    MAX_DOCUMENT_WORDS = int(os.environ.get('MAX_DOCUMENT_WORDS') or 15000)
    MIN_DOCUMENT_WORDS = int(os.environ.get('MIN_DOCUMENT_WORDS') or 50)
    
    # Report Configuration
    REPORTS_STORAGE_PATH = os.environ.get('REPORTS_STORAGE_PATH') or './reports'
    ENABLE_PDF_EXPORT = os.environ.get('ENABLE_PDF_EXPORT', 'True').lower() == 'true'
    ENABLE_CSV_EXPORT = os.environ.get('ENABLE_CSV_EXPORT', 'True').lower() == 'true'
    
    # Security Configuration
    SESSION_TIMEOUT = int(os.environ.get('SESSION_TIMEOUT') or 3600)
    API_RATE_LIMIT = int(os.environ.get('API_RATE_LIMIT') or 100)
    ENABLE_AUDIT_LOGGING = os.environ.get('ENABLE_AUDIT_LOGGING', 'True').lower() == 'true'
    
    # Session Cookie Configuration for Cross-Origin (localhost ports)
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    SESSION_COOKIE_SECURE = False  # Set to True only if using HTTPS
    
    # Logging Configuration
    LOG_LEVEL = os.environ.get('LOG_LEVEL') or 'INFO'
    LOG_FILE = os.environ.get('LOG_FILE') or './logs/metadoc.log'
    CORS_ORIGINS = _split_csv(
        os.environ.get('CORS_ORIGINS'),
        os.environ.get('FRONTEND_ORIGIN', 'http://localhost:3000,http://localhost:5173,http://localhost:5174')
    )

class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True
    FLASK_ENV = 'development'
    SQLALCHEMY_ECHO = True

class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False
    FLASK_ENV = 'production'
    SQLALCHEMY_ECHO = False
    
    # Enhanced security for production
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'

class TestingConfig(Config):
    """Testing configuration"""
    TESTING = True
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or Config.SQLALCHEMY_DATABASE_URI
    WTF_CSRF_ENABLED = False

# Configuration mapping
config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}