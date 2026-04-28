"""
Submission Service - Handles file submission logic and validation

Extracted from api/submission.py to follow proper service layer architecture.
"""

import os
import hashlib
import mimetypes
import uuid
from datetime import datetime
from flask import current_app
from werkzeug.utils import secure_filename
try:
    import magic
except ImportError:
    magic = None

from app.core.extensions import db
from app.models import Submission, SubmissionStatus, Student
from sqlalchemy import or_
from app.services.audit_service import AuditService


class SubmissionService:
    """Service class for handling file submissions and validation"""
    
    def __init__(self):
        self.allowed_extensions = {'docx', 'doc'}
        self.allowed_mime_types = {
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/msword',
            'application/vnd.google-apps.document',
            'application/zip'  # DOCX files are ZIP archives
        }
    
    @property
    def max_file_size(self):
        """Get max file size from config (lazy load)"""
        return current_app.config.get('MAX_CONTENT_LENGTH', 50 * 1024 * 1024)
    
    def validate_file(self, file):
        """Validate uploaded file according to SRS requirements"""
        errors = []
        
        # Check file size
        if len(file.read()) > self.max_file_size:
            errors.append(f"File size exceeds maximum limit of {self.max_file_size // (1024*1024)}MB")
        
        # Reset file pointer
        file.seek(0)
        
        # Check file extension
        filename = secure_filename(file.filename)
        if '.' not in filename or filename.rsplit('.', 1)[1].lower() not in self.allowed_extensions:
            errors.append("Unsupported file type. Only DOCX and DOC files are allowed.")
        
        # Check MIME type using python-magic for accuracy
        file_content = file.read(1024)  # Read first 1KB for MIME detection
        file.seek(0)  # Reset pointer
        
        if magic:
            try:
                mime_type = magic.from_buffer(file_content, mime=True)
                # DOCX files are often detected as application/zip, so check extension too
                if mime_type not in self.allowed_mime_types:
                    # If it's a ZIP file, verify it's actually a DOCX by checking extension
                    if mime_type == 'application/zip' and filename.endswith('.docx'):
                        pass  # Valid DOCX file
                    else:
                        errors.append(f"Invalid file format. Detected: {mime_type}")
            except Exception as e:
                current_app.logger.warning(f"MIME type detection failed: {e}")
                # Fallback to filename-based validation
        
        return errors
    
    def validate_drive_link(self, drive_link):
        """Validate Google Drive link format and extract file ID"""
        import re
        
        # Google Drive link patterns
        patterns = [
            r'https://drive\.google\.com/file/d/([a-zA-Z0-9-_]+)',
            r'https://docs\.google\.com/document/d/([a-zA-Z0-9-_]+)',
            r'https://drive\.google\.com/open\?id=([a-zA-Z0-9-_]+)'
        ]
        
        for pattern in patterns:
            match = re.search(pattern, drive_link)
            if match:
                return match.group(1), None
        
        return None, "Invalid Google Drive link format"
    
    def calculate_file_hash(self, file_path):
        """Calculate SHA-256 hash of file for integrity checking"""
        hash_sha256 = hashlib.sha256()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_sha256.update(chunk)
        return hash_sha256.hexdigest()
    
    def check_duplicate_submission(self, file_hash=None, drive_link=None, professor_id=None, deadline_id=None, student_id=None, student_email=None):
        """
        Check if a file has already been submitted by the same student identity.
        
        Args:
            file_hash: SHA-256 hash of the file
            drive_link: Google Drive link (if applicable)
            professor_id: Professor ID to scope the check
            deadline_id: Deadline ID to scope the check (optional)
            student_id: Student number of current submitter (optional)
            student_email: Gmail of current submitter (optional)
        
        Returns:
            tuple: (is_duplicate: bool, existing_submission: Submission or None)
        """
        scope_query = Submission.query

        if professor_id:
            scope_query = scope_query.filter_by(professor_id=professor_id)
        if deadline_id:
            scope_query = scope_query.filter_by(deadline_id=deadline_id)

        identity_student_ids = set()
        normalized_student_id = str(student_id or '').strip()
        normalized_email = str(student_email or '').strip().lower()

        if normalized_student_id:
            identity_student_ids.add(normalized_student_id)

        if normalized_email and professor_id:
            email_students = Student.query.filter(
                Student.professor_id == professor_id,
                db.func.lower(Student.email) == normalized_email
            ).all()
            for student in email_students:
                if student.student_id:
                    identity_student_ids.add(str(student.student_id).strip())

        # If we can resolve identity, check if THIS student has submitted THIS specific file before.
        if identity_student_ids:
            identity_query = scope_query.filter(Submission.student_id.in_(list(identity_student_ids)))
            
            # Check if this specific student has already submitted this content
            if drive_link:
                existing = identity_query.filter(Submission.google_drive_link == drive_link).first()
                if existing:
                    return True, existing
            
            if file_hash:
                existing = identity_query.filter(Submission.file_hash == file_hash).first()
                if existing:
                    return True, existing
        
        # If no identical submission by the same student found, allow it.
        # This allows different users to submit the same file, and the same user to submit different files.
        return False, None
    
    def create_submission_record(self, **kwargs):
        """Create submission record in database"""
        
        # Ensure file_modified_at is a datetime object if provided
        if 'file_modified_at' in kwargs and isinstance(kwargs['file_modified_at'], str):
            kwargs['file_modified_at'] = datetime.fromisoformat(kwargs['file_modified_at'])

        submission = Submission(
            job_id=str(uuid.uuid4()),
            **kwargs
        )
        
        try:
            db.session.add(submission)
            db.session.commit()
            
            # Log submission event
            AuditService.log_event(
                event_type='submission_created',
                description=f'New submission created: {submission.job_id}',
                submission_id=submission.id,
                metadata={'filename': submission.original_filename}
            )
            
            return submission, None
            
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Failed to create submission record: {e}")
            return None, str(e)
    
    def get_permission_guidance(self):
        """Return guidance for fixing Google Drive permissions"""
        return {
            'steps': [
                "1. Open your Google Drive file",
                "2. Click the 'Share' button (top-right corner)",
                "3. Change access to 'Anyone with the link'",
                "4. Set permissions to 'Viewer' or 'Commenter'",
                "5. Copy the new link and resubmit"
            ],
            'help_url': '/help/drive-permissions'
        }
