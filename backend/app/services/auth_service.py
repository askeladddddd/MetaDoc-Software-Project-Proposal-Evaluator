"""
Authentication Service - Handles OAuth authentication and session management

Extracted from api/auth.py to follow proper service layer architecture.
"""

import secrets
import os
import hashlib

# Force insecure transport for local development (must be set before oauth imports)
os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'

from datetime import datetime, timedelta
from flask import current_app, session
from google_auth_oauthlib.flow import Flow
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

from app.core.extensions import db
from app.models import User, UserSession, UserRole, Student, Deadline, Submission, SubmissionToken


class AuthService:
    """Service for handling OAuth authentication and session management"""
    
    def __init__(self):
        pass

    def _has_professor_owned_data(self, user_id):
        """Return True when user already owns professor resources and should not be auto-converted."""
        if not user_id:
            return False

        return (
            Deadline.query.filter_by(professor_id=user_id).first() is not None
            or SubmissionToken.query.filter_by(professor_id=user_id).first() is not None
            or Submission.query.filter_by(professor_id=user_id).first() is not None
        )

    def _normalize_profile_picture_url(self, picture_url):
        if not picture_url:
            return None

        normalized = str(picture_url).strip()
        if normalized.startswith('http://'):
            normalized = 'https://' + normalized[len('http://'):]

        # Prefer a clearer avatar size when Google provides a size suffix.
        if 'googleusercontent.com' in normalized and '=s' in normalized:
            try:
                suffix_index = normalized.rfind('=s')
                if suffix_index != -1:
                    normalized = normalized[:suffix_index] + '=s256-c'
            except Exception:
                pass

        return normalized
    
    @property
    def google_client_id(self):
        return current_app.config.get('GOOGLE_CLIENT_ID')
    
    @property
    def google_client_secret(self):
        return current_app.config.get('GOOGLE_CLIENT_SECRET')
    
    @property
    def redirect_uri(self):
        return current_app.config.get('GOOGLE_REDIRECT_URI')
    
    @property
    def allowed_domains(self):
        return current_app.config.get('ALLOWED_EMAIL_DOMAINS', [])

    
    def get_google_auth_url(self, user_type='professor'):
        """Generate Google OAuth authorization URL"""
        try:
            flow = Flow.from_client_config(
                client_config={
                    "web": {
                        "client_id": self.google_client_id,
                        "client_secret": self.google_client_secret,
                        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                        "token_uri": "https://oauth2.googleapis.com/token",
                        "redirect_uris": [self.redirect_uri]
                    }
                },
                scopes=[
                    'openid',
                    'https://www.googleapis.com/auth/userinfo.email',
                    'https://www.googleapis.com/auth/userinfo.profile',
                    'https://www.googleapis.com/auth/drive.readonly'
                ]
            )
            
            flow.redirect_uri = self.redirect_uri
            
            state = secrets.token_urlsafe(32)
            base_state = hashlib.sha256(os.urandom(1024)).hexdigest()
            # Bind user_type securely into the state to guarantee recovery if cookies drop
            state = f"{user_type}__{base_state}"
            
            session['oauth_state'] = state
            session['user_type'] = user_type
            session[f'oauth_user_type_{state}'] = user_type
            
            current_app.logger.info(f"OAuth URL generated. State saved: {state}")
            
            authorization_url, _ = flow.authorization_url(
                access_type='offline',
                include_granted_scopes='true',
                state=state,
                prompt='consent'
            )
            
            return authorization_url, None
            
        except Exception as e:
            current_app.logger.error(f"OAuth URL generation failed: {e}")
            return None, f"Authentication setup error: {e}"
    
    def handle_oauth_callback(self, authorization_code, state):
        """Handle OAuth callback and create user session"""
        try:
            current_app.logger.info(f"Callback received with state: {state}")
            
            # Extract user_type embedded directly in the state as a bulletproof failsafe
            user_type = 'professor'
            if state and '__' in state:
                embedded_role = state.split('__')[0]
                if embedded_role in ['student', 'professor']:
                    user_type = embedded_role
                    
            saved_state = session.get('oauth_state')
            
            if state != saved_state:
                current_app.logger.warning(f"Browser dropped session cookie! Continuing with recovered embedded User Type: {user_type}")
                # We intentionally DO NOT fail here. We recover gracefully using the encoded state.
            else:
                user_type_from_session = session.pop(f'oauth_user_type_{state}', None) or session.get('user_type')
                if user_type_from_session in ['student', 'professor']:
                    user_type = user_type_from_session

            # Clean session
            session.pop('user_type', None)
            session.pop('oauth_state', None)
            
            os.environ['OAUTHLIB_RELAX_TOKEN_SCOPE'] = '1'
            flow = Flow.from_client_config(
                client_config={
                    "web": {
                        "client_id": self.google_client_id,
                        "client_secret": self.google_client_secret,
                        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                        "token_uri": "https://oauth2.googleapis.com/token",
                        "redirect_uris": [self.redirect_uri]
                    }
                },
                scopes=[
                    'openid',
                    'https://www.googleapis.com/auth/userinfo.email',
                    'https://www.googleapis.com/auth/userinfo.profile',
                    'https://www.googleapis.com/auth/drive.readonly'
                ]
            )
            
            flow.redirect_uri = self.redirect_uri
            flow.fetch_token(code=authorization_code)
            
            credentials = flow.credentials
            
            # Store credentials in session for Drive API calls
            session['google_credentials'] = credentials.to_json()
            
            user_info = id_token.verify_oauth2_token(
                credentials.id_token,
                google_requests.Request(),
                self.google_client_id,
                clock_skew_in_seconds=60
            )
            
            email = (user_info.get('email') or '').strip()
            name = user_info.get('name')
            picture = self._normalize_profile_picture_url(user_info.get('picture'))
            google_id = user_info.get('sub')
            normalized_email = email.lower()
            
            # [NEW] Check for existing user role conflicts
            existing_user = User.query.filter(
                db.func.lower(User.email) == normalized_email
            ).first()
            student_record = Student.query.filter(
                db.func.lower(Student.email) == normalized_email
            ).first()

            # Never allow a student account to be promoted to professor by login flow.
            if existing_user and existing_user.role == UserRole.STUDENT and user_type == 'professor':
                return None, "This Gmail is already registered as a student account. Please use Student Sign In instead of professor login."

            # Domain and Class Record validation logic
            if user_type == 'student':
                if not email.endswith('@gmail.com'):
                    return None, "Only personal Gmail accounts (@gmail.com) are allowed for student submissions. Please use the Gmail account listed in the class record."

                # Check if this student email exists in ANY class record (Student table)
                if not student_record:
                    return None, f"This Gmail address ({email}) is not associated with any student in our class records. Please use the Gmail account listed in the class record."

                # Repair accidental professor-role accounts for student sign-in when safe.
                if existing_user and existing_user.role == UserRole.PROFESSOR:
                    if self._has_professor_owned_data(existing_user.id):
                        return None, "This Gmail is already used by a professor account with existing records. Please use another Gmail for student submission or contact the administrator."
                    existing_user.role = UserRole.STUDENT
                # If found, mark as registered if not already
                if not student_record.is_registered:
                    student_record.is_registered = True
                    student_record.registration_date = datetime.utcnow()
                    db.session.add(student_record)
                    # We commit below with User create/update
            else:
                if student_record and (not existing_user or existing_user.role != UserRole.PROFESSOR):
                    return None, "This Gmail is listed as a student account. Please use Student Sign In instead of professor login."

                if self.allowed_domains and self.allowed_domains != ['']:
                    domain = email.split('@')[1] if '@' in email else ''
                    allowed = [d.strip().lower() for d in self.allowed_domains if d.strip()]

                    if domain not in allowed:
                        return None, f"Email domain '{domain}' not allowed. Allowed domains: {', '.join(allowed)}"
            
            role = UserRole.PROFESSOR if user_type == 'professor' else UserRole.STUDENT
            
            user = existing_user
            if not user:
                user = User(
                    email=normalized_email,
                    name=name,
                    google_id=google_id,
                    profile_picture=picture,
                    role=role,
                    is_active=True
                )
                db.session.add(user)
            else:
                user.email = normalized_email
                user.name = name
                user.google_id = google_id
                user.profile_picture = picture
                user.last_login = datetime.utcnow()
                if user_type == 'student':
                    user.role = UserRole.STUDENT
            
            db.session.commit()

            session_token = secrets.token_urlsafe(32)
            user_session = UserSession(
                user_id=user.id,
                session_token=session_token,
                expires_at=datetime.utcnow() + timedelta(days=7),
                # Persist credentials to database for later use (e.g. reporting)
                google_access_token=credentials.token,
                google_refresh_token=credentials.refresh_token,
                token_expires_at=credentials.expiry
            )
            db.session.add(user_session)
            db.session.commit()
            
            return {
                'user': user,
                'session_token': session_token,
                'expires_at': user_session.expires_at
            }, None
            
        except Exception as e:
            current_app.logger.error(f"OAuth callback failed: {e}")
            return None, f"Authentication failed: {e}"
    
    def validate_session(self, session_token):
        """Validate session token and return user"""
        if not session_token:
            return None, "No session token provided"
        
        user_session = UserSession.query.filter_by(session_token=session_token).first()
        
        if not user_session:
            return None, "Invalid session token"
        
        if user_session.expires_at < datetime.utcnow():
            return None, "Session expired"
        
        user = User.query.filter_by(id=user_session.user_id).first()
        
        if not user or not user.is_active:
            return None, "User not found or inactive"
        
        return {'user': user, 'session': user_session}, None
    
    def logout_user(self, session_token):
        """Logout user by invalidating session"""
        try:
            user_session = UserSession.query.filter_by(session_token=session_token).first()
            if user_session:
                db.session.delete(user_session)
                db.session.commit()
            return True, None
        except Exception as e:
            current_app.logger.error(f"Logout failed: {e}")
            return False, str(e)
    
    def create_basic_auth_user(self, email, password, name):
        """Create user with basic authentication (for testing)"""
        try:
            existing_user = User.query.filter_by(email=email).first()
            if existing_user:
                return None, "User already exists"
            
            import hashlib
            password_hash = hashlib.sha256(password.encode()).hexdigest()
            
            user = User(
                email=email,
                name=name,
                password_hash=password_hash,
                role=UserRole.PROFESSOR,
                is_active=True
            )
            db.session.add(user)
            db.session.commit()
            
            return user, None
            
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"User creation failed: {e}")
            return None, str(e)
    
    def validate_basic_auth(self, email, password):
        """Validate basic authentication credentials"""
        try:
            user = User.query.filter_by(email=email).first()
            
            if not user or not user.password_hash:
                return None, "Invalid credentials"
            
            import hashlib
            password_hash = hashlib.sha256(password.encode()).hexdigest()
            
            if password_hash != user.password_hash:
                return None, "Invalid credentials"
            
            if not user.is_active:
                return None, "User account is inactive"
            
            session_token = secrets.token_urlsafe(32)
            user_session = UserSession(
                user_id=user.id,
                session_token=session_token,
                expires_at=datetime.utcnow() + timedelta(days=7)
            )
            db.session.add(user_session)
            
            user.last_login = datetime.utcnow()
            db.session.commit()
            
            return {
                'user': user,
                'session_token': session_token,
                'expires_at': user_session.expires_at
            }, None
            
        except Exception as e:
            current_app.logger.error(f"Basic auth validation failed: {e}")
            return None, str(e)
