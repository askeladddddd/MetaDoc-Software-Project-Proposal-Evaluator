import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { FileText, Users, LogIn, CheckCircle } from 'lucide-react';
import Card from '../components/common/Card/Card';
import Button from '../components/common/Button/Button';
import logoImg from '../assets/images/MainLogo.png';
import citLogo from '../assets/images/cit_logo.png';
import '../styles/Login.css'; // Reuse login styles


const StudentLogin = () => {
    const { login, isAuthenticated, authLoading, logout, user } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const [loading, setLoading] = useState(false);
    const [studentLinks, setStudentLinks] = useState([]);
    const [fetchingLinks, setFetchingLinks] = useState(false);

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

        return (
            <div className="premium-theme">
                <header className="premium-branding">
                    <h1 className="metallic-text">MetaDoc</h1>
                    <p className="subtitle">Student Submission Portal</p>
                </header>

                <Card className="premium-center-card">
                    <div className="premium-icon-box success">
                        <CheckCircle size={40} />
                    </div>

                    <h2 className="premium-card-title">Welcome, {user?.name}</h2>

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
                                        <FileText size={24} />
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

                    <div style={{ marginTop: '2.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem', color: '#9ca3af', fontSize: '0.8rem', fontWeight: 500 }}>
                        <img src={citLogo} alt="CIT University" width={22} height={22} style={{ objectFit: 'contain', display: 'block', flexShrink: 0 }} />
                        <span>Cebu Institute of Technology - University</span>
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
                        onClick={handleGoogleLogin}
                        disabled={loading}
                        className="google-login-button"
                    >
                        {loading ? (
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

                <div style={{ marginTop: '2.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem', color: '#9ca3af', fontSize: '0.8rem', fontWeight: 500 }}>
                    <img src={citLogo} alt="CIT University" width={22} height={22} style={{ objectFit: 'contain', display: 'block', flexShrink: 0 }} />
                    <span>Cebu Institute of Technology - University</span>
                </div>
            </Card>
        </div>
    );
};

export default StudentLogin;
