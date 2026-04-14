"""
Audit Log model
"""

from sqlalchemy import Text, JSON
from app.core.extensions import db
from app.models.base import BaseModel

class AuditLog(BaseModel):
    """Audit Log model for compliance and tracking"""
    __tablename__ = 'audit_logs'
    
    # Event details
    event_type = db.Column(db.String(100), nullable=False)
    event_description = db.Column(Text, nullable=False)
    ip_address = db.Column(db.String(45), nullable=True)
    user_agent = db.Column(db.String(500), nullable=True)
    
    # Associated entities
    user_id = db.Column(db.String(36), db.ForeignKey('users.id', ondelete='CASCADE'), nullable=True)
    submission_id = db.Column(db.String(36), db.ForeignKey('submissions.id'), nullable=True)
    
    # Additional metadata
    event_metadata = db.Column(JSON, nullable=True)
    
    def __repr__(self):
        return f'<AuditLog {self.event_type} at {self.created_at}>'
    
    def to_dict(self):
        return {
            'id': self.id,
            'event_type': self.event_type,
            'event_description': self.event_description,
            'user_id': self.user_id,
            'submission_id': self.submission_id,
            'ip_address': self.ip_address,
            'metadata': self.event_metadata,
            'created_at': self.created_at.isoformat()
        }
