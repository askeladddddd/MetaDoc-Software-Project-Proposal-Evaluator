import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { dashboardAPI, authAPI, submissionAPI } from '../services/api';
import {
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  Calendar,
  ArrowRight,
  ExternalLink,
  Copy,
  RefreshCw,
  Users,
} from 'lucide-react';
import Table from '../components/common/Table/Table';
import Card from '../components/common/Card/Card';
import Badge from '../components/common/Badge/Badge';
import Modal from '../components/common/Modal/Modal';
import '../styles/Dashboard.css';

const RECENT_LINKS_STORAGE_KEY = 'metadoc_recent_submission_links';

const loadActiveRecentLinks = () => {
  try {
    const raw = localStorage.getItem(RECENT_LINKS_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const now = Date.now();
    return parsed.filter((item) => {
      const expiry = new Date(item.expires_at).getTime();
      return Number.isFinite(expiry) && expiry > now;
    });
  } catch {
    return [];
  }
};

const formatStudentId = (input) => {
  if (!input) return 'N/A';
  const digits = input.replace(/\D/g, '');
  const limited = digits.slice(0, 9);
  let result = '';
  if (limited.length > 0) {
    result += limited.slice(0, 2);
    if (limited.length > 2) {
      result += '-' + limited.slice(2, 6);
      if (limited.length > 6) {
        result += '-' + limited.slice(6, 9);
      }
    }
  }
  return result || input;
};

const formatDateTime = (value) => {
  if (!value) return { date: '-', time: '-' };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: '-', time: '-' };
  return {
    date: date.toLocaleDateString('en-US'),
    time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
  };
};

const formatFilenameInitials = (value = '', maxChars = 20) => {
  const raw = String(value || 'Untitled').trim();
  if (raw.length <= maxChars) return raw;

  const dotIndex = raw.lastIndexOf('.');
  const extension = dotIndex > 0 ? raw.slice(dotIndex) : '';
  const baseName = dotIndex > 0 ? raw.slice(0, dotIndex) : raw;
  const chunks = baseName.split(/[\s._-]+/).filter(Boolean);

  let initials = chunks.map((chunk) => chunk.charAt(0).toUpperCase()).join('');
  if (!initials) initials = baseName.charAt(0).toUpperCase() || 'F';

  return `${initials.slice(0, 10)}${extension}`;
};

const resolveSubmissionTimeliness = (submission) => {
  const submittedAt = submission?.created_at ? new Date(submission.created_at) : null;
  const deadlineAt = submission?.deadline_datetime ? new Date(submission.deadline_datetime) : null;

  if (
    submittedAt &&
    deadlineAt &&
    !Number.isNaN(submittedAt.getTime()) &&
    !Number.isNaN(deadlineAt.getTime())
  ) {
    return submittedAt <= deadlineAt ? 'On Time' : 'Late';
  }

  return submission?.status || 'Unknown';
};

const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submissionToken, setSubmissionToken] = useState(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [copiedTarget, setCopiedTarget] = useState(null);
  const [deadlines, setDeadlines] = useState([]);
  const [selectedDeadline, setSelectedDeadline] = useState('');
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState({ title: '', body: '' });
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [recentGeneratedLinks, setRecentGeneratedLinks] = useState(() => loadActiveRecentLinks());
  const [recentLinksSearch, setRecentLinksSearch] = useState('');

  useEffect(() => {
    fetchOverview();
    fetchDeadlines();
    fetchGeneratedLinks();
  }, []);

  useEffect(() => {
    localStorage.setItem(RECENT_LINKS_STORAGE_KEY, JSON.stringify(recentGeneratedLinks));
  }, [recentGeneratedLinks]);

  const fetchOverview = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await dashboardAPI.getOverview();
      setOverview(response.data);
    } catch (err) {
      console.error('Failed to fetch overview:', err);
      setError('Failed to load dashboard data');
      setOverview({
        total_submissions: 0,
        pending_submissions: 0,
        completed_submissions: 0,
        active_deadlines: 0,
        recent_submissions: [],
        upcoming_deadlines: []
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchDeadlines = async () => {
    try {
      const response = await dashboardAPI.getDeadlines(false);
      setDeadlines(response.data.deadlines || []);
    } catch (err) {
      console.error('Failed to fetch deadlines:', err);
    }
  };

  const fetchGeneratedLinks = async () => {
    try {
      const response = await submissionAPI.getGeneratedLinks();
      const links = Array.isArray(response.data?.links) ? response.data.links : [];
      setRecentGeneratedLinks(links);
    } catch (err) {
      // Keep local cached links if the request fails.
      console.error('Failed to fetch generated links:', err);
    }
  };

  const generateToken = async () => {
    if (deadlines.length === 0) {
      setErrorMessage({
        title: 'No Deliverable Found',
        body: 'You need to create a deliverable first before generating a submission link. Deliverables help track and organize student submissions effectively.'
      });
      setShowErrorModal(true);
      return;
    }

    if (!selectedDeadline) {
      setErrorMessage({
        title: 'No Deliverable Selected',
        body: 'Please select a deliverable from the dropdown before generating a submission link. This helps students know which deliverable their submission is for.'
      });
      setShowErrorModal(true);
      return;
    }

    try {
      setTokenLoading(true);
      const response = await authAPI.generateSubmissionToken(selectedDeadline);
      setSubmissionToken(response.data.token);

      const selectedDeadlineData = deadlines.find(
        (deadline) => String(deadline.id) === String(selectedDeadline)
      );

      const generatedEntry = {
        deadline_id: selectedDeadlineData?.id ?? selectedDeadline,
        title: selectedDeadlineData?.title || response.data?.deadline?.title || 'Untitled Deliverable',
        token: response.data.token,
        url: response.data.submission_url || `${window.location.origin}/submit?token=${response.data.token}`,
        expires_at: response.data.expires_at,
        generated_at: response.data.generated_at || new Date().toISOString(),
      };

      setRecentGeneratedLinks((prev) => {
        const now = Date.now();
        const active = prev.filter((item) => {
          const expiry = new Date(item.expires_at).getTime();
          return Number.isFinite(expiry) && expiry > now;
        });

        const filtered = active.filter(
          (item) => String(item.deadline_id) !== String(generatedEntry.deadline_id)
        );

        return [generatedEntry, ...filtered].slice(0, 12);
      });

      // Sync links from backend so generated links persist across logins/devices.
      fetchGeneratedLinks();
      setShowSuccessModal(true);
    } catch (err) {
      console.error('Failed to generate token:', err);
      const errorMsg = err.response?.data?.error || 'Failed to generate submission token. Please try again.';
      setErrorMessage({
        title: 'Token Generation Failed',
        body: errorMsg
      });
      setShowErrorModal(true);
    } finally {
      setTokenLoading(false);
    }
  };

  const copySubmissionLink = () => {
    if (!submissionToken) {
      alert('Please generate a token first!');
      return;
    }
    const link = `${window.location.origin}/submit?token=${submissionToken}`;
    navigator.clipboard.writeText(link);
    setCopiedTarget('current');
    setTimeout(() => {
      setCopiedTarget((prev) => (prev === 'current' ? null : prev));
    }, 2000);
  };

  const copyDirectLink = async (link, targetKey) => {
    await navigator.clipboard.writeText(link);
    setCopiedTarget(targetKey);
    setTimeout(() => {
      setCopiedTarget((prev) => (prev === targetKey ? null : prev));
    }, 2000);
  };

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="spinner"></div>
        <p>Loading dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-error">
        <AlertCircle size={48} />
        <h3>{error}</h3>
      </div>
    );
  }

  const resultColumns = [
    {
      header: 'Deliverable',
      key: 'deliverable',
      render: (submission) => (
        <div className="file-info-cell">
          <div className="file-icon-mini">
            <Calendar size={18} />
          </div>
          <span className="file-name" title={submission.deliverable || 'Untitled Deliverable'}>
            {submission.deliverable || 'Untitled Deliverable'}
          </span>
        </div>
      )
    },
    {
      header: 'File Name',
      key: 'filename',
      render: (submission) => (
        <div className="file-info-cell">
          <div className="file-icon-mini">
            <FileText size={18} />
          </div>
          <span className="file-name" title={submission.file_name || submission.original_filename}>
            {formatFilenameInitials(submission.file_name || submission.original_filename || 'Untitled file', 20)}
          </span>
        </div>
      )
    },
    {
      header: 'Team Code',
      key: 'team_code',
      render: (submission) => submission.team_code || '-'
    },
    {
      header: 'Student ID',
      key: 'student_id',
      render: (submission) => (
        <span className="student-id-pill">
          <Users size={14} className="icon-subtle" />
          {formatStudentId(submission.student_id)}
        </span>
      )
    },
    {
      header: 'Date Submitted',
      key: 'date',
      render: (submission) => {
        const submitted = formatDateTime(submission.created_at);
        return (
          <div className="date-cell">
            <span>{submitted.date}</span>
            <span className="time-subtle">{submitted.time}</span>
          </div>
        );
      }
    },
    {
      header: 'Status',
      key: 'status',
      render: (submission) => {
        const statusLabel = resolveSubmissionTimeliness(submission);
        return (
        <Badge variant={getStatusColor(statusLabel)}>
          {statusLabel}
        </Badge>
      );
      }
    }
  ];

  const deadlineColumns = [
    {
      header: 'Deliverable Title',
      key: 'title',
      render: (deadline) => (
        <div className="file-info-cell">
          <div className="file-icon-mini">
            <Calendar size={18} />
          </div>
          <span className="file-name" title={deadline.title}>
            {deadline.title}
          </span>
        </div>
      )
    },
    {
      header: 'Due Date',
      key: 'duedate',
      render: (deadline) => (
        <div className="date-cell">
          <span>{new Date(deadline.deadline_datetime).toLocaleDateString()}</span>
          <span className="time-subtle">
            {getTimeRemaining(deadline.deadline_datetime)}
          </span>
        </div>
      )
    },
    {
      header: 'Submissions',
      key: 'submissions',
      render: (deadline) => (
        <Badge variant="info">
          {deadline.submission_count || 0} Submissions
        </Badge>
      )
    },
    {
      header: 'Status',
      key: 'status',
      render: (deadline) => {
        const isClosed = new Date(deadline.deadline_datetime) < new Date();
        return (
          <Badge variant={isClosed ? 'error' : 'success'}>
            {isClosed ? 'Closed' : 'Active'}
          </Badge>
        );
      }
    }
  ];

  const stats = [
    {
      label: 'Total Files',
      value: overview?.total_submissions || 0,
      icon: FileText,
      color: 'maroon',
      change: null,
      route: '/dashboard/reports',
    },
    {
      label: 'Active Deliverables',
      value: overview?.active_deadlines || 0,
      icon: Calendar,
      color: 'info',
      change: null,
      route: '/dashboard/deliverables',
      routeState: { activeOnly: true },
    },
  ];

  const modalFooter = errorMessage.title === 'No Deliverable Found' ? (
    <button
      type="button"
      className="btn btn-primary"
      onClick={() => {
        setShowErrorModal(false);
        navigate('/dashboard/deliverables');
      }}
    >
      <Calendar size={18} />
      Go to Deliverables
    </button>
  ) : (
    <button
      type="button"
      className="btn btn-primary"
      onClick={() => setShowErrorModal(false)}
    >
      OK
    </button>
  );

  const hasExistingLinkForSelected = recentGeneratedLinks.some(
    (item) => String(item.deadline_id) === String(selectedDeadline)
  );

  const formatGeneratedDate = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString();
  };

  const filteredRecentGeneratedLinks = recentGeneratedLinks.filter((entry) =>
    String(entry.title || '')
      .toLowerCase()
      .includes(recentLinksSearch.trim().toLowerCase())
  );

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <div>
          <h1>Dashboard Overview</h1>
          <p className="dashboard-subtitle">
            Welcome back! Monitor student SPP submissions and track deadlines.
          </p>
        </div>
      </div>

      <div className="submission-link-banner-compact">
        <div className="compact-header">
          <ExternalLink size={20} />
          <h3>Student Submission Portal</h3>
        </div>

        <div className="compact-content">
          <select
            value={selectedDeadline}
            onChange={(e) => {
              setSelectedDeadline(e.target.value);
              setSubmissionToken(null);
              setCopiedTarget(null);
            }}
            className="compact-select"
          >
            <option value="">No Deliverable</option>
            {deadlines.map((deadline) => (
              <option key={deadline.id} value={deadline.id}>
                {deadline.title} - {new Date(deadline.deadline_datetime).toLocaleDateString()}
              </option>
            ))}
          </select>

          <button
            className="btn-compact btn-generate"
            onClick={generateToken}
            disabled={tokenLoading}
          >
            {tokenLoading ? <RefreshCw size={16} className="spinning" /> : <ExternalLink size={16} />}
            {hasExistingLinkForSelected ? 'Generate Again' : 'Generate Link'}
          </button>

          {submissionToken && (
            <>
              <button
                className="btn-compact btn-copy"
                onClick={copySubmissionLink}
              >
                <Copy size={16} />
                {copiedTarget === 'current' ? 'Copied!' : 'Copy'}
              </button>
            </>
          )}
        </div>

        {submissionToken && (
          <div className="compact-token">
            <code>{window.location.origin}/submit?token={submissionToken}</code>
          </div>
        )}
      </div>

      <Card className="recent-links-card">
        <div className="recent-links-header">
          <h3>Generated Links</h3>
          <p>Synced to your professor account and removed automatically when expired.</p>
        </div>

        {recentGeneratedLinks.length > 0 && (
          <div className="recent-links-search-wrap">
            <input
              type="text"
              className="recent-links-search"
              value={recentLinksSearch}
              onChange={(e) => setRecentLinksSearch(e.target.value)}
              placeholder="Search deliverable title..."
            />
          </div>
        )}

        {recentGeneratedLinks.length === 0 ? (
          <p className="recent-links-empty">No active generated links yet.</p>
        ) : filteredRecentGeneratedLinks.length === 0 ? (
          <p className="recent-links-empty">No generated links found for that deliverable title.</p>
        ) : (
          <div className="recent-links-list">
            {filteredRecentGeneratedLinks.map((entry) => (
              <div key={`${entry.deadline_id}-${entry.token}`} className="recent-link-row">
                <div className="recent-link-main">
                  <p className="recent-link-title">{entry.title}</p>
                  <code className="recent-link-url">{entry.url}</code>
                </div>
                <div className="recent-link-side">
                  <span className="recent-link-meta">Generated: {formatGeneratedDate(entry.generated_at)}</span>
                  <span className="recent-link-meta">Expiry: {formatGeneratedDate(entry.expires_at)}</span>
                  <button
                    className="btn-compact btn-copy btn-copy-inline"
                    onClick={() => copyDirectLink(entry.url, entry.token)}
                  >
                    <Copy size={14} />
                    {copiedTarget === entry.token ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="stats-grid">
        {stats.map((stat, index) => (
          <div
            key={index}
            className={`stat-card stat-${stat.color} ${stat.route ? 'is-clickable' : ''}`}
            onClick={() => stat.route && navigate(stat.route, stat.routeState ? { state: stat.routeState } : undefined)}
            onKeyDown={(e) => {
              if (!stat.route) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                navigate(stat.route, stat.routeState ? { state: stat.routeState } : undefined);
              }
            }}
            role={stat.route ? 'button' : undefined}
            tabIndex={stat.route ? 0 : undefined}
          >
            <div className="stat-icon">
              <stat.icon size={24} />
            </div>
            <div className="stat-content">
              <p className="stat-label">{stat.label}</p>
              <div className="stat-value-row">
                <h3 className="stat-value">{stat.value}</h3>
                {stat.change && (
                  <span className="stat-change">
                    <TrendingUp size={14} />
                    {stat.change}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="dashboard-section">
        <div className="section-header">
          <h2>Recent Submission</h2>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate('/dashboard/reports')}
          >
            View All
            <ArrowRight size={16} />
          </button>
        </div>

        <Card>
          <Table
            columns={resultColumns.map(c => ({ header: c.header, key: c.key }))}
            data={overview?.recent_submissions || []}
            renderCell={(item, column) => {
              const colDef = resultColumns.find(c => c.key === column.key);
              return colDef ? colDef.render(item) : null;
            }}
            onRowClick={(item) => navigate(`/dashboard/submissions/${item.id}`, {
              state: {
                from: location.pathname,
                fromState: location.state || {},
              },
            })}
            emptyMessage="No SPP submissions yet"
          />
        </Card>
      </div>

      <div className="dashboard-section">
        <div className="section-header">
          <h2>Upcoming Deliverable Deadlines</h2>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate('/dashboard/deliverables')}
          >
            Manage
            <ArrowRight size={16} />
          </button>
        </div>

        <Card>
          <Table
            columns={deadlineColumns.map(c => ({ header: c.header, key: c.key }))}
            data={overview?.upcoming_deadlines || []}
            renderCell={(item, column) => {
              const colDef = deadlineColumns.find(c => c.key === column.key);
              return colDef ? colDef.render(item) : null;
            }}
            onRowClick={(item) => navigate('/dashboard/deliverables', { state: { deadlineId: item.id } })}
            emptyMessage="No upcoming deliverables"
          />
        </Card>
      </div>

      <Modal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        title={errorMessage.title}
        type="error"
        footer={modalFooter}
      >
        <p>{errorMessage.body}</p>
      </Modal>

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="modal-overlay" onClick={() => setShowSuccessModal(false)}>
          <div className="modal-content success-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="success-icon">
                <CheckCircle size={24} />
              </div>
              <h2>Generating Successful!</h2>
            </div>
            <div className="modal-body">
              <p>The submission link has been successfully generated.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setShowSuccessModal(false)}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const getStatusColor = (status) => {
  const colors = {
    'on time': 'success',
    late: 'error',
    pending: 'warning',
    processing: 'info',
    completed: 'success',
    failed: 'error',
    warning: 'warning',
  };
  return colors[String(status || '').toLowerCase()] || 'info';
};

const getTimeRemaining = (deadlineDate) => {
  const now = new Date();
  const deadline = new Date(deadlineDate);
  const diff = deadline - now;

  if (diff < 0) return 'Overdue';

  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 24) return `${hours}h remaining`;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(deadline);
  target.setHours(0, 0, 0, 0);

  const calendarDays = Math.round((target - today) / (1000 * 60 * 60 * 24));

  if (calendarDays === 1) return 'Tomorrow';
  return `${calendarDays} days`;
};

export default Dashboard;
