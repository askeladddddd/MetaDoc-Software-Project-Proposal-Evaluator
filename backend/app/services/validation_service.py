"""
Validation Service for MetaDoc

Provides comprehensive validation for:
- File types and formats
- Content validation
- Security checks
- Data integrity
"""

import mimetypes
try:
    import magic
except ImportError:
    magic = None
import os
from flask import current_app

class ValidationService:
    """Centralized validation service for MetaDoc system"""
    
    ALLOWED_EXTENSIONS = {'docx', 'doc'}
    ALLOWED_MIME_TYPES = {
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'application/vnd.google-apps.document'
    }
    
    @staticmethod
    def validate_file_extension(filename):
        """Validate file extension"""
        if '.' not in filename:
            return False, "No file extension found"
        
        extension = filename.rsplit('.', 1)[1].lower()
        if extension not in ValidationService.ALLOWED_EXTENSIONS:
            return False, f"Unsupported extension: .{extension}"
        
        return True, None
    
    @staticmethod
    def validate_mime_type(file_content, original_filename=None):
        """Validate MIME type using python-magic or fallback"""
        if magic:
            try:
                mime_type = magic.from_buffer(file_content, mime=True)
                if mime_type not in ValidationService.ALLOWED_MIME_TYPES:
                    return False, f"Unsupported MIME type: {mime_type}"
                return True, mime_type
            except Exception as e:
                return False, f"MIME type detection failed: {e}"
        
        # Fallback if libmagic is unavailable on Render
        if original_filename:
            mime_type, _ = mimetypes.guess_type(original_filename)
            if mime_type and mime_type not in ValidationService.ALLOWED_MIME_TYPES:
                return False, f"Unsupported MIME type from extension: {mime_type}"
        return True, "application/octet-stream"
    
    @staticmethod
    def validate_file_size(file_size, max_size=None):
        """Validate file size against limits"""
        if max_size is None:
            max_size = current_app.config.get('MAX_CONTENT_LENGTH', 52428800)  # 50MB
        
        if file_size > max_size:
            return False, f"File size ({file_size} bytes) exceeds limit ({max_size} bytes)"
        
        return True, None
    
    @staticmethod
    def validate_email(email):
        """Basic email validation"""
        import re
        
        if not email:
            return True, None  # Email is optional
        
        pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if re.match(pattern, email):
            return True, None
        else:
            return False, "Invalid email format"
    
    @staticmethod
    def validate_google_drive_url(url):
        """Validate Google Drive URL format"""
        import re
        
        patterns = [
            r'https://drive\.google\.com/file/d/([a-zA-Z0-9-_]+)',
            r'https://docs\.google\.com/document/d/([a-zA-Z0-9-_]+)',
            r'https://drive\.google\.com/open\?id=([a-zA-Z0-9-_]+)'
        ]
        
        for pattern in patterns:
            if re.match(pattern, url):
                return True, None
        
        return False, "Invalid Google Drive URL format"