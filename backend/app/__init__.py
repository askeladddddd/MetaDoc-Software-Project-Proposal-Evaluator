"""
MetaDoc: Google Drive-Integrated Metadata Analyzer for Academic Document Evaluation

Main application factory and initialization.
"""

import os
import logging
from flask import Flask
from flask_cors import CORS
from config import config

# Import core extensions
from app.core.extensions import db, migrate, jwt, init_extensions
from app.core.exceptions import MetaDocException

def create_app(config_name=None):
    """Application factory pattern"""
    
    # Determine configuration
    if config_name is None:
        config_name = os.environ.get('FLASK_ENV', 'default')
    
    # Create Flask app
    app = Flask(__name__)
    app.config.from_object(config[config_name])

    # Enable CORS for frontend domain using config
    cors_origins = app.config.get('CORS_ORIGINS', [])
    if isinstance(cors_origins, str):
        cors_origins = [cors_origins]
    elif not isinstance(cors_origins, list):
        cors_origins = list(cors_origins)
    
    if "https://metadoc-eight.vercel.app" not in cors_origins:
        cors_origins.append("https://metadoc-eight.vercel.app")
        
    CORS(app, origins=cors_origins, supports_credentials=True)
    
    # CRITICAL: Trust reverse proxies (like Render) so Secure cookies work properly
    from werkzeug.middleware.proxy_fix import ProxyFix
    app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)
    
    # Initialize extensions using core module
    init_extensions(app)
    
    # Setup logging
    setup_logging(app)
    
    # Create necessary directories
    create_directories(app)
    
    # Register blueprints
    register_blueprints(app)
    
    # Register error handlers
    register_error_handlers(app)
    
    return app

def setup_logging(app):
    """Configure application logging"""
    if not app.debug and not app.testing:
        # Create logs directory if it doesn't exist
        log_dir = os.path.dirname(app.config['LOG_FILE'])
        if not os.path.exists(log_dir):
            os.makedirs(log_dir, exist_ok=True)
        
        # Configure file logging
        file_handler = logging.FileHandler(app.config['LOG_FILE'])
        file_handler.setLevel(getattr(logging, app.config['LOG_LEVEL']))
        
        formatter = logging.Formatter(
            '%(asctime)s %(levelname)s: %(message)s [in %(pathname)s:%(lineno)d]'
        )
        file_handler.setFormatter(formatter)
        app.logger.addHandler(file_handler)
        app.logger.setLevel(getattr(logging, app.config['LOG_LEVEL']))
        app.logger.info('MetaDoc application startup')

def create_directories(app):
    """Create necessary directories for file storage"""
    directories = [
        app.config['UPLOAD_FOLDER'],
        app.config['TEMP_STORAGE_PATH'],
        app.config['REPORTS_STORAGE_PATH'],
        app.config['NLP_MODEL_PATH'],
        'logs'
    ]
    
    for directory in directories:
        if not os.path.exists(directory):
            os.makedirs(directory, exist_ok=True)
            app.logger.info(f'Created directory: {directory}')

def register_blueprints(app):
    """Register application blueprints"""
    
    # Authentication
    from app.api.auth import auth_bp
    app.register_blueprint(auth_bp, url_prefix='/api/v1/auth')
    
    # File Submission and Retrieval
    from app.api.submission import submission_bp
    app.register_blueprint(submission_bp, url_prefix='/api/v1/submission')
    
    # Dashboard
    from app.api.dashboard import dashboard_bp
    app.register_blueprint(dashboard_bp, url_prefix='/api/v1/dashboard')
    
    # Metadata Extraction
    from app.api.metadata import metadata_bp
    app.register_blueprint(metadata_bp, url_prefix='/api/v1/metadata')
    
    # Rule-Based Insights
    from app.api.insights import insights_bp
    app.register_blueprint(insights_bp, url_prefix='/api/v1/insights')
    
    # NLP Analysis
    from app.api.nlp import nlp_bp
    app.register_blueprint(nlp_bp, url_prefix='/api/v1/nlp')
    
    # Reports
    from app.api.reports import reports_bp
    app.register_blueprint(reports_bp, url_prefix='/api/v1/reports')

def register_error_handlers(app):
    """Register error handlers"""
    
    # Handle custom MetaDoc exceptions
    @app.errorhandler(MetaDocException)
    def handle_metadoc_exception(error):
        response = error.to_dict()
        return response, error.status_code
    
    # Handle standard HTTP errors
    @app.errorhandler(404)
    def not_found_error(error):
        return {'error': 'Resource not found'}, 404
    
    @app.errorhandler(400)
    def bad_request_error(error):
        return {'error': 'Bad request'}, 400
    
    @app.errorhandler(401)
    def unauthorized_error(error):
        return {'error': 'Unauthorized access'}, 401
    
    @app.errorhandler(403)
    def forbidden_error(error):
        return {'error': 'Forbidden'}, 403
    
    @app.errorhandler(413)
    def request_entity_too_large_error(error):
        return {'error': 'File too large'}, 413
    
    @app.errorhandler(415)
    def unsupported_media_type_error(error):
        return {'error': 'Unsupported media type'}, 415
    
    @app.errorhandler(500)
    def internal_error(error):
        db.session.rollback()
        app.logger.error(f'Internal server error: {error}')
        return {'error': 'Internal server error'}, 500

# Import models to ensure they are registered with SQLAlchemy
from app.models import *

if __name__ == '__main__':
    app = create_app()
    
    # Create database tables
    with app.app_context():
        db.create_all()
        
    app.run(host='0.0.0.0', port=5000, debug=True)