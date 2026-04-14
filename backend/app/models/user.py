"""
User and UserSession models
"""

from datetime import datetime
from sqlalchemy import Text
from app.core.extensions import db
from app.models.base import BaseModel, UserRole

class User(BaseModel):
    """User model for professor authentication"""
    __tablename__ = 'users'
    
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    name = db.Column(db.String(255), nullable=False)
    password_hash = db.Column(db.String(255), nullable=True)
    role = db.Column(db.Enum(UserRole), default=UserRole.PROFESSOR, nullable=False)
    google_id = db.Column(db.String(255), unique=True, nullable=True)
    profile_picture = db.Column(db.String(500), nullable=True)
    last_login = db.Column(db.DateTime, nullable=True)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    
    # Relationships
    submissions = db.relationship('Submission', backref='professor', lazy=True)
    deadlines = db.relationship('Deadline', backref='professor', lazy=True)
    sessions = db.relationship('UserSession', backref='user', lazy=True, cascade='all, delete-orphan', passive_deletes=True)
    
    def __repr__(self):
        return f'<User {self.email}>'
    
    def to_dict(self):
        return {
            'id': self.id,
            'email': self.email,
            'name': self.name,
            'role': self.role.value,
            'profile_picture': self.profile_picture,
            'last_login': self.last_login.isoformat() if self.last_login else None,
            'is_active': self.is_active
        }


class UserSession(BaseModel):
    """Session model for user session management"""
    __tablename__ = 'user_sessions'
    
    session_token = db.Column(db.String(255), unique=True, nullable=False, index=True)
    user_id = db.Column(db.String(36), db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)
    ip_address = db.Column(db.String(45), nullable=True)
    user_agent = db.Column(db.String(500), nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    
    # OAuth metadata
    google_access_token = db.Column(Text, nullable=True)
    google_refresh_token = db.Column(Text, nullable=True)
    token_expires_at = db.Column(db.DateTime, nullable=True)
    
    def __repr__(self):
        return f'<UserSession {self.session_token[:8]}... for {self.user_id}>'
