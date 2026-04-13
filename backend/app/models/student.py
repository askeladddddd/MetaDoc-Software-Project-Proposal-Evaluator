"""
Student model for Class Record tracking
"""

from app.core.extensions import db
from app.models.base import BaseModel

class Student(BaseModel):
    """Student model to track expected and registered students"""
    __tablename__ = 'students'
    
    student_id = db.Column(db.String(50), nullable=False) # ID number from Class Record
    last_name = db.Column(db.String(255), nullable=False)
    first_name = db.Column(db.String(255), nullable=False)
    email = db.Column(db.String(255), nullable=True) # Linked after registration
    
    course_year = db.Column(db.String(100), nullable=True)
    team_code = db.Column(db.String(100), nullable=True)
    subject_no = db.Column(db.String(100), nullable=True) # Added for explicit subject tracking
    
    # Registration status
    is_registered = db.Column(db.Boolean, default=False, nullable=False)
    registration_date = db.Column(db.DateTime, nullable=True)
    is_archived = db.Column(db.Boolean, default=False, nullable=False)
    archived_at = db.Column(db.DateTime, nullable=True)
    
    # Foreign key to Professor (User)
    professor_id = db.Column(db.String(36), db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    
    # Unique constraint per professor to prevent duplicate student IDs
    __table_args__ = (
        db.UniqueConstraint('student_id', 'professor_id', name='_student_professor_uc'),
    )
    
    def __repr__(self):
        return f'<Student {self.student_id}: {self.last_name}, {self.first_name}>'
    
    def to_dict(self):
        return {
            'id': self.id,
            'student_id': self.student_id,
            'last_name': self.last_name,
            'first_name': self.first_name,
            'email': self.email,
            'course_year': self.course_year,
            'team_code': self.team_code,
            'subject_no': self.subject_no,
            'is_registered': self.is_registered,
            'registration_date': self.registration_date.isoformat() if self.registration_date else None,
            'is_archived': self.is_archived,
            'archived_at': self.archived_at.isoformat() if self.archived_at else None,
            'professor_id': self.professor_id,
            'status': 'Registered' if self.is_registered else 'Pending'
        }
