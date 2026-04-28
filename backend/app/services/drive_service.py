"""
Google Drive Service - Handles Google Drive API integration

Extracted from api/submission.py to follow proper service layer architecture.
"""

import os
import json
import re
import difflib
import time
from datetime import datetime, timedelta, timezone
from flask import current_app
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
import requests

try:
    import google.generativeai as genai
except Exception:
    genai = None


class DriveService:
    """Service class for Google Drive API integration"""
    
    def __init__(self):
        self._service = None
    
    def _get_drive_service(self, user_credentials_json=None):
        """Initialize Google Drive API service (lazy initialization)"""
        # Always prioritize user credentials if provided (for accessing user-specific files)
        if user_credentials_json:
             try:
                 import json
                 from google.oauth2.credentials import Credentials
                 creds_dict = json.loads(user_credentials_json)
                 
                 # Using standard constructor for higher reliability
                 creds = Credentials(
                     token=creds_dict.get('token'),
                     refresh_token=creds_dict.get('refresh_token'),
                     token_uri=creds_dict.get('token_uri', "https://oauth2.googleapis.com/token"),
                     client_id=creds_dict.get('client_id'),
                     client_secret=creds_dict.get('client_secret'),
                     scopes=creds_dict.get('scopes', ['https://www.googleapis.com/auth/drive.readonly'])
                 )
                 return build('drive', 'v3', credentials=creds)
             except Exception as e:
                 current_app.logger.error(f"Failed to create service from user credentials: {e}")
                 # Fallthrough to service account
        
        if self._service:
            return self._service
            
        try:
            credentials = service_account.Credentials.from_service_account_file(
                current_app.config['GOOGLE_SERVICE_ACCOUNT_FILE'],
                scopes=['https://www.googleapis.com/auth/drive.readonly']
            )
            self._service = build('drive', 'v3', credentials=credentials)
            return self._service
        except Exception as e:
            current_app.logger.error(f"Failed to initialize Google Drive service: {e}")
            raise Exception("Google Drive service unavailable")
    
    def _parse_iso_datetime(self, value):
        """Parse ISO timestamp strings from Google APIs safely."""
        if not value:
            return None
        try:
            # Handles both 'Z' and '+00:00' UTC formats
            dt = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
            # If timezone-aware, convert to UTC and make naive
            if dt.tzinfo is not None:
                return dt.astimezone(timezone.utc).replace(tzinfo=None)
            # If naive, assume it's already UTC
            return dt
        except Exception:
            return None

    def get_file_metadata(self, file_id, user_credentials_json=None):
        """Get file metadata from Google Drive"""
        try:
            try:
                service = self._get_drive_service(user_credentials_json)
            except Exception as service_error:
                # If service account is missing or fails, try to scrape public title
                current_app.logger.warning(f"Service account unavailable ({service_error}), attempting public metadata scrape")
                
                file_name = 'Google_Drive_File.docx'
                try:
                    import urllib.request
                    import re
                    # Try to fetch title from public link
                    url = f"https://docs.google.com/document/d/{file_id}/preview"
                    
                    # Use a standard User-Agent to avoid being blocked
                    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
                    req = urllib.request.Request(url, headers=headers)
                    
                    with urllib.request.urlopen(req, timeout=5) as response:
                        html_content = response.read().decode('utf-8', errors='ignore')
                        
                        # Try multiple patterns
                        patterns = [
                            r'<title>(.*?) - Google Docs</title>',
                            r'<meta property="og:title" content="(.*?)">',
                            r'<meta name="title" content="(.*?)">'
                        ]
                        
                        found_title = None
                        for pattern in patterns:
                            match = re.search(pattern, html_content)
                            if match:
                                found_title = match.group(1)
                                break
                        
                        if found_title:
                            # Clean up title
                            found_title = found_title.strip()
                            if not found_title.endswith('.docx'):
                                found_title += '.docx'
                            file_name = found_title
                            current_app.logger.info(f"Scraped public title: {file_name}")

                except Exception as scrape_err:
                    current_app.logger.warning(f"Public title scrape failed: {scrape_err}")

                return {
                    'id': file_id,
                    'name': file_name,
                    'mimeType': 'application/vnd.google-apps.document' 
                }, None
            
            # Get file metadata
            metadata = service.files().get(
                fileId=file_id,
                fields='id,name,mimeType,size,createdTime,modifiedTime,owners,lastModifyingUser,permissions,headRevisionId,version'
            ).execute()
            
            # Extract timestamps for convenience if they exist
            if 'createdTime' in metadata:
                metadata['created_at_dt'] = self._parse_iso_datetime(metadata['createdTime'])
            if 'modifiedTime' in metadata:
                metadata['modified_at_dt'] = self._parse_iso_datetime(metadata['modifiedTime'])

            return metadata, None
            
        except HttpError as e:
            error_details = e.error_details[0] if e.error_details else {}
            
            if e.resp.status == 403:
                if 'insufficientPermissions' in str(e) or 'permissionDenied' in str(e):
                    return None, {
                        'error_type': 'permission_denied',
                        'message': 'Insufficient permissions to access the file',
                        'guidance': self._get_permission_guidance()
                    }
            elif e.resp.status == 404:
                return None, {
                    'error_type': 'file_not_found',
                    'message': 'File not found or not accessible'
                }
            
            current_app.logger.error(f"Google Drive API error: {e}")
            return None, {
                'error_type': 'api_error',
                'message': 'Failed to access Google Drive'
            }
        
        except Exception as e:
            current_app.logger.error(f"Unexpected error accessing Drive file: {e}")
            return None, {
                'error_type': 'unknown_error',
                'message': 'Unexpected error occurred'
            }
    
    def download_file(self, file_id, filename, mime_type=None, user_credentials_json=None):
        """Download file from Google Drive to temporary storage"""
        try:
            service = self._get_drive_service(user_credentials_json)
            
            # For Google Docs (based on mime_type), export as DOCX
            if mime_type == 'application/vnd.google-apps.document' or filename.endswith('.gdoc'):
                request_obj = service.files().export_media(
                    fileId=file_id,
                    mimeType='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                )
                if not filename.endswith('.docx'):
                   filename = filename.replace('.gdoc', '.docx') if filename.endswith('.gdoc') else filename + '.docx'
            else:
                # For regular files, download as-is
                request_obj = service.files().get_media(fileId=file_id)
            
            # Execute download
            file_content = request_obj.execute()
            
            # Save to temporary storage
            temp_path = os.path.join(current_app.config['TEMP_STORAGE_PATH'], filename)
            with open(temp_path, 'wb') as f:
                f.write(file_content)
            
            return temp_path, None
            
        except HttpError as e:
            current_app.logger.error(f"Failed to download Drive file: {e}")
            return None, f"Failed to download file: {e}"
        
        except Exception as e:
            # Fallback: Try downloading as a public file if API fails (no service account or permission error)
            # This works for files shared as "Anyone with link"
            try:
                current_app.logger.info(f"Attempting public download fallback for {file_id}")
                
                # Construct export URL for Docs or direct link for files
                if mime_type == 'application/vnd.google-apps.document':
                    url = f"https://docs.google.com/document/d/{file_id}/export?format=docx"
                else:
                    url = f"https://drive.google.com/uc?id={file_id}&export=download"
                
                import requests
                response = requests.get(url, allow_redirects=True)
                
                if response.status_code == 200:
                    # Save to temporary storage
                    if not filename.endswith('.docx') and mime_type == 'application/vnd.google-apps.document':
                         filename += '.docx'
                         
                    temp_path = os.path.join(current_app.config['TEMP_STORAGE_PATH'], filename)
                    with open(temp_path, 'wb') as f:
                        f.write(response.content)
                    return temp_path, None
            except Exception as fallback_error:
                current_app.logger.error(f"Public fallback failed: {fallback_error}")

            current_app.logger.error(f"Unexpected error downloading file: {e}")
            return None, f"Unexpected error: {e}"
    
    def _get_permission_guidance(self):
        """Return guidance for fixing Google Drive permissions"""
        return {
            'steps': [
                "1. Open your Google Drive file",
                "2. Click the 'Share' button (top-right corner)",
                "3. Change access to 'Anyone with the link'",
                "4. Set permissions to 'Viewer' or 'Commenter'",
                "5. Copy the new link and resubmit"
            ],
            'help_url': '/help/drive-permissions'
        }

    def _get_bearer_token(self, user_credentials_json=None):
        """Extract bearer token from serialized OAuth credentials."""
        if not user_credentials_json:
            return None
        try:
            creds_dict = json.loads(user_credentials_json)
            return creds_dict.get('token')
        except Exception:
            return None

    def _collab_ai_mode(self):
        return 'gemini'

    def _get_gemini_model_name(self):
        """Resolve Gemini model name with a safe default."""
        return str(current_app.config.get('GEMINI_MODEL') or 'gemini-1.5-flash').strip()

    def _get_gemini_model_candidates(self):
        """Primary model plus automatic fallback model candidates from config list."""
        primary = self._get_gemini_model_name()
        
        # Get list of fallbacks from config
        fallbacks = current_app.config.get('GEMINI_FALLBACK_MODELS')
        if isinstance(fallbacks, str):
            fallbacks = [f.strip() for f in fallbacks.split(',') if f.strip()]
        elif not isinstance(fallbacks, list):
            fallbacks = ['gemini-1.5-flash']

        candidates = [primary]
        for item in fallbacks:
            if item and item not in candidates:
                candidates.append(item)
        return candidates

    def _generate_with_gemini(self, prompt, generation_config=None, timeout_seconds=18):
        """Generate with Gemini using primary model and automatic fallback model."""
        if not genai:
            raise Exception('Gemini client is unavailable')

        api_key = current_app.config.get('GEMINI_API_KEY')
        if not api_key:
            raise Exception('GEMINI_API_KEY is not configured')

        genai.configure(api_key=api_key)

        errors = []
        models = self._get_gemini_model_candidates()
        for idx, model_name in enumerate(models):
            try:
                model = genai.GenerativeModel(model_name)
                response = model.generate_content(
                    prompt,
                    generation_config=generation_config,
                    request_options={'timeout': int(timeout_seconds)}
                )
                return response, model_name
            except Exception as model_error:
                msg = str(model_error)
                errors.append(f"{model_name}: {msg}")

                lower = msg.lower()
                retryable = (
                    '429' in lower or 'quota' in lower or 'rate' in lower or
                    'resource exhausted' in lower or 'unavailable' in lower or
                    'not found' in lower or 'unsupported' in lower or '503' in lower
                )
                if idx < (len(models) - 1) and retryable:
                    current_app.logger.warning(
                        f"Gemini model '{model_name}' failed ({msg}). Trying fallback model '{models[idx + 1]}'."
                    )
                    continue
                break

        raise Exception(' | '.join(errors) if errors else 'Gemini request failed')

    def _extract_ai_json(self, raw_text):
        """Extract JSON object/array from LLM output that may include markdown fences."""
        text = (raw_text or '').strip()
        if not text:
            return None

        # Fast path: raw JSON.
        try:
            return json.loads(text)
        except Exception:
            pass

        # Fenced code block path.
        fence_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', text, flags=re.IGNORECASE)
        if fence_match:
            candidate = fence_match.group(1).strip()
            try:
                return json.loads(candidate)
            except Exception:
                pass

        # Last-resort extraction of first JSON-looking payload.
        for pattern in (r'(\[[\s\S]*\])', r'(\{[\s\S]*\})'):
            match = re.search(pattern, text)
            if match:
                candidate = match.group(1)
                try:
                    return json.loads(candidate)
                except Exception:
                    continue

        # Partial JSON recovery for truncated model responses.
        candidate = text
        start_positions = [pos for pos in (candidate.find('{'), candidate.find('[')) if pos >= 0]
        if start_positions:
            candidate = candidate[min(start_positions):]

            repaired = []
            stack = []
            in_string = False
            escape = False
            for char in candidate:
                repaired.append(char)
                if escape:
                    escape = False
                    continue
                if char == '\\':
                    escape = True
                    continue
                if char == '"':
                    in_string = not in_string
                    continue
                if in_string:
                    continue
                if char in '{[':
                    stack.append('}' if char == '{' else ']')
                elif char in '}]' and stack and stack[-1] == char:
                    stack.pop()

            if in_string:
                repaired.append('"')

            repaired_text = ''.join(repaired).rstrip()
            repaired_text = re.sub(r',\s*$', '', repaired_text)
            while repaired_text and repaired_text[-1] in ',:':
                repaired_text = repaired_text[:-1].rstrip()
            repaired_text += ''.join(reversed(stack))

            try:
                return json.loads(repaired_text)
            except Exception:
                pass

        return None

    def _apply_collab_ai_scoring(self, contributors):
        """Apply Gemini-only AI scoring and return (contributors, provider, applied)."""
        if not current_app.config.get('GEMINI_API_KEY'):
            raise Exception('GEMINI_API_KEY is not configured')

        enriched = self._score_with_gemini(contributors)
        return enriched, 'gemini', True

    def _build_collab_analysis(self, revisions, contributors, nlp_context=None):
        """Build Gemini-only collaboration analysis payload and provider label."""
        if not current_app.config.get('GEMINI_API_KEY'):
            raise Exception('GEMINI_API_KEY is not configured')

        analysis = self._analyze_revision_history_with_gemini(revisions, contributors, nlp_context=nlp_context)
        if analysis:
            analysis['source'] = 'gemini'
            return analysis, 'gemini'

        raise Exception('Gemini analysis returned no result')

    def _apply_ai_effort_labels_from_analysis(self, contributors, analysis):
        """Apply AI effort labels embedded in the collaboration analysis payload."""
        labels = (analysis or {}).get('effortLabels')
        if not isinstance(labels, list):
            labels = []

        by_key = {}
        for row in labels:
            if not isinstance(row, dict):
                continue
            key = str(row.get('email') or row.get('name') or '').strip().lower()
            if key:
                by_key[key] = row

        labeled_count = 0
        for contributor in contributors:
            base_key = str(contributor.get('email') or contributor.get('name') or '').strip().lower()
            row = by_key.get(base_key)
            if not row:
                continue

            ai_label = str(row.get('effortLabel') or '').strip()
            ai_reason = str(row.get('reason') or '').strip()

            if contributor.get('workStatus') != 'No Work Detected' and ai_label:
                contributor['aiEffortLabel'] = ai_label
                labeled_count += 1
            if ai_reason:
                contributor['aiReason'] = ai_reason

        if labeled_count <= 0:
            # Graceful fallback: keep deterministic contributor states when AI labels are unavailable.
            for contributor in contributors:
                if contributor.get('workStatus') != 'No Work Detected' and not contributor.get('aiEffortLabel'):
                    contributor['aiEffortLabel'] = contributor.get('workStatus') or 'Contributing'
            return contributors, 'gemini', False

        return contributors, 'gemini', True

    def _contributor_identity(self, revision):
        """Resolve normalized contributor identity from revision payload."""
        user = revision.get('lastModifyingUser', {}) or {}
        email = str(user.get('emailAddress') or '').strip().lower()
        name = str(user.get('displayName') or '').strip()

        if not name and email:
            name = email.split('@')[0] if '@' in email else email
        if not name and not email:
            name = 'Anonymous Contributor'

        key = email or name
        return key, name, email

    def _parse_revision_timestamp(self, value):
        """Parse revision modifiedTime into naive UTC datetime."""
        if not value:
            return None
        try:
            dt = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
            if dt.tzinfo is not None:
                return dt.astimezone(timezone.utc).replace(tzinfo=None)
            return dt
        except Exception:
            return None

    def _coerce_deadline_utc_naive(self, value):
        """Normalize datetime or ISO string deadline into naive datetime."""
        if not value:
            return None
        if isinstance(value, datetime):
            if value.tzinfo is not None:
                return value.astimezone(timezone.utc).replace(tzinfo=None)
            return value
        try:
            dt = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
            if dt.tzinfo is not None:
                return dt.astimezone(timezone.utc).replace(tzinfo=None)
            return dt
        except Exception:
            return None

    def _extract_emails_from_document_metadata(self, document_metadata):
        """Extract email-like tokens from arbitrary document metadata payload."""
        if not isinstance(document_metadata, (dict, list, tuple, str)):
            return set()

        email_pattern = re.compile(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}')
        found = set()

        def walk(value):
            if isinstance(value, dict):
                for item in value.values():
                    walk(item)
                return
            if isinstance(value, (list, tuple)):
                for item in value:
                    walk(item)
                return
            if isinstance(value, str):
                for match in email_pattern.findall(value):
                    found.add(match.strip().lower())

        walk(document_metadata)
        return found

    def _normalize_identity_token(self, value):
        raw = str(value or '').strip().lower()
        if not raw:
            return ''
        return re.sub(r'[^a-z0-9]+', '', raw)

    def _build_identity_hint_email_map(self, roster_members=None, file_metadata=None, document_metadata=None):
        """Build conservative token->email lookup for recovering missing revision emails.

        A token resolves only when it maps to exactly one unique email.
        """
        hint_map = {}

        def add_hint(token, email):
            normalized_token = self._normalize_identity_token(token)
            normalized_email = str(email or '').strip().lower()
            if not normalized_token or not normalized_email:
                return
            if normalized_token not in hint_map:
                hint_map[normalized_token] = set()
            hint_map[normalized_token].add(normalized_email)

        # Class roster hints.
        for member in (roster_members or []):
            member_email = str((member or {}).get('email') or '').strip().lower()
            member_name = str((member or {}).get('name') or '').strip()
            if member_email:
                add_hint(member_name, member_email)
                add_hint(member_email.split('@')[0], member_email)

        # Drive metadata hints.
        for owner in ((file_metadata or {}).get('owners') or []):
            owner_email = str((owner or {}).get('emailAddress') or '').strip().lower()
            owner_name = str((owner or {}).get('displayName') or '').strip()
            if owner_email:
                add_hint(owner_name, owner_email)
                add_hint(owner_email.split('@')[0], owner_email)

        last_user = (file_metadata or {}).get('lastModifyingUser') or {}
        last_email = str(last_user.get('emailAddress') or '').strip().lower()
        last_name = str(last_user.get('displayName') or '').strip()
        if last_email:
            add_hint(last_name, last_email)
            add_hint(last_email.split('@')[0], last_email)

        # Document metadata hints.
        if isinstance(document_metadata, dict):
            author = str(document_metadata.get('author') or '').strip()
            last_editor = str(document_metadata.get('last_editor') or '').strip()
            for contributor in (document_metadata.get('contributors') or []):
                if not isinstance(contributor, dict):
                    continue
                c_email = str(contributor.get('email') or '').strip().lower()
                c_name = str(contributor.get('name') or '').strip()
                if c_email:
                    add_hint(c_name, c_email)
                    add_hint(c_email.split('@')[0], c_email)
                    if self._normalize_identity_token(author) == self._normalize_identity_token(c_name):
                        add_hint(author, c_email)
                    if self._normalize_identity_token(last_editor) == self._normalize_identity_token(c_name):
                        add_hint(last_editor, c_email)

        # Keep only unambiguous mappings to avoid incorrect attribution.
        return {
            token: next(iter(emails))
            for token, emails in hint_map.items()
            if len(emails) == 1
        }

    def _enrich_contributors_with_metadata(self, contributors, roster_members=None, file_metadata=None, document_metadata=None):
        """Attach class roster and document metadata identity context to contributors."""
        roster_by_email = {}
        for member in (roster_members or []):
            email = str((member or {}).get('email') or '').strip().lower()
            if email:
                roster_by_email[email] = member

        owners = (file_metadata or {}).get('owners') or []
        owner_emails = {
            str((owner or {}).get('emailAddress') or '').strip().lower()
            for owner in owners
            if str((owner or {}).get('emailAddress') or '').strip()
        }
        last_modifier_email = str(((file_metadata or {}).get('lastModifyingUser') or {}).get('emailAddress') or '').strip().lower()
        metadata_emails = self._extract_emails_from_document_metadata(document_metadata)

        for contributor in (contributors or []):
            email = str(contributor.get('email') or '').strip().lower()
            roster_match = roster_by_email.get(email) if email else None

            contributor['identity'] = {
                'classRosterMatched': bool(roster_match),
                'source': contributor.get('identitySource') or ('class_roster' if roster_match else ('drive_metadata' if email else 'unverified')),
                'confidence': (
                    'high' if (contributor.get('identitySource') == 'revision_email' or bool(roster_match))
                    else ('medium' if contributor.get('identitySource') == 'recovered_from_metadata' else 'low')
                )
            }

            if roster_match:
                contributor['studentProfile'] = {
                    'studentId': roster_match.get('studentId'),
                    'teamCode': roster_match.get('teamCode'),
                    'courseYear': roster_match.get('courseYear'),
                    'subjectNo': roster_match.get('subjectNo'),
                    'name': roster_match.get('name')
                }

            contributor['documentMetadataConnection'] = {
                'isDriveOwner': bool(email) and email in owner_emails,
                'isDriveLastModifier': bool(email) and bool(last_modifier_email) and email == last_modifier_email,
                'emailSeenInDocumentMetadata': bool(email) and email in metadata_emails
            }

        return contributors

    def _build_session_based_contributors(
        self,
        revisions,
        allowed_emails=None,
        roster_members=None,
        file_metadata=None,
        document_metadata=None,
        deadline_datetime=None,
        session_window_minutes=30,
        single_revision_default_minutes=5,
    ):
        """Aggregate metadata-only revisions into per-user active edit sessions."""
        window_size = float(session_window_minutes)
        allowed = {
            str(email or '').strip().lower()
            for email in (allowed_emails or [])
            if str(email or '').strip()
        }
        identity_hint_email_map = self._build_identity_hint_email_map(
            roster_members=roster_members,
            file_metadata=file_metadata,
            document_metadata=document_metadata,
        )
        deadline_dt = self._coerce_deadline_utc_naive(deadline_datetime)
        rush_window_start = (deadline_dt - timedelta(hours=12)) if deadline_dt else None

        grouped = {}
        for rev in (revisions or []):
            user = rev.get('lastModifyingUser') or {}
            email = str(user.get('emailAddress') or '').strip().lower()
            display_name = str(user.get('displayName') or '').strip()
            if not display_name and not user:
                display_name = 'Anonymous Contributor'
            ts = self._parse_revision_timestamp(rev.get('modifiedTime'))
            if not ts:
                continue

            identity_source = 'revision_email' if email else 'unverified'

            if not email and display_name:
                recovered = identity_hint_email_map.get(self._normalize_identity_token(display_name))
                if recovered:
                    email = recovered
                    identity_source = 'recovered_from_metadata'

            is_verified_roster_member = bool(email) and ((not allowed) or (email in allowed))
            
            # Record the actual email found in Drive history/permissions before matching
            original_drive_email = email
            
            # Smarter matching: if email not in roster, check if name matches someone in roster
            roster_email_for_grouping = None
            if not is_verified_roster_member and display_name:
                normalized_display_name = re.sub(r'[^a-z0-9]+', '', display_name.lower())
                for member in (roster_members or []):
                    m_name = member.get('name', '')
                    if m_name:
                        normalized_m_name = re.sub(r'[^a-z0-9]+', '', m_name.lower())
                        
                        if (normalized_display_name == normalized_m_name or 
                            (len(normalized_display_name) > 5 and normalized_display_name in normalized_m_name) or
                            (len(normalized_m_name) > 5 and normalized_m_name in normalized_display_name)):
                            match_found = True
                        else:
                            match_found = False
                            
                        if match_found:
                            # Match found! Use roster email for grouping
                            roster_email_for_grouping = member.get('email')
                            is_verified_roster_member = True
                            identity_source = 'matched_by_name'
                            break

            # Key for grouping is the roster email if matched, otherwise the original email
            key = roster_email_for_grouping or original_drive_email
            
            if key:
                name = display_name or (key.split('@')[0] if '@' in key else key)
                # DISPLAY EMAIL should be the original one from Drive history if available
                contributor_email = original_drive_email or key
                verified = is_verified_roster_member
            else:
                display_key = self._normalize_identity_token(display_name)
                key = f'unverified:{display_key}' if display_key else 'unverified'
                name = display_name or 'Anonymous Contributor'
                contributor_email = None
                verified = False

            # If matched to roster, we might want to use the roster name but keep the drive email
            # However, if we group by roster email, we must ensure 'drive_email' is preserved.
            if identity_source == 'matched_by_name' and is_verified_roster_member:
                # We matched "Mark Christian" to "Mark Christian Garing"
                # Let's use the roster email as the key to group them,
                # but keep the drive_email for the specific record if it's the only one.
                pass

            if key not in grouped:
                grouped[key] = {
                    'id': key,
                    'name': name,
                    'email': contributor_email,
                    'verified': verified,
                    'identitySource': identity_source,
                    'revisionCount': 0,
                    'timestamps': []
                }
            elif original_drive_email and not grouped[key].get('email'):
                grouped[key]['email'] = original_drive_email

            grouped[key]['revisionCount'] += 1
            grouped[key]['timestamps'].append(ts)

        # Note: Roster members with 0 edits are no longer added automatically per user request.

        contributors = []
        total_active_minutes = 0.0
        total_rush_minutes = 0.0

        for item in grouped.values():
            times = sorted(item['timestamps'])
            if not times:
                item['activeEditingMinutes'] = 0.0
                item['sessionCount'] = 0
                item['points'] = 0.0
                item['lastEditTime'] = None
                item['heuristics'] = ['No Work Detected']
                item['isRealContributor'] = False
                item['workStatus'] = 'No Work Detected'
                contributors.append(item)
                continue

            # Group spammy/autosave revisions into realistic sessions (10 minute gap rule)
            sessions = []
            
            # Simple direct loop over native drive history
            if times:
                # Create active blocks based on a 30-minute inactivity threshold
                active_blocks = []
                current_block = {
                    'start': times[0],
                    'end': times[0],
                    'revisionCount': 1
                }
                
                for idx in range(1, len(times)):
                    ts = times[idx]
                    gap_minutes = (ts - current_block['end']).total_seconds() / 60.0
                    
                    if gap_minutes <= window_size:
                        current_block['end'] = ts
                        current_block['revisionCount'] += 1
                    else:
                        # Finalize the active block
                        span = (current_block['end'] - current_block['start']).total_seconds() / 60.0
                        # Real Minutes = Duration of work + 1 minute starting buffer
                        current_block['minutes'] = max(1.0, span + 1.0)
                        active_blocks.append(current_block)
                        current_block = {
                            'start': ts,
                            'end': ts,
                            'revisionCount': 1
                        }
                
                # Finalize last block
                span = (current_block['end'] - current_block['start']).total_seconds() / 60.0
                current_block['minutes'] = max(1.0, span + 1.0)
                active_blocks.append(current_block)
                
                # Now group these active blocks into Daily Sessions for the 'sessionCount'
                daily_sessions = {}
                for b in active_blocks:
                    day_key = b['start'].date()
                    if day_key not in daily_sessions:
                        daily_sessions[day_key] = {
                            'start': b['start'],
                            'end': b['end'],
                            'revisionCount': b['revisionCount'],
                            'minutes': b['minutes']
                        }
                    else:
                        daily_sessions[day_key]['end'] = max(daily_sessions[day_key]['end'], b['end'])
                        daily_sessions[day_key]['revisionCount'] += b['revisionCount']
                        daily_sessions[day_key]['minutes'] += b['minutes']
                
                # Override sessions with daily aggregated versions
                sessions = sorted(daily_sessions.values(), key=lambda x: x['start'])
                

                        

            # --- Loophole Breaking: Spammy Edit Detection ---
            total_revs = sum(s['revisionCount'] for s in sessions)
            total_mins = sum(s['minutes'] for s in sessions)
            avg_rate = total_revs / total_mins if total_mins > 0 else 0
            
            suspicious_flags = []
            if total_revs > 50 and avg_rate > 10:
                suspicious_flags.append("High Frequency Edits (Spamming Risk)")
            
            short_sessions = [s for s in sessions if s['minutes'] < 2]
            if len(sessions) > 3 and len(short_sessions) / len(sessions) > 0.7:
                suspicious_flags.append("Short-Burst Attendance (Gaming Risk)")
            
            if total_revs > 100 and total_mins < 5:
                suspicious_flags.append("Rapid Revision Spiking")
                
            item['suspicious_activity'] = suspicious_flags
            item['edits'] = total_revs
            item['sessions'] = len(sessions)
            # -----------------------------------------------

            # Simplified contributor stats (metrics removed as requested)
            item['date'] = sessions[-1]['end'].isoformat() + 'Z' if sessions else None
            item['isRealContributor'] = bool(item.get('verified')) and len(sessions) > 0
            
            contributors.append(item)

        # Strip all metrics as requested (Keep suspicious_activity for the AI/loophole breaking)
        for item in contributors:
            # We preserve 'edits', 'sessions', and 'suspicious_activity' for AI context
            item.pop('activeEditingMinutes', None)
            item.pop('sessionCount', None)
            item.pop('contributionPercent', None)
            item.pop('workStatus', None)
            item.pop('heuristics', None)
            item.pop('points', None)
            item.pop('sessions_list', None) # Custom sessions list pop

        contributors.sort(key=lambda c: c.get('name', ''), reverse=False)
        
        # Apply AI evaluation (now a no-op)
        contributors = [self._evaluate_contributor_with_ai(contributor) for contributor in contributors]

        unverified_minutes = float(sum(
            float(c.get('activeEditingMinutes') or 0)
            for c in contributors
            if not c.get('verified')
        ))
        unverified_ratio = (unverified_minutes / total_active_minutes) if total_active_minutes > 0 else 0.0

        # Build Global Logs (Daily/Session History)
        all_sessions = []
        for key, item in grouped.items():
            for s in item.get('sessions', []):
                all_sessions.append({
                    'contributor': key,
                    'start': s['start'],
                    'end': s['end'],
                    'minutes': s['minutes'],
                    'revisionCount': s['revisionCount']
                })
        
        all_sessions.sort(key=lambda x: x['start'])
        
        global_logs = []
        if all_sessions:
            current_log = {
                'start': all_sessions[0]['start'],
                'end': all_sessions[0]['end'],
                'contributors': {all_sessions[0]['contributor']: {
                    'minutes': all_sessions[0]['minutes'],
                    'revisions': all_sessions[0]['revisionCount']
                }},
                'totalMinutes': all_sessions[0]['minutes'],
                'totalRevisions': all_sessions[0]['revisionCount']
            }
            
            for j in range(1, len(all_sessions)):
                s = all_sessions[j]
                # Group logs by day instead of gap
                is_same_day = s['start'].date() == current_log['start'].date()
                
                if is_same_day:
                    current_log['end'] = max(current_log['end'], s['end'])
                    c_key = s['contributor']
                    if c_key not in current_log['contributors']:
                        current_log['contributors'][c_key] = {'minutes': 0.0, 'revisions': 0}
                    current_log['contributors'][c_key]['minutes'] += s['minutes']
                    current_log['contributors'][c_key]['revisions'] += s['revisionCount']
                    current_log['totalMinutes'] += s['minutes']
                    current_log['totalRevisions'] = current_log.get('totalRevisions', 0) + s['revisionCount']
                else:
                    global_logs.append(current_log)
                    current_log = {
                        'start': s['start'],
                        'end': s['end'],
                        'contributors': {s['contributor']: {
                            'minutes': s['minutes'],
                            'revisions': s['revisionCount']
                        }},
                        'totalMinutes': s['minutes'],
                        'totalRevisions': s['revisionCount']
                    }
            global_logs.append(current_log)

        formatted_logs = []
        current_app.logger.info(f"Generating {len(global_logs)} history logs for document")
        for idx, gl in enumerate(global_logs):
            contrib_stats = {}
            for k, v in gl['contributors'].items():
                c_obj = grouped.get(k, {})
                c_key = c_obj.get('email') or c_obj.get('name') or k
                contrib_stats[c_key] = {
                    'minutes': round(v['minutes'], 2),
                    'revisions': v['revisions']
                }

            formatted_logs.append({
                'id': f"log_{idx}",
                'date': gl['start'].strftime('%Y-%m-%d %H:%M'),
                'label': f"{gl['start'].strftime('%b %d, %Y')} Session",
                'duration': round(gl['totalMinutes'], 2),
                'totalRevisions': gl.get('totalRevisions', 0),
                'contributors': contrib_stats
            })
        
        formatted_logs.sort(key=lambda x: x['date'], reverse=True)

        # Final contributors list - Combine History and Metadata insights
        final_contributors = []
        
        # 1. Add everyone from the history
        history_keys = set()
        for item_g in grouped.values():
            if 'sessions' in item_g:
                del item_g['sessions']
            
            if int(item_g.get('revisionCount') or 0) > 0:
                final_contributors.append(item_g)
                history_keys.add(item_g.get('id'))

        # 2. Add people from document metadata/permissions who didn't show up in history
        # (e.g. the Author or other stakeholders mentioned in the file)
        metadata_contributors = []
        if isinstance(document_metadata, dict) and document_metadata.get('contributors'):
            for mc in document_metadata['contributors']:
                mc_email = str(mc.get('email') or '').lower()
                mc_name = mc.get('name')
                mc_id = mc_email or mc_name
                
                if mc_id and mc_id not in history_keys:
                    metadata_contributors.append({
                        'id': f"meta_{mc_id}",
                        'name': mc_name,
                        'email': mc_email,
                        'verified': True,
                        'identitySource': 'document_metadata',
                        'revisionCount': 0,
                        'sessionCount': 0,
                        'activeEditingMinutes': 0.0,
                        'contributionPercent': 0.0,
                        'workStatus': 'Historical/Metadata Contributor',
                        'isRealContributor': False,
                        'heuristics': ['Found in Metadata', 'No recent history detected']
                    })
                    history_keys.add(mc_id)

        final_contributors.extend(metadata_contributors)

        # Sort final list by contribution percent, then revisions, then name
        final_contributors.sort(key=lambda c: (float(c.get('contributionPercent') or 0), int(c.get('revisionCount') or 0)), reverse=True)

        return final_contributors, {
            'mode': 'document_metadata_only',
            'historyLogs': [] # Removed logs as requested
        }

    def _apply_ai_effort_labels(self, contributors):
        """Use Gemini to label contribution quality without overriding core percentages."""
        if not contributors:
            return contributors, 'gemini', True
        if not genai:
            raise Exception('Gemini client is unavailable')

        api_key = current_app.config.get('GEMINI_API_KEY')
        if not api_key:
            raise Exception('GEMINI_API_KEY is not configured')

        try:
            genai.configure(api_key=api_key)

            compact = [
                {
                    'name': c.get('name'),
                    'email': c.get('email'),
                    'revisionCount': c.get('revisionCount', 0),
                    'sessionCount': c.get('sessionCount', 0),
                    'activeEditingMinutes': c.get('activeEditingMinutes', 0),
                    'contributionPercent': c.get('contributionPercent', 0),
                    'workStatus': c.get('workStatus')
                }
                for c in contributors
            ]

            prompt = (
                'Given collaborative metadata metrics, label each person with one effortLabel '
                '(High Contribution, Moderate Contribution, Low Contribution, No Work Detected) and brief reason. '
                'Do not invent contributors. Keep output strictly JSON array with fields: '
                '[{"name":"...","email":"...","effortLabel":"...","reason":"..."}].\\n\\n'
                f'Contributors: {json.dumps(compact, ensure_ascii=True)}'
            )

            response, _model_used = self._generate_with_gemini(
                prompt,
                generation_config={'temperature': 0, 'response_mime_type': 'application/json'},
                timeout_seconds=12
            )
            parsed = self._extract_ai_json((response.text or '').strip())
            if not isinstance(parsed, list):
                raise Exception('Gemini returned invalid effort-label payload')

            by_key = {}
            for row in parsed:
                if not isinstance(row, dict):
                    continue
                key = str(row.get('email') or row.get('name') or '').strip().lower()
                if key:
                    by_key[key] = row

            for contributor in contributors:
                base_key = str(contributor.get('email') or contributor.get('name') or '').strip().lower()
                ai_row = by_key.get(base_key)
                if not ai_row:
                    continue

                ai_label = str(ai_row.get('effortLabel') or '').strip()
                ai_reason = str(ai_row.get('reason') or '').strip()

                # Preserve deterministic no-work verdict to avoid false positives.
                if contributor.get('workStatus') != 'No Work Detected' and ai_label:
                    contributor['aiEffortLabel'] = ai_label
                if ai_reason:
                    contributor['aiReason'] = ai_reason

            labeled_count = sum(1 for c in contributors if c.get('aiEffortLabel') or c.get('aiReason'))
            if labeled_count <= 0:
                raise Exception('Gemini did not label any contributors')

            return contributors, 'gemini', True
        except Exception as ai_error:
            raise Exception(f"AI effort labeling unavailable: {ai_error}")

    def _build_session_summary_feedback(self, contributors, total_revisions, session_meta=None):
        """Deterministic session-based narrative summary."""
        session_meta = session_meta or {}
        session_window = int(session_meta.get('sessionWindowMinutes') or 30)
        if not contributors:
            return {
                'overallInsight': 'No contributor sessions could be computed from revision metadata.',
                'timeline': f'Revision history checked across {total_revisions} revisions.',
                'effortDistribution': 'No active editing sessions were detected.',
                'aiEvaluationQuality': 'Insufficient metadata to assess AI analysis & evaluation.',
                'identifiedRoles': [],
                'source': 'deterministic'
            }

        active_contributors = [c for c in contributors if float(c.get('activeEditingMinutes') or 0) > 0]
        if not active_contributors:
            return {
                'overallInsight': 'No measurable active editing sessions were attributed to roster contributors.',
                'timeline': f'Revision history analyzed across {total_revisions} revisions using {session_window}-minute session clustering.',
                'effortDistribution': 'All listed contributors are currently marked as No Work Detected.',
                'aiEvaluationQuality': 'Insufficient active editing evidence for fair attribution.',
                'identifiedRoles': [],
                'source': 'deterministic'
            }

        top = max(active_contributors, key=lambda c: float(c.get('contributionPercent') or 0))
        top_percent = float(top.get('contributionPercent') or 0)
        total_minutes = float(session_meta.get('totalActiveEditingMinutes') or 0)
        non_worker_count = sum(1 for c in contributors if c.get('workStatus') == 'No Work Detected')

        if top_percent >= 70:
            quality = 'Editing effort appears highly concentrated in one contributor session profile.'
        elif top_percent >= 50:
            quality = 'One contributor led the effort with visible supporting sessions from others.'
        else:
            quality = 'Session activity suggests a relatively balanced AI analysis & evaluation.'

        return {
            'overallInsight': 'Revision history indicates activity from the following contributors.',
            'timeline': f'Revision history analyzed across {total_revisions} revisions.',
            'effortDistribution': 'Contribution details summarized based on document revision metadata.',
            'aiEvaluationQuality': 'Analysis completed based on available revision history.',
            'source': 'deterministic'
        }

    def _tokenize_words(self, text):
        return re.findall(r"\b\w+\b", str(text or '').lower())

    def _calculate_word_deltas(self, previous_tokens, current_tokens):
        """Return added/deleted word counts between two token snapshots."""
        if previous_tokens is None:
            # First observed snapshot has no reliable "before" baseline.
            return 0, 0

        added = 0
        deleted = 0
        matcher = difflib.SequenceMatcher(a=previous_tokens, b=current_tokens, autojunk=False)
        for opcode, a0, a1, b0, b1 in matcher.get_opcodes():
            if opcode == 'insert':
                added += (b1 - b0)
            elif opcode == 'delete':
                deleted += (a1 - a0)
            elif opcode == 'replace':
                deleted += (a1 - a0)
                added += (b1 - b0)
        return added, deleted

    def _fetch_revision_text(self, file_id, revision_id, user_credentials_json=None):
        """Policy guard: metadata-only mode forbids historical text fetching."""
        return None

    def _extract_nlp_context(self, file_id, revisions, user_credentials_json=None):
        """Extract lightweight NLP context from the latest available revision text."""
        if not revisions:
            return None

        latest_revision = None
        try:
            latest_revision = sorted(
                revisions,
                key=lambda revision: str(revision.get('modifiedTime') or '')
            )[-1]
        except Exception:
            latest_revision = revisions[-1]

        revision_id = latest_revision.get('id') if isinstance(latest_revision, dict) else None
        if not revision_id:
            return None

        latest_text = self._fetch_revision_text(file_id, revision_id, user_credentials_json)
        if not latest_text:
            return None

        context = {
            'textLength': len(latest_text),
            'sourceRevisionId': revision_id
        }

        try:
            from app.services.nlp_service import NLPService
            nlp_service = NLPService()
            nlp_results = nlp_service.perform_local_nlp_analysis(latest_text)

            if not isinstance(nlp_results, dict) or nlp_results.get('error'):
                return context

            readability = nlp_results.get('readability') or {}
            token_analysis = nlp_results.get('token_analysis') or {}
            sentiment = nlp_results.get('sentiment') or {}

            context.update({
                'readabilityLevel': readability.get('reading_level'),
                'gradeLevel': readability.get('grade_level'),
                'vocabularyRichness': token_analysis.get('vocabulary_richness'),
                'topTerms': [
                    item.get('term')
                    for item in (token_analysis.get('top_terms') or [])[:5]
                    if isinstance(item, dict) and item.get('term')
                ],
                'sentiment': sentiment.get('overall')
            })
        except Exception as nlp_error:
            current_app.logger.warning(f"NLP context extraction skipped: {nlp_error}")

        return context

    def _build_contribution_stats(self, file_id, revisions, user_credentials_json=None, expected_word_count=None):
        """Build per-contributor metrics from revision metadata and text snapshots."""
        if not revisions:
            return [], {
                'scoringMode': 'revision_count',
                'revisionSnapshotsAnalyzed': 0,
                'expectedWordCount': expected_word_count,
                'biasControlApplied': False
            }

        sorted_revisions = sorted(
            revisions,
            key=lambda r: str(r.get('modifiedTime') or '')
        )

        stats = {}
        previous_tokens = None
        gap_since_last_snapshot = False
        snapshots_analyzed = 0
        start_time = time.monotonic()
        max_snapshots = 20
        max_seconds = 20

        for rev in sorted_revisions:
            if snapshots_analyzed >= max_snapshots:
                break
            if time.monotonic() - start_time >= max_seconds:
                break

            key, name, email = self._contributor_identity(rev)

            if key not in stats:
                stats[key] = {
                    'name': name,
                    'email': email,
                    'revisionCount': 0,
                    'wordsWritten': 0,
                    'wordsDeleted': 0,
                    'verified': email.endswith('@gmail.com') if email else False
                }

            stats[key]['revisionCount'] += 1

            revision_id = rev.get('id')
            if not revision_id:
                gap_since_last_snapshot = True
                continue

            revision_text = self._fetch_revision_text(file_id, revision_id, user_credentials_json)
            if revision_text is None:
                gap_since_last_snapshot = True
                continue

            snapshots_analyzed += 1
            current_tokens = self._tokenize_words(revision_text)

            # If revisions were skipped (missing snapshot text), avoid assigning
            # accumulated changes to the next visible editor.
            if previous_tokens is None or gap_since_last_snapshot:
                previous_tokens = current_tokens
                gap_since_last_snapshot = False
                continue

            words_added, words_deleted = self._calculate_word_deltas(previous_tokens, current_tokens)
            stats[key]['wordsWritten'] += words_added
            stats[key]['wordsDeleted'] += words_deleted
            previous_tokens = current_tokens
            gap_since_last_snapshot = False

        contributors = list(stats.values())
        measured_contributors = [
            contributor for contributor in contributors
            if (contributor.get('wordsWritten', 0) > 0 or contributor.get('wordsDeleted', 0) > 0)
        ]
        use_word_scoring = bool(measured_contributors)

        if not measured_contributors:
            return [], {
                'scoringMode': 'word_and_deletion',
                'revisionSnapshotsAnalyzed': snapshots_analyzed,
                'expectedWordCount': expected_word_count,
                'biasControlApplied': False,
                'estimatedWordMetrics': False,
                'noMeasuredEdits': True
            }

        total_points = 0.0
        baseline_word_count = None
        try:
            baseline_word_count = int(expected_word_count) if expected_word_count is not None else None
        except Exception:
            baseline_word_count = None

        points_cap = None
        if baseline_word_count and baseline_word_count > 0:
            # Bias control: cap extreme per-contributor churn relative to final document size.
            points_cap = baseline_word_count * 1.2

        estimated_word_metrics = False
        total_revisions_count = float(sum(int(c.get('revisionCount') or 0) for c in contributors)) or 1.0

        # Coverage-aware fairness: when some snapshots are missing, preserve revision
        # participation signal so one editor is not over-credited from sparse deltas.
        coverage_ratio = float(snapshots_analyzed) / float(len(sorted_revisions) or 1)
        if coverage_ratio >= 0.8:
            word_weight = 0.85
        elif coverage_ratio >= 0.5:
            word_weight = 0.65
        else:
            word_weight = 0.45
        revision_weight = 1.0 - word_weight

        word_points_by_key = {}
        total_word_points = 0.0
        for contributor in contributors:
            has_measured_delta = (
                float(contributor.get('wordsWritten') or 0) > 0 or
                float(contributor.get('wordsDeleted') or 0) > 0
            )
            if has_measured_delta:
                raw_points = float(contributor['wordsWritten']) + (float(contributor['wordsDeleted']) * 0.5)
                points = min(raw_points, points_cap) if points_cap is not None else raw_points
            else:
                points = 0.0

            key = str(contributor.get('email') or contributor.get('name') or '')
            word_points_by_key[key] = points
            total_word_points += points

        for contributor in contributors:
            key = str(contributor.get('email') or contributor.get('name') or '')
            word_points = float(word_points_by_key.get(key) or 0.0)

            word_percent = (word_points / total_word_points) * 100 if total_word_points > 0 else 0.0
            revision_percent = (float(contributor.get('revisionCount') or 0) / total_revisions_count) * 100

            if use_word_scoring:
                blended_percent = (word_percent * word_weight) + (revision_percent * revision_weight)
                points = blended_percent
            else:
                points = revision_percent

            contributor['points'] = round(points, 2)
            total_points += points

        if total_points <= 0:
            total_points = 1.0

        for contributor in contributors:
            contributor['contributionPercent'] = round((contributor['points'] / total_points) * 100, 2)

        contributors.sort(key=lambda x: (x['contributionPercent'], x['revisionCount']), reverse=True)

        meta = {
            'scoringMode': 'word_and_deletion' if use_word_scoring else 'revision_count',
            'revisionSnapshotsAnalyzed': snapshots_analyzed,
            'expectedWordCount': baseline_word_count,
            'biasControlApplied': points_cap is not None and use_word_scoring,
            'wordWeight': word_weight if use_word_scoring else 0.0,
            'revisionWeight': revision_weight if use_word_scoring else 1.0,
            'snapshotCoverage': round(coverage_ratio, 4),
            'estimatedWordMetrics': estimated_word_metrics,
            'noMeasuredEdits': False
        }

        return contributors, meta

    def _evaluate_contributor_with_ai(self, contributor):
        """AI-powered evaluation deactivated as per request."""
        return contributor

    def _build_summary_feedback(self, contributors, total_revisions, scoring_meta=None, total_words_added=None, total_words_deleted=None):
        """Create a deterministic collaboration summary for the report footer."""
        scoring_meta = scoring_meta or {}
        contributor_count = len(contributors or [])
        if scoring_meta.get('noMeasuredEdits'):
            return {
                'overallInsight': 'No measurable text edits were detected, so individual effort cannot be estimated reliably.',
                'timeline': f'{total_revisions} revisions were checked, but no measurable edit changes were confirmed.',
                'effortDistribution': 'There is not enough measurable evidence to distribute contribution percentages.',
                'collaborationQuality': 'Collaboration quality cannot be judged fairly from the available revision signals.',
                'identifiedRoles': [],
                'source': 'deterministic'
            }

        top_contributor = None
        top_percent = 0.0
        if contributors:
            top_contributor = max(contributors, key=lambda item: float(item.get('contributionPercent') or 0))
            top_percent = float(top_contributor.get('contributionPercent') or 0)

        if total_words_added is None:
            total_words_added = sum(int(c.get('wordsWritten') or 0) for c in contributors or [])
        if total_words_deleted is None:
            total_words_deleted = sum(int(c.get('wordsDeleted') or 0) for c in contributors or [])

        if contributor_count == 0:
            return {
                'overallInsight': 'No contributor activity could be summarized from the available revision history.',
                'timeline': 'No usable revision timeline was found for this file.',
                'effortDistribution': 'No contribution breakdown could be generated.',
                'collaborationQuality': 'Insufficient evidence to evaluate collaboration quality.',
                'identifiedRoles': [],
                'source': 'deterministic'
            }

        if top_percent >= 70:
            quality = 'Contribution is heavily concentrated in one editor.'
            recommendation = 'Encourage more balanced drafting and revision participation.'
        elif top_percent >= 50:
            quality = 'One primary contributor led the document, with supporting edits from others.'
            recommendation = 'Continue coordinated editing, but spread writing tasks more evenly.'
        else:
            quality = 'The document shows a more balanced collaboration pattern.'
            recommendation = 'Maintain the current collaboration rhythm and document shared edits clearly.'

        summary = {
            'overallInsight': f"Work detected across {total_revisions} revisions.",
            'timeline': f"Revision history analyzed for {contributor_count} contributors.",
            'effortDistribution': "Document contribution summarized based on metadata.",
            'aiEvaluationQuality': "Evaluation completed based on revision signals.",
            'source': 'deterministic'
        }

        return summary

    def _ensure_all_contributors_in_identified_roles(self, analysis, contributors):
        """Ensure summary roles include every contributor in report order."""
        analysis = analysis if isinstance(analysis, dict) else {}

        existing_roles = {}
        for role_item in (analysis.get('identifiedRoles') or []):
            if not isinstance(role_item, dict):
                continue
            role_name = str(role_item.get('role') or '').strip()
            contributor_name = str(role_item.get('name') or '').strip().lower()
            contributor_email = str(role_item.get('email') or '').strip().lower()
            if role_name and contributor_name:
                existing_roles[contributor_name] = role_name
            if role_name and contributor_email:
                existing_roles[contributor_email] = role_name

        resolved_roles = []
        for index, contributor in enumerate(contributors or []):
            name = str(contributor.get('name') or 'Unknown').strip() or 'Unknown'
            email = str(contributor.get('email') or '').strip().lower()

            role = existing_roles.get(email) or existing_roles.get(name.lower())
            if not role:
                role = str(contributor.get('aiEffortLabel') or '').strip()
            if not role:
                role = str(contributor.get('workStatus') or '').strip()
            if not role:
                role = 'Primary Contributor' if index == 0 else 'Supporting Contributor'

            resolved_roles.append({
                'name': name,
                'role': role
            })

        analysis['identifiedRoles'] = resolved_roles
        return analysis

    def _score_with_gemini(self, contributors):
        """AI scoring deactivated as per request."""
        return contributors

    def _apply_estimated_word_metrics(self, contributors, total_revisions, expected_word_count):
        """Word metric estimation deactivated."""
        return contributors, False

    def _aggregate_revision_count_contributors(self, revisions, expected_word_count=None):
        """Simplified identity-only contributor aggregation."""
        if not revisions:
            return []

        stats = {}
        for rev in revisions:
            key, name, email = self._contributor_identity(rev)
            if key not in stats:
                stats[key] = {
                    'name': name,
                    'email': email,
                    'verified': email.endswith('@gmail.com') if email else False
                }
        return list(stats.values())

    def _analyze_revision_history_with_gemini(self, revisions, contributors, nlp_context=None):
        """Collaboration history analysis deactivated as per request."""
        return None

    def fetch_revisions(self, file_id, user_credentials_json=None, max_pages=50):
        """Fetch Google Drive revisions via paginated metadata-only endpoint with enhanced accuracy."""
        try:
            service = self._get_drive_service(user_credentials_json)
            if not service:
                return None, None, "Google Drive service unavailable"

            revisions = []
            next_page_token = None
            pages_fetched = 0
            partial_data = False
            partial_reason = None
            retry_count = 0
            max_retries = 3

            while True:
                if pages_fetched >= int(max_pages):
                    partial_data = True
                    partial_reason = 'history_truncated_page_limit'
                    current_app.logger.warning(f"Revision history truncated at page limit {max_pages} for file {file_id}")
                    break

                try:
                    results = service.revisions().list(
                        fileId=file_id,
                        pageToken=next_page_token,
                        fields='nextPageToken,revisions(id,modifiedTime,lastModifyingUser(emailAddress,displayName))',
                        pageSize=100  # Max page size for efficiency
                    ).execute()
                    
                    # Validate and clean revision data
                    page_revisions = results.get('revisions', []) or []
                    valid_revisions = []
                    
                    for rev in page_revisions:
                        if not rev.get('id'):
                            continue
                        
                        # Validate timestamp
                        mod_time = rev.get('modifiedTime')
                        if not mod_time:
                            continue
                        
                        # Validate user data
                        user = rev.get('lastModifyingUser') or {}
                        if not user.get('displayName') and not user.get('emailAddress'):
                            # Still include anonymous revisions but mark them
                            rev['_isAnonymous'] = True
                        
                        valid_revisions.append(rev)
                    
                    revisions.extend(valid_revisions)
                    pages_fetched += 1
                    retry_count = 0  # Reset retry count on success
                    
                    current_app.logger.info(f"Fetched page {pages_fetched}: {len(valid_revisions)} revisions for file {file_id}")
                    
                except HttpError as page_error:
                    status = getattr(getattr(page_error, 'resp', None), 'status', None)
                    err_text = str(page_error).lower()
                    
                    if status == 403 and ('rate' in err_text or 'quota' in err_text):
                        if retry_count < max_retries:
                            retry_count += 1
                            wait_time = min(2 ** retry_count, 10)  # Exponential backoff, max 10 seconds
                            current_app.logger.warning(f"Rate limit hit, retrying in {wait_time}s (attempt {retry_count}/{max_retries})")
                            import time
                            time.sleep(wait_time)
                            continue
                        
                        partial_data = True
                        partial_reason = 'rate_limit_exceeded'
                        current_app.logger.warning(f"Rate limit exceeded after {max_retries} retries for file {file_id}")
                        break
                    elif status == 429:
                        if retry_count < max_retries:
                            retry_count += 1
                            wait_time = min(2 ** retry_count, 15)  # Longer backoff for 429
                            current_app.logger.warning(f"429 error, retrying in {wait_time}s (attempt {retry_count}/{max_retries})")
                            import time
                            time.sleep(wait_time)
                            continue
                        
                        partial_data = True
                        partial_reason = 'too_many_requests'
                        break
                    else:
                        current_app.logger.error(f"HTTP error fetching revisions: {page_error}")
                        raise

                next_page_token = results.get('nextPageToken')
                if not next_page_token:
                    break

            if not revisions:
                return None, {
                    'partialData': partial_data,
                    'partialReason': partial_reason,
                    'pagesFetched': pages_fetched,
                }, "No revision history found for this document type (revisions are best for Google Docs/Sheets)."

            # Sort revisions by timestamp to ensure chronological order
            revisions.sort(key=lambda x: x.get('modifiedTime', ''), reverse=True)
            
            # Remove duplicates based on revision ID
            seen_ids = set()
            unique_revisions = []
            for rev in revisions:
                rev_id = rev.get('id')
                if rev_id and rev_id not in seen_ids:
                    seen_ids.add(rev_id)
                    unique_revisions.append(rev)
            
            current_app.logger.info(f"Successfully fetched {len(unique_revisions)} unique revisions for file {file_id}")

            return unique_revisions, {
                'partialData': partial_data,
                'partialReason': partial_reason,
                'pagesFetched': pages_fetched,
            }, None
            
        except HttpError as e:
            status = getattr(getattr(e, 'resp', None), 'status', None)

            # E1: If rate-limited but we already fetched pages in the loop, callers
            # may still process partial arrays if provided by upstream logic.
            if status == 403 and ('rate' in str(e).lower() or 'quota' in str(e).lower()):
                return [], {
                    'partialData': True,
                    'partialReason': 'rate_limit_exceeded',
                    'pagesFetched': 0,
                }, "Drive API rate limit exceeded"

            try:
                # Try to extract detailed error message from response body
                import json
                error_details = json.loads(e.content.decode())
                message = error_details.get('error', {}).get('message', str(e))
                return None, None, f"Drive API Error: {message}"
            except:
                if status == 401:
                    return None, None, "Expired or invalid OAuth token"
                elif status == 403:
                    return None, None, "Insufficient permissions to access revision history"
                elif status == 404:
                    return None, None, "File not found"
                return None, None, f"API error: {str(e)}"
        except Exception as e:
            current_app.logger.error(f"Error fetching revisions: {e}")
            return None, None, f"Unexpected error: {str(e)}"

    def generate_contribution_report(
        self,
        file_id,
        user_credentials_json=None,
        expected_word_count=None,
        quick_mode=False,
        allowed_emails=None,
        roster_members=None,
        deadline_datetime=None,
        submitter_identity=None,
        document_metadata=None,
    ):
        """Generate collaborative report using session-based revision aggregation."""
        session_window_minutes = int(current_app.config.get('COLLAB_SESSION_WINDOW_MINUTES', 30) or 30)
        single_revision_default_minutes = int(current_app.config.get('COLLAB_SINGLE_REVISION_DEFAULT_MINUTES', 5) or 5)
        max_revision_pages = int(current_app.config.get('COLLAB_MAX_REVISION_PAGES', 50) or 50)
        micro_edit_revision_threshold = int(current_app.config.get('COLLAB_MICRO_EDIT_REVISION_THRESHOLD', 50) or 50)
        micro_edit_minutes_threshold = float(current_app.config.get('COLLAB_MICRO_EDIT_MINUTES_THRESHOLD', 10) or 10)
        massive_paste_wpm_threshold = float(current_app.config.get('COLLAB_MASSIVE_PASTE_WPM_THRESHOLD', 80) or 80)
        high_idle_minutes_threshold = float(current_app.config.get('COLLAB_HIGH_IDLE_MINUTES_THRESHOLD', 180) or 180)
        high_idle_wordcount_threshold = int(current_app.config.get('COLLAB_HIGH_IDLE_WORDCOUNT_THRESHOLD', 500) or 500)
        unverified_ratio_threshold = float(current_app.config.get('COLLAB_UNVERIFIED_RATIO_THRESHOLD', 0.40) or 0.40)

        # Step 1: Fetch Google Drive file metadata
        service = self._get_drive_service(user_credentials_json)
        file_metadata = None
        if service:
            try:
                file_metadata = service.files().get(
                    fileId=file_id,
                    fields='id,name,mimeType,createdTime,modifiedTime,owners,lastModifyingUser,size'
                ).execute()
            except Exception as e:
                current_app.logger.warning(f"Could not fetch file metadata: {e}")

        mime_type = str((file_metadata or {}).get('mimeType') or '').strip().lower()
        is_google_doc = mime_type == 'application/vnd.google-apps.document'
        is_docx_on_drive = mime_type == 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        
        if mime_type and not (is_google_doc or is_docx_on_drive):
            return None, f'Contribution tracking requires a Google Doc or Word file on Drive. (Detected: {mime_type})'

        # Step 2: Fetch revision history
        revisions, fetch_meta, error = self.fetch_revisions(file_id, user_credentials_json, max_pages=max_revision_pages)
        
        if error:
            if fetch_meta and fetch_meta.get('partialData') and str(error).lower().find('rate limit') >= 0:
                revisions = revisions or []
            else:
                return None, error

        revisions = revisions or []
        total_revisions = len(revisions)

        warnings = []
        if fetch_meta and fetch_meta.get('partialData'):
            warnings.append('Partial Data Warning: History Truncated')

        if total_revisions == 0:
            submitter_name = str((submitter_identity or {}).get('name') or 'Submitter').strip() or 'Submitter'
            submitter_email = str((submitter_identity or {}).get('email') or '').strip().lower() or None
            contributors = [{
                'name': submitter_name,
                'email': submitter_email,
                'verified': bool(submitter_email),
                'revisionCount': 0,
                'sessionCount': 1,
                'activeEditingMinutes': 0.0,
                'points': 100.0,
                'contributionPercent': 100.0,
                'workStatus': 'No Work Detected',
                'isRealContributor': False,
                'heuristics': ['Single Session Document / Possible Copy-Paste']
            }]
            warnings.append('Single Session Document / Possible Copy-Paste')
            session_meta = {
                'mode': 'session_active_minutes',
                'sessionWindowMinutes': session_window_minutes,
                'singleRevisionDefaultMinutes': single_revision_default_minutes,
                'totalActiveEditingMinutes': 0.0,
                'totalLastMinuteMinutes': 0.0,
                'unverifiedMinutes': 0.0,
                'unverifiedRatio': 0.0,
            }
        else:
            contributors, session_meta = self._build_session_based_contributors(
                revisions,
                allowed_emails=allowed_emails,
                roster_members=roster_members,
                file_metadata=file_metadata,
                document_metadata=document_metadata,
                deadline_datetime=deadline_datetime,
                session_window_minutes=session_window_minutes,
                single_revision_default_minutes=single_revision_default_minutes,
            )

        contributors = self._enrich_contributors_with_metadata(
            contributors,
            roster_members=roster_members,
            file_metadata=file_metadata,
            document_metadata=document_metadata,
        )

        try:
            total_active_minutes = float(session_meta.get('totalActiveEditingMinutes') or 0)
        except Exception:
            total_active_minutes = 0.0

        expected_wc = None
        try:
            expected_wc = int(expected_word_count) if expected_word_count is not None else None
        except Exception:
            expected_wc = None

        if expected_wc and total_active_minutes > 0:
            typing_velocity_wpm = round(float(expected_wc) / float(total_active_minutes), 2)
            session_meta['typingVelocityWPM'] = typing_velocity_wpm
            if typing_velocity_wpm > massive_paste_wpm_threshold:
                warnings.append('Massive Paste / Offline Draft')
        else:
            session_meta['typingVelocityWPM'] = None

        if expected_wc is not None and total_active_minutes > high_idle_minutes_threshold and expected_wc < high_idle_wordcount_threshold:
            warnings.append('High Idle / Formatting Ghost')

        if any(
            int(c.get('revisionCount') or 0) > micro_edit_revision_threshold and float(c.get('activeEditingMinutes') or 0) < micro_edit_minutes_threshold
            for c in (contributors or [])
        ):
            warnings.append('Micro-Edit Spammer')

        try:
            unverified_ratio = float(session_meta.get('unverifiedRatio') or 0)
        except Exception:
            unverified_ratio = 0.0
        if unverified_ratio > unverified_ratio_threshold:
            warnings.append('Academic Integrity Warning: High Unverified Contribution')

        warnings = list(dict.fromkeys(warnings))

        total_words_added = sum(int(c.get('wordsWritten') or 0) for c in (contributors or []))
        total_words_deleted = sum(int(c.get('wordsDeleted') or 0) for c in (contributors or []))

        revision_analysis = self._build_summary_feedback(
            contributors,
            total_revisions,
            scoring_meta=session_meta,
            total_words_added=total_words_added,
            total_words_deleted=total_words_deleted
        )
        analysis_provider = 'deterministic'
        ai_provider = 'none'
        ai_applied = False
        ai_collab_analysis_applied = False

        try:
            revision_analysis, analysis_provider = self._build_collab_analysis(
                revisions,
                contributors,
                nlp_context=None
            )
            contributors, ai_provider, ai_applied = self._apply_ai_effort_labels_from_analysis(
                contributors,
                revision_analysis,
            )
            ai_collab_analysis_applied = bool(ai_applied)
        except Exception as ai_error:
            current_app.logger.warning(f"AI collaboration analysis unavailable; falling back to deterministic summary: {ai_error}")
            warnings.append('AI labeling unavailable; using deterministic contribution summary')

        revision_analysis = self._ensure_all_contributors_in_identified_roles(
            revision_analysis or {},
            contributors
        )

        max_report_contributors = int(current_app.config.get('COLLAB_MAX_REPORT_CONTRIBUTORS', 6) or 6)
        max_report_contributors = max(1, max_report_contributors)
        report_contributors = list(contributors or [])[:max_report_contributors]
        if len(contributors or []) > max_report_contributors:
            warnings.append(f'Contributor list limited to top {max_report_contributors} by measured contribution.')

        warnings = list(dict.fromkeys(warnings))
        
        # Discard raw revision data (Data Minimization)
        del revisions
        
        return {
            'fileId': file_id,
            'fileMetadata': {
                'name': file_metadata.get('name') if file_metadata else 'Unknown',
                'mimeType': file_metadata.get('mimeType') if file_metadata else 'Unknown',
                'createdTime': file_metadata.get('createdTime') if file_metadata else None,
                'modifiedTime': file_metadata.get('modifiedTime') if file_metadata else None,
                'size': file_metadata.get('size') if file_metadata else 0
            } if file_metadata else {},
            'totalRevisions': total_revisions,
            'contributors': report_contributors,
            'scoring': {
                'mode': session_meta.get('mode'),
                'weights': {
                    'activeEditingMinutes': 1.0
                },
                'totalContributorsDetected': len(contributors or []),
                'contributorsReturned': len(report_contributors),
                'sessionWindowMinutes': session_meta.get('sessionWindowMinutes', 15),
                'singleRevisionDefaultMinutes': session_meta.get('singleRevisionDefaultMinutes', 5),
                'totalActiveEditingMinutes': session_meta.get('totalActiveEditingMinutes', 0),
                'totalLastMinuteMinutes': session_meta.get('totalLastMinuteMinutes', 0),
                'unverifiedMinutes': session_meta.get('unverifiedMinutes', 0),
                'unverifiedRatio': session_meta.get('unverifiedRatio', 0),
                'typingVelocityWPM': session_meta.get('typingVelocityWPM'),
                'partialData': bool((fetch_meta or {}).get('partialData')),
                'partialReason': (fetch_meta or {}).get('partialReason'),
                'pagesFetched': (fetch_meta or {}).get('pagesFetched', 0),
                'aiEffortLabelingApplied': bool(ai_applied),
                'aiProvider': ai_provider,
                'aiCollabAnalysisApplied': bool(ai_collab_analysis_applied),
                'analysisProvider': analysis_provider,
                'historyLogs': session_meta.get('historyLogs', [])
            },
            'flags': warnings,
            'collaborationAnalysis': revision_analysis or {},
            'advisoryNotice': 'Investigative, not punitive: treat flags as conversation starters with the student group, not as automated grade deductions.',
            'quickMode': bool(quick_mode),
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }, None

    def generate_docx_contribution_report(self, docx_file_path, expected_word_count=None):
        """
        Generate AI Analysis & Evaluation Report using REAL DOCX tracked changes.
        This analyzes the actual w:ins and w:del elements for accurate contributor metrics.
        No estimation - only real data from document tracking.
        """
        try:
            from app.services.metadata_service import MetadataService
            metadata_service = MetadataService()
            
            # Extract REAL tracked changes data from DOCX
            tracked_changes, error = metadata_service.extract_tracked_changes_analysis(docx_file_path)
            
            if error:
                return None, error
            
            if not tracked_changes:
                return None, "No tracked changes found in document"
            
            # Build contributors list from tracked changes
            contributors = []
            total_words_added = 0
            total_words_deleted = 0
            
            for change in tracked_changes:
                contributor = {
                    'name': change['name'],
                    'email': None,
                    'revisionCount': change['insertions'] + change['deletions'],
                    'wordsWritten': change['words_added'],
                    'wordsDeleted': change['words_deleted'],
                    'verified': False,
                    'insertions': change['insertions'],
                    'deletions': change['deletions'],
                    'lastChangeDate': change['last_change']
                }
                
                # Calculate points: words_written + (0.5 * words_deleted)
                contributor['points'] = round(
                    change['words_added'] + (change['words_deleted'] * 0.5), 2
                )
                
                contributors.append(contributor)
                total_words_added += change['words_added']
                total_words_deleted += change['words_deleted']
            
            # Calculate contribution percentages
            total_points = sum(c['points'] for c in contributors)
            if total_points > 0:
                for contributor in contributors:
                    contributor['contributionPercent'] = round(
                        (contributor['points'] / total_points) * 100, 2
                    )
            
            # Sort by contribution percentage
            contributors.sort(key=lambda x: x['contributionPercent'], reverse=True)

            collaboration_analysis = self._build_summary_feedback(
                contributors,
                len(tracked_changes),
                scoring_meta={
                    'scoringMode': 'word_and_deletion',
                    'revisionSnapshotsAnalyzed': len(tracked_changes),
                    'estimatedWordMetrics': False
                },
                total_words_added=total_words_added,
                total_words_deleted=total_words_deleted
            )

            collaboration_analysis = self._ensure_all_contributors_in_identified_roles(
                collaboration_analysis,
                contributors
            )

            max_report_contributors = int(current_app.config.get('COLLAB_MAX_REPORT_CONTRIBUTORS', 6) or 6)
            max_report_contributors = max(1, max_report_contributors)
            report_contributors = list(contributors)[:max_report_contributors]
            
            # Extract file metadata
            file_metadata = {}
            try:
                import os
                if os.path.exists(docx_file_path):
                    from datetime import datetime
                    file_stat = os.stat(docx_file_path)
                    file_metadata = {
                        'name': os.path.basename(docx_file_path),
                        'size': file_stat.st_size,
                        'modifiedTime': datetime.fromtimestamp(file_stat.st_mtime).isoformat() + 'Z'
                    }
            except Exception as e:
                current_app.logger.warning(f"Could not extract file metadata: {e}")
            
            # Build final report
            return {
                'fileId': None,
                'source': 'docx_tracked_changes',
                'dataSource': 'REAL - Extracted from DOCX tracked changes (w:ins, w:del)',
                'fileMetadata': file_metadata,
                'totalTrackedChanges': sum(c['revisionCount'] for c in contributors),
                'totalWordsAdded': total_words_added,
                'totalWordsDeleted': total_words_deleted,
                'contributors': report_contributors,
                'scoring': {
                    'mode': 'word_and_deletion',
                    'weights': {
                        'wordsWritten': 1.0,
                        'wordsDeleted': 0.5,
                        'aiBlend': 0.3
                    },
                    'totalContributorsDetected': len(contributors),
                    'contributorsReturned': len(report_contributors),
                    'expectedWordCount': expected_word_count,
                    'revisionSnapshotsAnalyzed': len(tracked_changes),
                    'biasControlApplied': False,
                    'estimatedWordMetrics': False,
                    'aiScoringApplied': False,
                    'trackedChangesAnalysis': True
                },
                'collaborationAnalysis': collaboration_analysis,
                'analysisType': 'DOCX_TRACKED_CHANGES_ANALYSIS',
                'timestamp': datetime.utcnow().isoformat() + 'Z'
            }, None
            
        except Exception as e:
            current_app.logger.error(f"DOCX contribution report failed: {e}")
            return None, f"Failed to analyze DOCX tracked changes: {str(e)}"
