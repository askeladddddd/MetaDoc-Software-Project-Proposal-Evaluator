"""
Module 4: NLP-Based Readability, Content Trends, and AI-Assisted Insights

Implements SRS requirements:
- M4.UC01: Local NLP Analysis (spaCy/NLTK/textstat)
- M4.UC02: External AI Summary (Google Gemini)
- M4.UC03: Consolidate NLP & AI Outputs

Handles:
1. Local NLP analysis using spaCy, NLTK, and textstat
2. Tokenization, stopword removal, and frequency analysis
3. Readability scoring (Flesch-Kincaid)
4. Named Entity Recognition (NER) for people, dates, organizations
5. Optional Gemini-generated summaries for qualitative insights
6. Consolidation of all NLP results into a unified report
"""

import os
import re
import json
from datetime import datetime
from collections import Counter
from flask import Blueprint, request, jsonify, current_app

# NLP Libraries and AI handled in service layer

from app.core.extensions import db
from app.models import Submission, AnalysisResult
from app.services.audit_service import AuditService
from app.services import NLPService

nlp_bp = Blueprint('nlp', __name__)

# Initialize service
# Initialize service
nlp_service = None

def get_nlp_service():
    global nlp_service
    if nlp_service is None:
        nlp_service = NLPService()
    return nlp_service

@nlp_bp.route('/analyze/<submission_id>', methods=['POST'])
def analyze_nlp(submission_id):
    """
    Perform comprehensive NLP analysis on a submission
    
    Combines M4.UC01, M4.UC02, and M4.UC03
    """
    try:
        # Get submission and analysis result
        submission = Submission.query.filter_by(id=submission_id).first()
        
        if not submission:
            return jsonify({'error': 'Submission not found'}), 404
        
        if not submission.analysis_result or not submission.analysis_result.document_text:
            return jsonify({'error': 'Document text not available. Complete metadata extraction first.'}), 400
        
        text = submission.analysis_result.document_text
        
        # Perform local NLP analysis
        local_results = get_nlp_service().perform_local_nlp_analysis(text)
        
        # Optional AI analysis
        ai_summary = None
        # Default to True to ensure Gemini is used, unless explicitly disabled
        enable_ai = True
        if request.json and 'enable_ai_summary' in request.json:
            enable_ai = request.json.get('enable_ai_summary')
        
        if enable_ai and get_nlp_service().gemini_initialized:
            context = {
                'assignment_type': getattr(submission.deadline, 'assignment_type', None) if submission.deadline else None,
                'course_code': getattr(submission.deadline, 'course_code', None) if submission.deadline else None
            }
            
            ai_summary, model_used, ai_error = get_nlp_service().generate_ai_summary(text, context)
            if ai_error:
                current_app.logger.warning(f"AI summary failed: {ai_error}")
        
        # Consolidate results
        consolidated_results, consolidation_error = get_nlp_service().consolidate_nlp_results(local_results, ai_summary)
        
        if consolidation_error:
            return jsonify({'error': consolidation_error}), 500
        
        # Update analysis result
        analysis_result = submission.analysis_result
        analysis_result.nlp_results = consolidated_results
        
        # Extract key fields for database
        if 'readability' in local_results and local_results['readability']:
            analysis_result.flesch_kincaid_score = local_results['readability'].get('flesch_kincaid_grade')
            analysis_result.readability_grade = local_results['readability'].get('reading_level')
        
        if 'named_entities' in local_results:
            analysis_result.named_entities = local_results['named_entities']
        
        if 'token_analysis' in local_results and 'top_terms' in local_results['token_analysis']:
            analysis_result.top_terms = local_results['token_analysis']['top_terms']
        
        if ai_summary:
            analysis_result.ai_summary = ai_summary.get('summary')
            analysis_result.ai_insights = ai_summary
        
        db.session.commit()
        
        # Log NLP analysis completion
        AuditService.log_submission_event(
            'nlp_analysis_completed',
            submission,
            additional_metadata={
                'flesch_kincaid_grade': analysis_result.flesch_kincaid_score,
                'ai_summary_generated': ai_summary is not None,
                'recommendation_count': len(consolidated_results.get('recommendations', []))
            }
        )
        
        return jsonify({
            'message': 'NLP analysis completed successfully',
            'submission_id': submission_id,
            'analysis_results': consolidated_results,
            'ai_summary_included': ai_summary is not None
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"NLP analysis error: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@nlp_bp.route('/readability/<submission_id>', methods=['GET'])
def get_readability_analysis(submission_id):
    """Get only readability analysis for a submission"""
    try:
        submission = Submission.query.filter_by(id=submission_id).first()
        
        if not submission or not submission.analysis_result:
            return jsonify({'error': 'Submission or analysis not found'}), 404
        
        text = submission.analysis_result.document_text
        if not text:
            return jsonify({'error': 'Document text not available'}), 400
        
        readability_results = get_nlp_service()._analyze_readability(text)
        
        return jsonify({
            'submission_id': submission_id,
            'readability_analysis': readability_results
        })
        
    except Exception as e:
        current_app.logger.error(f"Readability analysis error: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@nlp_bp.route('/generate-prompt', methods=['POST'])
def generate_rubric_prompt():
    """Generate a professional AI system prompt based on rubric data"""
    try:
        rubric_data = request.json
        if not rubric_data:
            return jsonify({'error': 'Rubric data required'}), 400
            
        generated_prompt, error = get_nlp_service().generate_rubric_system_prompt(rubric_data)
        
        if error:
            return jsonify({'error': error}), 500
            
        return jsonify({'prompt': generated_prompt}), 200
    except Exception as e:
        current_app.logger.error(f"Generate prompt error: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@nlp_bp.route('/generate-criteria', methods=['POST'])
def generate_criteria():
    """Generate professional rubric criteria using Gemini AI"""
    try:
        data = request.json
        title = data.get('title', 'General Research')
        description = data.get('description', '')
        
        criteria, error = get_nlp_service().generate_rubric_criteria(title, description)
        
        if error:
            return jsonify({'error': error}), 500
            
        return jsonify({'criteria': criteria}), 200
    except Exception as e:
        current_app.logger.error(f"Generate criteria error: {e}")
        return jsonify({'error': 'Internal server error'}), 500

