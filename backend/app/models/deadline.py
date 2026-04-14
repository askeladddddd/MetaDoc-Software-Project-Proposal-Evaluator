"""
Deadline model
"""

from sqlalchemy import Text
from app.core.extensions import db
from app.models.base import BaseModel

class Deadline(BaseModel):
    """Deadline model for timeliness analysis"""
    __tablename__ = 'deadlines'
    
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(Text, nullable=True)
    deadline_datetime = db.Column(db.DateTime, nullable=False)
    timezone = db.Column(db.String(50), default='UTC')
    
    # Assignment details
    course_code = db.Column(db.String(50), nullable=True)
    assignment_type = db.Column(db.String(100), nullable=True)
    
    # Foreign key
    professor_id = db.Column(db.String(36), db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    
    # Relationships - cascade delete submissions when deadline is deleted
    submissions = db.relationship('Submission', backref='deadline', lazy=True, cascade='all, delete-orphan')
    
    def __repr__(self):
        return f'<Deadline {self.title}>'
    
    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'description': self.description,
            'deadline_datetime': self.deadline_datetime.isoformat(),
            'timezone': self.timezone,
            'course_code': self.course_code,
            'assignment_type': self.assignment_type,
            'professor_id': self.professor_id,
            'created_at': self.created_at.isoformat()
        }
