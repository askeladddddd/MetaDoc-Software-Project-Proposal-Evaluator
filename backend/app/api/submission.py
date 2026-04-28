"""
Module 1: File Submission, Retrieval, and Validation

Implements SRS requirements:
- M1.UC01: Submit File for Analysis (Upload / API Submit)
- M1.UC02: Handle Permission Error & Guide User

Handles:
1. File submission via upload or Google Drive link
2. Validation of file type, link format, and access permissions
3. Retrieval of Google Docs/DOCX files via Google Drive API
4. Temporary secure storage of retrieved files
5. Enqueueing validated files for metadata and content analysis
"""

import os
import hashlib
import mimetypes
from datetime import datetime
from flask import Blueprint, request, jsonify, current_app
from werkzeug.utils import secure_filename
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
import requests
try:
    import magic
except ImportError:
    magic = None
import uuid
import threading
from threading import Thread

from app.core.extensions import db
from app.models import Submission, SubmissionToken, SubmissionStatus, Deadline, UserRole
from app.services.audit_service import AuditService
from app.services import SubmissionService, DriveService
from app.api.auth import get_auth_service
from app.schemas.dto import SubmissionDTO, SubmissionTokenDTO
from app.utils.file_utils import FileUtils
from app.utils.decorators import require_authentication

submission_bp = Blueprint('submission', __name__)

# Initialize services
submission_service = SubmissionService()
drive_service = DriveService()

def _parse_iso_datetime(value):
    """Parse ISO timestamp strings from Google APIs safely."""
    if not value:
        return None
    try:
        # Handles both 'Z' and '+00:00' UTC formats
        dt = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        # If timezone-aware, convert to UTC and make naive
        if dt.tzinfo is not None:
            from datetime import timezone
            return dt.astimezone(timezone.utc).replace(tzinfo=None)
        # If naive, assume it's already UTC
        return dt
    except Exception:
        return None

def perform_full_analysis(app, submission_id):
    """Perform metadata extraction and AI analysis in the background."""
    with app.app_context():
        try:
            from app.models import Submission, AnalysisResult, SubmissionStatus
            from app.api.metadata import metadata_service
            from app.api.nlp import get_nlp_service
            
            submission = Submission.query.get(submission_id)
            if not submission:
                return
                
            storage_path = submission.file_path
            if not storage_path or not os.path.exists(storage_path):
                app.logger.error(f"Storage path not found for submission {submission_id}")
                submission.status = SubmissionStatus.FAILED
                db.session.commit()
                return

            # 1. Extract local metadata & text
            metadata, metadata_error = metadata_service.extract_docx_metadata(storage_path)
            text, text_error = metadata_service.extract_document_text(storage_path)
            
            if metadata_error or text_error:
                app.logger.error(f"Metadata/Text extraction failed: {metadata_error or text_error}")
                submission.status = SubmissionStatus.FAILED
                db.session.commit()
                return
                
            content_stats = metadata_service.compute_content_statistics(text)
            is_complete, warnings = metadata_service.validate_document_completeness(content_stats, text)
            
            # 2. Save local analysis
            analysis = AnalysisResult.query.filter_by(submission_id=submission.id).first()
            if not analysis:
                analysis = AnalysisResult(submission_id=submission.id)
                db.session.add(analysis)
            
            analysis.document_metadata = metadata
            analysis.content_statistics = content_stats
            analysis.document_text = text
            analysis.is_complete_document = is_complete
            analysis.validation_warnings = warnings

            # Sync submission's file_modified_at with extracted metadata for better list-view fallback
            if metadata.get('last_modified_date'):
                new_mod_at = _parse_iso_datetime(metadata['last_modified_date'])
                if new_mod_at:
                    submission.file_modified_at = new_mod_at

            db.session.commit()
            
            # 3. AI Analysis
            nlp_service = get_nlp_service()
            local_results = nlp_service.perform_local_nlp_analysis(text)
            
            context = {}
            if submission.deadline_id:
                from app.models import Deadline
                deadline = Deadline.query.get(submission.deadline_id)
                if deadline:
                    context = {
                        'assignment_type': deadline.assignment_type,
                        'course_code': deadline.course_code
                    }
            
            ai_summary, ai_error = nlp_service.generate_ai_summary(text, context)
            
            consolidated_results = local_results
            if hasattr(nlp_service, 'consolidate_nlp_results'):
                consolidated_results, _ = nlp_service.consolidate_nlp_results(local_results, ai_summary)
                
            analysis.nlp_results = consolidated_results
            if ai_summary:
                analysis.ai_summary = ai_summary.get('summary')
                analysis.ai_insights = ai_summary
                
            if 'readability' in local_results and local_results['readability']:
                analysis.flesch_kincaid_score = local_results['readability'].get('grade_level')
                analysis.readability_grade = local_results['readability'].get('reading_level')
                
            submission.status = SubmissionStatus.COMPLETED
            submission.processing_completed_at = datetime.utcnow()
            db.session.commit()
            app.logger.info(f"Background analysis completed for submission {submission_id}")
            
        except Exception as e:
            error_msg = str(e)
            app.logger.error(f"Background analysis failed for submission {submission_id}: {error_msg}")
            try:
                db.session.rollback()
                submission = Submission.query.get(submission_id)
                if submission:
                    submission.status = SubmissionStatus.FAILED
                    submission.error_message = f"Analysis Error: {error_msg}"
                    db.session.commit()
            except Exception as rollback_err:
                app.logger.error(f"Failed to record analysis failure: {rollback_err}")


def normalize_semester(raw_semester):
    """Normalize semester input to canonical values expected by the system."""
    if raw_semester is None:
        return None

    value = str(raw_semester).strip().upper()
    if not value:
        return None

    if value in {'1', '1ST', 'FIRST'}:
        return '1ST'
    if value in {'2', '2ND', 'SECOND'}:
        return '2ND'

    return None


def resolve_submission_semester(submitted_at=None):
    """Resolve semester from submission date.

    Rules:
    - 1ST semester: August to December
    - 2ND semester: January to May
    """
    date = submitted_at or datetime.utcnow()
    month = date.month

    if 8 <= month <= 12:
        return '1ST'
    if 1 <= month <= 5:
        return '2ND'

    # Fallback for months outside the defined windows.
    return '2ND'

def validate_submission_token(token, increment=False):
    """Validate submission token and return token with deadline info"""
    from app.models import SubmissionToken, Deadline
    from datetime import datetime
    
    if not token:
        return None, "No submission token provided"
    
    token_record = SubmissionToken.query.filter_by(token=token).first()
    
    if not token_record:
        return None, "Invalid submission token"
    
    if not token_record.is_valid():
        return None, "This submission link has expired or reached its usage limit."
    
    # Check if token has an associated deadline (safely check if column exists)
    deadline_id = getattr(token_record, 'deadline_id', None)
    if deadline_id:
        deadline = Deadline.query.filter_by(id=deadline_id).first()
        if not deadline:
            return None, "This submission link is no longer valid. The deadline has been deleted by the professor."
        
        token_record.deadline_title = deadline.title
        token_record.deadline_datetime = deadline.deadline_datetime
    
    if increment:
        # Increment usage count only when an actual action/submission is performed
        token_record.usage_count += 1
        db.session.commit()
    
    return token_record, None

@submission_bp.route('/token-info', methods=['GET'])
def get_token_info():
    """Get deadline information from submission token"""
    try:
        token = request.args.get('token')
        if not token:
            return jsonify({'error': 'Token is required'}), 400
        
        token_record, error = validate_submission_token(token)
        if error:
            return jsonify({'error': error}), 403

        professor_id = token_record.professor_id
        
        # Return deadline information
        response = {}
        if hasattr(token_record, 'deadline_title'):
            response['title'] = token_record.deadline_title
        if hasattr(token_record, 'deadline_datetime'):
            response['deadline_datetime'] = token_record.deadline_datetime.isoformat() if token_record.deadline_datetime else None
        
        # Get deadline description if available
        deadline_id = getattr(token_record, 'deadline_id', None)
        if deadline_id:
            from app.models import Deadline
            deadline = Deadline.query.get(deadline_id)
            if deadline and deadline.description:
                response['description'] = deadline.description
        
        return jsonify(response), 200
        
    except Exception as e:
        current_app.logger.error(f"Token info error: {e}")
        return jsonify({'error': 'Failed to fetch deadline information'}), 500

@submission_bp.route('/student-status', methods=['GET'])
@require_authentication()
def get_student_status():
    """Check if the current user is registered for a deadline"""
    try:
        token = request.args.get('token')
        if not token:
            return jsonify({'error': 'Token is required'}), 400
            
        token_record, error = validate_submission_token(token)
        if error:
            return jsonify({'error': error}), 403

        professor_id = token_record.professor_id
            
        deadline_id = getattr(token_record, 'deadline_id', None)
        if not deadline_id:
            return jsonify({'error': 'Invalid deadline associated with token'}), 400
            
        from app.models import Student
        user = request.current_user
        user_email = (user.email or '').strip().lower()
        role_value = str(getattr(user, 'role', '') or '').lower()
        is_professor_user = role_value in {UserRole.PROFESSOR.value, 'professor'}

        if not user_email:
            return jsonify({
                'is_registered': False,
                'message': 'No Gmail account is associated with your current session.'
            }), 200

        # Find if student is already linked via email (Case-insensitive)
        student = Student.query.filter(
            Student.professor_id == professor_id,
            db.func.lower(Student.email) == user_email
        ).first()
        
        if student:
            if student.is_archived:
                return jsonify({
                    'is_registered': False,
                    'is_archived': True,
                    'message': 'Your submission access has been restricted by your professor. Please contact your professor for assistance.'
                }), 200

            # Auto-register if not already marked (first time logging in)
            if not student.is_registered:
                student.is_registered = True
                student.registration_date = datetime.utcnow()
                db.session.commit()
                current_app.logger.info(f"Auto-registered student {student.student_id} via email match")

            return jsonify({
                'is_registered': True,
                'student_id': student.student_id,
                'last_name': student.last_name,
                'first_name': student.first_name,
                'course_year': student.course_year,
                'team_code': student.team_code,
                'subject_no': getattr(student, 'subject_no', None),
                'email': student.email,
                'name': f"{student.first_name} {student.last_name}".strip()
            }), 200
        else:
            return jsonify({
                'is_registered': False,
                'is_professor': is_professor_user,
                'message': 'Account not authorized. Your Gmail account is not in the class record.'
            }), 200
            
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Student status error: {e}")
        return jsonify({
            'is_registered': False,
            'is_professor': False,
            'error': 'Failed to check registration status',
            'message': 'Unable to verify if your Gmail account is included in the class record right now. Please try again.'
        }), 200

@submission_bp.route('/student-register', methods=['POST'])
@require_authentication()
def register_student():
    """Link current user's email to a student ID in the class record"""
    try:
        data = request.get_json()
        token = data.get('token')
        student_id = data.get('student_id')
        first_name = data.get('first_name')
        last_name = data.get('last_name')
        provided_email = data.get('email')
        
        if not token or not student_id:
            return jsonify({'error': 'Token and Student ID are required'}), 400
            
        token_record, error = validate_submission_token(token)
        if error:
            return jsonify({'error': error}), 403

        professor_id = token_record.professor_id
        
        from app.models import Student
        # Use provided email if available, otherwise fallback to session email
        user_email = provided_email.lower().strip() if provided_email else request.current_user.email.lower().strip()
        
        # Enforce Gmail domain
        if not user_email.endswith('@gmail.com'):
            return jsonify({'error': 'Only personal Gmail accounts (@gmail.com) are allowed for student submissions.'}), 400
        
        # 1. Check if email is already used in this class
        existing_email = Student.query.filter(
            Student.professor_id == professor_id,
            db.func.lower(Student.email) == user_email
        ).first()
        if existing_email:
            if existing_email.is_archived:
                return jsonify({'error': 'Your submission access has been restricted by your professor. Please contact your professor for assistance.'}), 403
            return jsonify({
                'message': 'Account already registered',
                'student_id': existing_email.student_id,
                'name': f"{existing_email.first_name} {existing_email.last_name}"
            }), 200
            
        # 2. Check if student ID exists in the professor's class record
        student = Student.query.filter_by(professor_id=professor_id, student_id=student_id).first()
        
        if not student:
            return jsonify({'error': 'Your Student ID was not found in the class record for this folder. Please ensure you are enrolled or contact your professor.'}), 404
            
        # 3. Check if student ID is already linked to another email
        if student.email and student.email != user_email:
            return jsonify({'error': 'This Student ID is already registered to a different email account.'}), 400

        if student.is_archived:
            return jsonify({'error': 'Your submission access has been restricted by your professor. Please contact your professor for assistance.'}), 403
            
        # 4. Link the Google account and update registration status
        student.email = user_email
        student.is_registered = True
        student.registration_date = datetime.utcnow()
        
        # Optional: verify names match or update them if they were empty in the record
        if first_name and not student.first_name: student.first_name = first_name
        if last_name and not student.last_name: student.last_name = last_name

        db.session.commit()
        
        return jsonify({
            'message': 'Successfully registered and linked account!',
            'student_id': student.student_id,
            'name': f"{student.first_name} {student.last_name}"
        }), 200
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Student registration error: {e}")
        return jsonify({'error': 'Failed to complete registration'}), 500

@submission_bp.route('/student-links', methods=['GET'])
@require_authentication()
def get_student_links():
    """Get all submission links authorized for the current student"""
    try:
        from app.models import Student, SubmissionToken, Deadline
        user = request.current_user
        
        # Get all students with this email
        student_records = Student.query.filter(
            db.func.lower(Student.email) == user.email.lower(),
            Student.is_archived == False
        ).all()
        
        if not student_records:
            return jsonify({'links': []}), 200

        professor_ids = list({s.professor_id for s in student_records if s.professor_id})
        if not professor_ids:
            return jsonify({'links': []}), 200
        
        # Find active tokens for these deadlines
        tokens = SubmissionToken.query.filter(
            SubmissionToken.professor_id.in_(professor_ids),
            SubmissionToken.is_active == True,
            SubmissionToken.expires_at > datetime.utcnow()
        ).all()
        
        links = []
        for token in tokens:
            deadline = Deadline.query.get(token.deadline_id)
            links.append({
                'token': token.token,
                'deadline_title': deadline.title if deadline else "Unknown Deadline",
                'deadline_id': token.deadline_id,
                'expires_at': token.expires_at.isoformat(),
                'professor_name': token.professor.name if token.professor else "Professor"
            })
            
        # Sort by creation date (using BaseModel.created_at) if available
        links.sort(key=lambda x: tokens[[t.token for t in tokens].index(x['token'])].created_at, reverse=True)
            
        return jsonify({'links': links}), 200
        
    except Exception as e:
        import traceback
        current_app.logger.error(f"Error fetching student links: {e}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': 'Internal server error'}), 500


@submission_bp.route('/generated-links', methods=['GET'])
@require_authentication()
def get_generated_links():
    """Get active generated submission links for the logged-in professor."""
    try:
        user = request.current_user
        role_value = user.role.value if hasattr(user.role, 'value') else str(user.role).lower()
        if role_value != UserRole.PROFESSOR.value:
            return jsonify({'error': 'Only professors can view generated links'}), 403

        tokens = SubmissionToken.query.filter(
            SubmissionToken.professor_id == user.id,
            SubmissionToken.is_active == True,
            SubmissionToken.expires_at > datetime.utcnow()
        ).order_by(SubmissionToken.created_at.desc()).all()

        deadline_ids = [t.deadline_id for t in tokens if getattr(t, 'deadline_id', None)]
        deadlines = Deadline.query.filter(Deadline.id.in_(deadline_ids)).all() if deadline_ids else []
        deadline_map = {deadline.id: deadline for deadline in deadlines}

        frontend_url = current_app.config.get('FRONTEND_URL', 'http://localhost:5173')
        links = []
        for token in tokens:
            d_id = getattr(token, 'deadline_id', None)
            deadline = deadline_map.get(d_id)
            
            # Skip links that have no associated deadline (either deleted or legacy)
            if not deadline:
                continue
                
            links.append({
                'deadline_id': d_id,
                'title': deadline.title,
                'token': token.token,
                'url': f"{frontend_url}/submit?token={token.token}",
                'expires_at': token.expires_at.isoformat() if token.expires_at else None,
                'generated_at': token.created_at.isoformat() if token.created_at else None,
            })

        return jsonify({'links': links}), 200
    except Exception as e:
        current_app.logger.error(f"Error fetching generated links: {e}")
        return jsonify({'error': 'Failed to fetch generated links'}), 500

@submission_bp.route('/upload', methods=['POST'])
@require_authentication()
def upload_file():
    """
    Handle file upload submissions
        
    SRS Reference: M1.UC01 - Submit File for Analysis (Upload)
    """
    try:
        # Get submission token (REQUIRED - links submission to professor)
        token = request.form.get('token') or request.args.get('token')
        
        if not token:
            return jsonify({'error': 'Submission token is required. Please use the link provided by your professor.'}), 403
        
        token_record, error = validate_submission_token(token, increment=True)
        if error:
            return jsonify({'error': error}), 403
        
        professor_id = token_record.professor_id
        # Use deadline from token (if column exists)
        deadline_id = getattr(token_record, 'deadline_id', None)
        
        # Verify current account against the class record for this submission link.
        from app.models import Student
        user = request.current_user
        
        student_id = request.form.get('student_id', '').strip()
        student_name = request.form.get('student_name', '').strip()
        semester = resolve_submission_semester()

        normalized_user_email = (user.email or '').strip().lower()
        student = Student.query.filter(
            Student.professor_id == professor_id,
            db.func.lower(Student.email) == normalized_user_email
        ).first()
        if not student:
            return jsonify({'error': 'Account not authorized. Your Gmail account is not in the class record for this folder.'}), 403

        if student.is_archived:
            return jsonify({'error': 'Submission denied. Your account is restricted and cannot submit files.'}), 403
        
        # Override with official class record info
        student_id = student.student_id
        student_name = f"{student.first_name} {student.last_name}"
        
        # [SECURITY FIX] Rate Limiting: Prevent DoS & API Quota Exhaustion
        from datetime import timedelta
        recent_submission = Submission.query.filter(
            Submission.student_id == student_id,
            Submission.professor_id == professor_id,
            Submission.created_at > datetime.utcnow() - timedelta(seconds=30)
        ).first()
        if recent_submission:
            return jsonify({'error': 'Rate limit exceeded. Please wait 30 seconds before submitting another file.'}), 429
        
        # Validate request
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        # Validate file
        validation_errors = submission_service.validate_file(file)
        if validation_errors:
            return jsonify({'error': '; '.join(validation_errors)}), 415
        
        # Secure filename and create paths
        original_filename = file.filename
        secure_name = secure_filename(original_filename)
        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        unique_filename = f"{timestamp}_{secure_name}"
        
        # Save file to temporary storage
        temp_path = os.path.join(current_app.config['TEMP_STORAGE_PATH'], unique_filename)
        file.save(temp_path)
        
        # Pre-validate the document before creating submission
        try:
            from app.api.metadata import metadata_service
            
            # Try to extract metadata to validate document
            test_metadata, test_error = metadata_service.extract_docx_metadata(temp_path)
            
            # Use internal document last-modified date if available, fallback to OS timestamp
            file_modified_at = None
            if not test_error and test_metadata.get('last_modified_date'):
                file_modified_at = _parse_iso_datetime(test_metadata['last_modified_date'])
            
            if not file_modified_at:
                file_modified_at = datetime.fromtimestamp(os.path.getmtime(temp_path))

            if test_error:
                os.remove(temp_path)
                return jsonify({'error': f'Invalid document: {test_error}'}), 415
            
            # Try to extract text to ensure document is readable
            test_text, text_error = metadata_service.extract_document_text(temp_path)
            if text_error:
                os.remove(temp_path)
                return jsonify({'error': f'Cannot read document: {text_error}'}), 415
            
            # Check if document has content
            if not test_text or len(test_text.strip()) < 10:
                os.remove(temp_path)
                return jsonify({'error': 'Document appears to be empty or has insufficient content'}), 415
                
        except Exception as e:
            if os.path.exists(temp_path):
                os.remove(temp_path)
            return jsonify({'error': f'Invalid or corrupted document: {str(e)}'}), 415
        
        # Calculate file hash and size
        file_hash = submission_service.calculate_file_hash(temp_path)
        file_size = os.path.getsize(temp_path)
        mime_type = mimetypes.guess_type(temp_path)[0] or 'application/octet-stream'
        
        # Check for duplicate submission
        is_duplicate, existing_submission = submission_service.check_duplicate_submission(
            file_hash=file_hash,
            professor_id=professor_id,
            deadline_id=deadline_id,
            student_id=student_id if student_id else None,
            student_email=(user.email or '').strip().lower() if getattr(user, 'email', None) else None
        )
        
        if is_duplicate:
            # Clean up the temporary file
            os.remove(temp_path)
            
            # Return error with details about the existing submission
            return jsonify({
                'error': 'Duplicate file submission detected',
                'message': f'You have already submitted this specific file ("{existing_submission.original_filename}") on {existing_submission.created_at.strftime("%Y-%m-%d %H:%M:%S")}. To submit a new version, please ensure the file content has changed.',
                'existing_submission': {
                    'job_id': existing_submission.job_id,
                    'submitted_at': existing_submission.created_at.isoformat(),
                    'original_filename': existing_submission.original_filename,
                    'student_id': existing_submission.student_id
                }
            }), 409  # 409 Conflict status code
        
        # Create folder based on deadline title
        if deadline_id:
            from app.models import Deadline
            deadline = Deadline.query.filter_by(id=deadline_id).first()
            if deadline:
                # Sanitize deadline title for folder name
                import re
                folder_name = re.sub(r'[<>:"/\\|?*]', '_', deadline.title)  # Remove invalid chars
                folder_name = folder_name.strip()[:100]  # Limit length
                deadline_folder = os.path.join(current_app.config['UPLOAD_FOLDER'], folder_name)
                
                # Create folder if it doesn't exist
                os.makedirs(deadline_folder, exist_ok=True)
                
                storage_path = os.path.join(deadline_folder, unique_filename)
            else:
                storage_path = os.path.join(current_app.config['UPLOAD_FOLDER'], unique_filename)
        else:
            # No deadline - use root upload folder
            storage_path = os.path.join(current_app.config['UPLOAD_FOLDER'], unique_filename)
        
        os.rename(temp_path, storage_path)
        
        # Create submission record
        submission, error = submission_service.create_submission_record(
            file_name=unique_filename,
            original_filename=original_filename,
            file_path=storage_path,
            file_hash=file_hash,
            file_size=file_size,
            file_type=mime_type,
            file_modified_at=file_modified_at,
            submitted_at=datetime.utcnow(),
            student_id=student_id,
            student_name=student_name,
            professor_id=professor_id,
            deadline_id=deadline_id,
            semester=semester,
            status=SubmissionStatus.PENDING
        )
        
        if error:
            # Clean up file on database error
            try:
                os.remove(storage_path)
            except:
                pass
            return jsonify({'error': error}), 500
        
        # Update status to processing and start background thread
        submission.status = SubmissionStatus.PROCESSING
        submission.processing_started_at = datetime.utcnow()
        db.session.commit()
        
        # Start background analysis thread for speed
        app = current_app._get_current_object()
        thread = Thread(target=perform_full_analysis, args=(app, submission.id))
        thread.daemon = True
        thread.start()
        
        current_app.logger.info(f"Started background analysis for submission {submission.id}")
        
        # Refresh the submission to ensure all relationships are loaded
        db.session.refresh(submission)
        
        return jsonify({
            'message': 'File uploaded successfully',
            'job_id': submission.job_id,
            'submission_id': submission.id,
            'status': submission.status.value,
            'file_info': {
                'filename': original_filename,
                'size': file_size,
                'type': mime_type
            }
        }), 201
        
    except Exception as e:
        import traceback
        current_app.logger.error(f"File upload error: {e}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@submission_bp.route('/drive-link', methods=['POST'])
@require_authentication()
def submit_drive_link():
    """
    Handle Google Drive link submissions
    
    SRS Reference: M1.UC01 - Submit File for Analysis (Drive Link)
    """
    try:
        data = request.get_json()
        
        if not data or 'drive_link' not in data:
            return jsonify({'error': 'Google Drive link is required'}), 400
        
        # Get submission token (REQUIRED - links submission to professor)
        token = data.get('token') or request.args.get('token')
        
        if not token:
            return jsonify({'error': 'Submission token is required. Please use the link provided by your professor.'}), 403
        
        token_record, error = validate_submission_token(token, increment=True)
        if error:
            return jsonify({'error': error}), 403
        
        professor_id = token_record.professor_id
        # Use deadline from token (if column exists)
        deadline_id = getattr(token_record, 'deadline_id', None)
        
        # Verify current account against the class record for this submission link.
        from app.models import Student
        user = request.current_user
        
        drive_link = data['drive_link'].strip()
        student_id = data.get('student_id', '').strip()
        student_name = data.get('student_name', '').strip()
        semester = resolve_submission_semester()

        normalized_user_email = (user.email or '').strip().lower()
        student = Student.query.filter(
            Student.professor_id == professor_id,
            db.func.lower(Student.email) == normalized_user_email
        ).first()
        if not student:
            return jsonify({'error': 'Account not authorized. Your Gmail account is not in the class record for this folder.'}), 403

        if student.is_archived:
            return jsonify({'error': 'Submission denied. Your account is restricted and cannot submit files.'}), 403
        
        # Override with official class record info
        student_id = student.student_id
        student_name = f"{student.first_name} {student.last_name}"
        
        # [SECURITY FIX] Rate Limiting: Prevent DoS & API Quota Exhaustion
        from datetime import timedelta
        recent_submission = Submission.query.filter(
            Submission.student_id == student_id,
            Submission.professor_id == professor_id,
            Submission.created_at > datetime.utcnow() - timedelta(seconds=30)
        ).first()
        if recent_submission:
            return jsonify({'error': 'Rate limit exceeded. Please wait 30 seconds before submitting another file.'}), 429
        
        # Validate drive link format
        file_id, validation_error = submission_service.validate_drive_link(drive_link)
        if validation_error:
            return jsonify({'error': validation_error}), 400
        
        # Get file metadata from Google Drive
        metadata, error = drive_service.get_file_metadata(file_id)
        
        if error:
            if error['error_type'] == 'permission_denied':
                # Return permission guidance per SRS M1.UC02
                return jsonify({
                    'error': error['message'],
                    'error_type': 'permission_denied',
                    'guidance': error['guidance']
                }), 403
            else:
                return jsonify({'error': error['message']}), 400
        
        # Validate file type from metadata
        if metadata['mimeType'] not in submission_service.allowed_mime_types:
            return jsonify({
                'error': f"Unsupported file type: {metadata['mimeType']}"
            }), 415
        
        # Download file
        filename = f"{metadata['name']}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
        if not filename.endswith(('.docx', '.doc')):
            filename += '.docx'
        
        file_path, download_error = drive_service.download_file(file_id, filename, mime_type=metadata['mimeType'])
        
        if download_error:
            return jsonify({'error': download_error}), 500
        
        # Pre-validate the document before creating submission
        try:
            from app.api.metadata import metadata_service
            
            # Try to extract metadata to validate document
            test_metadata, test_error = metadata_service.extract_docx_metadata(file_path, external_metadata=metadata)
            if test_error:
                os.remove(file_path)
                return jsonify({'error': f'Invalid document: {test_error}'}), 415
            
            # Try to extract text to ensure document is readable
            test_text, text_error = metadata_service.extract_document_text(file_path)
            if text_error:
                os.remove(file_path)
                return jsonify({'error': f'Cannot read document: {text_error}'}), 415
            
            # Check if document has content
            if not test_text or len(test_text.strip()) < 10:
                os.remove(file_path)
                return jsonify({'error': 'Document appears to be empty or has insufficient content'}), 415
                
        except Exception as e:
            if os.path.exists(file_path):
                os.remove(file_path)
            return jsonify({'error': f'Invalid or corrupted document: {str(e)}'}), 415
        
        # Calculate file hash
        file_hash = submission_service.calculate_file_hash(file_path)
        
        # Safely get file size from metadata or local file
        metadata_size = metadata.get('size')
        if metadata_size is not None:
            try:
                file_size = int(metadata_size)
            except (ValueError, TypeError):
                file_size = os.path.getsize(file_path)
        else:
            file_size = os.path.getsize(file_path)
        
        # Check for duplicate submission (by hash and by drive link)
        is_duplicate, existing_submission = submission_service.check_duplicate_submission(
            file_hash=file_hash,
            drive_link=drive_link,
            professor_id=professor_id,
            deadline_id=deadline_id,
            student_id=student_id if student_id else None,
            student_email=(user.email or '').strip().lower() if getattr(user, 'email', None) else None
        )
        
        if is_duplicate:
            # Clean up the temporary file
            os.remove(file_path)
            
            # Return error with details about the existing submission
            return jsonify({
                'error': 'Duplicate file submission detected',
                'message': f'You have already submitted this specific file ("{existing_submission.original_filename}") on {existing_submission.created_at.strftime("%Y-%m-%d %H:%M:%S")}. To submit a new version, please ensure the file content has changed.',
                'existing_submission': {
                    'job_id': existing_submission.job_id,
                    'submitted_at': existing_submission.created_at.isoformat(),
                    'original_filename': existing_submission.original_filename,
                    'student_id': existing_submission.student_id
                }
            }), 409  # 409 Conflict status code
        
        # Create folder based on deadline title
        if deadline_id:
            from app.models import Deadline
            deadline = Deadline.query.filter_by(id=deadline_id).first()
            if deadline:
                # Sanitize deadline title for folder name
                import re
                folder_name = re.sub(r'[<>:"/\\|?*]', '_', deadline.title)  # Remove invalid chars
                folder_name = folder_name.strip()[:100]  # Limit length
                deadline_folder = os.path.join(current_app.config['UPLOAD_FOLDER'], folder_name)
                
                # Create folder if it doesn't exist
                os.makedirs(deadline_folder, exist_ok=True)
                
                storage_path = os.path.join(deadline_folder, filename)
            else:
                storage_path = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
        else:
            # No deadline - use root upload folder
            storage_path = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
        
        os.rename(file_path, storage_path)
        
        # Get file modification time from Drive metadata
        file_modified_at = _parse_iso_datetime(metadata.get('modifiedTime'))

        # Create submission record
        submission, error = submission_service.create_submission_record(
            file_name=filename,
            original_filename=metadata['name'],
            file_path=storage_path,
            file_size=file_size,
            file_hash=file_hash,
            mime_type=metadata['mimeType'],
            file_modified_at=file_modified_at,
            submitted_at=datetime.utcnow(),
            submission_type='drive_link',
            google_drive_link=drive_link,
            student_id=student_id if student_id else None,
            student_name=student_name if student_name else None,
            semester=semester,
            deadline_id=deadline_id if deadline_id else None,
            professor_id=professor_id,
            status=SubmissionStatus.PENDING
        )
        
        if error:
            # Clean up file on database error
            try:
                os.remove(storage_path)
            except:
                pass
            return jsonify({'error': error}), 500
        
        # Update status to processing and start background thread
        submission.status = SubmissionStatus.PROCESSING
        submission.processing_started_at = datetime.utcnow()
        db.session.commit()
        
        # Start background analysis thread for speed
        app = current_app._get_current_object()
        thread = Thread(target=perform_full_analysis, args=(app, submission.id))
        thread.daemon = True
        thread.start()
        
        current_app.logger.info(f"Started background analysis for drive submission {submission.id}")
        
        return jsonify({
            'message': 'Google Drive file retrieved successfully',
            'job_id': submission.job_id,
            'submission_id': submission.id,
            'status': submission.status.value,
            'file_info': {
                'filename': metadata['name'],
                'size': file_size,
                'type': metadata['mimeType'],
                'created_time': metadata.get('createdTime'),
                'modified_time': metadata.get('modifiedTime')
            }
        }), 201
        
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        current_app.logger.error(f"Drive link submission error: {e}")
        current_app.logger.error(f"Traceback: {error_details}")
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@submission_bp.route('/status/<job_id>', methods=['GET'])
def get_submission_status(job_id):
    """Get submission status by job ID"""
    try:
        submission = Submission.query.filter_by(job_id=job_id).first()
        
        if not submission:
            return jsonify({'error': 'Submission not found'}), 404
        
        response_data = SubmissionDTO.serialize(submission, include_analysis=True)
        
        # Include analysis results if available
        if submission.analysis_result:
            response_data['analysis_available'] = True
            response_data['analysis_summary'] = {
                'word_count': submission.analysis_result.content_statistics.get('word_count') if submission.analysis_result.content_statistics else None,
                'readability_score': submission.analysis_result.flesch_kincaid_score,
                'timeliness': submission.analysis_result.timeliness_classification.value if submission.analysis_result.timeliness_classification else None
            }
        else:
            response_data['analysis_available'] = False
        
        return jsonify(response_data)
        
    except Exception as e:
        current_app.logger.error(f"Status check error: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@submission_bp.route('/help/drive-permissions', methods=['GET'])
def drive_permission_help():
    """
    Provide guidance for Google Drive permission issues
    
    SRS Reference: M1.UC02 - Permission Guidance for Drive Retrieval
    """
    return jsonify({
        'title': 'Google Drive Permission Setup',
        'description': 'Follow these steps to make your Google Drive file accessible:',
        'steps': submission_service._get_permission_guidance()['steps'],
        'video_tutorial': '/static/videos/drive-permissions.mp4',
        'troubleshooting': {
            'still_not_working': [
                'Ensure you are signed in to the correct Google account',
                'Check if the file is in a shared drive (different permissions)',
                'Try using the direct file link instead of folder link',
                'Contact your instructor if file sharing is restricted'
            ]
        }
    })

@submission_bp.route('/validate-link', methods=['POST'])
def validate_drive_link():
    """Validate Google Drive link without downloading"""
    try:
        data = request.get_json()
        
        if not data or 'drive_link' not in data:
            return jsonify({'error': 'Google Drive link is required'}), 400
        
        drive_link = data['drive_link'].strip()
        
        # Validate link format
        file_id, validation_error = submission_service.validate_drive_link(drive_link)
        if validation_error:
            return jsonify({
                'valid': False,
                'error': validation_error
            }), 200
        
        # Check file accessibility
        metadata, error = drive_service.get_file_metadata(file_id)
        
        if error:
            return jsonify({
                'valid': False,
                'error': error['message'],
                'error_type': error.get('error_type'),
                'guidance': error.get('guidance')
            }), 200
        
        # Check file type
        if metadata['mimeType'] not in submission_service.allowed_mime_types:
            return jsonify({
                'valid': False,
                'error': f"Unsupported file type: {metadata['mimeType']}",
                'supported_types': list(submission_service.allowed_mime_types)
            }), 200
        
        return jsonify({
            'valid': True,
            'file_info': {
                'name': metadata['name'],
                'type': metadata['mimeType'],
                'size': metadata.get('size'),
                'created_time': metadata.get('createdTime'),
                'modified_time': metadata.get('modifiedTime')
            }
        })
        
    except Exception as e:
        current_app.logger.error(f"Link validation error: {e}")
        return jsonify({'error': 'Internal server error'}), 500


