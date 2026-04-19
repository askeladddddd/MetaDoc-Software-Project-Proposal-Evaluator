import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { LogIn, Info } from 'lucide-react';
import Card from '../components/common/Card/Card';
import Button from '../components/common/Button/Button';
import Modal from '../components/common/Modal/Modal';
import logoImg from '../assets/images/MainLogo.png';
import authLogoImg from '../assets/images/Logo4.jpg';
import logo2Img from '../assets/images/Logo2.jpg';
import '../styles/Login.css'; // Reuse login styles


const StudentLogin = () => {
    const { login, isAuthenticated, authLoading, logout, user } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const [loading, setLoading] = useState(false);
    const [studentLinks, setStudentLinks] = useState([]);
    const [fetchingLinks, setFetchingLinks] = useState(false);
    const [showUnauthorizedModal, setShowUnauthorizedModal] = useState(false);

    useEffect(() => {
        if (isAuthenticated && !authLoading) {
            if (token) {
                navigate(`/submit?token=${token}`);
            } else {
                // Fetch available links for this student
                fetchAvailableLinks();
            }
        }
    }, [isAuthenticated, authLoading, token, navigate]);

    const fetchAvailableLinks = async () => {
        setFetchingLinks(true);
        try {
            const { submissionAPI } = await import('../services/api');
            const response = await submissionAPI.getStudentLinks();
            setStudentLinks(response.data.links || []);
        } catch (err) {
            console.error('Failed to fetch student links:', err);
        } finally {
            setFetchingLinks(false);
        }
    };

    const handleGoogleLogin = async () => {
        setLoading(true);
        try {
            const redirectPath = token ? `/submit?token=${token}` : `/student/login`;
            localStorage.setItem('redirect_after_auth', redirectPath);
            await login('student', 'google');
        } catch (err) {
            console.error('Failed to initiate login:', err);
            setLoading(false);
        }
    };

    if (isAuthenticated && !authLoading) {
        // Token present: useEffect navigates to /submit immediately — render nothing to avoid any flash.
        if (token) return null;

        const roleValue = String(user?.role || '').toLowerCase();
        if (roleValue === 'professor') {
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
                            <div className="login-legal-links">
                                <Link to="/privacy-policy">Privacy Policy</Link>
                                <span aria-hidden="true">•</span>
                                <Link to="/terms">Terms of Service</Link>
                            </div>
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
            <div className="premium-theme">
                <>
                    <Card className="premium-center-card">
                        <div className="status-badge registered">Account Registered</div>

                        <p className="premium-card-desc">
                            You are successfully signed in as <strong>{user?.email}</strong>.
                        </p>

                        <div style={{ marginTop: 'var(--spacing-xl)' }}>
                            {studentLinks.length > 0 ? (
                                <div className="authorized-links-container">
                                    <div
                                        className="submission-link-card"
                                        onClick={() => navigate(`/submit?token=${studentLinks[0].token}`)}
                                    >
                                        <div className="link-icon">
                                            <img src={logo2Img} alt="Submission" className="link-logo-image" />
                                        </div>
                                        <div className="link-info">
                                            <h4>{studentLinks[0].deadline_title}</h4>
                                        </div>
                                        <LogIn size={20} className="link-arrow" />
                                    </div>
                                </div>
                            ) : (
                                <div className="alert alert-info" style={{ textAlign: 'left' }}>
                                    <p>To submit your proposal, please click the <strong>Submission Link</strong> shared by your professor.</p>
                                    {fetchingLinks && <div className="fetching-loader">Checking for shared links...</div>}
                                </div>
                            )}

                            <Button
                                onClick={() => logout()}
                                variant="outline"
                                size="medium"
                                className="w-full"
                                style={{ marginTop: '1.5rem' }}
                            >
                                Sign Out
                            </Button>
                        </div>
                    </Card>

                    <div className="university-footer submission-footer-brand submission-footer-outside">
                        <div className="university-footer-stack">
                            <span>Cebu Institute of Technology - University</span>
                            <span className="university-footer-version">MetaDoc V1.0</span>
                        </div>
                    </div>
                </>
            </div>
        );
    }

    return (
        <div className="submission-theme">
            <p className="submission-sign-message">Click the button</p>

            <Card className="premium-center-card submission-login-card logo-only-card">
                <div className="oauth-logo-entry">
                    <button
                        type="button"
                        onClick={handleGoogleLogin}
                        disabled={loading}
                        className="oauth-logo-button"
                        aria-label="Sign in with Google"
                    >
                        <span className="oauth-logo-orb">
                            <img src={authLogoImg} alt="Sign in with Google" className="oauth-logo-image" />
                        </span>
                        {!loading && <span className="logo-hover-tooltip">Click to proceed</span>}
                    </button>
                    {loading && <p className="logo-only-hint">Redirecting to Google...</p>}
                </div>
            </Card>

            <div className="university-footer submission-footer-brand submission-footer-outside">
                <div className="university-footer-stack">
                    <span>Cebu Institute of Technology - University</span>
                    <span className="university-footer-version">MetaDoc V1.0</span>
                    <div className="login-legal-links">
                        <Link to="/privacy-policy">Privacy Policy</Link>
                        <span aria-hidden="true">•</span>
                        <Link to="/terms">Terms of Service</Link>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StudentLogin;
