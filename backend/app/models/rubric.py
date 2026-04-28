"""
Rubric model for evaluation criteria
"""

from app.core.extensions import db
from app.models.base import BaseModel
from sqlalchemy.dialects.sqlite import JSON as SQLiteJSON
from sqlalchemy import Text

class Rubric(BaseModel):
    """Rubric model to store evaluation criteria in the database"""
    __tablename__ = 'rubrics'
    
    name = db.Column(db.String(255), nullable=False)
    description = db.Column(Text, nullable=True)
    criteria = db.Column(db.JSON, nullable=False) # Stores the list of criteria and levels
    system_instructions = db.Column(Text, nullable=True) # Custom Gemini prompt
    ai_prompt_message = db.Column(Text, nullable=True) # Manual AI prompt message with prioritization instructions
    evaluation_goal = db.Column(Text, nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    
    # Foreign key
    professor_id = db.Column(db.String(36), db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    
    def __repr__(self):
        return f'<Rubric {self.name}>'
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'criteria': self.criteria,
            'system_instructions': self.system_instructions,
            'ai_prompt_message': self.ai_prompt_message,
            'evaluation_goal': self.evaluation_goal,
            'is_active': self.is_active,
            'professor_id': self.professor_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if getattr(self, 'updated_at', None) else None
        }
