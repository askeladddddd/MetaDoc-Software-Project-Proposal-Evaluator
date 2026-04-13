import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { submissionAPI } from '../services/api';
import axios from 'axios';
import { Upload, Link as LinkIcon, FileText, CheckCircle, AlertCircle, X, Check, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import Card from '../components/common/Card/Card';
import Input from '../components/common/Input/Input';
import Button from '../components/common/Button/Button';
import logoImg from '../assets/images/MainLogo.png';
import '../styles/TokenBasedSubmission.css';


const TokenBasedSubmission = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user, login, logout, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);

  // Registration status (fetched on load)
  const [isRegistered, setIsRegistered] = useState(true); // Default to true to prevent premature redirect
  const [checkingRegistration, setCheckingRegistration] = useState(false);
  const [studentInfo, setStudentInfo] = useState(null);
  const [isProfessor, setIsProfessor] = useState(false);
  const [registrationStatusMessage, setRegistrationStatusMessage] = useState('');

  // Drive link form state
  const [driveData, setDriveData] = useState({
    drive_link: '',
  });

  const [linkValidation, setLinkValidation] = useState(null);
  const [deadlineInfo, setDeadlineInfo] = useState(null);
  const [showDescriptionModal, setShowDescriptionModal] = useState(false);

  // Get token from URL
  const getTokenFromURL = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get('token');
  };

  // Fetch deadline info and check registration status
  useEffect(() => {
    const initData = async () => {
      const token = getTokenFromURL();
      if (token) {
        // 1. Fetch Deadline Info
        try {
          const response = await axios.get(`/api/v1/submission/token-info?token=${token}`);
          if (response.data) {
            setDeadlineInfo(response.data);
          }
        } catch (err) {
          console.error('Failed to fetch deadline info:', err);
        }

        // 2. Check Registration if authenticated
        if (isAuthenticated) {
          try {
            setCheckingRegistration(true);
            const response = await submissionAPI.getStudentStatus(token);
            if (response.data.is_registered) {
              setIsRegistered(true);
              setRegistrationStatusMessage('');
              const { student_id, first_name, last_name, course_year, team_code, email, name } = response.data;
              setStudentInfo({
                student_id,
                name: name || `${first_name} ${last_name}`.trim(),
                course_year: course_year || '',
                team_code: team_code || '',
                email: email || user?.email || ''
              });
            } else {
              setIsRegistered(false);
              if (response.data.is_professor) {
                setIsProfessor(true);
                setRegistrationStatusMessage('');
              } else {
                setRegistrationStatusMessage(response.data.message || 'Your Gmail account is not in the class list for this submission link.');
              }
            }
          } catch (err) {
            console.error('Failed to check registration status:', err);
            setIsRegistered(false);
            setIsProfessor(false);
            setRegistrationStatusMessage(
              err.response?.data?.message ||
              err.response?.data?.error ||
              'Unable to verify if your Gmail account is in the class list. Please try again.'
            );
          } finally {
            setCheckingRegistration(false);
          }
        }
      }
    };
    initData();
  }, [isAuthenticated]);

  // Handle Redirection to Registration removed as backend handles it automatically
  useEffect(() => {
    // No-op - redirecting to registration is no longer needed
  }, [isAuthenticated, checkingRegistration, isRegistered, navigate]);


  const handleValidateLink = async () => {
    if (!driveData.drive_link) {
      setError('Please enter a Google Drive link');
      return;
    }

    setValidating(true);
    setLinkValidation(null);
    setError(null);

    try {
      const response = await submissionAPI.validateDriveLink(driveData.drive_link);
      if (response.data.valid) {
        setLinkValidation({
          valid: true,
          fileInfo: response.data.file_info,
        });
      } else {
        setLinkValidation({
          valid: false,
          error: response.data.error,
          guidance: response.data.guidance,
        });
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to validate link');
    } finally {
      setValidating(false);
    }
  };

  const handleDriveLinkSubmit = async (e) => {
    e.preventDefault();
    if (!driveData.drive_link) {
      setError('Please enter a Google Drive link');
      return;
    }

    // Check for token
    const token = getTokenFromURL();
    if (!token) {
      setError('Invalid submission link. Please use the link provided by your professor.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const submissionData = { ...driveData, token };

      const response = await submissionAPI.submitDriveLink(submissionData);
      setSuccess({
        message: 'Your file has been submitted successfully.',
        jobId: response.data.job_id,
      });

      // Reset form
      setDriveData({ drive_link: '' });
      setLinkValidation(null);

      // Clear success message after 5 seconds
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      const errorData = err.response?.data;
      if (errorData?.error_type === 'permission_denied') {
        setError({
          message: `❌ ${errorData.error}`,
          guidance: errorData.guidance,
        });
      } else {
        const errorMessage = errorData?.error || 'Failed to submit Google Drive link';

        // Check for specific error types
        if (errorMessage.includes('empty') || errorMessage.includes('insufficient content')) {
          setError('❌ Document is empty or has insufficient content. Please provide a valid document with text.');
        } else if (errorMessage.includes('Invalid document') || errorMessage.includes('corrupted')) {
          setError('❌ Document is invalid or corrupted. Please check your file and try again.');
        } else if (errorMessage.includes('Cannot read document')) {
          setError('❌ Cannot read document. The file may be password-protected or corrupted.');
        } else {
          setError(`❌ ${errorMessage}`);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const canSubmitDriveLink = Boolean(driveData.drive_link?.trim()) && !loading && !validating;
  const descriptionText = String(deadlineInfo?.description || '').trim();
  const isLongDescription = descriptionText.length > 160;
  const descriptionPreview = isLongDescription
    ? `${descriptionText.slice(0, 160).trim()}...`
    : descriptionText;

  const handleStudentLogin = () => {
    // Save current URL for redirect after OAuth
    localStorage.setItem('redirect_after_auth', window.location.pathname + window.location.search);
    login('student', 'google');
  };

  // 1. Loading State
  if (authLoading || (isAuthenticated && checkingRegistration)) {
    return (
      <div className="submit-page">
        <div className="loading-container" style={{ textAlign: 'center', color: 'white' }}>
          <div className="spinner" style={{ margin: '0 auto var(--spacing-md)' }}></div>
          <p>Loading submission portal...</p>
        </div>
      </div>
    );
  }

  // 2. Login Gate - Modified to show login directly on page
  if (!isAuthenticated) {
    return (
      <div className="premium-theme">
        <header className="premium-branding">
          <h1 className="metallic-text">MetaDoc</h1>
          <p className="subtitle">Student Submission Portal</p>
        </header>

        <Card className="premium-center-card">
          <div className="premium-icon-box">
            <Users size={40} />
          </div>

          <h2 className="premium-card-title">Google Login</h2>

          <p className="premium-card-desc">
            Sign in with the <strong>Gmail account</strong> that you listed in the excel class list.
          </p>

          <div style={{ marginTop: 'var(--spacing-xl)' }}>
            <button
              type="button"
              onClick={handleStudentLogin}
              disabled={authLoading}
              className="google-login-button"
            >
              {authLoading ? (
                <div className="btn-spinner"></div>
              ) : (
                <>
                  <svg width="24" height="24" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M23.5 12.2c0-.8-.1-1.5-.2-2.2H12v4.1h6.5c-.3 1.5-1.1 2.8-2.4 3.6v3h3.8c2.3-2.1 3.6-5.2 3.6-8.5z" />
                    <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.8-3c-1.1.7-2.5 1.1-4.1 1.1-3.1 0-5.8-2.1-6.7-5H1.5v3.1C3.5 21.3 7.5 24 12 24z" />
                    <path fill="#FBBC05" d="M5.3 14.2c-.2-.6-.4-1.3-.4-2.2s.2-1.5.4-2.2V6.7H1.5C.5 8.7 0 10.3 0 12s.5 3.3 1.5 5.3l3.8-3.1z" />
                    <path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4C17.9 1.1 15.2 0 12 0 7.5 0 3.5 2.7 1.5 6.7l3.8 3.1c.9-2.9 3.6-5 6.7-5z" />
                  </svg>
                  Sign in with Google
                </>
              )}
            </button>
          </div>

          <div className="university-footer">
            Cebu Institute of Technology - University
          </div>
        </Card>
      </div>
    );
  }

  // 3. User Feedback for Unregistered Account
  if (isAuthenticated && !checkingRegistration && !isRegistered) {
    if (isProfessor) {
      return (
        <div className="premium-theme">
          <header className="premium-branding">
            <h1 className="metallic-text">MetaDoc</h1>
            <p className="subtitle">Professor Preview Mode</p>
          </header>

          <Card className="premium-center-card">
            <div className="premium-icon-box" style={{ background: 'var(--color-maroon)', color: 'white' }}>
              <Users size={40} />
            </div>

            <h2 className="premium-card-title">Professor Preview</h2>

            <p className="premium-card-desc" style={{ marginBottom: '1.5rem', fontWeight: 'bold' }}>
              You are currently logged in as a Professor.
            </p>

            <p className="premium-card-desc" style={{ fontSize: '0.95rem' }}>
              To test the student submission process for <strong>{deadlineInfo?.title || 'this deadline'}</strong>, please:
              <br /><br />
              1. Open this link in an <strong>Incognito window</strong> or <strong>another browser</strong>.<br />
              2. Or <strong>Sign Out</strong> and log in with a student Gmail account.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)', marginTop: '2rem' }}>
              <Button
                variant="primary"
                onClick={() => navigate('/dashboard')}
                style={{ width: '100%', borderRadius: '16px', padding: '14px' }}
              >
                Go to Dashboard
              </Button>
              <Button
                variant="outline"
                onClick={logout}
                style={{ width: '100%', borderRadius: '16px' }}
              >
                Sign Out to Test
              </Button>
            </div>

            <div className="university-footer">
              Cebu Institute of Technology - University
            </div>
          </Card>
        </div>
      );
    }

    return (
      <div className="premium-theme">
        <header className="premium-branding">
          <h1 className="metallic-text">MetaDoc</h1>
          <p className="subtitle">Student Submission Portal</p>
        </header>

        <Card className="premium-center-card">
          <div className="premium-icon-box" style={{ background: '#fee2e2', color: '#dc2626' }}>
            <AlertCircle size={40} />
          </div>

          <h2 className="premium-card-title" style={{ color: '#dc2626' }}>Access Denied</h2>

          <p className="premium-card-desc" style={{ marginBottom: '1.5rem', fontWeight: 'bold', color: '#991b1b' }}>
            {registrationStatusMessage || 'Your Gmail account is not in this class list'}
          </p>

          <p className="premium-card-desc" style={{ fontSize: '0.95rem' }}>
            Logged in as: <strong>{user?.email}</strong><br /><br />
            Please ensure you are using the <strong>Gmail account</strong> that you listed in the excel class list. If this IS the correct account, contact your professor.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)', marginTop: '2rem' }}>
            <Button
              variant="primary"
              onClick={() => window.location.reload()}
              style={{ width: '100%', borderRadius: '16px', padding: '14px' }}
            >
              Try Again
            </Button>
            <Button
              variant="ghost"
              onClick={logout}
              style={{ width: '100%', borderRadius: '16px', color: '#6b7280' }}
            >
              Sign Out
            </Button>
          </div>

          <div className="university-footer">
            Cebu Institute of Technology - University
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="submit-page">
      <Card className="submit-container">
        <div className="submit-header">
          <h2>Submit Your Document</h2>
          {deadlineInfo ? (
            <div className="deadline-info">
              <h3 className="deadline-title">{deadlineInfo.title}</h3>
              {deadlineInfo.description && (
                <div className="deadline-description-block">
                  <p className="deadline-description">{descriptionPreview}</p>
                  {isLongDescription && (
                    <button
                      type="button"
                      className="deadline-read-more-btn"
                      onClick={() => setShowDescriptionModal(true)}
                    >
                      Read more
                    </button>
                  )}
                </div>
              )}
              <div className="submission-context">
                <div className="submission-context-avatar">
                  {studentInfo?.name?.charAt(0) || 'S'}
                </div>
                <div className="submission-context-details">
                  <p className="submission-context-label">Submitting as</p>
                  <p className="submission-context-name">
                    {studentInfo?.name || 'Student'}
                  </p>
                  <p className="submission-context-meta">Student ID: {studentInfo?.student_id || 'N/A'}</p>
                  <p className="submission-context-meta">Course & Year: {studentInfo?.course_year || 'N/A'}</p>
                  <p className="submission-context-meta">Team Code: {studentInfo?.team_code || 'N/A'}</p>
                  <p className="submission-context-email">{studentInfo?.email || user?.email || ''}</p>

                </div>
              </div>
            </div>
          ) : (
            <p>Provide a Google Drive link for analysis</p>
          )}
        </div>

        {
          !getTokenFromURL() && (
            <div className="alert alert-error">
              <AlertCircle size={20} />
              <div>
                <p className="font-semibold">Invalid Submission Link</p>
                <p className="text-sm">Please use the submission link provided by your professor.</p>
              </div>
            </div>
          )
        }

        {
          success && (
            <div className="alert alert-success">
              <CheckCircle size={20} />
              <div>
                <p className="font-semibold">{success.message}</p>
                <p className="text-sm">Job ID: {success.jobId}</p>
              </div>
            </div>
          )
        }

        <div className="submit-content">
          <div className="card-header submission-drive-header">
            <h3 className="card-title text-maroon submission-drive-title">Google Drive Submission</h3>
            <p className="text-gray-600 text-sm submission-drive-subtitle">
              Provide a link to your Google Docs or DOCX file
            </p>
          </div>

          <form onSubmit={handleDriveLinkSubmit} className="flex flex-col gap-4">
            <div className="form-group">
              <label className="form-label">GOOGLE DRIVE LINK</label>
              <div className="drive-link-input-wrap">
                <input
                  type="url"
                  name="drive_link"
                  value={driveData.drive_link}
                  onChange={(e) =>
                    setDriveData({ ...driveData, drive_link: e.target.value })
                  }
                  placeholder="https://drive.google.com/file/d/..."
                  className="form-input w-full"
                  style={{ paddingRight: '3rem' }}
                  required
                />
                <button
                  type="button"
                  onClick={handleValidateLink}
                  disabled={!driveData.drive_link || validating}
                  className="drive-link-validate-btn flex items-center justify-center transition-colors"
                >
                  {validating ? (
                    <div className="btn-spinner" style={{ color: 'var(--color-maroon)' }}></div>
                  ) : (
                    <Check size={20} color="var(--color-maroon)" strokeWidth={3} />
                  )}
                </button>
              </div>
            </div>

            {linkValidation && (
              <div className={`alert ${linkValidation.valid ? 'alert-success' : 'alert-error'}`}>
                {linkValidation.valid ? (
                  <>
                    <CheckCircle size={20} />
                    <div>
                      <p className="font-semibold">Link is valid!</p>
                      <p className="text-sm">File: {linkValidation.fileInfo?.name}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <AlertCircle size={20} />
                    <div>
                      <p className="font-semibold">{linkValidation.error}</p>
                      {linkValidation.guidance && (
                        <div className="guidance-steps">
                          {linkValidation.guidance.steps?.map((step, index) => (
                            <p key={index} className="text-sm">{step}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {error && typeof error === 'object' && (
              <div className="alert alert-error">
                <AlertCircle size={20} />
                <div>
                  <p className="font-semibold">{error.message}</p>
                  {error.guidance && (
                    <div className="guidance-steps">
                      {error.guidance.steps?.map((step, index) => (
                        <p key={index} className="text-sm">{step}</p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {error && typeof error === 'string' && (
              <div className="alert alert-error">
                <AlertCircle size={20} />
                <p>{error}</p>
              </div>
            )}

            <Button
              type="submit"
              size="large"
              loading={loading}
              disabled={!canSubmitDriveLink}
              icon={LinkIcon}
              className="w-full submit-analysis-btn"
            >
              Submit for Analysis
            </Button>
          </form>
        </div>
      </Card >

      {showDescriptionModal && (
        <div className="modal-overlay" onClick={() => setShowDescriptionModal(false)}>
          <div className="modal-content submission-description-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Description</h2>
              <button className="btn-close" onClick={() => setShowDescriptionModal(false)}>
                <X size={22} />
              </button>
            </div>

            <div className="modal-body">
              <div className="submission-description-scrollable">
                {descriptionText}
              </div>
            </div>
          </div>
        </div>
      )}
    </div >
  );
};


export default TokenBasedSubmission;
