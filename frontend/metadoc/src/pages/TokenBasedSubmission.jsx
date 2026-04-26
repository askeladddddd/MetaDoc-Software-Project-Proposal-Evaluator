import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { submissionAPI } from '../services/api';
import axios from 'axios';
import { Upload, FileText, CheckCircle, AlertCircle, X, Info, ArrowUp, Loader2 } from '../components/common/Icons';
import { useAuth } from '../contexts/AuthContext';
import Card from '../components/common/Card/Card';
import Button from '../components/common/Button/Button';
import Modal from '../components/common/Modal/Modal';
import authLogoImg from '../assets/images/Logo4.jpg';
import '../styles/TokenBasedSubmission.css';


const TokenBasedSubmission = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user, login, logout, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
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

  const [deadlineInfo, setDeadlineInfo] = useState(null);
  const [showDescriptionModal, setShowDescriptionModal] = useState(false);
  const [showUnauthorizedModal, setShowUnauthorizedModal] = useState(false);

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
          const response = await submissionAPI.getTokenInfo(token);
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
              const { student_id, first_name, last_name, course_year, team_code, subject_no, email, name } = response.data;
              setStudentInfo({
                student_id,
                name: name || `${first_name} ${last_name}`.trim(),
                course_year: course_year || '',
                team_code: team_code || '',
                subject_no: subject_no || '',
                email: email || user?.email || ''
              });
            } else {
              setIsRegistered(false);
              const roleValue = String(user?.role || '').toLowerCase();
              if (response.data.is_professor || roleValue === 'professor') {
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

  // Handle automatic redirect to login if auth failed
  useEffect(() => {
    let timer;
    if (isAuthenticated && !checkingRegistration && !isRegistered && !isProfessor) {
      timer = setTimeout(() => {
        logout();
      }, 3000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isAuthenticated, checkingRegistration, isRegistered, isProfessor, logout]);

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

  const canSubmitDriveLink = Boolean(driveData.drive_link?.trim()) && !loading;
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
      <div className="submit-page portal-loading-screen">
        <div className="portal-loading-container">
          <div className="portal-loading-spinner-wrap">
            <Loader2 className="portal-loading-spinner" size={48} />
          </div>
          <h2 className="portal-loading-title">MetaDoc</h2>
          <p className="portal-loading-text">Preparing your submission portal...</p>
        </div>
      </div>
    );
  }

  // 2. Login Gate - Modified to show login directly on page
  if (!isAuthenticated) {
    return (
      <div className="submission-theme">
        <p className="submission-sign-message">Click the button</p>
        <Card className="premium-center-card submission-login-card logo-only-card">
          <div className="oauth-logo-entry">
            <button
              type="button"
              onClick={handleStudentLogin}
              disabled={authLoading}
              className="oauth-logo-button"
              aria-label="Sign in with Google"
            >
              <span className="oauth-logo-orb">
                <img src={authLogoImg} alt="Sign in with Google" className="oauth-logo-image" />
              </span>
              {!authLoading && <span className="logo-hover-tooltip">Click to proceed</span>}
            </button>
            {authLoading && <p className="logo-only-hint">Redirecting to Google...</p>}
          </div>
        </Card>

        <div className="university-footer submission-footer-brand submission-footer-outside">
          <div className="university-footer-stack">
            <span>Cebu Institute of Technology - University</span>
            <span className="university-footer-version">MetaDoc V1.0</span>
          </div>
        </div>
      </div>
    );
  }

  // 3. User Feedback for Unregistered Account
  if (isAuthenticated && !checkingRegistration && !isRegistered) {
    if (isProfessor) {
      return (
        <div className="submission-theme">
          <Card className="premium-center-card">
            <button
              type="button"
              onClick={() => setShowUnauthorizedModal(true)}
              aria-label="Open unauthorized access explanation"
              className="premium-icon-box"
              style={{ background: 'var(--color-maroon)', color: 'white', border: 'none', cursor: 'pointer' }}
            >
              <Info size={40} />
            </button>

            <h2 className="premium-card-title">Unauthorized Access</h2>

            <p className="premium-card-desc" style={{ marginBottom: '1.5rem', fontWeight: 'bold' }}>
              Click the info icon to see why this page is blocked for professors.
            </p>
          </Card>

          <div className="university-footer submission-footer-brand submission-footer-outside">
            <div className="university-footer-stack">
              <span>Cebu Institute of Technology - University</span>
              <span className="university-footer-version">MetaDoc V1.0</span>
            </div>
          </div>

          <Modal
            isOpen={showUnauthorizedModal}
            onClose={() => setShowUnauthorizedModal(false)}
            title="Unauthorized Access"
            type="error"
            showCloseButton={false}
            modalClassName="unauthorized-access-modal"
            footer={(
              <Button
                variant="primary"
                onClick={() => setShowUnauthorizedModal(false)}
                style={{ minWidth: '180px' }}
              >
                Close
              </Button>
            )}
          >
            <div className="unauthorized-modal-content">
              <p className="unauthorized-modal-lead">
                You are signed in as a professor, so direct student submission access is blocked for this page.
              </p>
              <p className="unauthorized-modal-text">
                The submission portal is only for student Gmail accounts matched to the class list.
              </p>
              <ul className="unauthorized-modal-steps">
                <li>Open this link in an incognito window or another browser.</li>
                <li>Or sign out and log in using a student Gmail account.</li>
              </ul>
            </div>
          </Modal>
        </div>
      );
    }

    return (
      <div className="submission-auth-failure-page">
        <Card className="submission-auth-failure-card">
          <div className="submission-auth-failure-icon-shell">
            <AlertCircle size={36} className="submission-auth-failure-icon" />
          </div>

          <h2 className="submission-auth-failure-title">Authentication Failed</h2>

          <p className="submission-auth-failure-message">
            {registrationStatusMessage || 'This account is not listed in the class list.'}
          </p>

          <p className="submission-auth-failure-redirect">Redirecting to sign in...</p>

          <Button
            variant="primary"
            onClick={logout}
            className="submission-auth-failure-button"
          >
            Sign In
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="submit-page">
      <div className="submit-workspace">
        <header className="submit-page-title-block">
          <h2 className="submit-page-title">Submit Your Document</h2>
        </header>

        {!getTokenFromURL() && (
          <div className="alert alert-error">
            <AlertCircle size={20} />
            <div>
              <p className="font-semibold">Invalid Submission Link</p>
              <p className="text-sm">Please use the submission link provided by your professor.</p>
            </div>
          </div>
        )}

        {deadlineInfo && (
          <Card className="submit-section-card deliverable-card file-like-card">
            <h1 className="deliverable-heading">TITLE : {deadlineInfo.title}</h1>
            {deadlineInfo.description && (
              <div className="deadline-description-block">
                <p className="deadline-description">{descriptionPreview}</p>
                {isLongDescription && (
                  <button
                    type="button"
                    className="deadline-read-more-btn"
                    onClick={() => setShowDescriptionModal(true)}
                    aria-label="See the full description"
                  >
                    See more
                  </button>
                )}
              </div>
            )}
          </Card>
        )}

        <Card className="submit-section-card student-info-card">
          <h2 className="section-card-title">Student Details</h2>
          <p className="student-kicker">Submitting as</p>
          <div className="student-grid">
            <div className="student-grid-item">
              <span className="student-grid-label">Name</span>
              <span className="student-grid-value">{studentInfo?.name || 'N/A'}</span>
            </div>
            <div className="student-grid-item">
              <span className="student-grid-label">Course & Year</span>
              <span className="student-grid-value">{studentInfo?.course_year || 'N/A'}</span>
            </div>

            <div className="student-grid-item">
              <span className="student-grid-label">Student ID</span>
              <span className="student-grid-value">{studentInfo?.student_id || 'N/A'}</span>
            </div>
            <div className="student-grid-item">
              <span className="student-grid-label">Team Code</span>
              <span className="student-grid-value">{studentInfo?.team_code || 'N/A'}</span>
            </div>

            <div className="student-grid-item">
              <span className="student-grid-label">Subject No.</span>
              <span className="student-grid-value">{studentInfo?.subject_no || 'N/A'}</span>
            </div>
            <div className="student-grid-item">
              <span className="student-grid-label">Email</span>
              <span className="student-grid-value student-grid-value-email">{studentInfo?.email || user?.email || 'N/A'}</span>
            </div>
          </div>
        </Card>

        <Card className="submit-section-card drive-submit-card">
          {success && (
            <div className="alert alert-success">
              <CheckCircle size={20} />
              <div>
                <p className="font-semibold">{success.message}</p>
                <p className="text-sm">Job ID: {success.jobId}</p>
              </div>
            </div>
          )}

          {loading && (
            <div className="submission-processing-overlay" role="status" aria-live="polite" aria-busy="true">
              <div className="submission-processing-card">
                <Loader2 size={28} className="submission-processing-spinner" />
                <p className="submission-processing-title">Submitting your document</p>
                <p className="submission-processing-text">Please wait while we validate and process your Google Drive link.</p>
              </div>
            </div>
          )}

          <div className="card-header submission-drive-header">
            <h3 className="card-title text-maroon submission-drive-title">Google Drive Submission</h3>
            <p className="text-gray-600 text-sm submission-drive-subtitle">
              Provide a link to your Google Docs or DOCX file
            </p>
          </div>

          <form onSubmit={handleDriveLinkSubmit} className="flex flex-col gap-4" aria-busy={loading}>
            <div className="form-group">
              <label className="form-label">GOOGLE DRIVE LINK</label>
              <div className="drive-submit-inline">
                <input
                  type="url"
                  name="drive_link"
                  value={driveData.drive_link}
                  onChange={(e) =>
                    setDriveData({ ...driveData, drive_link: e.target.value })
                  }
                  placeholder="https://drive.google.com/file/d/..."
                  className="form-input w-full"
                  disabled={loading}
                  required
                />
                <Button
                  type="submit"
                  size="large"
                  loading={loading}
                  disabled={!canSubmitDriveLink}
                  className="submit-analysis-btn submit-analysis-inline submit-analysis-icon-only"
                  aria-label="Submit for Analysis"
                  title="Submit for Analysis"
                >
                  <ArrowUp size={22} strokeWidth={2.6} />
                </Button>
              </div>
            </div>

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
          </form>
        </Card>
      </div>

      <div className="university-footer university-footer-with-logo submission-footer-brand submission-footer-outside">
        <div className="university-footer-stack">
          <span>Cebu Institute of Technology - University</span>
          <span className="university-footer-version">MetaDoc V1.0</span>
        </div>
      </div>

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
