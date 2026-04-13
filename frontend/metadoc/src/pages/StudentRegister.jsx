import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { submissionAPI } from '../services/api';
import axios from 'axios';
import { FileText, User, Mail, CheckCircle, AlertCircle } from 'lucide-react';
import Card from '../components/common/Card/Card';
import Input from '../components/common/Input/Input';
import Button from '../components/common/Button/Button';
import '../styles/TokenBasedSubmission.css'; // Reuse portal styles

const StudentRegister = () => {
    const { user, isAuthenticated, authLoading, logout } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [deadlineInfo, setDeadlineInfo] = useState(null);

    const [formData, setFormData] = useState({
        student_id: '',
        first_name: '',
        last_name: '',
        email: ''
    });

    useEffect(() => {
        // 1. Authenticated check
        if (!authLoading && !isAuthenticated) {
            navigate(`/submit${token ? `?token=${token}` : ''}`);
            return;
        }

        if (user && !formData.email) {
            setFormData(prev => ({ ...prev, email: user.email }));
        }

        // 2. Deadline and Registration status check
        const checkStatus = async () => {
            if (!token) return;
            try {
                const [deadlineRes, statusRes] = await Promise.all([
                    axios.get(`/api/v1/submission/token-info?token=${token}`),
                    submissionAPI.getStudentStatus(token)
                ]);

                setDeadlineInfo(deadlineRes.data);

                // If already registered, don't show this page
                if (statusRes.data.is_registered) {
                    navigate(`/submit?token=${token}`);
                }
            } catch (err) {
                console.error('Initial check failed:', err);
            }
        };

        checkStatus();
    }, [isAuthenticated, authLoading, user, token, navigate]);

    const handleLogoutAndRestart = async () => {
        await logout();
        navigate(`/submit${token ? `?token=${token}` : ''}`);
    };

    const handleChange = (e) => {
        // (Keep existing handleChange logic...)
        const { name, value } = e.target;
        if (name === 'student_id') {
            const digits = value.replace(/\D/g, '');
            let formatted = digits;
            if (digits.length > 2 && digits.length <= 6) {
                formatted = `${digits.slice(0, 2)}-${digits.slice(2)}`;
            } else if (digits.length > 6) {
                formatted = `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 9)}`;
            }
            setFormData(prev => ({ ...prev, [name]: formatted }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
        setError(null);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!token) {
            setError('Invalid submission session. Please use the link provided by your professor.');
            return;
        }

        setLoading(true);
        try {
            await submissionAPI.registerStudent({
                token,
                student_id: formData.student_id,
                first_name: formData.first_name,
                last_name: formData.last_name,
                email: formData.email
            });

            navigate(`/submit?token=${token}`);
        } catch (err) {
            setError(err.response?.data?.error || 'Account linking failed. Ensure your ID is in the class list.');
        } finally {
            setLoading(false);
        }
    };

    if (authLoading) return <div className="loading">Checking authentication...</div>;

    return (
        <div className="submit-page">
            <div className="submit-page-header">
                <div className="branding">
                    <FileText size={32} className="brand-icon" />
                    <h1 className="brand-name">MetaDoc</h1>
                </div>
                <p className="page-subtitle">Account Identification</p>
            </div>

            <Card className="submit-container" style={{ maxWidth: '600px' }}>
                <div className="submit-header" style={{ textAlign: 'center' }}>
                    <h2>Verify Class List</h2>
                    <p style={{ color: 'var(--color-gray-600)', marginBottom: 'var(--spacing-md)' }}>
                        Gmail account <strong>{user?.email}</strong> is not yet linked to an ID.
                        Please provide your details as they appear in the class list.
                    </p>
                    {deadlineInfo && (
                        <div className="deadline-badge" style={{
                            display: 'inline-block',
                            backgroundColor: 'rgba(128, 0, 32, 0.1)',
                            color: 'var(--color-maroon)',
                            padding: '4px 12px',
                            borderRadius: '16px',
                            fontSize: '0.8rem',
                            fontWeight: '600',
                            marginTop: '8px'
                        }}>
                            Folder: {deadlineInfo.title}
                        </div>
                    )}
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <Input
                        label="ID NUMBER"
                        name="student_id"
                        value={formData.student_id}
                        onChange={handleChange}
                        placeholder="e.g., 22-1686-452"
                        required
                        icon={FileText}
                    />

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-md)' }}>
                        <Input
                            label="FIRST NAME"
                            name="first_name"
                            value={formData.first_name}
                            onChange={handleChange}
                            placeholder="Enter your first name"
                            required
                            icon={User}
                        />
                        <Input
                            label="LAST NAME"
                            name="last_name"
                            value={formData.last_name}
                            onChange={handleChange}
                            placeholder="Enter your last name"
                            required
                            icon={User}
                        />
                    </div>



                    <Input
                        label="EMAIL ADDRESS"
                        name="email"
                        type="email"
                        value={formData.email}
                        onChange={handleChange}
                        placeholder="your.email@gmail.com"
                        required
                        icon={Mail}
                        disabled={false} // Allow manual entry or correction
                    />

                    {error && (
                        <div className="alert alert-error">
                            <AlertCircle size={20} />
                            <p>{error}</p>
                        </div>
                    )}

                    <Button
                        type="submit"
                        size="large"
                        loading={loading}
                        icon={CheckCircle}
                        className="w-full"
                        style={{ marginTop: 'var(--spacing-md)' }}
                    >
                        Register Student Detail
                    </Button>
                </form>

                <div style={{ marginTop: 'var(--spacing-lg)', textAlign: 'center', borderTop: '1px solid var(--color-gray-100)', paddingTop: 'var(--spacing-lg)' }}>
                    <p style={{ fontSize: '0.85rem', color: 'var(--color-gray-500)', marginBottom: 'var(--spacing-sm)' }}>
                        Logged in as {user?.email}
                    </p>
                    <button
                        onClick={handleLogoutAndRestart}
                        style={{
                            color: 'var(--color-maroon)',
                            fontWeight: '600',
                            fontSize: '0.875rem',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            textDecoration: 'underline'
                        }}
                    >
                        Try different Gmail account
                    </button>
                </div>
            </Card>
        </div>
    );
};

export default StudentRegister;
