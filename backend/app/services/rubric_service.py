"""
Service for managing rubrics
"""

from app.core.extensions import db
from app.models.rubric import Rubric
from flask import current_app

class RubricService:
    """Service to handle rubric CRUD operations"""
    
    def get_user_rubrics(self, user_id):
        """Get all rubrics for a specific user"""
        try:
            rubrics = Rubric.query.filter_by(professor_id=user_id).all()
            return [r.to_dict() for r in rubrics], None
        except Exception as e:
            current_app.logger.error(f"Get rubrics error: {e}")
            return None, str(e)
            
    def create_rubric(self, user_id, rubric_data):
        """Create a new rubric"""
        try:
            rubric = Rubric(
                id=rubric_data.get('id', None), # Maintain ID if provided (for migration)
                name=rubric_data.get('name', 'Untitled Rubric'),
                description=rubric_data.get('description', ''),
                criteria=rubric_data.get('criteria', []),
                system_instructions=rubric_data.get('system_instructions', ''),
                ai_prompt_message=rubric_data.get('ai_prompt_message', ''),
                evaluation_goal=rubric_data.get('evaluation_goal', ''),
                is_active=rubric_data.get('is_active', True),
                professor_id=user_id
            )
            
            # Validate total weight
            criteria = rubric_data.get('criteria', [])
            total_weight = sum(float(c.get('weight', 0)) for c in criteria)
            if total_weight != 100:
                return None, f"Total rubric weight must be exactly 100%. Current total: {total_weight}%"
            
            # If this is set to active, deactivate others
            if rubric.is_active:
                Rubric.query.filter_by(professor_id=user_id).update({'is_active': False})
                
            db.session.add(rubric)
            db.session.commit()
            return rubric.to_dict(), None
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Create rubric error: {e}")
            return None, str(e)
            
    def update_rubric(self, rubric_id, user_id, rubric_data):
        """Update an existing rubric"""
        try:
            rubric = Rubric.query.filter_by(id=rubric_id, professor_id=user_id).first()
            if not rubric:
                return None, "Rubric not found"
                
            rubric.name = rubric_data.get('name', rubric.name)
            rubric.description = rubric_data.get('description', rubric.description)
            rubric.criteria = rubric_data.get('criteria', rubric.criteria)
            rubric.system_instructions = rubric_data.get('system_instructions', rubric.system_instructions)
            rubric.ai_prompt_message = rubric_data.get('ai_prompt_message', rubric.ai_prompt_message)
            rubric.evaluation_goal = rubric_data.get('evaluation_goal', rubric.evaluation_goal)
            rubric.is_active = rubric_data.get('is_active', rubric.is_active)
            
            # Validate total weight
            criteria = rubric_data.get('criteria', rubric.criteria)
            total_weight = sum(float(c.get('weight', 0)) for c in criteria)
            if total_weight != 100:
                return None, f"Total rubric weight must be exactly 100%. Current total: {total_weight}%"
            
            # If this is set to active, deactivate others
            if rubric_data.get('is_active') is True:
                Rubric.query.filter_by(professor_id=user_id).filter(Rubric.id != rubric_id).update({'is_active': False})
            
            db.session.commit()
            return rubric.to_dict(), None
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Update rubric error: {e}")
            return None, str(e)
            
    def delete_rubric(self, rubric_id, user_id):
        """Delete a rubric"""
        try:
            rubric = Rubric.query.filter_by(id=rubric_id, professor_id=user_id).first()
            if not rubric:
                return False, "Rubric not found"
                
            db.session.delete(rubric)
            db.session.commit()
            return True, None
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Delete rubric error: {e}")
            return False, str(e)
