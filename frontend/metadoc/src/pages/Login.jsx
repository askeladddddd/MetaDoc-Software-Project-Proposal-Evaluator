import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FileText, Shield, BarChart3, Mail, Lock, FolderOpen, ArrowRight, Search, X, ChevronLeft, Info } from 'lucide-react';
import Input from '../components/common/Input/Input';
import Button from '../components/common/Button/Button';
import { authAPI } from '../services/api';
import metaDocLogo from '../assets/images/MainLogo.png';
import logo1Img from '../assets/images/Logo1.jpg';
import logo2Img from '../assets/images/Logo2.jpg';
import logo3Img from '../assets/images/Logo3.jpg';
import logo4Img from '../assets/images/Logo4.jpg';
import quindaoProfile from '../assets/images/members/Quindao_Profile.jpg';
import abellanaProfile from '../assets/images/members/Abellana_Profile.jpg';
import velosoProfile from '../assets/images/members/Veloso_Profile.jpg';
import garingProfile from '../assets/images/members/Garing_Profile.jpg';
import '../styles/Login.css';

const Login = () => {
  const { login, handleOAuthCallback } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [selectedDeveloper, setSelectedDeveloper] = useState(null);
  const [selectedFeature, setSelectedFeature] = useState(null);

  const teamMembers = [
    {
      name: 'Garing',
      role: 'FullStack',
      photo: garingProfile,
      description: 'Implements end-to-end features across frontend and backend. Handles API integration, data flow, and system behavior to ensure seamless functionality throughout the MetaDoc platform.'
    },
    {
      name: 'Veloso',
      role: 'Frontend',
      photo: velosoProfile,
      description: 'Builds and refines the MetaDoc user interface, focusing on usability, consistency, and responsive behavior. Translates functional requirements into clean and intuitive UI components.'
    },
    {
      name: 'Abellana',
      role: 'NLP & Backend',
      photo: abellanaProfile,
      description: 'Specializes in Natural Language Processing and backend architecture. Responsible for developing data models, APIs, and machine learning integrations for automated document evaluation.'
    },
    {
      name: 'Quindao',
      role: 'Project Manager',
      photo: quindaoProfile,
      description: 'Manages documentation flow, task prioritization, and team communication. Supports risk mitigation and helps maintain quality and progress visibility across all development phases.'
    }
  ];

  const systemFeatures = [
    {
      id: 'doc-analysis',
      title: 'Document Analysis',
      subtitle: 'Automated metadata extraction and content validation',
      image: logo3Img,
      description: 'MetaDoc performs deep structural analysis of uploaded Software Project Proposals. It automatically reads and evaluates document sections, checking for compliance with standard academic formatting and necessary prerequisite sections before further review.'
    },
    {
      id: 'insights',
      title: 'Intelligent Insights',
      subtitle: 'Rule-based heuristics and NLP-powered analysis',
      image: logo2Img,
      description: 'Leveraging Natural Language Processing and predefined rubrics, the system provides contextual feedback on the novelty, clarity, and viability of the project scope. It highlights areas of improvement immediately, accelerating the evaluation timeline.'
    },
    {
      id: 'secure',
      title: 'Secure & Compliant',
      subtitle: 'Data Privacy Act 2012 compliant with OAuth 2.0',
      image: logo1Img,
      description: 'Security is a top priority. MetaDoc strictly adheres to the Data Privacy Act of 2012, utilizing Google OAuth 2.0 to securely access student submissions from Drive, ensuring that academic records and sensitive data remain protected.'
    }
  ];

  // Check for success message from registration redirect
  useEffect(() => {
    if (location.state?.message) {
      setSuccess(location.state.message);
      // Clear state so message doesn't persist on refresh
      navigate(location.pathname, { replace: true });
    }
  }, [location, navigate]);

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setError(null);
    try {
      await login('professor', 'google');
    } catch (err) {
      setError('Failed to initiate Google login. Please try again.');
      setGoogleLoading(false);
    }
  };

  return (
    <div className="login-page">
      {showAboutModal && (
        <div className="about-modal-overlay" onClick={() => { setShowAboutModal(false); setSelectedDeveloper(null); }}>
          <div className={`about-modal-content ${selectedDeveloper ? 'detail-view' : ''}`} onClick={(e) => e.stopPropagation()}>
            <button className="about-modal-close" onClick={() => { setShowAboutModal(false); setSelectedDeveloper(null); }}>
              <X size={24} />
            </button>

            {!selectedDeveloper ? (
              <>
                <div className="about-modal-header" style={{ alignItems: 'center' }}>
                  <div className="about-info-icon-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '40px', height: '40px', borderRadius: '12px', backgroundColor: 'rgba(128, 0, 0, 0.1)', color: 'var(--color-maroon-dark)' }}>
                    <Info size={24} />
                  </div>
                  <h2>About</h2>
                </div>
                
                <div className="about-section">
                  <h3>Our System</h3>
                  <p>
                    MetaDoc is an intelligent, Google Drive-Integrated Metadata Analyzer designed to streamline the evaluation of academic software project proposals. It leverages rule-based heuristics and Natural Language Processing (NLP) to automate metadata extraction, validate content, and provide actionable insights.
                  </p>
                </div>
                
                <div className="about-section">
                  <h3>The Developers</h3>
                  <p>
                    This system is proudly developed by a dedicated team of student researchers from the Cebu Institute of Technology - University:
                  </p>
                  <ul className="developer-list">
                    {teamMembers.map((member, index) => (
                      <li key={index} onClick={() => setSelectedDeveloper(member)} className="developer-list-item">
                        <strong>{member.name}</strong> - {member.role}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="about-modal-footer">
                  <p>Built for the Future of Academic Excellence. &copy; 2025</p>
                </div>
              </>
            ) : (
              <div className="developer-detail">
                <button className="back-button" onClick={() => setSelectedDeveloper(null)}>
                  <ChevronLeft size={20} /> Back
                </button>
                <div className="developer-detail-content">
                  <div className="developer-photo-container">
                    <img src={selectedDeveloper.photo} alt={selectedDeveloper.name} className="developer-photo-large" />
                  </div>
                  <h3>{selectedDeveloper.name}</h3>
                  <p className="developer-role">{selectedDeveloper.role.toUpperCase()}</p>
                  <p className="developer-desc">{selectedDeveloper.description}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {selectedFeature && (
        <div className="feature-modal-overlay" onClick={() => setSelectedFeature(null)}>
          <div className="feature-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="feature-modal-close" onClick={() => setSelectedFeature(null)}>
              <X size={24} />
            </button>
            <div className="feature-modal-header">
              <div className="feature-modal-icon-container">
                <img src={selectedFeature.image} alt={selectedFeature.title} />
              </div>
              <div>
                <h2>{selectedFeature.title}</h2>
                <span className="feature-modal-subtitle">{selectedFeature.subtitle}</span>
              </div>
            </div>
            <div className="feature-modal-body">
              <p>{selectedFeature.description}</p>
            </div>
          </div>
        </div>
      )}

      <div className="login-container">
        <div className="login-left">
          <div className="brand-header">
            <div className="brand-flow-visual single-logo" aria-hidden="true" style={{ justifyContent: 'center', marginBottom: '2rem' }}>
              <img 
                src={logo4Img} 
                alt="MetaDoc Logo" 
                className="clickable-brand-logo" 
                onClick={() => setShowAboutModal(true)} 
                title="Click to learn about MetaDoc!"
              />
            </div>
            <p className="brand-subtitle">
              Google Drive-Integrated Metadata Analyzer for Academic Document Evaluation
            </p>
          </div>

          <div className="features-list">
            {systemFeatures.map(feature => (
              <div 
                key={feature.id} 
                className="feature-item cursor-pointer" 
                onClick={() => setSelectedFeature(feature)}
                title="Click to learn more"
              >
                <div className="feature-icon feature-icon-clickable" style={{ backgroundColor: 'white', padding: '6px', overflow: 'hidden', borderRadius: '12px' }}>
                  <img src={feature.image} alt={feature.title} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </div>
                <div className="feature-content">
                  <h3>{feature.title}</h3>
                  <p>{feature.subtitle}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="login-right">
          <div className="login-card">
            <div className="login-header">
              <h2>MetaDoc</h2>
              <p>Sign in to your account</p>
            </div>

            {error && (
              <div className="alert alert-error">
                <p>{error}</p>
              </div>
            )}

            {success && (
              <div className="alert alert-success">
                <p>{success}</p>
              </div>
            )}



            <Button
              type="button"
              variant="google"
              onClick={handleGoogleLogin}
              loading={googleLoading}
              disabled={loading}
              size="large"
              className="w-full mb-3"
              style={{ marginBottom: '0.75rem' }}
              icon={() => (
                <svg width="20" height="20" viewBox="0 0 24 24" className="google-icon">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              )}
            >
              Sign in with Google
            </Button>


            <div className="login-footer">
              <div className="login-university-row">
                <span>Cebu Institute of Technology - University</span>
              </div>
              <div className="login-legal-links">
                <Link to="/privacy-policy">Privacy Policy</Link>
                <span aria-hidden="true">•</span>
                <Link to="/terms">Terms of Service</Link>
              </div>
              <p className="text-sm">© 2025 MetaDoc. All rights reserved.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
