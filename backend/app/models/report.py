"""
Report Export model
"""

from sqlalchemy import JSON
from app.core.extensions import db
from app.models.base import BaseModel

class ReportExport(BaseModel):
    """Report Export model for tracking exports"""
    __tablename__ = 'report_exports'
    
    export_type = db.Column(db.String(20), nullable=False)
    file_path = db.Column(db.String(500), nullable=False)
    file_size = db.Column(db.BigInteger, nullable=False)
    
    # Export parameters
    filter_parameters = db.Column(JSON, nullable=True)
    submissions_included = db.Column(JSON, nullable=True)
    
    # User who requested export
    user_id = db.Column(db.String(36), db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    
    # Export metadata
    download_count = db.Column(db.Integer, default=0)
    expires_at = db.Column(db.DateTime, nullable=True)
    
    def __repr__(self):
        return f'<ReportExport {self.export_type} by {self.user_id}>'
