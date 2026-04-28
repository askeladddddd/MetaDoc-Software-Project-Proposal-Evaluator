"""
Dashboard Module for MetaDoc

Implements SRS requirements:
- M5.UC02: View Submission Report (Dashboard)
- M5.UC03: Export Report (PDF / CSV)
- Deadline management
- Report viewing and filtering
"""

from datetime import datetime, timedelta, timezone
import json
import shutil
import time
from flask import Blueprint, request, jsonify, current_app, send_file

from sqlalchemy import desc, asc, and_, or_
import pytz
import os

from app.core.extensions import db
from app.models import (
    Submission, AnalysisResult, Deadline, User, DocumentSnapshot, AuditLog,
    SubmissionStatus, TimelinessClassification, UserRole, Student, UserSession
)
from app.services.audit_service import AuditService
from app.services import DashboardService, DriveService, SubmissionService
from app.api.auth import get_auth_service
from app.utils.decorators import require_authentication
from app.schemas.dto import (
    SubmissionListDTO, SubmissionDetailDTO, DeadlineDTO, DeadlineListDTO
)

dashboard_bp = Blueprint('dashboard', __name__)

# Initialize service
dashboard_service = None

def get_dashboard_service():
    global dashboard_service
    if dashboard_service is None:
        from app.services import DashboardService
        dashboard_service = DashboardService()
    return dashboard_service

# Lazy initialize
dashboard_service = get_dashboard_service()

# Lightweight in-process cache to prevent repeated AI generation bursts.
_contribution_report_cache = {}


def _parse_iso_datetime(value):
    """Parse ISO timestamp strings from Google APIs safely."""
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        if dt.tzinfo is not None:
            return dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt
    except Exception:
        return None


def _to_naive_utc(dt):
    """Normalize datetime values to naive UTC for safe comparisons."""
    if not dt:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _extract_drive_credentials_from_request():
    """Build user OAuth credentials payload when available for Drive access."""
    session_obj = getattr(request, 'current_session', None)
    if not session_obj or not session_obj.google_access_token:
        return None

    try:
        creds_dict = {
            "token": session_obj.google_access_token,
            "refresh_token": session_obj.google_refresh_token,
            "token_uri": "https://oauth2.googleapis.com/token",
            "client_id": current_app.config.get('GOOGLE_CLIENT_ID'),
            "client_secret": current_app.config.get('GOOGLE_CLIENT_SECRET'),
            "scopes": ['https://www.googleapis.com/auth/drive.readonly']
        }
        return json.dumps(creds_dict)
    except Exception as err:
        current_app.logger.warning(f"Failed to serialize Drive credentials: {err}")
        return None


def _refresh_drive_submission_analysis(submission, force_refresh=False):
    """Refresh stored metadata/content stats for Drive submissions when doc changed."""
    if not submission or not submission.google_drive_link:
        return False, None

    submission_service = SubmissionService()
    file_id, validation_error = submission_service.validate_drive_link(submission.google_drive_link)
    if validation_error:
        return False, validation_error

    drive_service = DriveService()
    user_creds_json = _extract_drive_credentials_from_request()

    drive_meta, meta_error = drive_service.get_file_metadata(file_id, user_credentials_json=user_creds_json)
    if meta_error or not drive_meta:
        error_message = meta_error.get('message') if isinstance(meta_error, dict) else meta_error
        return False, error_message or "Unable to fetch latest Drive metadata"

    remote_modified = _to_naive_utc(_parse_iso_datetime(drive_meta.get('modifiedTime')))
    local_processed = _to_naive_utc(submission.processing_completed_at)
    
    # [REVISION TRACKING] Use headRevisionId for definitive change detection
    current_revision_id = drive_meta.get('headRevisionId')
    stored_revision_id = None
    if submission.analysis_result and submission.analysis_result.document_metadata:
        stored_revision_id = submission.analysis_result.document_metadata.get('headRevisionId')

    has_stats = (
        submission.analysis_result is not None and
        bool(submission.analysis_result.content_statistics)
    )

    # Check if we can skip the refresh
    is_same_revision = stored_revision_id and current_revision_id and (stored_revision_id == current_revision_id)
    is_up_to_date_time = remote_modified and local_processed and (remote_modified <= local_processed)

    if not force_refresh and has_stats:
        if current_revision_id:
            if is_same_revision:
                return False, None
        elif is_up_to_date_time:
            # Fallback to timestamp if revision ID is unavailable
            return False, None

    filename = f"refresh_{submission.id}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.docx"
    temp_path, download_error = drive_service.download_file(
        file_id,
        filename,
        mime_type=drive_meta.get('mimeType'),
        user_credentials_json=user_creds_json
    )
    if download_error or not temp_path or not os.path.exists(temp_path):
        return False, download_error or "Unable to download latest Drive document"

    from app.services.metadata_service import MetadataService
    metadata_service = MetadataService()

    metadata, metadata_error = metadata_service.extract_docx_metadata(
        temp_path,
        external_metadata=drive_meta
    )
    if metadata_error:
        return False, metadata_error

    text, text_error = metadata_service.extract_document_text(temp_path)
    if text_error:
        return False, text_error

    content_stats = metadata_service.compute_content_statistics(text)
    is_complete, warnings = metadata_service.validate_document_completeness(content_stats, text)

    target_path = submission.file_path
    if not target_path:
        target_path = os.path.join(
            current_app.config['UPLOAD_FOLDER'],
            f"drive_submission_{submission.id}.docx"
        )

    os.makedirs(os.path.dirname(target_path), exist_ok=True)
    try:
        if os.path.abspath(temp_path) != os.path.abspath(target_path):
            shutil.move(temp_path, target_path)
    except Exception as move_err:
        current_app.logger.warning(f"Could not replace stored Drive file for {submission.id}: {move_err}")
        target_path = temp_path

    analysis = submission.analysis_result
    if not analysis:
        analysis = AnalysisResult(submission_id=submission.id)
        db.session.add(analysis)
        submission.analysis_result = analysis
    else:
        # Loophole Fix: Archive the old report before overwriting it!
        # If there's an existing AI evaluation, save it so students can't completely erase their history
        if analysis.ai_summary or analysis.ai_insights:
            archive_dir = os.path.join(current_app.config.get('REPORTS_STORAGE_PATH', './reports'), 'archive')
            os.makedirs(archive_dir, exist_ok=True)
            archive_filename = f"report_archive_{submission.id}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
            archive_path = os.path.join(archive_dir, archive_filename)
            try:
                with open(archive_path, 'w') as f:
                    json.dump(analysis.to_dict(), f, indent=2)
                current_app.logger.info(f"Loophole Fix: Archived previous report to {archive_path} before revision update")
            except Exception as archive_err:
                current_app.logger.error(f"Failed to archive report: {archive_err}")

    analysis.document_metadata = metadata
    analysis.content_statistics = content_stats
    analysis.document_text = text
    analysis.is_complete_document = is_complete
    analysis.validation_warnings = warnings

    # [RE-EVALUATION] Clear previous AI evaluation to trigger automatic re-analysis 
    # of the new document version in the frontend.
    analysis.nlp_results = {}
    analysis.ai_insights = {}
    analysis.ai_summary = None
    analysis.updated_at = datetime.utcnow()
    current_app.logger.info(f"AI Evaluation reset for submission {submission.id} due to document change")

    submission.file_path = target_path
    submission.file_size = os.path.getsize(target_path) if os.path.exists(target_path) else submission.file_size
    if drive_meta.get('name'):
        submission.original_filename = drive_meta.get('name')
        submission.file_name = drive_meta.get('name')
    
    # Update file_modified_at from Drive if available
    if drive_meta.get('modifiedTime'):
        submission.file_modified_at = _parse_iso_datetime(drive_meta.get('modifiedTime'))
        
    submission.status = SubmissionStatus.WARNING if warnings else SubmissionStatus.COMPLETED
    submission.processing_completed_at = datetime.utcnow()
    submission.error_message = None

    db.session.commit()
    current_app.logger.info(f"Drive submission {submission.id} analysis refreshed from latest revision")
    return True, None

@dashboard_bp.route('/overview', methods=['GET'])
@require_authentication()
def get_dashboard_overview():
    """
    Get dashboard overview with statistics
    
    SRS Reference: Dashboard functionality for professor interface
    """
    try:
        user_id = request.current_user.id
        
        overview_data, error = dashboard_service.get_dashboard_overview(user_id)
        
        if error:
            return jsonify({'error': error}), 500
        
        return jsonify(overview_data)
        
    except Exception as e:
        current_app.logger.error(f"Dashboard overview error: {e}")
        return jsonify({'error': 'Error loading dashboard'}), 500

@dashboard_bp.route('/submissions', methods=['GET'])
@require_authentication()
def get_submissions():
    """
    Get submissions list with filtering and pagination
    
    SRS Reference: M5.UC02 - View Submission Report
    """
    try:
        user_id = request.current_user.id
        
        # Parse query parameters
        filters = {}
        if request.args.get('status'):
            filters['status'] = request.args.get('status')
        if request.args.get('deadline_id'):
            filters['deadline_id'] = request.args.get('deadline_id')
        if request.args.get('student_id'):
            filters['student_id'] = request.args.get('student_id')
        if request.args.get('search'):
            filters['search'] = request.args.get('search')
        if request.args.get('team_code'):
            filters['team_code'] = request.args.get('team_code')
        if request.args.get('date_from'):
            filters['date_from'] = request.args.get('date_from')
        if request.args.get('date_to'):
            filters['date_to'] = request.args.get('date_to')
        if request.args.get('timeliness'):
            filters['timeliness'] = request.args.get('timeliness')
        if request.args.get('sort_by'):
            filters['sort_by'] = request.args.get('sort_by')
        if request.args.get('sort_order'):
            filters['sort_order'] = request.args.get('sort_order')
        
        # Parse pagination
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 20))
        
        result, error = dashboard_service.get_submissions_list(
            user_id=user_id,
            filters=filters if filters else None,
            page=page,
            per_page=per_page
        )
        
        if error:
            return jsonify({'error': error}), 500
        
        return jsonify(result)
        
    except Exception as e:
        current_app.logger.error(f"Submissions list error: {e}")
        return jsonify({'error': 'Error loading submissions'}), 500

@dashboard_bp.route('/submissions/<submission_id>', methods=['GET'])
@require_authentication()
def get_submission_detail(submission_id):
    """
    Get detailed submission information
    
    SRS Reference: M5.UC02 - View Submission Report (detailed view)
    """
    try:
        user_id = request.current_user.id
        
        submission, error = dashboard_service.get_submission_detail(submission_id, user_id)
        
        if error:
            return jsonify({'error': error}), 404 if 'not found' in error else 500
            
        # Keep Drive-link submissions in sync with latest remote edits.
        try:
            if submission.google_drive_link:
                force_refresh = str(request.args.get('force_refresh', 'false')).lower() == 'true'
                refreshed, refresh_error = _refresh_drive_submission_analysis(submission, force_refresh=force_refresh)
                if refresh_error:
                    if force_refresh:
                        return jsonify({'error': f"Refresh failed: {refresh_error}"}), 400
                    current_app.logger.warning(
                        f"Drive sync skipped for submission {submission.id}: {refresh_error}"
                    )
                elif refreshed:
                    db.session.refresh(submission)
        except Exception as sync_err:
            current_app.logger.warning(f"Drive analysis sync failed for {submission.id}: {sync_err}")

        # [Auto-Repair] Check if metadata is missing/incomplete
        # This fixes submissions that were processed before the metadata logic was improved
        try:
            # Force GDrive re-download if file is missing locally
            processing_path = submission.file_path
            if submission.google_drive_link and (not processing_path or not os.path.exists(processing_path)):
                current_app.logger.info(f"File missing for {submission.id}, attempting re-download from Drive link")
                try:
                    # Extract ID
                    file_id = None
                    if 'drive.google.com' in submission.google_drive_link or 'docs.google.com' in submission.google_drive_link:
                         import re
                         match = re.search(r'[-\w]{25,}', submission.google_drive_link)
                         if match: file_id = match.group()
                    
                    if file_id:
                        from app.services.drive_service import DriveService
                        drive_service = DriveService()
                        # Use generic name for temp processing
                        temp_path, _ = drive_service.download_file(file_id, "temp_reprocess.docx", "application/vnd.google-apps.document")
                        if temp_path and os.path.exists(temp_path):
                            processing_path = temp_path
                except Exception as dl_err:
                     current_app.logger.warning(f"Re-download failed: {dl_err}")

            if processing_path and os.path.exists(processing_path):
                needs_update = False
                if not submission.analysis_result:
                    needs_update = True
                if submission.analysis_result and submission.analysis_result.document_metadata:
                    meta = submission.analysis_result.document_metadata
                    # Check if key fields are unavailable
                    if meta.get('author') == 'Unavailable' and meta.get('last_editor') == 'Unavailable':
                         needs_update = True
                    # [Correction] If Author is currently set to Student Name, force re-check
                    # This fixes records where Student Name was incorrectly assigned as Author
                    elif submission.student_name and meta.get('author') == submission.student_name:
                        needs_update = True
                
                if needs_update:
                    current_app.logger.info(f"Auto-repairing metadata for submission {submission.id}")
                    from app.services.metadata_service import MetadataService
                    meta_service = MetadataService()
                    
                    # Re-extract
                    new_metadata, err = meta_service.extract_docx_metadata(processing_path)
                    
                    if not err and new_metadata:
                        # [GDrive Enhancement] Try to fetch real owner info if it's a Drive link
                        if submission.google_drive_link:
                            try:
                                # Extract ID from link
                                file_id = None
                                if 'drive.google.com' in submission.google_drive_link or 'docs.google.com' in submission.google_drive_link:
                                    import re
                                    # Simple regex for ID (alphanumeric, -, _)
                                    match = re.search(r'[-\w]{25,}', submission.google_drive_link)
                                    if match:
                                        file_id = match.group()
                                
                                if file_id:
                                    from app.services.drive_service import DriveService
                                    from flask import session
                                    drive_service = DriveService()
                                    
                                    # Use the current request's session object which has the persisted tokens
                                    user_creds = None
                                    if hasattr(request, 'current_session') and request.current_session:
                                        curr_sess = request.current_session
                                        if curr_sess.google_access_token:
                                            try:
                                                import json
                                                creds_dict = {
                                                    "token": curr_sess.google_access_token,
                                                    "refresh_token": curr_sess.google_refresh_token,
                                                    "token_uri": "https://oauth2.googleapis.com/token",
                                                    "client_id": current_app.config.get('GOOGLE_CLIENT_ID'),
                                                    "client_secret": current_app.config.get('GOOGLE_CLIENT_SECRET'),
                                                    "scopes": ['https://www.googleapis.com/auth/drive.readonly']
                                                }
                                                user_creds = json.dumps(creds_dict)
                                            except Exception as json_err:
                                                current_app.logger.warning(f"Failed to format credentials: {json_err}")
                                    
                                    # Fallback to flask session if current_session is missing
                                    if not user_creds:
                                        user_creds = session.get('google_credentials')
                                    
                                    # Try to fetch GDrive metadata with credentials
                                    g_meta, g_error = drive_service.get_file_metadata(file_id, user_credentials_json=user_creds)
                                    
                                    if g_meta and not g_error:
                                        # [Title Repair] Update filename if we found a better one and current is generic
                                        if 'name' in g_meta and g_meta['name'] and g_meta['name'] != 'Google_Drive_File.docx':
                                            current_name = submission.original_filename
                                            # Check if current name is generic, hash version, or suspiciously short/default
                                            is_generic = (
                                                'Google_Drive_File' in current_name or 
                                                'submission' in current_name.lower() or
                                                current_name == 'file.docx'
                                            )
                                            
                                            if is_generic:
                                                current_app.logger.info(f"Renaming submission {submission.id} from {current_name} to {g_meta['name']}")
                                                submission.original_filename = g_meta['name']
                                                submission.file_name = g_meta['name'] # Update display name too
                                                db.session.add(submission)
                                                # Explicit commit for filename change
                                                db.session.commit()

                                        # Got real GDrive data! Use extracted metadata with GDrive augmentation
                                        # Use the improved MetadataService logic by calling it again with GDrive meta
                                        new_metadata, err = meta_service.extract_docx_metadata(processing_path, external_metadata=g_meta)
                                        
                                        if not err and new_metadata:
                                            # Successfully merged GDrive info into metadata
                                            pass 
                                        else:
                                            # Fallback to manual merge if re-extraction fails (redundancy)
                                            if 'owners' in g_meta and g_meta['owners']:
                                                owner = g_meta['owners'][0]
                                                owner_display = f"{owner.get('displayName')}"
                                                if owner.get('emailAddress'):
                                                    owner_display += f" ({owner.get('emailAddress')})"
                                                new_metadata['author'] = owner_display
                                            
                                            if 'lastModifyingUser' in g_meta:
                                                mod_user = g_meta['lastModifyingUser']
                                                mod_display = f"{mod_user.get('displayName')}"
                                                if mod_user.get('emailAddress'):
                                                    mod_display += f" ({mod_user.get('emailAddress')})"
                                                new_metadata['last_editor'] = mod_display

                            except Exception as drive_err:
                                current_app.logger.warning(f"Could not fetch GDrive specific metadata: {drive_err}")

                        # [Fallback] Use Student Name from submission if Author is still Unavailable
                        # ONLY for direct file uploads. For Google Drive, we prefer 'Unavailable' over incorrect attribution
                        # unless the user strictly requested otherwise.
                        if submission.student_name and not submission.google_drive_link and new_metadata.get('author') == 'Unavailable':
                            from app.models import Student

                            student_row = None
                            if submission.student_id and submission.professor_id:
                                student_row = Student.query.filter_by(
                                    professor_id=submission.professor_id,
                                    student_id=submission.student_id
                                ).first()

                            student_email = (student_row.email.strip().lower() if student_row and student_row.email else None)

                            new_metadata['author'] = submission.student_name
                            
                            # Ensure contributors list has the student
                            has_student = False
                            if new_metadata.get('contributors'):
                                for c in new_metadata['contributors']:
                                    if c.get('name') == submission.student_name:
                                        has_student = True
                                        break
                            else:
                                new_metadata['contributors'] = []
                                
                            if not has_student:
                                new_metadata['contributors'].append({
                                    'name': submission.student_name,
                                    'role': 'Author (Student)',
                                    'date': new_metadata.get('creation_date')
                                })
                        
                        # Update DB
                        # ... rest of the update logic ...
                        from app.models import AnalysisResult
                        if not submission.analysis_result:
                            submission.analysis_result = AnalysisResult(submission_id=submission.id)
                            db.session.add(submission.analysis_result)
                        
                        submission.analysis_result.document_metadata = new_metadata
                        
                        # Sync submission's file_modified_at for better list-view consistency
                        if new_metadata.get('last_modified_date'):
                            from app.api.submission import _parse_iso_datetime
                            new_mod_at = _parse_iso_datetime(new_metadata['last_modified_date'])
                            if new_mod_at:
                                submission.file_modified_at = new_mod_at
                                
                        db.session.commit()
                        current_app.logger.info("Metadata auto-repaired successfully")
        except Exception as e:
            current_app.logger.error(f"Auto-repair failed (non-critical): {e}")

        # Serialize submission using DTO
        from app.schemas.dto import SubmissionDetailDTO
        return jsonify(SubmissionDetailDTO.serialize(submission))
        
    except Exception as e:
        current_app.logger.error(f"Submission detail error: {e}")
        return jsonify({'error': 'Error loading submission details'}), 500

@dashboard_bp.route('/deadlines', methods=['GET'])
@require_authentication()
def get_deadlines():
    """Get list of deadlines for the authenticated user"""
    try:
        user_id = request.current_user.id
        include_past = request.args.get('include_past', 'false').lower() == 'true'
        
        deadlines, error = dashboard_service.get_deadlines_list(user_id)
        
        if error:
            return jsonify({'error': error}), 500
        
        # Serialize deadlines using DTO
        from app.schemas.dto import DeadlineListDTO
        return jsonify({
            'deadlines': [DeadlineListDTO.serialize(d) for d in deadlines]
        })
        
    except Exception as e:
        current_app.logger.error(f"Deadlines list error: {e}")
        return jsonify({'error': 'Error loading deadlines'}), 500

@dashboard_bp.route('/deadlines', methods=['POST'])
@require_authentication()
def create_deadline():
    """Create a new deadline"""
    try:
        user_id = request.current_user.id
        data = request.get_json()
        
        if not data or not data.get('title') or not data.get('deadline_datetime'):
            return jsonify({'error': 'Title and deadline_datetime are required'}), 400
        
        deadline, error = dashboard_service.create_deadline(user_id, data)
        
        if error:
            return jsonify({'error': error}), 400
        
        from app.schemas.dto import DeadlineDTO
        return jsonify({
            'message': 'Deadline created successfully',
            'deadline': DeadlineDTO.serialize(deadline)
        }), 201
        
    except Exception as e:
        current_app.logger.error(f"Deadline creation error: {e}")
        return jsonify({'error': 'Error creating deadline'}), 500

@dashboard_bp.route('/deadlines/<deadline_id>', methods=['PUT'])
@require_authentication()
def update_deadline(deadline_id):
    """Update an existing deadline"""
    try:
        user_id = request.current_user.id
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No update data provided'}), 400
        
        deadline, error = dashboard_service.update_deadline(deadline_id, user_id, data)
        
        if error:
            return jsonify({'error': error}), 404 if 'not found' in error else 400
        
        from app.schemas.dto import DeadlineDTO
        return jsonify({
            'message': 'Deadline updated successfully',
            'deadline': DeadlineDTO.serialize(deadline)
        })
        
    except Exception as e:
        current_app.logger.error(f"Deadline update error: {e}")
        return jsonify({'error': 'Error updating deadline'}), 500

@dashboard_bp.route('/deadlines/<deadline_id>', methods=['DELETE'])
@require_authentication()
def delete_deadline(deadline_id):
    """Delete a deadline"""
    try:
        user_id = request.current_user.id
        
        success, error = dashboard_service.delete_deadline(deadline_id, user_id)
        
        if error:
            return jsonify({'error': error}), 404 if 'not found' in error else 400
        
        return jsonify({
            'message': 'Deadline deleted successfully'
        })
        
    except Exception as e:
        current_app.logger.error(f"Deadline deletion error: {e}")
        return jsonify({'error': 'Error deleting deadline'}), 500

@dashboard_bp.route('/submissions/<submission_id>', methods=['DELETE'])
@require_authentication()
def delete_submission(submission_id):
    """Delete a submission"""
    try:
        user_id = request.current_user.id
        
        success, error = dashboard_service.delete_submission(submission_id, user_id)
        
        if error:
            return jsonify({'error': error}), 404 if 'not found' in error else 400
        
        return jsonify({
            'message': 'Submission deleted successfully'
        })
        
    except Exception as e:
        current_app.logger.error(f"Submission deletion error: {e}")
        return jsonify({'error': 'Error deleting submission'}), 500


@dashboard_bp.route('/submissions/<submission_id>/download', methods=['GET'])
@require_authentication()
def download_submission_file(submission_id):
    """
    Download/View the submission file
    """
    try:
        user_id = request.current_user.id
        submission, error = dashboard_service.get_submission_detail(submission_id, user_id)
        
        if error:
             return jsonify({'error': error}), 404 if 'not found' in error else 500
             
        # Allow downloading of the local snapshot file even if it's a drive link
        # This provides a fallback if the link is inaccessible or if the user wants the analyzed version


        if not submission.file_path:
             return jsonify({'error': 'No file path associated with submission'}), 404
             
        # Ensure absolute path
        abs_file_path = os.path.abspath(submission.file_path)

        if not os.path.exists(abs_file_path):
             current_app.logger.error(f"File not found on disk: {abs_file_path}")
             return jsonify({'error': 'File not found on server'}), 404
             
        return send_file(
            abs_file_path,
            as_attachment=False, # View in browser if possible (inline)
            download_name=submission.original_filename,
            mimetype=submission.mime_type or 'application/pdf'
        )
    except Exception as e:
        import traceback
        current_app.logger.error(f"Download error: {e}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': f'Error downloading file: {str(e)}'}), 500

@dashboard_bp.route('/deadlines/<deadline_id>/download-all', methods=['GET'])
@require_authentication()
def download_deadline_files(deadline_id):
    """
    Download all submission files for a deadline as a ZIP archive
    """
    try:
        user_id = request.current_user.id
        
        # Verify deadline ownership
        deadline = Deadline.query.filter_by(id=deadline_id, professor_id=user_id).first()
        if not deadline:
            return jsonify({'error': 'Deadline not found'}), 404
            
        submissions = Submission.query.filter_by(deadline_id=deadline_id).all()
        if not submissions:
            return jsonify({'error': 'No submissions found for this deadline'}), 404
            
        # Create ZIP in memory
        import zipfile
        import io
        
        memory_file = io.BytesIO()
        with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zf:
            added_files = set()
            for sub in submissions:
                if sub.file_path and os.path.exists(sub.file_path):
                    # Create a unique filename for the zip
                    # Format: StudentName_OriginalName
                    student_prefix = sub.student_name.replace(' ', '_') if sub.student_name else sub.student_id or 'Unknown'
                    clean_filename = f"{student_prefix}_{sub.original_filename}".replace(' ', '_')
                    
                    # Handle duplicates in zip
                    if clean_filename in added_files:
                        name, ext = os.path.splitext(clean_filename)
                        clean_filename = f"{name}_{sub.id[:4]}{ext}"
                    
                    zf.write(sub.file_path, clean_filename)
                    added_files.add(clean_filename)
        
        memory_file.seek(0)
        
        return send_file(
            memory_file,
            as_attachment=True,
            download_name=f"{deadline.title.replace(' ', '_')}_Submissions.zip",
            mimetype='application/zip'
        )
        
    except Exception as e:
        import traceback
        current_app.logger.error(f"Batch download error: {e}")
        return jsonify({'error': 'Error preparing batch download'}), 500


@dashboard_bp.route('/students', methods=['GET'])
@require_authentication()
def get_students():
    """Get list of students for the system"""
    try:
        user_id = request.current_user.id
        archived_param = request.args.get('archived')
        archived = None
        if archived_param is not None:
            archived = str(archived_param).lower() == 'true'
        result, error = dashboard_service.get_students(user_id, archived=archived)
        
        if error:
            return jsonify({'error': error}), 404 if 'not found' in error else 500
        
        return jsonify({'students': result})
        
    except Exception as e:
        current_app.logger.error(f"Get students error: {e}")
        return jsonify({'error': 'Error loading students'}), 500

@dashboard_bp.route('/students/archive', methods=['POST'])
@require_authentication()
def archive_students():
    """Archive selected students."""
    try:
        user_id = request.current_user.id
        data = request.get_json() or {}
        student_ids = data.get('student_ids', [])

        result, error = dashboard_service.archive_students(user_id, student_ids)
        if error:
            return jsonify({'error': error}), 400

        return jsonify({'message': 'Students restricted successfully', 'stats': result}), 200
    except Exception as e:
        current_app.logger.error(f"Archive students error: {e}")
        return jsonify({'error': 'Error archiving students'}), 500

@dashboard_bp.route('/students/unarchive', methods=['POST'])
@require_authentication()
def unarchive_students():
    """Restore selected archived students."""
    try:
        user_id = request.current_user.id
        data = request.get_json() or {}
        student_ids = data.get('student_ids', [])

        result, error = dashboard_service.unarchive_students(user_id, student_ids)
        if error:
            return jsonify({'error': error}), 400

        return jsonify({'message': 'Student restrictions removed successfully', 'stats': result}), 200
    except Exception as e:
        current_app.logger.error(f"Unarchive students error: {e}")
        return jsonify({'error': 'Error restoring students'}), 500

@dashboard_bp.route('/students/import', methods=['POST'])
@require_authentication()
def import_students():
    """Import students to the system"""
    try:
        user_id = request.current_user.id
        data = request.get_json()
        
        if not data or 'students' not in data:
            return jsonify({'error': 'No student data provided'}), 400
        
        result, error = dashboard_service.import_students(user_id, data['students'])
        
        if error:
            return jsonify({'error': error}), 400
        
        return jsonify({
            'message': 'Students imported successfully',
            'stats': result
        })
        
    except Exception as e:
        current_app.logger.error(f"Import students error: {e}")
        return jsonify({'error': 'Error importing students'}), 500
@dashboard_bp.route('/students/<student_id>', methods=['DELETE'])
@require_authentication()
def delete_student(student_id):
    """Delete a student record from the system"""
    try:
        user_id = request.current_user.id
        success, error = dashboard_service.delete_student(student_id, user_id)
        
        if error:
            return jsonify({'error': error}), 404 if 'not found' in error else 400
        
        return jsonify({
            'message': 'Student record deleted successfully'
        })
        
    except Exception as e:
        current_app.logger.error(f"Delete student error: {e}")
        return jsonify({'error': 'Error deleting student record'}), 500

@dashboard_bp.route('/students/add', methods=['POST'])
@require_authentication()
def add_student():
    """Manually add a single student to the system"""
    try:
        user_id = request.current_user.id
        data = request.get_json()
        
        if not data or not data.get('student_id') or not data.get('last_name'):
            return jsonify({'error': 'Student ID and Last Name are required'}), 400
        
        student, error = dashboard_service.add_student(user_id, data)
        
        if error:
            return jsonify({'error': error}), 400
        
        return jsonify({
            'message': 'Student added successfully',
            'student': student
        }), 201
        
    except Exception as e:
        current_app.logger.error(f"Add student error: {e}")
        return jsonify({'error': 'Error adding student record'}), 500

@dashboard_bp.route('/students/<student_id>', methods=['PUT'])
@require_authentication()
def update_student(student_id):
    """Update an existing student record"""
    try:
        user_id = request.current_user.id
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No update data provided'}), 400
        
        student, error = dashboard_service.update_student(student_id, user_id, data)
        
        if error:
            return jsonify({'error': error}), 400
        
        return jsonify({
            'message': 'Student updated successfully',
            'student': student
        })
        
    except Exception as e:
        current_app.logger.error(f"Update student error: {e}")
        return jsonify({'error': 'Error updating student record'}), 500
@dashboard_bp.route('/submissions/<submission_id>/contribution-report', methods=['GET'])
@require_authentication()
def get_contribution_report(submission_id):
    """
    Generate AI Analysis & Evaluation report for a submission.
    Prioritizes REAL DOCX tracked changes analysis over Google Drive API estimates.
    """
    try:
        user = request.current_user
        
        # Super-robust role check for various serialization formats
        role_id = str(user.role).lower()
        role_value = str(user.role.value).lower() if hasattr(user.role, 'value') else ""
        role_name = str(user.role.name).lower() if hasattr(user.role, 'name') else ""
        
        is_authorized = any(kw in role_id or kw in role_value or kw in role_name 
                           for kw in ['professor', 'admin'])
        
        if not is_authorized:
            return jsonify({'error': 'Unauthorized. Only professors can view this report.'}), 403
            
        submission = Submission.query.filter_by(id=submission_id, professor_id=user.id).first()
        if not submission:
            return jsonify({'error': 'Submission not found or unauthorized'}), 404

        force_refresh = str(request.args.get('refresh', 'false')).lower() == 'true'

        # Fast cache path to avoid repeated Gemini calls within a short window.
        try:
            cache_key = str(submission.id)
            submission_version = "|".join([
                submission.updated_at.isoformat() if submission.updated_at else '',
                submission.processing_completed_at.isoformat() if submission.processing_completed_at else '',
                submission.google_drive_link or ''
            ])
            cached = _contribution_report_cache.get(cache_key)
            if (
                not force_refresh and
                cached and
                cached.get('version') == submission_version and
                (time.time() - float(cached.get('createdAtEpoch') or 0)) < 120
            ):
                return jsonify(cached.get('report'))
        except Exception as cache_err:
            current_app.logger.warning(f"Contribution report cache read skipped: {cache_err}")
        
        # Keep baseline stats aligned with latest Drive content when available.
        try:
            if submission.google_drive_link:
                _refresh_drive_submission_analysis(submission, force_refresh=force_refresh)
                db.session.refresh(submission)
        except Exception as sync_err:
            current_app.logger.warning(f"Pre-report sync failed for submission {submission_id}: {sync_err}")

        # Get expected word count from analysis results
        expected_word_count = None
        try:
            expected_word_count = (
                submission.analysis_result.content_statistics.get('word_count')
                if submission.analysis_result and submission.analysis_result.content_statistics
                else None
            )
        except Exception:
            expected_word_count = None
        
        drive_service = DriveService()
        report = None
        error = None
        
        # ══════════════════════════════════════════════════════════════════════════
        # PRIORITY 1: Use REAL DOCX Tracked Changes (if file is locally available)
        # ══════════════════════════════════════════════════════════════════════════
        if submission.submission_type in ['file_upload', 'docx', 'word']:
            # DOCX file uploaded locally - use REAL tracked changes
            if submission.file_path and os.path.exists(submission.file_path):
                current_app.logger.info(f"Analyzing DOCX tracked changes for submission {submission_id}")
                report, error = drive_service.generate_docx_contribution_report(
                    submission.file_path,
                    expected_word_count=expected_word_count
                )
                
                if report and not error:
                    # Success - return real DOCX analysis
                    return jsonify(report)
                else:
                    current_app.logger.warning(f"DOCX tracked changes analysis failed: {error}. Will try alternative method.")
        
        # ══════════════════════════════════════════════════════════════════════════
        # PRIORITY 2: Use Google Drive API (for Google Docs/Sheets or cloud links)
        # ══════════════════════════════════════════════════════════════════════════
        if submission.submission_type == 'drive_link' or submission.google_drive_link:
            if not submission.google_drive_link:
                return jsonify({'error': 'No Google Drive link associated with this submission.'}), 400
            
            # Extract File ID
            submission_service = SubmissionService()
            file_id, validation_error = submission_service.validate_drive_link(submission.google_drive_link)
            
            if validation_error:
                return jsonify({'error': f"Invalid Drive link: {validation_error}"}), 400
            
            # Get professor's credentials
            user_creds_json = None
            session_obj = getattr(request, 'current_session', None)
            oauth_session = session_obj

            # Fallback: use latest persisted Google OAuth session for this professor.
            if (not oauth_session) or (not getattr(oauth_session, 'google_access_token', None)):
                oauth_session = UserSession.query.filter(
                    UserSession.user_id == user.id,
                    UserSession.google_access_token.isnot(None)
                ).order_by(UserSession.created_at.desc()).first()

            if oauth_session and oauth_session.google_access_token:
                try:
                    import json
                    creds_dict = {
                        "token": oauth_session.google_access_token,
                        "refresh_token": oauth_session.google_refresh_token,
                        "token_uri": "https://oauth2.googleapis.com/token",
                        "client_id": current_app.config.get('GOOGLE_CLIENT_ID'),
                        "client_secret": current_app.config.get('GOOGLE_CLIENT_SECRET'),
                        "scopes": ['https://www.googleapis.com/auth/drive.readonly']
                    }
                    user_creds_json = json.dumps(creds_dict)
                except Exception as cred_err:
                    current_app.logger.warning(f"Failed to prepare user credentials: {cred_err}")

            if not user_creds_json:
                return jsonify({
                    'error': 'Google Drive permission setup required. Please sign out and sign in using Google professor login, then try again.'
                }), 400
            
            current_app.logger.info(f"Analyzing Google Drive revision history for submission {submission_id}")
            quick_mode = str(request.args.get('quick', 'false')).lower() == 'true'

            roster_rows = Student.query.filter_by(professor_id=user.id, is_archived=False).all()
            roster_members = []
            roster_emails = []
            for s in roster_rows:
                member_email = str(getattr(s, 'email', '') or '').strip().lower()
                member_name = f"{str(getattr(s, 'first_name', '') or '').strip()} {str(getattr(s, 'last_name', '') or '').strip()}".strip()
                if not member_name:
                    member_name = str(getattr(s, 'student_id', '') or '').strip() or 'Student'
                roster_members.append({
                    'studentId': str(getattr(s, 'student_id', '') or '').strip() or None,
                    'name': member_name,
                    'email': member_email or None,
                    'teamCode': str(getattr(s, 'team_code', '') or '').strip() or None,
                    'courseYear': str(getattr(s, 'course_year', '') or '').strip() or None,
                    'subjectNo': str(getattr(s, 'subject_no', '') or '').strip() or None,
                })
                if member_email:
                    roster_emails.append(member_email)

            submitter_email = None
            if submission.student_id:
                submitter_row = Student.query.filter_by(
                    professor_id=user.id,
                    student_id=submission.student_id
                ).first()
                if submitter_row and submitter_row.email:
                    submitter_email = str(submitter_row.email).strip().lower()

            submitter_identity = {
                'name': submission.student_name,
                'email': submitter_email
            }

            deadline_dt = submission.deadline.deadline_datetime if submission.deadline else None
            
            report, error = drive_service.generate_contribution_report(
                file_id,
                user_creds_json,
                expected_word_count=expected_word_count,
                quick_mode=quick_mode,
                allowed_emails=roster_emails,
                roster_members=roster_members,
                deadline_datetime=deadline_dt,
                submitter_identity=submitter_identity,
                document_metadata=(submission.analysis_result.document_metadata if submission.analysis_result else None)
            )
        
        # Handle errors
        if error:
            current_app.logger.error(f"Contribution report failed for {submission_id}: {error}")
            
            # Special guidance for missing tokens (likely an old session)
            if "Insufficient permissions" in error or "Google Drive service unavailable" in error:
                return jsonify({
                    'error': 'Permission setup required. Please Log Out and Log Back In with your Gmail account to enable collaborative tracking for your documents.'
                }), 400

            lowered = str(error).lower()
            if '429' in lowered or 'quota' in lowered or 'rate limit' in lowered or 'resource exhausted' in lowered:
                return jsonify({
                    'error': 'AI daily limit reached. Please try again later.'
                }), 429
                      
            return jsonify({'error': error}), 400
        
        if not report:
            return jsonify({'error': 'Unable to generate contribution report for this submission type.'}), 400

        # Save cache after successful generation.
        try:
            _contribution_report_cache[str(submission.id)] = {
                'version': "|".join([
                    submission.updated_at.isoformat() if submission.updated_at else '',
                    submission.processing_completed_at.isoformat() if submission.processing_completed_at else '',
                    submission.google_drive_link or ''
                ]),
                'createdAtEpoch': time.time(),
                'report': report
            }
        except Exception as cache_err:
            current_app.logger.warning(f"Contribution report cache write skipped: {cache_err}")
            
        return jsonify(report)
        
    except Exception as e:
        current_app.logger.error(f"Contribution report error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to generate contribution report'}), 500

@dashboard_bp.route('/submissions/<submission_id>/evaluate', methods=['POST'])
@require_authentication()
def evaluate_submission(submission_id):
    """Perform AI evaluation based on a rubric"""
    try:
        user_id = request.current_user.id
        data = request.get_json()
        
        if not data or 'rubric' not in data:
            return jsonify({'error': 'Rubric data is required'}), 400
            
        result, error = dashboard_service.evaluate_submission(submission_id, user_id, data['rubric'])
        
        if error:
            return jsonify({'error': error}), 400
            
        return jsonify(result)
        
    except Exception as e:
        current_app.logger.error(f"AI evaluation route error: {e}")
        return jsonify({'error': 'Failed to perform AI evaluation'}), 500

# Rubric Management Routes
@dashboard_bp.route('/rubrics', methods=['GET'])
@require_authentication()
def get_rubrics():
    """Get all rubrics for the current user"""
    try:
        user_id = request.current_user.id
        from app.services.rubric_service import RubricService
        rubric_service = RubricService()
        rubrics, error = rubric_service.get_user_rubrics(user_id)
        
        if error:
            return jsonify({'error': error}), 400
            
        return jsonify(rubrics)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@dashboard_bp.route('/rubrics', methods=['POST'])
@require_authentication()
def create_rubric():
    """Create a new rubric"""
    try:
        user_id = request.current_user.id
        data = request.get_json()
        from app.services.rubric_service import RubricService
        rubric_service = RubricService()
        rubric, error = rubric_service.create_rubric(user_id, data)
        
        if error:
            return jsonify({'error': error}), 400
            
        return jsonify(rubric), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@dashboard_bp.route('/rubrics/<rubric_id>', methods=['PUT'])
@require_authentication()
def update_rubric(rubric_id):
    """Update an existing rubric"""
    try:
        user_id = request.current_user.id
        data = request.get_json()
        from app.services.rubric_service import RubricService
        rubric_service = RubricService()
        rubric, error = rubric_service.update_rubric(rubric_id, user_id, data)
        
        if error:
            return jsonify({'error': error}), 400
            
        return jsonify(rubric)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@dashboard_bp.route('/rubrics/<rubric_id>', methods=['DELETE'])
@require_authentication()
def delete_rubric(rubric_id):
    """Delete a rubric"""
    try:
        user_id = request.current_user.id
        from app.services.rubric_service import RubricService
        rubric_service = RubricService()
        success, error = rubric_service.delete_rubric(rubric_id, user_id)
        
        if error:
            return jsonify({'error': error}), 400
            
        return jsonify({'message': 'Rubric deleted successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
