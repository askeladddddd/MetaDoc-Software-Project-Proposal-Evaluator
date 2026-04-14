"""
Authentication Module for MetaDoc

Implements SRS requirements:
- M5.UC01: Professor Login via Gmail OAuth
- OAuth 2.0 authentication with Google
- Session management
- Domain-based access control
"""

import os
import json
import hashlib
import urllib.parse
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, current_app, session, redirect, url_for
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from google_auth_oauthlib.flow import Flow
import secrets

from app.core.extensions import db
from app.models import User, UserSession, UserRole
from app.services.audit_service import AuditService
from app.schemas.dto import UserDTO, UserProfileDTO

auth_bp = Blueprint('auth', __name__)

# Initialize service
auth_service = None

def get_auth_service():
    global auth_service
    if auth_service is None:
        from app.services import AuthService
        auth_service = AuthService()
    return auth_service

@auth_bp.route('/login', methods=['GET'])
def initiate_login():
    """
    Initiate OAuth login (Google/Gmail)
    """
    try:
        # Get user type from query parameter (student or professor)
        user_type = request.args.get('user_type', 'professor')
        
        # We only support Google/Gmail now
        auth_url, error = get_auth_service().get_google_auth_url(user_type)
        
        if error:
            return jsonify({'error': error}), 500
        
        return jsonify({
            'auth_url': auth_url,
            'message': 'Redirect to auth_url to complete Google login'
        })
        
    except Exception as e:
        current_app.logger.error(f"Login initiation failed: {e}")
        return jsonify({'error': 'Authentication service unavailable'}), 500



@auth_bp.route('/callback', methods=['GET'])
def oauth_callback():
    """Handle Google OAuth callback"""
    try:
        # Get authorization code and state from callback
        authorization_code = request.args.get('code')
        state = request.args.get('state')
        error = request.args.get('error')
        
        if error:
            return jsonify({'error': f'OAuth error: {error}'}), 400
        
        if not authorization_code:
            return jsonify({'error': 'No authorization code received'}), 400
        
        # Process OAuth callback
        result, error = get_auth_service().handle_oauth_callback(authorization_code, state)
        
        if error:
            # Redirect to frontend with error
            frontend_url = current_app.config.get('FRONTEND_URL', 'http://localhost:5173')
            encoded_error = urllib.parse.quote(str(error))
            user_type = session.get('user_type')
            if not user_type:
                lowered = str(error).lower()
                if 'class record' in lowered or 'gmail' in lowered or 'student' in lowered:
                    user_type = 'student'
                else:
                    user_type = 'professor'
            return redirect(f"{frontend_url}/auth/callback?error={encoded_error}&user_type={user_type}")
        
        # Redirect to frontend with session token and user data
        from app.schemas.dto import UserDTO
        
        frontend_url = current_app.config.get('FRONTEND_URL', 'http://localhost:5173')
        # Serialize User object to dict before JSON dumping
        user_dict = UserDTO.serialize(result['user'])
        user_json = urllib.parse.quote(json.dumps(user_dict))
        
        return redirect(
            f"{frontend_url}/auth/callback?session_token={result['session_token']}&user={user_json}"
        )
        
    except Exception as e:
        import traceback
        current_app.logger.error(f"OAuth callback failed: {e}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': f'Authentication failed: {str(e)}'}), 500

@auth_bp.route('/validate', methods=['POST'])
def validate_session():
    """Validate user session token"""
    try:
        data = request.get_json()
        session_token = data.get('session_token') if data else None
        
        if not session_token:
            # Try to get from Authorization header
            auth_header = request.headers.get('Authorization')
            if auth_header and auth_header.startswith('Bearer '):
                session_token = auth_header[7:]
        
        result, error = get_auth_service().validate_session(session_token)
        
        if error:
            return jsonify({'valid': False, 'error': error}), 401

        session_obj = result.get('session')
        expires_at = getattr(session_obj, 'expires_at', None)
        created_at = getattr(session_obj, 'created_at', None)
        
        return jsonify({
            'valid': True,
            'user': UserDTO.serialize(result['user']),
            'session_info': {
                'expires_at': expires_at.isoformat() if expires_at else None,
                'created_at': created_at.isoformat() if created_at else None
            }
        })
        
    except Exception as e:
        current_app.logger.error(f"Session validation failed: {e}")
        return jsonify({'valid': False, 'error': 'Validation error'}), 500

@auth_bp.route('/logout', methods=['POST'])
def logout():
    """Logout user and invalidate session"""
    try:
        data = request.get_json()
        session_token = data.get('session_token') if data else None
        
        if not session_token:
            # Try to get from Authorization header
            auth_header = request.headers.get('Authorization')
            if auth_header and auth_header.startswith('Bearer '):
                session_token = auth_header[7:]
        
        if not session_token:
            return jsonify({'error': 'No session token provided'}), 400
        
        success, error = get_auth_service().logout_user(session_token)
        
        if error:
            return jsonify({'error': error}), 500
        
        return jsonify({
            'message': 'Logged out successfully',
            'success': success
        })
        
    except Exception as e:
        current_app.logger.error(f"Logout failed: {e}")
        return jsonify({'error': 'Logout error'}), 500

@auth_bp.route('/profile', methods=['GET'])
def get_user_profile():
    """Get current user profile information"""
    try:
        # Get session token
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({'error': 'Authentication required'}), 401
        
        session_token = auth_header[7:]
        
        # Validate session
        result, error = get_auth_service().validate_session(session_token)
        
        if error:
            return jsonify({'error': error}), 401
        
        user = result['user']
        
        # Get additional user statistics
        from app.models import Submission, Deadline
        
        user_stats = {
            'total_submissions_reviewed': Submission.query.filter_by(professor_id=user.id).count(),
            'active_deadlines': Deadline.query.filter_by(professor_id=user.id).filter(
                Deadline.deadline_datetime > datetime.utcnow()
            ).count(),
            'account_created': user.created_at.isoformat(),
            'last_login': user.last_login.isoformat() if user.last_login else None
        }
        
        return jsonify({
            'user': UserProfileDTO.serialize(user, include_stats=True)
        })
        
    except Exception as e:
        current_app.logger.error(f"Profile retrieval failed: {e}")
        return jsonify({'error': 'Profile retrieval error'}), 500

@auth_bp.route('/generate-submission-token', methods=['POST'])
def generate_submission_token():
    """
    Generate a token for student submission portal access
    Only professors can generate tokens
    """
    try:
        # Get session token
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({'error': 'Authentication required'}), 401
        
        session_token = auth_header[7:]
        
        # Validate session
        result, error = get_auth_service().validate_session(session_token)
        
        if error:
            return jsonify({'error': error}), 401
        
        user = result['user']
        
        # Check if user is professor
        if user.role != UserRole.PROFESSOR:
            return jsonify({'error': 'Only professors can generate submission tokens'}), 403
        
        # Get deadline_id from request body (optional)
        data = request.get_json() or {}
        deadline_id = data.get('deadline_id')
        
        # Validate deadline if provided
        if deadline_id:
            from app.models import Deadline
            deadline = Deadline.query.filter_by(id=deadline_id, professor_id=user.id).first()
            if not deadline:
                return jsonify({'error': 'Invalid deadline or access denied'}), 404
            
            # Check if deadline is in the past
            # Check if deadline is in the past
            if deadline.deadline_datetime < datetime.now():
                return jsonify({'error': 'Cannot generate submission link: The selected deadline is past or outdated.'}), 400
        
        # Cleanup expired tokens before generating a new one to save space
        try:
            from app.models import SubmissionToken
            expired_count = SubmissionToken.query.filter(SubmissionToken.expires_at < datetime.utcnow()).delete()
            if expired_count > 0:
                db.session.commit()
                current_app.logger.info(f"Cleaned up {expired_count} expired submission tokens.")
        except Exception as cleanup_err:
            current_app.logger.warning(f"Failed to cleanup expired tokens: {cleanup_err}")
            db.session.rollback()

        # Replace old active token for the same deliverable when generating again.
        try:
            from app.models import SubmissionToken
            existing_query = SubmissionToken.query.filter(
                SubmissionToken.professor_id == user.id,
                SubmissionToken.is_active == True,
                SubmissionToken.expires_at > datetime.utcnow()
            )
            if deadline_id:
                existing_query = existing_query.filter(SubmissionToken.deadline_id == deadline_id)
            else:
                existing_query = existing_query.filter(SubmissionToken.deadline_id.is_(None))

            replaced_count = existing_query.update({'is_active': False}, synchronize_session=False)
            if replaced_count > 0:
                db.session.commit()
                current_app.logger.info(
                    f"Deactivated {replaced_count} existing active token(s) for professor={user.id}, deadline={deadline_id}"
                )
        except Exception as replace_err:
            current_app.logger.warning(f"Failed to deactivate existing tokens before regeneration: {replace_err}")
            db.session.rollback()

        # Generate submission token with expiry aligned to the selected deliverable deadline.
        submission_token = secrets.token_urlsafe(32)
        if deadline_id and deadline:
            expires_at = deadline.deadline_datetime
        else:
            # Fallback for legacy callers without a linked deliverable.
            expires_at = datetime.utcnow() + timedelta(days=30)
        
        # Store token with deadline link
        from app.models import SubmissionToken
        
        # Try to create token with deadline_id, fallback if column doesn't exist
        try:
            token_record = SubmissionToken(
                token=submission_token,
                professor_id=user.id,
                deadline_id=deadline_id,  # Link to deadline
                expires_at=expires_at,
                is_active=True
            )
            db.session.add(token_record)
            db.session.commit()
        except Exception as e:
            # If deadline_id column doesn't exist, create without it
            current_app.logger.warning(f"Creating token without deadline_id: {e}")
            db.session.rollback()
            token_record = SubmissionToken(
                token=submission_token,
                professor_id=user.id,
                expires_at=expires_at,
                is_active=True
            )
            db.session.add(token_record)
            db.session.commit()
            deadline_id = None  # Reset deadline_id for response
        
        # Get deadline info for response
        deadline_info = None
        if deadline_id:
            deadline = Deadline.query.filter_by(id=deadline_id).first()
            if deadline:
                deadline_info = {
                    'id': deadline.id,
                    'title': deadline.title,
                    'deadline_datetime': deadline.deadline_datetime.isoformat()
                }
        
        return jsonify({
            'token': submission_token,
            'generated_at': token_record.created_at.isoformat() if token_record.created_at else datetime.utcnow().isoformat(),
            'expires_at': expires_at.isoformat(),
            'deadline': deadline_info,
            'submission_url': f"{current_app.config.get('FRONTEND_URL', 'http://localhost:5173')}/submit?token={submission_token}"
        })
        
    except Exception as e:
        current_app.logger.error(f"Token generation failed: {e}")
        return jsonify({'error': 'Failed to generate token'}), 500


# Helper functions for password hashing
def hash_password(password):
    """Hash password using SHA-256 with salt"""
    salt = secrets.token_hex(16)
    password_hash = hashlib.sha256((password + salt).encode()).hexdigest()
    return f"{salt}:{password_hash}"

def verify_password(password, stored_hash):
    """Verify password against stored hash"""
    try:
        salt, password_hash = stored_hash.split(':')
        return hashlib.sha256((password + salt).encode()).hexdigest() == password_hash
    except:
        return False


@auth_bp.route('/register', methods=['POST'])
def register():
    """
    Register a new user with email and password
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        email = data.get('email', '').strip().lower()
        password = data.get('password', '')
        name = data.get('name', '').strip()
        
        # Validation
        if not email:
            return jsonify({'error': 'Email is required'}), 400
        if not password:
            return jsonify({'error': 'Password is required'}), 400
        if len(password) < 6:
            return jsonify({'error': 'Password must be at least 6 characters'}), 400
        if not name:
            return jsonify({'error': 'Name is required'}), 400
        
        # Check if user already exists
        existing_user = User.query.filter_by(email=email).first()
        if existing_user:
            if existing_user.google_id:
                return jsonify({'error': 'Account already registered with Google. Please sign in with Google.'}), 409
            return jsonify({'error': 'Account already registered with this email.'}), 409
        
        # Create new user
        user = User(
            email=email,
            name=name,
            password_hash=hash_password(password),
            role=UserRole.PROFESSOR,
            is_active=True,
            created_at=datetime.utcnow()
        )
        
        db.session.add(user)
        db.session.commit()
        
        # Log registration
        AuditService.log_authentication_event('register', email, True)
        
        return jsonify({
            'message': 'Registration successful',
            'user': UserDTO.serialize(user)
        }), 201
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Registration failed: {e}")
        return jsonify({'error': 'Registration failed'}), 500


@auth_bp.route('/login-basic', methods=['POST'])
def login_basic():
    """
    Login with email and password
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        email = data.get('email', '').strip().lower()
        password = data.get('password', '')
        
        # Validation
        if not email or not password:
            return jsonify({'error': 'Email and password are required'}), 400
        
        # Find user
        user = User.query.filter_by(email=email).first()
        
        if not user:
            AuditService.log_authentication_event('login_attempt', email, False, 'User not found')
            return jsonify({'error': 'Invalid email or password'}), 401

        # Block student accounts from using professor basic login.
        if user.role == UserRole.STUDENT:
            AuditService.log_authentication_event('login_attempt', email, False, 'Student account attempted professor login')
            return jsonify({'error': 'Unauthorized access. This Gmail is a student account. Please use Student Sign In.'}), 403
        
        # Check if user has password (might be OAuth-only user)
        if not user.password_hash:
            return jsonify({'error': 'Please use Google Sign-In for this account'}), 401
        
        # Verify password
        if not verify_password(password, user.password_hash):
            AuditService.log_authentication_event('login_attempt', email, False, 'Invalid password')
            return jsonify({'error': 'Invalid email or password'}), 401
        
        # Check if user is active
        if not user.is_active:
            return jsonify({'error': 'Account is deactivated'}), 401
        
        # Update last login
        user.last_login = datetime.utcnow()
        
        # Create session
        session_token = secrets.token_urlsafe(64)
        session_expiry = datetime.utcnow() + timedelta(
            seconds=current_app.config.get('SESSION_TIMEOUT', 3600)
        )
        
        user_session = UserSession(
            session_token=session_token,
            user_id=user.id,
            expires_at=session_expiry,
            ip_address=request.environ.get('HTTP_X_FORWARDED_FOR', request.remote_addr),
            user_agent=request.headers.get('User-Agent'),
            is_active=True
        )
        
        db.session.add(user_session)
        db.session.commit()
        
        # Log successful login
        AuditService.log_authentication_event('login_success', email, True)
        
        return jsonify({
            'message': 'Login successful',
            'session_token': session_token,
            'user': UserDTO.serialize(user),
            'expires_at': session_expiry.isoformat()
        })
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Login failed: {e}")
        return jsonify({'error': 'Login failed'}), 500

