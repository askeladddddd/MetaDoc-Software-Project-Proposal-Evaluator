"""
Submission-related Data Transfer Objects
"""

from typing import Optional, Dict, Any, List
from datetime import datetime


def _normalize_iso_datetime(value: Any) -> Optional[str]:
    """Return ISO-like datetime with UTC suffix when timezone is missing."""
    if not value:
        return None

    if isinstance(value, datetime):
        iso_value = value.isoformat()
    else:
        iso_value = str(value).strip()

    if not iso_value:
        return None

    if not iso_value.endswith('Z') and '+' not in iso_value:
        iso_value += 'Z'

    return iso_value


def _resolve_last_modified_iso(submission) -> Optional[str]:
    """Prefer document metadata modified date, fallback to submission timestamps."""
    metadata_modified = None
    latest_contributor_date = None

    def _parse_iso_candidate(date_value):
        if not date_value:
            return None
        try:
            normalized = str(date_value).strip().replace('Z', '+00:00')
            return datetime.fromisoformat(normalized)
        except Exception:
            return None

    if hasattr(submission, 'analysis_result') and submission.analysis_result:
        metadata = submission.analysis_result.document_metadata or {}
        metadata_modified = metadata.get('last_modified_date') or metadata.get('modified_date')

        contributors = metadata.get('contributors') if isinstance(metadata, dict) else None
        if isinstance(contributors, list):
            for contributor in contributors:
                if not isinstance(contributor, dict):
                    continue
                contributor_date = contributor.get('date')
                parsed_contributor_date = _parse_iso_candidate(contributor_date)
                if parsed_contributor_date and (latest_contributor_date is None or parsed_contributor_date > latest_contributor_date):
                    latest_contributor_date = parsed_contributor_date

    if metadata_modified:
        parsed_metadata_modified = _parse_iso_candidate(metadata_modified)
        if latest_contributor_date and parsed_metadata_modified and latest_contributor_date > parsed_metadata_modified:
            return _normalize_iso_datetime(latest_contributor_date)

        normalized_metadata = _normalize_iso_datetime(metadata_modified)
        if normalized_metadata:
            return normalized_metadata

    if latest_contributor_date:
        return _normalize_iso_datetime(latest_contributor_date)

    # Removed fallback to created_at/updated_at to leave blank if metadata is unavailable
    return None


def _get_document_metadata_last_modified_iso(submission) -> Optional[str]:
    """Return last-modified timestamp exactly from document metadata fields."""
    if not (hasattr(submission, 'analysis_result') and submission.analysis_result):
        return None

    metadata = submission.analysis_result.document_metadata or {}
    metadata_modified = metadata.get('last_modified_date') or metadata.get('modified_date')
    return _normalize_iso_datetime(metadata_modified)


class SubmissionDTO:
    """Base DTO for Submission model serialization"""
    
    @staticmethod
    def serialize(submission, include_analysis: bool = False) -> Dict[str, Any]:
        """Serialize Submission model to dictionary"""
        if not submission:
            return None
        
        created_at_iso = _normalize_iso_datetime(submission.created_at)
        last_modified_iso = _resolve_last_modified_iso(submission)
        
        data = {
            'id': submission.id,
            'job_id': submission.job_id,
            'file_name': submission.file_name,
            'original_filename': submission.original_filename,
            'file_size': submission.file_size,
            'mime_type': submission.mime_type,
            'submission_type': submission.submission_type,
            'student_id': submission.student_id,
            'student_name': submission.student_name,
            'semester': submission.semester,
            'status': submission.status.value if hasattr(submission.status, 'value') else submission.status,
            'is_late': submission.is_late if hasattr(submission, 'is_late') else False,
            'created_at': created_at_iso,
            'last_modified': last_modified_iso
        }
        
        if submission.google_drive_link:
            data['google_drive_link'] = submission.google_drive_link
        
        if submission.deadline_id:
            data['deadline_id'] = submission.deadline_id
        
        if submission.error_message:
            data['error_message'] = submission.error_message
        
        if include_analysis and hasattr(submission, 'analysis_summary'):
            data['analysis_summary'] = submission.analysis_summary
        
        return data
    
    @staticmethod
    def serialize_list(submissions) -> List[Dict[str, Any]]:
        """Serialize list of Submission models"""
        return [SubmissionDTO.serialize(sub) for sub in submissions]


class SubmissionListDTO:
    """DTO for submission list view with minimal data"""
    
    @staticmethod
    def serialize(submission) -> Dict[str, Any]:
        """Serialize submission for list view"""
        if not submission:
            return None
        
        created_at_iso = _normalize_iso_datetime(submission.created_at)
        metadata_last_modified_iso = _get_document_metadata_last_modified_iso(submission)
        last_modified_iso = metadata_last_modified_iso or _get_document_metadata_last_modified_iso(submission)
        
        # Get word count from analysis result if available
        word_count = None
        if hasattr(submission, 'analysis_result') and submission.analysis_result:
            if submission.analysis_result.content_statistics:
                word_count = submission.analysis_result.content_statistics.get('word_count')
        
        submitted_at_value = getattr(submission, 'submitted_at', None) or submission.created_at
        submitted_at_iso = submitted_at_value.isoformat() if submitted_at_value else None

        data = {
            'id': submission.id,
            'job_id': submission.job_id,
            'file_name': submission.file_name,
            'original_filename': submission.original_filename,
            'deadline_id': submission.deadline_id,
            'deadline_title': submission.deadline.title if hasattr(submission, 'deadline') and submission.deadline and submission.deadline.title else None,
            'student_id': submission.student_id,
            'student_name': submission.student_name,
            'semester': submission.semester,
            'status': submission.status.value if hasattr(submission, 'status') and submission.status else 'Unknown',
            'timeliness': submission.timeliness.value if hasattr(submission, 'timeliness') and submission.timeliness else 'UNKNOWN',
            'created_at': created_at_iso,
            'submitted_at': _normalize_iso_datetime(submitted_at_value),
            'updated_at': _normalize_iso_datetime(submission.updated_at) if hasattr(submission, 'updated_at') else None,
            'file_modified_at': _normalize_iso_datetime(submission.file_modified_at) if hasattr(submission, 'file_modified_at') and submission.file_modified_at else None,
            'metadata_last_modified': metadata_last_modified_iso,
            'last_modified': metadata_last_modified_iso,
            'last_activity': metadata_last_modified_iso,
            'file_size': submission.file_size,
            'submission_type': submission.submission_type
        }
        
        # Add analysis summary if word count is available
        if word_count is not None:
            data['analysis_summary'] = {'word_count': word_count}
        
        return data
    
    @staticmethod
    def serialize_list(submissions) -> List[Dict[str, Any]]:
        """Serialize list of submissions for list view"""
        return [SubmissionListDTO.serialize(sub) for sub in submissions]


class SubmissionDetailDTO:
    """DTO for detailed submission view with full information"""
    
    @staticmethod
    def serialize(submission) -> Dict[str, Any]:
        """Serialize submission with full details"""
        if not submission:
            return None
        
        created_at_iso = _normalize_iso_datetime(submission.created_at)
        last_modified_iso = _resolve_last_modified_iso(submission)
        
        started_at_iso = submission.processing_started_at.isoformat() if submission.processing_started_at else None
        if started_at_iso and not started_at_iso.endswith('Z') and '+' not in started_at_iso:
            started_at_iso += 'Z'
        
        completed_at_iso = submission.processing_completed_at.isoformat() if submission.processing_completed_at else None
        if completed_at_iso and not completed_at_iso.endswith('Z') and '+' not in completed_at_iso:
            completed_at_iso += 'Z'
        
        submitted_at_value = getattr(submission, 'submitted_at', None) or submission.created_at
        submitted_at_iso = submitted_at_value.isoformat() if submitted_at_value else None

        data = {
            'id': submission.id,
            'job_id': submission.job_id,
            'file_name': submission.file_name,
            'original_filename': submission.original_filename,
            'file_path': submission.file_path,
            'file_size': submission.file_size,
            'file_hash': submission.file_hash,
            'mime_type': submission.mime_type,
            'submission_type': submission.submission_type,
            'google_drive_link': submission.google_drive_link,
            'student_id': submission.student_id,
            'student_name': submission.student_name,
            'semester': submission.semester,
            'status': submission.status.value if hasattr(submission.status, 'value') else submission.status,
            'is_late': submission.is_late if hasattr(submission, 'is_late') else False,
            'created_at': created_at_iso,
            'submitted_at': _normalize_iso_datetime(submitted_at_value),
            'last_modified': last_modified_iso,
            'processing_started_at': _normalize_iso_datetime(submission.processing_started_at),
            'processing_completed_at': _normalize_iso_datetime(submission.processing_completed_at),
            'error_message': submission.error_message,
            'professor_id': submission.professor_id,
            'deadline_id': submission.deadline_id
        }
        
        if hasattr(submission, 'analysis_summary'):
            data['analysis_summary'] = submission.analysis_summary
        
        if hasattr(submission, 'analysis_result') and submission.analysis_result:
            from .analysis_dto import AnalysisResultDTO
            data['analysis_result'] = AnalysisResultDTO.serialize(submission.analysis_result, include_full_text=True)
        
        if hasattr(submission, 'deadline') and submission.deadline:
            from .deadline_dto import DeadlineDTO
            data['deadline'] = DeadlineDTO.serialize(submission.deadline)
        
        return data


class SubmissionTokenDTO:
    """DTO for Submission Token serialization"""
    
    @staticmethod
    def serialize(token) -> Dict[str, Any]:
        """Serialize SubmissionToken model"""
        if not token:
            return None
        
        return {
            'id': token.id,
            'token': token.token,
            'expires_at': token.expires_at.isoformat() if token.expires_at else None,
            'is_active': token.is_active,
            'usage_count': token.usage_count,
            'max_usage': token.max_usage,
            'deadline_id': token.deadline_id,
            'created_at': token.created_at.isoformat() if hasattr(token, 'created_at') else None
        }
    
    @staticmethod
    def serialize_list(tokens) -> List[Dict[str, Any]]:
        """Serialize list of tokens"""
        return [SubmissionTokenDTO.serialize(token) for token in tokens]
