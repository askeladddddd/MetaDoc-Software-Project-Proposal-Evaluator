"""
Database models for MetaDoc system

This package contains all database models organized by domain:
- base: Base model and enums
- user: User and UserSession
- submission: Submission and SubmissionToken
- deadline: Deadline
- analysis: AnalysisResult and DocumentSnapshot
- audit: AuditLog
- report: ReportExport
"""

# Import base classes and enums
from app.models.base import (
    BaseModel,
    SubmissionStatus,
    TimelinessClassification,
    UserRole
)

# Import all models
from app.models.user import User, UserSession
from app.models.submission import Submission, SubmissionToken
from app.models.deadline import Deadline
from app.models.analysis import AnalysisResult, DocumentSnapshot
from app.models.audit import AuditLog
from app.models.report import ReportExport
from app.models.student import Student

# Export all models for easy importing
__all__ = [
    # Base
    'BaseModel',
    'SubmissionStatus',
    'TimelinessClassification',
    'UserRole',
    # Models
    'User',
    'UserSession',
    'Submission',
    'SubmissionToken',
    'Deadline',
    'AnalysisResult',
    'DocumentSnapshot',
    'AuditLog',
    'ReportExport',
    'Student'
]
