"""
Dashboard Service - Handles dashboard operations and data aggregation

Extracted from api/dashboard.py to follow proper service layer architecture.
"""

from datetime import datetime, timedelta
from flask import current_app
from sqlalchemy import desc, and_
import pytz

from app.core.extensions import db
from app.models import (
    Submission, AnalysisResult, Deadline, DocumentSnapshot,
    SubmissionStatus, TimelinessClassification, Student, SubmissionToken, User, UserRole
)


class DashboardService:
    """Service for dashboard operations and data aggregation"""
    
    def __init__(self):
        pass

    def _normalize_text(self, value):
        return (value or '').strip()

    def _normalize_lower(self, value):
        return self._normalize_text(value).lower()

    def _normalize_full_name(self, first_name, last_name):
        return f"{self._normalize_lower(first_name)} {self._normalize_lower(last_name)}".strip()

    def _is_professor_email(self, email):
        """Return True when email belongs to a professor account with owned professor data."""
        email_norm = self._normalize_lower(email)
        if not email_norm:
            return False

        user = User.query.filter(
            db.func.lower(User.email) == email_norm,
            User.role == UserRole.PROFESSOR
        ).first()

        if not user:
            return False

        has_professor_data = (
            Deadline.query.filter_by(professor_id=user.id).first() is not None
            or SubmissionToken.query.filter_by(professor_id=user.id).first() is not None
            or Submission.query.filter_by(professor_id=user.id).first() is not None
        )

        return has_professor_data

    def _validate_student_uniqueness(self, user_id, student_id, first_name, last_name, email=None, exclude_id=None):
        """Validate uniqueness per professor for student_id, full name, and email."""
        sid_norm = self._normalize_text(student_id)
        email_norm = self._normalize_lower(email)
        name_norm = self._normalize_full_name(first_name, last_name)

        students = Student.query.filter_by(professor_id=user_id).all()

        for existing in students:
            if exclude_id and existing.id == exclude_id:
                continue

            if sid_norm and self._normalize_text(existing.student_id) == sid_norm:
                return f"Student No. {sid_norm} already exists."

            if email_norm and self._normalize_lower(existing.email) == email_norm:
                return f"Gmail {email_norm} already exists."

            if name_norm and self._normalize_full_name(existing.first_name, existing.last_name) == name_norm:
                return f"Student name '{self._normalize_text(first_name)} {self._normalize_text(last_name)}' already exists."

        return None
    
    def get_dashboard_overview(self, user_id):
        """Get dashboard overview statistics for professor"""
        try:
            total_submissions = Submission.query.filter_by(professor_id=user_id).count()
            
            pending_submissions = Submission.query.filter_by(
                professor_id=user_id,
                status=SubmissionStatus.PENDING
            ).count()
            
            completed_submissions = Submission.query.filter_by(
                professor_id=user_id,
                status=SubmissionStatus.COMPLETED
            ).count()
            
            failed_submissions = Submission.query.filter_by(
                professor_id=user_id,
                status=SubmissionStatus.FAILED
            ).count()
            
            timeliness_stats = self._get_timeliness_statistics(user_id)
            recent_submissions = self._get_recent_submissions(user_id, limit=5)
            upcoming_deadlines = self._get_upcoming_deadlines(user_id, limit=3)
            
            # Count active deadlines (deadlines that haven't passed yet)
            now = datetime.utcnow()
            active_deadlines_count = Deadline.query.filter(
                Deadline.professor_id == user_id,
                Deadline.deadline_datetime >= now
            ).count()
            
            return {
                'total_submissions': total_submissions,
                'pending_submissions': pending_submissions,
                'completed_submissions': completed_submissions,
                'failed_submissions': failed_submissions,
                'active_deadlines': active_deadlines_count,
                'timeliness_statistics': timeliness_stats,
                'recent_submissions': recent_submissions,
                'upcoming_deadlines': upcoming_deadlines
            }, None
            
        except Exception as e:
            current_app.logger.error(f"Dashboard overview error: {e}")
            return None, str(e)
    
    def _get_timeliness_statistics(self, user_id):
        """Get timeliness classification statistics"""
        try:
            results = db.session.query(
                AnalysisResult.timeliness_classification,
                db.func.count(AnalysisResult.id)
            ).join(Submission).filter(
                Submission.professor_id == user_id,
                AnalysisResult.timeliness_classification.isnot(None)
            ).group_by(AnalysisResult.timeliness_classification).all()
            
            stats = {
                'on_time': 0,
                'late': 0,
                'last_minute': 0,
                'no_deadline': 0
            }
            
            for classification, count in results:
                if classification == TimelinessClassification.ON_TIME:
                    stats['on_time'] = count
                elif classification == TimelinessClassification.LATE:
                    stats['late'] = count
                elif classification == TimelinessClassification.LAST_MINUTE_RUSH:
                    stats['last_minute'] = count
                elif classification == TimelinessClassification.NO_DEADLINE:
                    stats['no_deadline'] = count
            
            return stats
            
        except Exception as e:
            current_app.logger.error(f"Timeliness stats error: {e}")
            return {'on_time': 0, 'late': 0, 'last_minute': 0, 'no_deadline': 0}
    
    def _get_recent_submissions(self, user_id, limit=5):
        """Get recent submissions"""
        try:
            submissions = Submission.query.filter_by(
                professor_id=user_id
            ).order_by(desc(Submission.created_at)).limit(limit).all()

            student_rows = Student.query.filter_by(professor_id=user_id).all()

            def _norm_student_id(value):
                return ''.join(ch for ch in str(value or '') if ch.isalnum()).lower()

            students_by_sid = {
                _norm_student_id(st.student_id): st
                for st in student_rows
                if st.student_id
            }
            
            recent = []
            for s in submissions:
                student_row = students_by_sid.get(_norm_student_id(s.student_id))
                created_at_iso = s.created_at.isoformat() if s.created_at else None
                if created_at_iso and not created_at_iso.endswith('Z') and '+' not in created_at_iso:
                    created_at_iso += 'Z'
                deadline_at_iso = None
                if hasattr(s, 'deadline') and s.deadline and s.deadline.deadline_datetime:
                    deadline_at_iso = s.deadline.deadline_datetime.isoformat()
                recent.append({
                    'id': s.id,
                    'job_id': s.job_id,
                    'deliverable': s.deadline.title if hasattr(s, 'deadline') and s.deadline and s.deadline.title else 'Untitled Deliverable',
                    'file_name': s.original_filename,
                    'student_name': s.student_name,
                    'student_id': s.student_id,
                    'team_code': student_row.team_code if student_row and student_row.team_code else None,
                    'status': s.status.value,
                    'created_at': created_at_iso,
                    'deadline_datetime': deadline_at_iso
                })

            return recent
            
        except Exception as e:
            current_app.logger.error(f"Recent submissions error: {e}")
            return []
    
    def _get_upcoming_deadlines(self, user_id, limit=3):
        """Get upcoming deadlines"""
        try:
            now = datetime.utcnow()
            deadlines = Deadline.query.filter(
                Deadline.professor_id == user_id,
                Deadline.deadline_datetime >= now
            ).order_by(Deadline.deadline_datetime).limit(limit).all()
            
            return [{
                'id': d.id,
                'title': d.title,
                'deadline_datetime': d.deadline_datetime.isoformat(),
                'course_code': d.course_code,
                'submission_count': len(d.submissions) if d.submissions else 0
            } for d in deadlines]
            
        except Exception as e:
            current_app.logger.error(f"Upcoming deadlines error: {e}")
            return []
    
    def get_submissions_list(self, user_id, filters=None, page=1, per_page=20):
        """Get paginated list of submissions with filters"""
        try:
            query = Submission.query.filter_by(professor_id=user_id)
            
            if filters:
                if filters.get('status'):
                    query = query.filter_by(status=SubmissionStatus[filters['status'].upper()])
                
                if filters.get('deadline_id'):
                    query = query.filter_by(deadline_id=filters['deadline_id'])
                
                if filters.get('search'):
                    search_term = f"%{filters['search']}%"
                    matching_team_students = Student.query.filter_by(professor_id=user_id)\
                        .filter(Student.team_code.ilike(search_term)).all()

                    matching_team_student_ids = set()
                    for st in matching_team_students:
                        raw_sid = str(st.student_id or '').strip()
                        if not raw_sid:
                            continue

                        matching_team_student_ids.add(raw_sid)

                        digits = ''.join(ch for ch in raw_sid if ch.isdigit())
                        if digits:
                            matching_team_student_ids.add(digits)
                            if len(digits) >= 9:
                                matching_team_student_ids.add(
                                    f"{digits[:2]}-{digits[2:6]}-{digits[6:9]}"
                                )

                    search_conditions = [
                        Submission.original_filename.ilike(search_term),
                        Submission.student_name.ilike(search_term),
                        Submission.student_id.ilike(search_term)
                    ]

                    if matching_team_student_ids:
                        search_conditions.append(Submission.student_id.in_(list(matching_team_student_ids)))

                    query = query.filter(
                        db.or_(*search_conditions)
                    )
            
            student_rows = Student.query.filter_by(professor_id=user_id).all()
            deadline_rows = Deadline.query.filter_by(professor_id=user_id).all()

            query = query.order_by(desc(Submission.created_at))

            def _norm_student_id(value):
                return ''.join(ch for ch in str(value or '') if ch.isalnum()).lower()

            def _norm_deadline_id(value):
                return str(value) if value is not None else None

            students_by_sid = {
                _norm_student_id(st.student_id): st
                for st in student_rows
                if st.student_id
            }

            deadlines_by_id = {
                _norm_deadline_id(dl.id): dl
                for dl in deadline_rows
            }

            from app.schemas.dto.submission_dto import SubmissionListDTO

            def _enrich_submission_items(items):
                serialized_items = [SubmissionListDTO.serialize(s) for s in items]

                for item in serialized_items:
                    student = students_by_sid.get(_norm_student_id(item.get('student_id')))
                    item['course_year'] = student.course_year if student and student.course_year else None
                    item['team_code'] = student.team_code if student and student.team_code else None
                    if (not item.get('student_name')) and student:
                        item['student_name'] = f"{student.first_name} {student.last_name}".strip()

                    deadline = deadlines_by_id.get(_norm_deadline_id(item.get('deadline_id')))
                    item['deadline_title'] = deadline.title if deadline and deadline.title else None

                return serialized_items

            if filters and filters.get('team_code'):
                serialized_submissions = _enrich_submission_items(query.all())
                target_team_code = str(filters['team_code']).strip()
                filtered_submissions = [
                    item for item in serialized_submissions
                    if str(item.get('team_code') or '').strip() == target_team_code
                ]

                total = len(filtered_submissions)
                start = max((page - 1) * per_page, 0)
                end = start + per_page
                pages = (total + per_page - 1) // per_page if per_page else 1

                return {
                    'submissions': filtered_submissions[start:end],
                    'total': total,
                    'page': page,
                    'per_page': per_page,
                    'pages': pages
                }, None

            pagination = query.paginate(page=page, per_page=per_page, error_out=False)
            serialized_submissions = _enrich_submission_items(pagination.items)

            return {
                'submissions': serialized_submissions,
                'total': pagination.total,
                'page': page,
                'per_page': per_page,
                'pages': pagination.pages
            }, None
            
        except Exception as e:
            current_app.logger.error(f"Submissions list error: {e}")
            return None, str(e)
    
    def get_submission_detail(self, submission_id, user_id):
        """Get detailed submission information"""
        try:
            submission = Submission.query.filter_by(
                id=submission_id,
                professor_id=user_id
            ).first()
            
            if not submission:
                return None, "Submission not found"
            
            return submission, None
            
        except Exception as e:
            current_app.logger.error(f"Submission detail error: {e}")
            return None, str(e)
    
    def delete_submission(self, submission_id, user_id):
        """Delete a submission and its related data"""
        try:
            submission = Submission.query.filter_by(
                id=submission_id,
                professor_id=user_id
            ).first()
            
            if not submission:
                return False, "Submission not found"
            
            # Delete related analysis results first (foreign key constraint)
            if hasattr(submission, 'analysis_result') and submission.analysis_result:
                db.session.delete(submission.analysis_result)
            
            # Delete the physical file
            import os
            if submission.file_path and os.path.exists(submission.file_path):
                try:
                    os.remove(submission.file_path)
                except Exception as file_err:
                    current_app.logger.warning(f"Could not delete file: {file_err}")
            
            # Delete the submission record
            db.session.delete(submission)
            db.session.commit()
            
            return True, None
            
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Submission deletion error: {e}")
            return False, str(e)
    
    def create_deadline(self, user_id, deadline_data):
        """Create a new deadline"""
        try:
            deadline = Deadline(
                professor_id=user_id,
                title=deadline_data['title'],
                description=deadline_data.get('description'),
                deadline_datetime=datetime.fromisoformat(deadline_data['deadline_datetime']),
                timezone=deadline_data.get('timezone', 'UTC'),
                course_code=deadline_data.get('course_code'),
                assignment_type=deadline_data.get('assignment_type'),
                rubric_id=deadline_data.get('rubric_id')
            )
            
            db.session.add(deadline)
            db.session.commit()
            
            return deadline, None
            
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Deadline creation error: {e}")
            return None, str(e)
    
    def update_deadline(self, deadline_id, user_id, deadline_data):
        """Update an existing deadline"""
        try:
            deadline = Deadline.query.filter_by(
                id=deadline_id,
                professor_id=user_id
            ).first()
            
            if not deadline:
                return None, "Deadline not found"
            
            if 'title' in deadline_data:
                deadline.title = deadline_data['title']
            if 'description' in deadline_data:
                deadline.description = deadline_data['description']

            new_deadline_datetime = None
            if 'deadline_datetime' in deadline_data:
                new_deadline_datetime = datetime.fromisoformat(deadline_data['deadline_datetime'])
                deadline.deadline_datetime = new_deadline_datetime
            if 'timezone' in deadline_data:
                deadline.timezone = deadline_data['timezone']
            if 'course_code' in deadline_data:
                deadline.course_code = deadline_data['course_code']
            if 'assignment_type' in deadline_data:
                deadline.assignment_type = deadline_data['assignment_type']
            if 'rubric_id' in deadline_data:
                deadline.rubric_id = deadline_data['rubric_id']

            # Keep generated link expiry aligned with the edited deliverable deadline.
            if new_deadline_datetime is not None:
                SubmissionToken.query.filter(
                    SubmissionToken.professor_id == user_id,
                    SubmissionToken.deadline_id == deadline.id,
                    SubmissionToken.is_active == True
                ).update({'expires_at': new_deadline_datetime}, synchronize_session=False)
            
            db.session.commit()
            
            return deadline, None
            
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Deadline update error: {e}")
            return None, str(e)
    
    def delete_deadline(self, deadline_id, user_id):
        """Delete a deadline and all its submissions"""
        try:
            deadline = Deadline.query.filter_by(
                id=deadline_id,
                professor_id=user_id
            ).first()
            
            if not deadline:
                return False, "Deadline not found"
            
            # Get all submissions for this deadline
            submissions = Submission.query.filter_by(deadline_id=deadline_id).all()
            
            # Delete associated submission tokens
            try:
                SubmissionToken.query.filter_by(deadline_id=deadline_id).delete()
            except Exception as token_err:
                current_app.logger.warning(f"Could not delete associated tokens: {token_err}")
            
            # Delete each submission and its related data
            import os
            for submission in submissions:
                # Delete related analysis results
                if hasattr(submission, 'analysis_result') and submission.analysis_result:
                    db.session.delete(submission.analysis_result)
                
                # Delete the physical file
                if submission.file_path and os.path.exists(submission.file_path):
                    try:
                        os.remove(submission.file_path)
                    except Exception as file_err:
                        current_app.logger.warning(f"Could not delete file: {file_err}")
                
                # Delete the submission record
                db.session.delete(submission)
            
            # Delete the deadline
            db.session.delete(deadline)
            db.session.commit()
            
            return True, None
            
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Deadline deletion error: {e}")
            return False, str(e)
    
    def get_deadlines_list(self, user_id):
        """Get all deadlines for a professor"""
        try:
            deadlines = Deadline.query.filter_by(
                professor_id=user_id
            ).order_by(Deadline.deadline_datetime).all()
            
            return deadlines, None
            
        except Exception as e:
            current_app.logger.error(f"Deadlines list error: {e}")
            return None, str(e)

    def get_students(self, user_id, archived=None):
        """Get students for the professor. Optionally filter by archive state."""
        try:
            query = Student.query.filter_by(professor_id=user_id)
            if archived is not None:
                query = query.filter_by(is_archived=archived)

            students = query.order_by(Student.created_at.asc()).all()
            return [s.to_dict() for s in students], None
            
        except Exception as e:
            current_app.logger.error(f"Get students error: {e}")
            return None, str(e)

    def import_students(self, user_id, students_data):
        """
        Import a list of students for a professor
        students_data: list of dicts with {student_id, last_name, first_name, email, course_year, team_code}
        """
        try:
            imported_count = 0
            updated_count = 0
            seen_ids = set()
            seen_emails = set()
            seen_names = set()
            
            for data in students_data:
                student_id = self._normalize_text(data.get('student_id'))
                if not student_id:
                    continue

                first_name = self._normalize_text(data.get('first_name'))
                last_name = self._normalize_text(data.get('last_name'))
                email = self._normalize_lower(data.get('email'))
                full_name = self._normalize_full_name(first_name, last_name)

                if student_id in seen_ids:
                    return None, f"Duplicate STUDENT NO. in CSV: {student_id}"
                seen_ids.add(student_id)

                if email:
                    if email in seen_emails:
                        return None, f"Duplicate GMAIL in CSV: {email}"
                    seen_emails.add(email)

                if full_name:
                    if full_name in seen_names:
                        return None, f"Duplicate NAME OF STUDENT in CSV: {first_name} {last_name}"
                    seen_names.add(full_name)
                
                existing = Student.query.filter_by(
                    student_id=student_id,
                    professor_id=user_id
                ).first()

                uniqueness_error = self._validate_student_uniqueness(
                    user_id=user_id,
                    student_id=student_id,
                    first_name=first_name,
                    last_name=last_name,
                    email=email,
                    exclude_id=existing.id if existing else None
                )
                if uniqueness_error:
                    return None, uniqueness_error
                
                if existing:
                    # Update info
                    existing.last_name = last_name or existing.last_name
                    existing.first_name = first_name or existing.first_name
                    existing.course_year = data.get('course_year', existing.course_year)
                    existing.team_code = data.get('team_code', existing.team_code)
                    if 'subject_no' in data:
                        existing.subject_no = data.get('subject_no')
                    
                    # Update email if provided, otherwise check format
                    if email:
                        if email.endswith('@gmail.com'):
                            existing.email = email
                        
                    updated_count += 1
                else:
                    # Create new
                    new_student = Student(
                        student_id=student_id,
                        last_name=last_name,
                        first_name=first_name,
                        course_year=data.get('course_year'),
                        team_code=data.get('team_code'),
                        subject_no=data.get('subject_no'),
                        professor_id=user_id,
                        is_registered=False
                    )
                    
                    # Handle email for new student
                    if email:
                        if email.endswith('@gmail.com'):
                            new_student.email = email
                        
                    db.session.add(new_student)
                    imported_count += 1
            
            db.session.commit()
            
            if imported_count == 0 and updated_count == 0:
                return None, "No valid records found in CSV."

            response_data = {
                'imported': imported_count,
                'updated': updated_count,
                'total': Student.query.filter_by(professor_id=user_id).count()
            }
            
            return response_data, None
            
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Import students error: {e}")
            return None, str(e)
    def delete_student(self, student_id, user_id):
        """Delete a student record"""
        try:
            # Find the specific student using database primary key
            student = Student.query.filter_by(id=student_id, professor_id=user_id).first()
            if not student:
                return False, "Student record not found"
            
            db.session.delete(student)
            db.session.commit()
            
            return True, None
            
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Delete student error: {e}")
            return False, str(e)
    def add_student(self, user_id, student_data):
        """
        Manually add a single student to the system
        """
        try:
            student_id = self._normalize_text(student_data.get('student_id'))
            first_name = self._normalize_text(student_data.get('first_name'))
            last_name = self._normalize_text(student_data.get('last_name'))
            course_year = self._normalize_text(student_data.get('course_year'))
            subject_no = self._normalize_text(student_data.get('subject_no'))
            team_code = self._normalize_text(student_data.get('team_code'))
            email = self._normalize_lower(student_data.get('email'))

            required_values = {
                'Student ID Number': student_id,
                'First Name': first_name,
                'Last Name': last_name,
                'Course & Year': course_year,
                'Subject No.': subject_no,
                'Team Code': team_code,
                'Email Address': email
            }
            missing_fields = [label for label, value in required_values.items() if not value]
            if missing_fields:
                return None, "Please fill in all the fields before adding student."

            if self._is_professor_email(email):
                return None, "This Gmail is already used by a professor account. Please use a different student Gmail."

            uniqueness_error = self._validate_student_uniqueness(
                user_id=user_id,
                student_id=student_id,
                first_name=first_name,
                last_name=last_name,
                email=email
            )
            if uniqueness_error:
                return None, uniqueness_error
            
            new_student = Student(
                student_id=student_id,
                last_name=last_name,
                first_name=first_name,
                email=email,
                course_year=course_year,
                team_code=team_code,
                subject_no=subject_no,
                professor_id=user_id,
                is_registered=False
            )
            
            db.session.add(new_student)
            db.session.commit()
            
            return new_student.to_dict(), None
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Add student error: {e}")
            return None, str(e)

    def update_student(self, student_id, user_id, student_data):
        """
        Update an existing student record (using database task id)
        """
        try:
            # student_id here is the primary key (UUID)
            student = Student.query.filter_by(id=student_id, professor_id=user_id).first()
            if not student:
                return None, "Student record not found"

            new_sid = self._normalize_text(student_data.get('student_id', student.student_id))
            new_first = self._normalize_text(student_data.get('first_name', student.first_name))
            new_last = self._normalize_text(student_data.get('last_name', student.last_name))
            new_email = self._normalize_lower(student_data.get('email', student.email))

            if self._is_professor_email(new_email):
                return None, "This Gmail is already used by a professor account. Please use a different student Gmail."

            uniqueness_error = self._validate_student_uniqueness(
                user_id=user_id,
                student_id=new_sid,
                first_name=new_first,
                last_name=new_last,
                email=new_email,
                exclude_id=student.id
            )
            if uniqueness_error:
                return None, uniqueness_error

            student.student_id = new_sid
                
            if 'last_name' in student_data:
                student.last_name = new_last
            if 'first_name' in student_data:
                student.first_name = new_first
            if 'email' in student_data:
                student.email = new_email
            if 'course_year' in student_data:
                student.course_year = student_data['course_year']
            if 'team_code' in student_data:
                student.team_code = student_data['team_code']
            if 'subject_no' in student_data:
                student.subject_no = student_data['subject_no']
            
            db.session.commit()
            return student.to_dict(), None
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Update student error: {e}")
            return None, str(e)

    def archive_students(self, user_id, student_ids):
        """Archive selected students for the professor."""
        try:
            if not student_ids:
                return None, "No students selected for archive."

            students = Student.query.filter(
                Student.professor_id == user_id,
                Student.id.in_(student_ids)
            ).all()

            if not students:
                return None, "No matching students found."

            now = datetime.utcnow()
            archived_count = 0
            for student in students:
                if not student.is_archived:
                    student.is_archived = True
                    student.archived_at = now
                    archived_count += 1

            db.session.commit()
            return {
                'archived': archived_count,
                'total_selected': len(student_ids)
            }, None
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Archive students error: {e}")
            return None, str(e)

    def unarchive_students(self, user_id, student_ids):
        """Restore archived students for the professor."""
        try:
            if not student_ids:
                return None, "No students selected for restore."

            students = Student.query.filter(
                Student.professor_id == user_id,
                Student.id.in_(student_ids)
            ).all()

            if not students:
                return None, "No matching students found."

            restored_count = 0
            for student in students:
                if student.is_archived:
                    student.is_archived = False
                    student.archived_at = None
                    restored_count += 1

            db.session.commit()
            return {
                'restored': restored_count,
                'total_selected': len(student_ids)
            }, None
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Unarchive students error: {e}")
            return None, str(e)

    def evaluate_submission(self, submission_id, user_id, rubric_data):
        """Perform AI evaluation of a submission using a provided rubric"""
        try:
            submission = Submission.query.filter_by(
                id=submission_id,
                professor_id=user_id
            ).first()
            
            if not submission:
                return None, "Submission not found"
            
            if not submission.analysis_result or not submission.analysis_result.document_text:
                return None, "Document content not available for analysis. Please refresh the submission first."
            
            from app.services.nlp_service import NLPService
            nlp_service = NLPService()
            
            context = {
                'assignment_type': submission.deadline.assignment_type if submission.deadline else 'Project',
                'title': submission.deadline.title if submission.deadline else 'Untitled Submission',
                'course_code': submission.deadline.course_code if submission.deadline else 'N/A',
                'description': submission.deadline.description if submission.deadline else 'No specific description provided.'
            }
            
            # Add contributor metadata and identify submitter for collaborative analysis
            if submission.analysis_result.document_metadata:
                contributors = submission.analysis_result.document_metadata.get('contributors', [])
                
                # Identify the submitter in the contributors list for AI scoring
                submitter_email = None
                from app.models.student import Student
                student = Student.query.filter_by(student_id=submission.student_id, professor_id=user_id).first()
                if student and student.email:
                    submitter_email = student.email.lower()
                
                for c in contributors:
                    c_email = str(c.get('email', '')).lower()
                    if submitter_email and c_email == submitter_email:
                        c['is_submitter'] = True
                
                context['contributors'] = contributors
                context['submitter_email'] = submitter_email
                context['image_density_warning'] = submission.analysis_result.document_metadata.get('image_density_warning', False)
                context['image_count'] = submission.analysis_result.document_metadata.get('image_count', 0)
            
            evaluation, model_used, error = nlp_service.evaluate_with_rubric(
                submission.analysis_result.document_text,
                rubric_data,
                submission_context=context
            )
            
            if error:
                return None, error
                
            # Recalculate total weighted score based on rubric weights with fuzzy matching
            try:
                criteria_list = rubric_data.get('criteria', [])
                total_weighted_score = 0
                total_found_weight = 0
                
                eval_items = evaluation.get('rubric_evaluation', [])
                
                for criterion in criteria_list:
                    name = criterion.get('name')
                    weight = float(criterion.get('weight', 0))
                    
                    # Try to find matching evaluation item (exact or fuzzy)
                    found_item = next((item for item in eval_items if item.get('criterion_name') == name), None)
                    if not found_item:
                        # Fuzzy match check
                        found_item = next((item for item in eval_items if name.lower() in item.get('criterion_name', '').lower()), None)
                    
                    if found_item:
                        score = float(found_item.get('score', 0))
                        total_weighted_score += (score * (weight / 100.0))
                        total_found_weight += weight
                
                # Update the score in the evaluation dictionary
                if total_found_weight > 0:
                    evaluation['score'] = round(total_weighted_score, 2)
            except Exception as math_err:
                current_app.logger.warning(f"Score recalculation failed: {math_err}")
                
            # Update the analysis result with AI evaluation
            analysis = submission.analysis_result
            analysis.ai_summary = evaluation.get('ai_summary')
            
            # MERGE into nlp_results instead of overwriting to prevent data loss 
            # if local NLP analysis runs later.
            if analysis.nlp_results and isinstance(analysis.nlp_results, dict):
                merged_nlp = {**analysis.nlp_results, **evaluation}
                analysis.nlp_results = merged_nlp
            else:
                analysis.nlp_results = evaluation
            
            # Also store in ai_insights as the primary store for the DTO
            analysis.ai_insights = evaluation
            
            # Populate validation_warnings for the UI
            warnings = []
            if evaluation.get('integrity_warning'):
                warnings.append(evaluation['integrity_warning'])
            if evaluation.get('image_density_warning'):
                warnings.append(f"High Image Density: This document contains {evaluation.get('image_count', 0)} images relative to text. Possible screenshots detected.")
            
            # Preserve existing warnings if any
            existing_warnings = analysis.validation_warnings or []
            # Merge and avoid duplicates
            analysis.validation_warnings = list(set(existing_warnings + warnings))
            
            db.session.commit()
            return evaluation, None
            
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"AI Evaluation error: {e}")
            return None, str(e)
