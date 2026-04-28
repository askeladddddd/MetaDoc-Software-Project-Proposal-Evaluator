"""
Audit Service for MetaDoc

Handles audit logging for compliance with Data Privacy Act of 2012
and institutional security requirements.
"""

from datetime import datetime
from flask import request, current_app
from app.core.extensions import db
from app.models.audit import AuditLog

class AuditService:
    """Service for handling audit logging throughout the application"""
    
    @staticmethod
    def log_event(event_type, description, user_id=None, submission_id=None, metadata=None):
        """
        Log an audit event
        
        Args:
            event_type (str): Type of event (e.g., 'submission_created', 'file_downloaded')
            description (str): Human-readable description of the event
            user_id (str, optional): ID of the user who performed the action
            submission_id (str, optional): ID of related submission
            metadata (dict, optional): Additional event metadata
        """
        try:
            # Extract request information if available
            ip_address = None
            user_agent = None
            
            if request:
                raw_ip = request.environ.get('HTTP_X_FORWARDED_FOR', request.remote_addr)
                if raw_ip:
                    # X-Forwarded-For can be a comma-separated list. Take the first IP.
                    ip_address = raw_ip.split(',')[0].strip()
                    # Strictly truncate to 45 chars to prevent DB errors
                    ip_address = ip_address[:45]
                user_agent = request.headers.get('User-Agent')
            
            # Create audit log entry
            audit_log = AuditLog(
                event_type=event_type,
                event_description=description,
                user_id=user_id,
                submission_id=submission_id,
                ip_address=ip_address,
                user_agent=user_agent,
                metadata=metadata or {}
            )
            
            db.session.add(audit_log)
            db.session.commit()
            
            # Also log to application logger for immediate visibility
            current_app.logger.info(f"AUDIT: {event_type} - {description}")
            
            return True
            
        except Exception as e:
            current_app.logger.error(f"Failed to log audit event: {e}")
            # Don't raise exception to avoid breaking main functionality
            return False
    
    @staticmethod
    def log_submission_event(event_type, submission, user_id=None, additional_metadata=None):
        """Log submission-related events with standard metadata"""
        metadata = {
            'filename': submission.original_filename,
            'file_size': submission.file_size,
            'submission_type': submission.submission_type,
            'job_id': submission.job_id
        }
        
        if additional_metadata:
            metadata.update(additional_metadata)
        
        return AuditService.log_event(
            event_type=event_type,
            description=f"Submission {event_type}: {submission.original_filename}",
            user_id=user_id,
            submission_id=submission.id,
            metadata=metadata
        )
    
    @staticmethod
    def log_authentication_event(event_type, user_email, success=True, error_message=None):
        """Log authentication events"""
        metadata = {
            'user_email': user_email,
            'success': success
        }
        
        if error_message:
            metadata['error_message'] = error_message
        
        description = f"Authentication {event_type} for {user_email}"
        if not success:
            description += f" - Failed: {error_message}"
        
        return AuditService.log_event(
            event_type=f"auth_{event_type}",
            description=description,
            metadata=metadata
        )
    
    @staticmethod
    def log_export_event(export_type, user_id, submission_ids=None, filter_params=None):
        """Log report export events"""
        metadata = {
            'export_type': export_type,
            'submission_count': len(submission_ids) if submission_ids else 0
        }
        
        if submission_ids:
            metadata['submission_ids'] = submission_ids
        
        if filter_params:
            metadata['filter_params'] = filter_params
        
        return AuditService.log_event(
            event_type='report_export',
            description=f"Report exported as {export_type.upper()}",
            user_id=user_id,
            metadata=metadata
        )
    
    @staticmethod
    def log_data_access(access_type, resource_id, user_id, resource_type='submission'):
        """Log data access events for privacy compliance"""
        return AuditService.log_event(
            event_type=f"data_access_{access_type}",
            description=f"Data access: {access_type} {resource_type} {resource_id}",
            user_id=user_id,
            metadata={
                'resource_type': resource_type,
                'resource_id': resource_id,
                'access_type': access_type
            }
        )