"""
Analysis-related Data Transfer Objects
"""

from typing import Optional, Dict, Any, List
import json


def _ensure_dict(data: Any) -> Dict[str, Any]:
    """Ensure the provided data is a dictionary. Parses JSON strings if necessary."""
    if not data:
        return {}
    if isinstance(data, dict):
        return data
    if isinstance(data, str):
        try:
            return json.loads(data)
        except Exception:
            return {}
    return {}


class MetadataDTO:
    """DTO for document metadata serialization"""
    
    @staticmethod
    def serialize(metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Serialize document metadata"""
        metadata = _ensure_dict(metadata)
        if not metadata:
            return {}
        
        return {
            'author': metadata.get('author'),
            # Map service keys (creation_date) to DTO keys or standard ones
            'created_date': metadata.get('creation_date') or metadata.get('created_date'),
            'modified_date': metadata.get('last_modified_date') or metadata.get('modified_date'),
            'last_editor': metadata.get('last_editor') or metadata.get('last_modified_by'),
            'revision_count': metadata.get('revision_count') or metadata.get('revision'),
            'editing_time_minutes': metadata.get('editing_time_minutes') or metadata.get('total_editing_time'),
            'application': metadata.get('application'),
            'contributors': metadata.get('contributors', []),
            
            # Keep legacy keys for backward compatibility if needed
            'title': metadata.get('title'),
            'subject': metadata.get('subject'),
            'keywords': metadata.get('keywords')
        }


class ContentStatisticsDTO:
    """DTO for content statistics serialization"""
    
    @staticmethod
    def serialize(statistics: Dict[str, Any]) -> Dict[str, Any]:
        """Serialize content statistics"""
        statistics = _ensure_dict(statistics)
        if not statistics:
            return {}
        
        return {
            'word_count': statistics.get('word_count', 0),
            'character_count': statistics.get('character_count', 0),
            'paragraph_count': statistics.get('paragraph_count', 0),
            'sentence_count': statistics.get('sentence_count', 0),
            'page_count': statistics.get('page_count', 0),
            'average_words_per_sentence': statistics.get('average_words_per_sentence', 0),
            'average_sentence_length': statistics.get('average_sentence_length', 0)
        }


class HeuristicInsightsDTO:
    """DTO for heuristic insights serialization"""
    
    @staticmethod
    def serialize(insights: Dict[str, Any]) -> Dict[str, Any]:
        """Serialize heuristic insights"""
        insights = _ensure_dict(insights)
        if not insights:
            return {}
        
        return {
            'timeliness_score': insights.get('timeliness_score'),
            'timeliness_classification': insights.get('timeliness_classification'),
            'submission_pattern': insights.get('submission_pattern'),
            'contribution_growth': insights.get('contribution_growth'),
            'revision_count': insights.get('revision_count'),
            'last_minute_submission': insights.get('last_minute_submission'),
            'early_submission': insights.get('early_submission'),
            'recommendations': insights.get('recommendations', [])
        }


class NLPResultDTO:
    """DTO for NLP analysis results serialization"""
    
    @staticmethod
    def serialize(nlp_results: Dict[str, Any]) -> Dict[str, Any]:
        """Serialize NLP analysis results"""
        nlp_results = _ensure_dict(nlp_results)
        if not nlp_results:
            return {}
        
        return {
            'flesch_reading_ease': nlp_results.get('flesch_reading_ease'),
            'flesch_kincaid_grade': nlp_results.get('flesch_kincaid_grade'),
            'gunning_fog': nlp_results.get('gunning_fog'),
            'smog_index': nlp_results.get('smog_index'),
            'automated_readability_index': nlp_results.get('automated_readability_index'),
            'coleman_liau_index': nlp_results.get('coleman_liau_index'),
            'readability_grade': nlp_results.get('readability_grade'),
            'named_entities': nlp_results.get('named_entities', []),
            'top_terms': nlp_results.get('top_terms', []),
            'sentiment_score': nlp_results.get('sentiment_score'),
            'language': nlp_results.get('language')
        }


class AnalysisResultDTO:
    """DTO for complete analysis result serialization"""
    
    @staticmethod
    def serialize(analysis, include_full_text: bool = False) -> Dict[str, Any]:
        """Serialize AnalysisResult model"""
        if not analysis:
            return None
        
        # Extract rubric evaluation data from nlp_results or ai_insights (backup)
        nlp_raw = _ensure_dict(analysis.nlp_results)
        ai_raw = _ensure_dict(analysis.ai_insights)
        
        # Merge them to find rubric fields, prioritizing whichever has 'rubric_evaluation'
        eval_source = nlp_raw if nlp_raw.get('rubric_evaluation') else ai_raw
        
        data = {
            'id': analysis.id,
            'submission_id': analysis.submission_id,
            'document_metadata': MetadataDTO.serialize(analysis.document_metadata) if analysis.document_metadata else {},
            'content_statistics': ContentStatisticsDTO.serialize(analysis.content_statistics) if analysis.content_statistics else {},
            'heuristic_insights': HeuristicInsightsDTO.serialize(analysis.heuristic_insights) if analysis.heuristic_insights else {},
            'timeliness_classification': analysis.timeliness_classification.value if hasattr(analysis, 'timeliness_classification') and analysis.timeliness_classification else None,
            'contribution_growth_percentage': analysis.contribution_growth_percentage,
            'nlp_results': NLPResultDTO.serialize(analysis.nlp_results) if analysis.nlp_results else {},
            'flesch_kincaid_score': analysis.flesch_kincaid_score,
            'readability_grade': analysis.readability_grade,
            'named_entities': _ensure_dict(analysis.named_entities) if analysis.named_entities else [],
            'top_terms': _ensure_dict(analysis.top_terms) if analysis.top_terms else [],
            
            # AI evaluation fields
            'ai_summary': analysis.ai_summary or eval_source.get('ai_summary'),
            'score': eval_source.get('score'),
            'rubric_evaluation': eval_source.get('rubric_evaluation', []),
            'strengths': eval_source.get('strengths', []),
            'weaknesses': eval_source.get('weaknesses', []),
            'reviewer_persona': eval_source.get('reviewer_persona'),
            'evaluation_goal': eval_source.get('evaluation_goal'),
            
            'ai_insights': analysis.ai_insights,
            'is_complete_document': analysis.is_complete_document,
            'validation_warnings': _ensure_dict(analysis.validation_warnings) if analysis.validation_warnings else [],
            'analysis_version': analysis.analysis_version,
            'processing_duration_seconds': analysis.processing_duration_seconds,
            'created_at': analysis.created_at.isoformat() if hasattr(analysis, 'created_at') and analysis.created_at else None,
            'updated_at': analysis.updated_at.isoformat() if hasattr(analysis, 'updated_at') and analysis.updated_at else None
        }
        
        # fix: some json columns like top_terms/named_entities might actually be arrays, not dicts
        if analysis.named_entities and isinstance(analysis.named_entities, list):
            data['named_entities'] = analysis.named_entities
        elif analysis.named_entities and isinstance(analysis.named_entities, str):
            try:
                parsed = json.loads(analysis.named_entities)
                data['named_entities'] = parsed if isinstance(parsed, list) else []
            except:
                data['named_entities'] = []
                
        if analysis.top_terms and isinstance(analysis.top_terms, list):
            data['top_terms'] = analysis.top_terms
        elif analysis.top_terms and isinstance(analysis.top_terms, str):
            try:
                parsed = json.loads(analysis.top_terms)
                data['top_terms'] = parsed if isinstance(parsed, list) else []
            except:
                data['top_terms'] = []
                
        if analysis.validation_warnings and isinstance(analysis.validation_warnings, list):
            data['validation_warnings'] = analysis.validation_warnings
        elif analysis.validation_warnings and isinstance(analysis.validation_warnings, str):
            try:
                parsed = json.loads(analysis.validation_warnings)
                data['validation_warnings'] = parsed if isinstance(parsed, list) else []
            except:
                data['validation_warnings'] = []
                
        if include_full_text and hasattr(analysis, 'document_text'):
            data['document_text'] = analysis.document_text
        
        return data
    
    @staticmethod
    def serialize_summary(analysis) -> Dict[str, Any]:
        """Serialize analysis result summary (minimal data)"""
        if not analysis:
            return None
        
        content_stats = _ensure_dict(analysis.content_statistics) if analysis.content_statistics else {}
        
        return {
            'id': analysis.id,
            'submission_id': analysis.submission_id,
            'word_count': content_stats.get('word_count'),
            'flesch_kincaid_score': analysis.flesch_kincaid_score,
            'readability_grade': analysis.readability_grade,
            'timeliness_classification': analysis.timeliness_classification.value if hasattr(analysis, 'timeliness_classification') and analysis.timeliness_classification else None,
            'is_complete_document': analysis.is_complete_document,
            'created_at': analysis.created_at.isoformat() if hasattr(analysis, 'created_at') and analysis.created_at else None
        }

