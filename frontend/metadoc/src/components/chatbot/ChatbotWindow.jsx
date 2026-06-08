import React, { useState, useRef, useEffect } from 'react';
import { Send, X, MessageSquare, Bot, User, Loader2, Minus } from '../common/Icons';
import { chatbotAPI } from '../../services/api';
import './ChatbotWindow.css';

const ChatbotWindow = ({ submissionId = null, fileName = null }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Initialize chat history when submissionId or fileName changes
  useEffect(() => {
    if (submissionId && fileName) {
      setChatHistory([
        { role: 'bot', content: `Hello! I've analyzed "${fileName}". Ask me anything about its content, technical architecture, or team contributions.` }
      ]);
    } else {
      setChatHistory([
        { role: 'bot', content: "Hello! I am your MetaDoc Assistant. I can help you understand your evaluation results, navigate the dashboard, or explain how to use the platform's features. How can I help you today?" }
      ]);
    }
  }, [submissionId, fileName]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [chatHistory, isOpen]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!message.trim() || isLoading) return;

    const userMsg = message.trim();
    setMessage('');
    setChatHistory(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);

    try {
      let response;
      if (submissionId) {
        response = await chatbotAPI.sendMessage(submissionId, userMsg);
      } else {
        response = await chatbotAPI.sendSystemMessage(userMsg);
      }
      setChatHistory(prev => [...prev, { role: 'bot', content: response.data.reply }]);
    } catch (err) {
      console.error('Chatbot error:', err);
      setChatHistory(prev => [...prev, { role: 'bot', content: 'Sorry, I encountered an error. Please try again later.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`chatbot-container ${isOpen ? 'open' : 'closed'} ${submissionId ? 'in-detail' : 'global'}`}>
      {!isOpen && (
        <button className="chatbot-toggle" onClick={() => setIsOpen(true)}>
          <MessageSquare size={24} />
          <span className="chatbot-toggle-text">Assistant</span>
        </button>
      )}

      {isOpen && (
        <div className="chatbot-window">
          <div className="chatbot-header">
            <div className="chatbot-header-info">
              <Bot size={20} />
              <div>
                <h3>MetaDoc AI Assistant</h3>
                <p>{submissionId ? `Analyzing: ${fileName}` : 'System Guide'}</p>
              </div>
            </div>
            <div className="chatbot-header-actions">
              <button className="chatbot-action-btn" onClick={() => setIsOpen(false)} title="Minimize">
                <Minus size={20} />
              </button>
              <button className="chatbot-action-btn" onClick={() => setIsOpen(false)} title="Close">
                <X size={20} />
              </button>
            </div>
          </div>

          <div className="chatbot-messages">
            {chatHistory.map((msg, index) => (
              <div key={index} className={`message-wrapper ${msg.role}`}>
                <div className="message-icon">
                  {msg.role === 'bot' ? <Bot size={16} /> : <User size={16} />}
                </div>
                <div className="message-bubble">
                  {msg.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="message-wrapper bot">
                <div className="message-icon">
                  <Bot size={16} />
                </div>
                <div className="message-bubble loading">
                  <Loader2 size={16} className="animate-spin" />
                  <span>AI is thinking...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form className="chatbot-input-area" onSubmit={handleSendMessage}>
            <input
              type="text"
              placeholder="Ask a question..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={isLoading}
            />
            <button type="submit" disabled={!message.trim() || isLoading}>
              <Send size={18} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default ChatbotWindow;
