from flask import Blueprint, request, jsonify
from app.services.agent_service import agent_service
from app.utils.decorators import require_authentication

chatbot_bp = Blueprint('chatbot', __name__)

@chatbot_bp.route('/chat/<document_id>', methods=['POST'])
@require_authentication()
def chat(document_id):
    """Chat with a specific document using RAG."""
    data = request.get_json()
    if not data or 'message' not in data:
        return jsonify({'error': 'Message is required'}), 400
        
    user_message = data['message']
    
    try:
        response = agent_service.chat_with_document(document_id, user_message)
        return jsonify({
            'reply': response,
            'status': 'success'
        }), 200
    except Exception as e:
        import traceback
        current_app.logger.error(f"Chatbot Error: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@chatbot_bp.route('/chat', methods=['POST'])
@require_authentication()
def general_chat():
    """General system assistant chat."""
    data = request.get_json()
    if not data or 'message' not in data:
        return jsonify({'error': 'Message is required'}), 400
        
    user_message = data['message']
    
    try:
        response = agent_service.system_chat(user_message, user=request.current_user)
        return jsonify({
            'reply': response,
            'status': 'success'
        }), 200
    except Exception as e:
        import traceback
        current_app.logger.error(f"System Chat Error: {str(e)}")
        current_app.logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500
