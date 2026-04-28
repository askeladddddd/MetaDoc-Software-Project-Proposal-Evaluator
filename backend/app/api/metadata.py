"""
Module 2: Metadata Extraction & Content Analysis

Implements SRS requirements:
- M2.UC01: Perform Metadata Extraction & Validation
- M2.UC02: Store Analysis Snapshot & Generate Report

Handles:
1. Extracting essential metadata fields from Google Docs and DOCX files
2. Parsing and processing full document text
3. Computing content statistics (word count, sentences, pages)
4. Validating document completeness
5. Generating analysis snapshots for version comparison
6. Preparing structured output for downstream modules
"""

import os
import json
import time
from datetime import datetime
from flask import Blueprint, request, jsonify, current_app
from docx import Document
from docx.opc.exceptions import PackageNotFoundError
import zipfile
import xml.etree.ElementTree as ET
from collections import Counter
import re

from app.core.extensions import db
from app.models import Submission, AnalysisResult, DocumentSnapshot, SubmissionStatus, Student
from app.services.audit_service import AuditService
from app.services import MetadataService
from app.api.auth import get_auth_service
from app.schemas.dto import SubmissionDTO, AnalysisResultDTO

metadata_bp = Blueprint('metadata', __name__)

# Initialize service
metadata_service = MetadataService()

@metadata_bp.route('/analyze/<submission_id>', methods=['POST'])
def analyze_submission(submission_id):
    """
    Perform complete metadata extraction and content analysis
    
    SRS Reference: M2.UC01 - Perform Metadata Extraction & Validation
    """
    start_time = time.time()
    
    try:
        # Get submission
        submission = Submission.query.filter_by(id=submission_id).first()
        
        if not submission:
            return jsonify({'error': 'Submission not found'}), 404
        
        if submission.status != SubmissionStatus.PENDING:
            return jsonify({'error': 'Submission already processed or processing'}), 400
        
        # Update status to processing
        submission.status = SubmissionStatus.PROCESSING
        submission.processing_started_at = datetime.utcnow()
        db.session.commit()
        
        # Log processing start
        AuditService.log_submission_event('processing_started', submission)
        
        # Extract metadata
        metadata, metadata_error = metadata_service.extract_docx_metadata(submission.file_path)

        # Ensure last editor reflects the submitting Gmail from class record when available
        submitter_email = None
        if submission.student_id and submission.professor_id:
            student_row = Student.query.filter_by(
                professor_id=submission.professor_id,
                student_id=submission.student_id
            ).first()
            if student_row and student_row.email:
                submitter_email = student_row.email.strip().lower()

        if metadata_error:
            submission.status = SubmissionStatus.FAILED
            submission.error_message = metadata_error
            db.session.commit()
            return jsonify({'error': metadata_error}), 500
        
        # Extract text content
        text, text_error = metadata_service.extract_document_text(submission.file_path)
        
        if text_error:
            submission.status = SubmissionStatus.FAILED
            submission.error_message = text_error
            db.session.commit()
            return jsonify({'error': text_error}), 500
        
        # Compute content statistics
        content_stats = metadata_service.compute_content_statistics(text)
        
        # Validate document completeness
        is_complete, warnings = metadata_service.validate_document_completeness(content_stats, text)
        
        # Create analysis snapshot
        snapshot, snapshot_error = metadata_service.create_analysis_snapshot(
            submission, metadata, content_stats, text
        )
        
        if snapshot_error:
            current_app.logger.warning(f"Snapshot creation failed: {snapshot_error}")
        
        # Generate preliminary report
        preliminary_report = metadata_service.generate_preliminary_report(
            submission, metadata, content_stats, text, is_complete, warnings
        )
        
        # Calculate processing duration
        processing_duration = time.time() - start_time
        
        # Create or update analysis result
        analysis_result = AnalysisResult.query.filter_by(submission_id=submission.id).first()
        if not analysis_result:
            analysis_result = AnalysisResult(submission_id=submission.id)
        
        # Store results
        analysis_result.document_metadata = metadata
        analysis_result.content_statistics = content_stats
        analysis_result.document_text = text
        analysis_result.is_complete_document = is_complete
        analysis_result.validation_warnings = warnings
        analysis_result.processing_duration_seconds = round(processing_duration, 2)
        
        # Save to database
        db.session.add(analysis_result)
        
        # Update submission status
        submission.status = SubmissionStatus.WARNING if warnings else SubmissionStatus.COMPLETED
        submission.processing_completed_at = datetime.utcnow()
        
        db.session.commit()
        
        # Log completion
        AuditService.log_submission_event(
            'metadata_analysis_completed',
            submission,
            additional_metadata={
                'word_count': content_stats['word_count'],
                'is_complete': is_complete,
                'warning_count': len(warnings),
                'processing_duration': processing_duration
            }
        )

        # ---------------------------------------------------------
        # [Auto-Trigger] Perform NLP & AI Analysis Immediately
        # ---------------------------------------------------------
        try:
            from app.services import NLPService
            nlp_service = NLPService()
            
            # Local NLP
            local_results = nlp_service.perform_local_nlp_analysis(text)
            
            # AI Analysis (Enabled by default)
            context = {
                'assignment_type': getattr(submission.deadline, 'assignment_type', None) if submission.deadline else None,
                'course_code': getattr(submission.deadline, 'course_code', None) if submission.deadline else None
            }
            
            ai_summary, model_used, ai_error = nlp_service.generate_ai_summary(text, context)
            
            # Consolidate
            consolidated_results, _ = nlp_service.consolidate_nlp_results(local_results, ai_summary)
            
            # Update Analysis Result
            analysis_result.nlp_results = consolidated_results
            
            # Update Specific Fields
            if 'readability' in local_results and local_results['readability'] and 'scores' in local_results['readability']:
                analysis_result.flesch_kincaid_score = local_results['readability']['scores'].get('flesch_kincaid_grade')
                analysis_result.readability_grade = local_results['readability'].get('reading_level')
            
            if 'named_entities' in local_results:
                analysis_result.named_entities = local_results['named_entities']
            
            if 'token_analysis' in local_results and local_results['token_analysis'] and 'top_terms' in local_results['token_analysis']:
                analysis_result.top_terms = local_results['token_analysis']['top_terms']
            
            if ai_summary:
                analysis_result.ai_summary = ai_summary.get('summary')
                analysis_result.ai_insights = ai_summary
            
            db.session.commit()
            AuditService.log_submission_event('nlp_analysis_completed', submission)
            current_app.logger.info("Auto-triggered NLP/AI analysis completed.")
            
        except Exception as nlp_e:
            current_app.logger.error(f"Auto-triggered NLP failed: {nlp_e}")
            # Do not fail the whole request, as metadata is successful
        # ---------------------------------------------------------
        
        return jsonify({
            'message': 'Metadata analysis completed successfully',
            'job_id': submission.job_id,
            'status': submission.status.value,
            'analysis_id': analysis_result.id,
            'preliminary_report': preliminary_report,
            'processing_info': {
                'duration_seconds': processing_duration,
                'started_at': submission.processing_started_at.isoformat(),
                'completed_at': submission.processing_completed_at.isoformat()
            }
        }), 200
        
    except Exception as e:
        # Update submission status on error
        if 'submission' in locals():
            submission.status = SubmissionStatus.FAILED
            submission.error_message = f"Processing error: {str(e)}"
            db.session.commit()
        
        current_app.logger.error(f"Metadata analysis error: {e}")
        return jsonify({'error': 'Internal processing error'}), 500

@metadata_bp.route('/result/<submission_id>', methods=['GET'])
def get_analysis_result(submission_id):
    """
    Get analysis results for a submission
    
    SRS Reference: M2.UC02 - Store Analysis Snapshot & Generate Report
    """
    try:
        submission = Submission.query.filter_by(id=submission_id).first()
        
        if not submission:
            return jsonify({'error': 'Submission not found'}), 404
        
        analysis_result = AnalysisResult.query.filter_by(submission_id=submission.id).first()
        
        if not analysis_result:
            return jsonify({
                'message': 'Analysis not yet completed',
                'status': submission.status.value,
                'job_id': submission.job_id
            }), 202
        
        # Get document snapshots for version comparison
        snapshots = DocumentSnapshot.query.filter_by(
            submission_id=submission.id
        ).order_by(DocumentSnapshot.created_at.desc()).all()
        
        response_data = {
            'submission': SubmissionDTO.serialize(submission),
            'analysis_result': AnalysisResultDTO.serialize(analysis_result),
            'snapshots': [
                {
                    'id': s.id,
                    'word_count': s.word_count,
                    'timestamp': s.snapshot_timestamp.isoformat(),
                    'major_changes': s.major_changes,
                    'change_percentage': s.change_percentage
                } for s in snapshots
            ]
        }
        
        # Log data access
        AuditService.log_data_access('view', submission.id, None)
        
        return jsonify(response_data)
        
    except Exception as e:
        current_app.logger.error(f"Result retrieval error: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@metadata_bp.route('/reprocess/<submission_id>', methods=['POST'])
def reprocess_submission(submission_id):
    """Reprocess a submission's metadata analysis"""
    try:
        submission = Submission.query.filter_by(id=submission_id).first()
        
        if not submission:
            return jsonify({'error': 'Submission not found'}), 404
        
        # Reset status and clear previous results
        submission.status = SubmissionStatus.PENDING
        submission.processing_started_at = None
        submission.processing_completed_at = None
        submission.error_message = None
        
        # Remove existing analysis result
        existing_result = AnalysisResult.query.filter_by(submission_id=submission.id).first()
        if existing_result:
            db.session.delete(existing_result)
        
        db.session.commit()
        
        # Log reprocessing request
        AuditService.log_submission_event('reprocessing_requested', submission)
        
        # Trigger analysis
        return analyze_submission(submission_id)
        
    except Exception as e:
        current_app.logger.error(f"Reprocess error: {e}")
        return jsonify({'error': 'Internal server error'}), 500

