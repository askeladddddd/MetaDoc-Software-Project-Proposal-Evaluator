import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Loader, CheckCircle, XCircle, RefreshCcw } from 'lucide-react';
import Card from '../components/common/Card/Card';
import '../styles/OAuthCallback.css';

const OAuthCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { handleOAuthCallback } = useAuth();
  const [status, setStatus] = useState('processing'); // 'processing', 'success', 'error'
  const [message, setMessage] = useState('Completing authentication...');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isClassListError, setIsClassListError] = useState(false);
  const processed = useRef(false);

  const handleStudentRefresh = () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setTimeout(() => navigate('/student/login'), 420);
  };

  useEffect(() => {
    const processCallback = async () => {
      if (processed.current) return;
      processed.current = true;

      try {
        // Get session token and user data from URL (sent by backend)
        const sessionToken = searchParams.get('session_token');
        const userParam = searchParams.get('user');
        const rawError = searchParams.get('error');
        const callbackUserType = searchParams.get('user_type');
        const storedUserType = localStorage.getItem('user_type');
        const redirectAfterAuth = localStorage.getItem('redirect_after_auth');
        const isStudentFlow =
          callbackUserType === 'student' ||
          storedUserType === 'student' ||
          redirectAfterAuth === '/student/login' ||
          (redirectAfterAuth || '').startsWith('/submit');
        const fallbackLoginPath = isStudentFlow ? '/student/login' : '/login';

        const error = rawError ? decodeURIComponent(rawError) : null;

        if (error) {
          const isClassRecordError = /class list|excel class list|not associated with any student/i.test(error);
          const errorDelay = isStudentFlow ? 30000 : 3000;
          setStatus('error');
          setIsClassListError(isClassRecordError);
          setMessage(
            isClassRecordError
              ? 'This account is not listed in the class list. Please sign in again using the Gmail account registered in the class list. Or try to contact your professor to update this.'
              : `Authentication failed: ${error}`
          );
          setTimeout(() => navigate(fallbackLoginPath), errorDelay);
          return;
        }

        if (!sessionToken || !userParam) {
          setStatus('error');
          setIsClassListError(false);
          setMessage('Invalid authentication response');
          setTimeout(() => navigate(fallbackLoginPath), isStudentFlow ? 30000 : 3000);
          return;
        }

        // Parse user data
        const userData = JSON.parse(decodeURIComponent(userParam));

        // Store session and user data
        handleOAuthCallback(sessionToken, userData);

        setStatus('success');
        setMessage('Login successful! Redirecting...');

        // Check for specific redirect after auth
        const redirectPath = localStorage.getItem('redirect_after_auth');
        localStorage.removeItem('redirect_after_auth'); // Clean up
        localStorage.removeItem('user_type'); // Clean up

        setTimeout(() => {
          if (redirectPath) {
            navigate(redirectPath);
          } else if (userData.role === 'STUDENT' || userData.role === 'student') {
            // Students are directed to the student portal
            navigate('/student/login');
          } else {
            navigate('/dashboard');
          }
        }, 2000);
      } catch (error) {
        console.error('OAuth callback error:', error);
        setStatus('error');
        setIsClassListError(false);
        setMessage('An error occurred during authentication');
        const storedUserType = localStorage.getItem('user_type');
        const isStudent = storedUserType === 'student';
        setTimeout(() => navigate(isStudent ? '/student/login' : '/login'), isStudent ? 30000 : 3000);
      }
    };

    processCallback();
  }, [searchParams, navigate, handleOAuthCallback]);

  return (
    <div className={`oauth-callback-page ${status === 'error' && isClassListError ? 'oauth-callback-page-class-list-error' : ''}`}>
      <div className="callback-container">
        <Card className={`callback-card-content ${status === 'error' && isClassListError ? 'callback-card-class-list-error' : ''}`}>
          <div className="text-center">
            {status === 'processing' && (
              <>
                <Loader size={64} className="callback-icon spinner" />
                <h2>Authenticating...</h2>
                <p>{message}</p>
              </>
            )}

            {status === 'success' && (
              <>
                <CheckCircle size={64} className="callback-icon success" />
                <h2>Success!</h2>
                <p>{message}</p>
              </>
            )}

            {status === 'error' && (
              <>
                <div className="callback-icon-shell">
                  <XCircle size={36} className="callback-icon error" />
                </div>
                <h2>Authentication Failed</h2>
                <p className="callback-error-message">{message}</p>
                <p className="redirect-text">Redirecting to sign in...</p>
                <button
                  type="button"
                  className={`student-signin-btn ${isRefreshing ? 'refreshing' : ''}`}
                  onClick={handleStudentRefresh}
                >
                  <RefreshCcw size={22} className="student-signin-icon" />
                  <span>Refresh</span>
                </button>
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default OAuthCallback;
