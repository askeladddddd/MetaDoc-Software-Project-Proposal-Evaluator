"""
Analysis-related models
"""

from datetime import datetime
from sqlalchemy import Text, JSON
from app.core.extensions import db
from app.models.base import BaseModel, TimelinessClassification

class AnalysisResult(BaseModel):
    """Analysis Result model - Stores all analysis outputs"""
    __tablename__ = 'analysis_results'
    
    submission_id = db.Column(db.String(36), db.ForeignKey('submissions.id'), nullable=False, unique=True)
    
    # Module 2: Metadata and Content Analysis
    document_metadata = db.Column(JSON, nullable=True)
    content_statistics = db.Column(JSON, nullable=True)
    document_text = db.Column(db.Text, nullable=True)
    
    # Module 3: Rule-based Insights
    heuristic_insights = db.Column(JSON, nullable=True)
    timeliness_classification = db.Column(db.Enum(TimelinessClassification), nullable=True)
    contribution_growth_percentage = db.Column(db.Float, nullable=True)
    
    # Module 4: NLP Analysis
    nlp_results = db.Column(JSON, nullable=True)
    flesch_kincaid_score = db.Column(db.Float, nullable=True)
    readability_grade = db.Column(db.String(50), nullable=True)
    named_entities = db.Column(JSON, nullable=True)
    top_terms = db.Column(JSON, nullable=True)
    
    # AI-generated insights
    ai_summary = db.Column(Text, nullable=True)
    ai_insights = db.Column(JSON, nullable=True)
    
    # Validation flags
    is_complete_document = db.Column(db.Boolean, default=True)
    validation_warnings = db.Column(JSON, nullable=True)
    
    # Processing metadata
    analysis_version = db.Column(db.String(50), default="1.0")
    processing_duration_seconds = db.Column(db.Float, nullable=True)
    
    def __repr__(self):
        return f'<AnalysisResult for {self.submission_id}>'
    
    def to_dict(self):
        def _ensure_dict(data):
            if not data: return {}
            if isinstance(data, dict): return data
            if isinstance(data, str):
                import json
                try: return json.loads(data)
                except: return {}
            return {}

        return {
            'id': self.id,
            'submission_id': self.submission_id,
            'document_metadata': _ensure_dict(self.document_metadata),
            'content_statistics': _ensure_dict(self.content_statistics),
            'heuristic_insights': _ensure_dict(self.heuristic_insights),
            'timeliness_classification': self.timeliness_classification.value if self.timeliness_classification else None,
            'contribution_growth_percentage': self.contribution_growth_percentage,
            'nlp_results': _ensure_dict(self.nlp_results),
            'flesch_kincaid_score': self.flesch_kincaid_score,
            'readability_grade': self.readability_grade,
            'named_entities': _ensure_dict(self.named_entities),
            'top_terms': _ensure_dict(self.top_terms),
            'ai_summary': self.ai_summary,
            'ai_insights': _ensure_dict(self.ai_insights),
            'is_complete_document': self.is_complete_document,
            'validation_warnings': _ensure_dict(self.validation_warnings),
            'analysis_version': self.analysis_version,
            'created_at': self.created_at.isoformat()
        }


class DocumentSnapshot(BaseModel):
    """Document Snapshot model for version comparison"""
    __tablename__ = 'document_snapshots'
    
    file_id = db.Column(db.String(255), nullable=False, index=True)
    submission_id = db.Column(db.String(36), db.ForeignKey('submissions.id'), nullable=False)
    
    # Snapshot data
    word_count = db.Column(db.Integer, nullable=False)
    file_hash = db.Column(db.String(64), nullable=False)
    snapshot_timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Metadata for comparison
    major_changes = db.Column(db.Boolean, default=False)
    change_percentage = db.Column(db.Float, nullable=True)
    
    def __repr__(self):
        return f'<DocumentSnapshot {self.file_id} at {self.snapshot_timestamp}>'
