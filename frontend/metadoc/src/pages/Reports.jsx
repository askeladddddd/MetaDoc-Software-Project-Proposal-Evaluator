import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Search,
    FileText,
    Hash,
    Calendar,
    ChevronRight,
    Trash2,
    CheckCircle,
    AlertTriangle,
    TrendingUp,
    X,
    AlertCircle
} from '../components/common/Icons';
import { dashboardAPI } from '../services/api';
import { useLoadingState } from '../hooks/useLoadingState';
import '../styles/Reports.css';

const formatStudentId = (input) => {
    if (!input) return 'N/A';
    const digits = input.replace(/\D/g, '').slice(0, 9);
    if (digits.length <= 2) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 9)}`;
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

const resolveSchoolYear = () => {
    // SY follows the active school year label based on current year (ex: 2026-2027).
    const currentYear = new Date().getFullYear();
    return `${currentYear}-${currentYear + 1}`;
};

const resolveSemester = (value) => {
    const date = value ? new Date(value) : new Date();
    const normalizedDate = Number.isNaN(date.getTime()) ? new Date() : date;
    const month = normalizedDate.getMonth();

    // 1ST semester: August to December, 2ND semester: January to July.
    return month >= 7 ? '1ST' : '2ND';
};

const getStatusMeta = (status = '') => {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'late') {
        return { text: 'LATE', className: 'status-late', Icon: AlertTriangle };
    }
    return { text: 'ON TIME', className: 'status-ontime', Icon: CheckCircle };
};

const resolveSubmissionStatusMeta = (submission, deadlineDatetimeMap) => {
    if (!submission) return getStatusMeta('on_time');

    if (submission.is_late === true) {
        return getStatusMeta('late');
    }

    if (String(submission.status || '').toLowerCase() === 'late') {
        return getStatusMeta('late');
    }

    const deadlineKey = submission.deadline_id !== undefined && submission.deadline_id !== null
        ? String(submission.deadline_id)
        : null;
    const deadlineValue = deadlineKey ? deadlineDatetimeMap.get(deadlineKey) : null;

    if (deadlineValue && submission.created_at) {
        const submittedAt = new Date(submission.created_at);
        const deadlineAt = new Date(deadlineValue);
        if (!Number.isNaN(submittedAt.getTime()) && !Number.isNaN(deadlineAt.getTime()) && submittedAt > deadlineAt) {
            return getStatusMeta('late');
        }
    }

    return getStatusMeta('on_time');
};

const getDeliverableTitle = (submission, deadlineTitleMap) => {
    const directId = submission?.deadline_id;
    const normalizedId = directId !== undefined && directId !== null ? String(directId) : null;

    return (
        deadlineTitleMap.get(directId) ||
        (normalizedId ? deadlineTitleMap.get(normalizedId) : null) ||
        submission.deadline_title ||
        submission.title ||
        'Untitled Deliverable'
    );
};

const normalizeContributorRole = (role) => {
    const normalized = String(role || '').trim().toLowerCase();
    if (normalized === 'author' || normalized === 'owner') return 'Author';
    if (['editor', 'last editor', 'writer', 'contributor', 'commenter', 'reader'].includes(normalized)) return 'Editor';
    return 'Editor';
};

const isLongFilename = (value = '') => String(value).length > 20;

const formatFilenameInitials = (value = '', maxChars = 20) => {
    const raw = String(value || 'Untitled').trim();
    if (raw.length <= maxChars) return raw;

    const dotIndex = raw.lastIndexOf('.');
    const extension = dotIndex > 0 ? raw.slice(dotIndex) : '';
    const baseName = dotIndex > 0 ? raw.slice(0, dotIndex) : raw;
    const chunks = baseName.split(/[\s._-]+/).filter(Boolean);

    let initials = chunks.map((chunk) => chunk.charAt(0).toUpperCase()).join('');
    if (!initials) initials = baseName.charAt(0).toUpperCase() || 'F';

    const compactInitials = initials.slice(0, 10);
    return `${compactInitials}${extension}`;
};

const formatDeliverableInitials = (value = '', maxChars = 10) => {
    const raw = String(value || 'Untitled Deliverable').trim();
    if (raw.length <= maxChars) return raw;
    const chunks = raw.split(/[\s._-]+/).filter(Boolean);

    let initials = chunks.map((chunk) => chunk.charAt(0).toUpperCase()).join('');
    if (!initials) initials = raw.charAt(0).toUpperCase() || 'D';

    return initials.slice(0, maxChars);
};

const Reports = () => {
    const navigate = useNavigate();
    const [submissions, setSubmissions] = useState([]);
    const [deadlines, setDeadlines] = useState([]);
    const [students, setStudents] = useState([]);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);
    const { showLongLoading } = useLoadingState(loading);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortOption, setSortOption] = useState('none');
    const [teamCodeFilter, setTeamCodeFilter] = useState('none');
    const [deliverableFilter, setDeliverableFilter] = useState('none');
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    const [previewSubmission, setPreviewSubmission] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [showFilenameModal, setShowFilenameModal] = useState(false);
    const [selectedFilename, setSelectedFilename] = useState('');

    const deadlineTitleMap = useMemo(() => {
        const map = new Map();
        deadlines.forEach((deadline) => {
            const title = deadline.title || 'Untitled Deliverable';
            map.set(deadline.id, title);
            map.set(String(deadline.id), title);
        });
        return map;
    }, [deadlines]);

    const deadlineDatetimeMap = useMemo(() => {
        const map = new Map();
        deadlines.forEach((deadline) => {
            if (deadline?.deadline_datetime) {
                map.set(String(deadline.id), deadline.deadline_datetime);
            }
        });
        return map;
    }, [deadlines]);

    const teamCodeOptions = useMemo(() => {
        const codes = students
            .map((student) => String(student.team_code || '').trim())
            .filter(Boolean);

        return [...new Set(codes)].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
    }, [students]);

    const deliverableOptions = useMemo(() => {
        return [...deadlines]
            .map((deadline) => ({
                id: String(deadline.id),
                title: deadline.title || 'Untitled Deliverable',
            }))
            .sort((left, right) => left.title.localeCompare(right.title));
    }, [deadlines]);

    const fetchAllSubmissions = async () => {
        try {
            setLoading(true);
            const [submissionsResponse, deadlinesResponse, studentsResponse] = await Promise.all([
                dashboardAPI.getSubmissions({
                    page: 1,
                    per_page: 2000,
                }),
                dashboardAPI.getDeadlines(true),
                dashboardAPI.getDeadlineStudents(),
            ]);

            setSubmissions(submissionsResponse.data?.submissions || []);
            setDeadlines(deadlinesResponse.data?.deadlines || []);
            setStudents(studentsResponse.data?.students || []);
        } catch (error) {
            console.error('Failed to fetch submissions for reports:', error);
            setError('Failed to Connect to Server');
            setSubmissions([]);
            setDeadlines([]);
            setStudents([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAllSubmissions();
    }, []);

    const visibleRows = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        let rows = [...submissions];

        if (term) {
            rows = rows.filter((submission) => {
                const deliverableTitle = getDeliverableTitle(submission, deadlineTitleMap);
                const filename = submission.filename || submission.original_filename || '';
                const studentId = submission.student_id || '';
                const studentName = submission.student_name || '';
                return (
                    deliverableTitle.toLowerCase().includes(term) ||
                    filename.toLowerCase().includes(term) ||
                    studentId.toLowerCase().includes(term) ||
                    studentName.toLowerCase().includes(term)
                );
            });
        }

        if (teamCodeFilter !== 'none') {
            rows = rows.filter((submission) => String(submission.team_code || '').trim() === teamCodeFilter);
        }

        if (deliverableFilter !== 'none') {
            rows = rows.filter((submission) => String(submission.deadline_id || '') === deliverableFilter);
        }

        if (sortOption === 'newest') {
            rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        } else if (sortOption === 'oldest') {
            rows.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        } else if (sortOption === 'a_z') {
            rows.sort((a, b) => {
                const left = getDeliverableTitle(a, deadlineTitleMap).toLowerCase();
                const right = getDeliverableTitle(b, deadlineTitleMap).toLowerCase();
                return left.localeCompare(right);
            });
        }

        return rows;
    }, [submissions, searchTerm, sortOption, teamCodeFilter, deliverableFilter, deadlineTitleMap]);

    const handleDelete = async (submissionId) => {
        const confirmed = window.confirm('Delete this submitted file?');
        if (!confirmed) return;

        try {
            await dashboardAPI.deleteSubmission(submissionId);
            setSubmissions((prev) => prev.filter((item) => item.id !== submissionId));
        } catch (error) {
            console.error('Failed to delete submission:', error);
            alert('Unable to delete this submission. Please try again.');
        }
    };

    const openPreview = async (event, submission) => {
        event.stopPropagation();
        setPreviewSubmission(submission);
        setShowPreviewModal(true);
        setPreviewLoading(true);

        try {
            const response = await dashboardAPI.getSubmissionDetail(submission.id);
            setPreviewSubmission(response.data);
        } catch (error) {
            console.error('Failed to load preview details:', error);
        } finally {
            setPreviewLoading(false);
        }
    };

    const closePreview = () => {
        setShowPreviewModal(false);
        setPreviewSubmission(null);
        setPreviewLoading(false);
    };

    const openFilenameModal = (event, filename) => {
        event.stopPropagation();
        setSelectedFilename(filename || 'Untitled');
        setShowFilenameModal(true);
    };

    const closeFilenameModal = () => {
        setShowFilenameModal(false);
        setSelectedFilename('');
    };

    if (error) {
        return (
            <div className="dashboard-error" style={{ height: '70vh' }}>
                <AlertCircle size={48} />
                <h3>{error}</h3>
                <p>Unable to load reports data. Please check your backend connection and try again.</p>
            </div>
        );
    }

    return (
        <div className="reports-page fade-in">
            <div className="reports-container">
                <div className="submissions-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--spacing-xl)' }}>
                    <div>
                        <h1>Reports</h1>
                        <p>View all submitted files by deliverable title, track submission details, and manage report records in one place.</p>
                    </div>
                </div>

                <div className="reports-toolbar">
                    <div className="search-input-wrapper">
                        <Search size={18} className="search-icon" />
                        <input
                            type="text"
                            className="search-input"
                            placeholder="Search title, student ID, student name..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <select
                        className="filter-select team-code-filter-select"
                        value={teamCodeFilter}
                        onChange={(e) => setTeamCodeFilter(e.target.value)}
                    >
                        <option value="none">Select Code</option>
                        {teamCodeOptions.map((teamCode) => (
                            <option key={teamCode} value={teamCode}>{teamCode}</option>
                        ))}
                    </select>

                    <select
                        className="filter-select deliverable-filter-select"
                        value={deliverableFilter}
                        onChange={(e) => setDeliverableFilter(e.target.value)}
                    >
                        <option value="none">Select Title</option>
                        {deliverableOptions.map((deliverable) => (
                            <option key={deliverable.id} value={deliverable.id}>{deliverable.title}</option>
                        ))}
                    </select>

                    <select
                        className="filter-select"
                        value={sortOption}
                        onChange={(e) => setSortOption(e.target.value)}
                    >
                        <option value="none">Sort By</option>
                        <option value="newest">Newest</option>
                        <option value="oldest">Oldest</option>
                        <option value="a_z">A-Z (Title)</option>
                    </select>
                </div>

                <div className="table-container reports-table-wrap">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Title</th>
                                <th>File Name</th>
                                <th>Student ID</th>
                                <th>Student Name</th>
                                <th>Date Submitted</th>
                                <th>Last Modified</th>
                                <th>Course &amp; Year</th>
                                <th>Team Code</th>
                                <th>SY</th>
                                <th>Semester</th>
                                <th>Status</th>
                                <th className="text-right">Actions</th>
                            </tr>
                        </thead>

                        <tbody>
                            {loading && (
                                showLongLoading ? (
                                    <tr>
                                        <td colSpan="12" style={{ padding: '3rem 0' }}>
                                            <div className="spinner-container-maroon">
                                                <div className="spinner-maroon"></div>
                                                <p style={{ marginTop: '1rem', color: 'var(--color-maroon)', fontWeight: '600' }}>Loading Reports...</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    [...Array(10)].map((_, i) => (
                                        <tr key={`skeleton-${i}`} className="skeleton-row">
                                            <td><div className="skeleton skeleton-cell"></div></td>
                                            <td>
                                                <div className="skeleton-flex">
                                                    <div className="skeleton skeleton-circle"></div>
                                                    <div className="skeleton skeleton-cell"></div>
                                                </div>
                                            </td>
                                            <td><div className="skeleton skeleton-cell-sm"></div></td>
                                            <td><div className="skeleton skeleton-cell"></div></td>
                                            <td><div className="skeleton skeleton-cell"></div></td>
                                            <td><div className="skeleton skeleton-cell"></div></td>
                                            <td><div className="skeleton skeleton-cell-sm"></div></td>
                                            <td><div className="skeleton skeleton-cell-sm"></div></td>
                                            <td><div className="skeleton skeleton-cell-sm"></div></td>
                                            <td><div className="skeleton skeleton-cell-sm"></div></td>
                                            <td><div className="skeleton skeleton-cell" style={{ width: '60px', height: '24px', borderRadius: '12px' }}></div></td>
                                            <td className="text-right">
                                                <div className="skeleton-flex" style={{ justifyContent: 'flex-end' }}>
                                                    <div className="skeleton skeleton-circle" style={{ width: '20px', height: '20px' }}></div>
                                                    <div className="skeleton skeleton-circle" style={{ width: '20px', height: '20px' }}></div>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )
                            )}

                            {!loading && visibleRows.length === 0 && (
                                <tr>
                                    <td colSpan="12" className="empty-table-state">No submitted files found.</td>
                                </tr>
                            )}

                            {!loading && visibleRows.map((submission) => {
                                const submitted = formatDateTime(submission.created_at);
                                const modified = formatDateTime(submission.last_activity);
                                const status = resolveSubmissionStatusMeta(submission, deadlineDatetimeMap);
                                const deliverableTitle = getDeliverableTitle(submission, deadlineTitleMap);
                                const displayDeliverableTitle = formatDeliverableInitials(deliverableTitle, 10);
                                const filename = submission.filename || submission.original_filename || 'Untitled';
                                const displayFilename = formatFilenameInitials(filename, 20);

                                return (
                                    <tr key={submission.id}>
                                        <td>
                                            <span className="file-name" title={deliverableTitle}>{displayDeliverableTitle}</span>
                                        </td>

                                        <td>
                                            <div className="file-info-cell">
                                                <button
                                                    type="button"
                                                    className="file-icon-mini reports-preview-trigger"
                                                    title="Preview file"
                                                    onClick={(event) => openPreview(event, submission)}
                                                >
                                                    <FileText size={14} />
                                                </button>
                                                <div className="reports-file-cell">
                                                    <span className="file-name" title={filename}>{displayFilename}</span>
                                                    {isLongFilename(filename) && (
                                                        <button
                                                            type="button"
                                                            className="reports-see-more"
                                                            onClick={(event) => openFilenameModal(event, filename)}
                                                        >
                                                            See more
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </td>

                                        <td>
                                            <span className="student-id-pill">
                                                <Hash size={12} className="icon-subtle" />
                                                {formatStudentId(submission.student_id || '')}
                                            </span>
                                        </td>

                                        <td>{submission.student_name || 'N/A'}</td>

                                        <td>
                                            <div className="date-cell">
                                                <span><Calendar size={12} className="icon-subtle" /> {submitted.date}</span>
                                                <span className="time-subtle">{submitted.time}</span>
                                            </div>
                                        </td>

                                        <td>
                                            <div className="date-cell">
                                                <span><Calendar size={12} className="icon-subtle" /> {modified.date}</span>
                                                <span className="time-subtle">{modified.time}</span>
                                            </div>
                                        </td>

                                        <td>{submission.course_year || 'N/A'}</td>
                                        <td>{submission.team_code || 'N/A'}</td>
                                        <td>{resolveSchoolYear()}</td>
                                        <td>{submission.semester || resolveSemester(submission.created_at)}</td>

                                        <td>
                                            <span className={`status-pill ${status.className}`}>
                                                <status.Icon size={12} />
                                                {status.text}
                                            </span>
                                        </td>

                                        <td className="actions-cell text-right">
                                            <button
                                                type="button"
                                                className="btn-icon btn-view"
                                                onClick={() => navigate(`/dashboard/submissions/${submission.id}`, { state: { from: '/dashboard/reports', fromState: {} } })}
                                                title="View Submission Details"
                                            >
                                                <ChevronRight size={16} />
                                            </button>
                                            <button
                                                type="button"
                                                className="btn-icon btn-delete-row"
                                                onClick={() => handleDelete(submission.id)}
                                                title="Delete Submission"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {!loading && (
                    <div className="reports-footnote">
                        Showing {visibleRows.length} submitted file{visibleRows.length === 1 ? '' : 's'}.
                    </div>
                )}

                {showPreviewModal && (
                    <div className="modal-overlay" onClick={closePreview}>
                        <div className="modal-content preview-modal reports-preview-modal" onClick={(event) => event.stopPropagation()}>
                            <div className="modal-header">
                                <h2>File Preview</h2>
                                <button className="btn-close" onClick={closePreview}>
                                    <X size={24} />
                                </button>
                            </div>

                            <div className="modal-body">
                                {previewLoading ? (
                                    <div className="reports-preview-loading">Loading preview...</div>
                                ) : previewSubmission ? (
                                    <div className="preview-content-wrapper">
                                        <h3 className="preview-title-large">{previewSubmission.original_filename || previewSubmission.file_name || 'Untitled file'}</h3>

                                        <div className="preview-info-row">
                                            <span className="preview-info-item"><strong>Student ID:</strong> {formatStudentId(previewSubmission.student_id || '')}</span>
                                            <span className="preview-info-item"><strong>Submitted:</strong> {new Date(previewSubmission.created_at).toLocaleString()}</span>
                                        </div>

                                        <div className="preview-info-row">
                                            <span className="preview-info-item"><strong>Word Count:</strong> {previewSubmission.analysis_result?.content_statistics?.word_count || 'N/A'}</span>
                                        </div>

                                        {!previewSubmission.analysis_result?.document_text ? (
                                            <div className="preview-placeholder-large">
                                                <FileText size={48} strokeWidth={1} />
                                                <p>Document content not available</p>
                                                <small>The document may still be processing or content extraction failed.</small>
                                            </div>
                                        ) : (
                                            <div className="document-text-preview">
                                                {previewSubmission.analysis_result.document_text}
                                            </div>
                                        )}

                                        <hr className="preview-divider" />

                                        <div className="preview-section">
                                            <h4 className="preview-section-header">Document Metadata:</h4>
                                            <div className="metadata-grid-compact">
                                                <div className="meta-pair">
                                                    <span className="meta-label">Author:</span>
                                                    <span className="meta-val">{previewSubmission.analysis_result?.document_metadata?.author || 'Unknown'}</span>
                                                </div>

                                                <div className="meta-pair">
                                                    <span className="meta-label">Creation Date:</span>
                                                    <span className="meta-val">
                                                        {(previewSubmission.analysis_result?.document_metadata?.creation_date || previewSubmission.analysis_result?.document_metadata?.created_date)
                                                            ? new Date(previewSubmission.analysis_result.document_metadata.creation_date || previewSubmission.analysis_result.document_metadata.created_date).toLocaleString()
                                                            : 'Unknown'}
                                                    </span>
                                                </div>

                                                <div className="meta-pair">
                                                    <span className="meta-label">File Size:</span>
                                                    <span className="meta-val">
                                                        {previewSubmission.file_size ? `${(previewSubmission.file_size / 1024 / 1024).toFixed(2)} MB` : 'Unknown'}
                                                    </span>
                                                </div>

                                                <div className="meta-pair">
                                                    <span className="meta-label">Last Editor:</span>
                                                    <span className="meta-val">{previewSubmission.analysis_result?.document_metadata?.last_editor || 'Unknown'}</span>
                                                </div>

                                                <div className="meta-pair">
                                                    <span className="meta-label">Last Modified Date:</span>
                                                    <span className="meta-val">
                                                        {(previewSubmission.analysis_result?.document_metadata?.last_modified_date || previewSubmission.analysis_result?.document_metadata?.modified_date)
                                                            ? new Date(previewSubmission.analysis_result.document_metadata.last_modified_date || previewSubmission.analysis_result.document_metadata.modified_date).toLocaleString()
                                                            : 'Unknown'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="preview-section">
                                            <h4 className="preview-section-header">Contributors:</h4>
                                            <div className="contributors-list-simple">
                                                {previewSubmission.analysis_result?.document_metadata?.contributors ? (
                                                    previewSubmission.analysis_result.document_metadata.contributors.map((contributor, index) => (
                                                        <div key={index} className="contributor-row">
                                                            <strong>{contributor.name}</strong> <span>({normalizeContributorRole(contributor.role)})</span>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className="contributor-row">
                                                        <strong>{previewSubmission.analysis_result?.document_metadata?.author || 'Unknown'}</strong> <span>(Author)</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="preview-error">Failed to load preview</div>
                                )}
                            </div>

                            <div className="modal-footer-full">
                                <button
                                    className="btn btn-primary btn-block"
                                    onClick={() => {
                                        closePreview();
                                        navigate(`/dashboard/submissions/${previewSubmission?.id}`, { state: { from: '/dashboard/reports', fromState: {} } });
                                    }}
                                >
                                    View Full Details
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {showFilenameModal && (
                    <div className="modal-overlay" onClick={closeFilenameModal}>
                        <div className="modal-content reports-filename-modal" onClick={(event) => event.stopPropagation()}>
                            <div className="modal-header">
                                <h2>File Name</h2>
                                <button className="btn-close" onClick={closeFilenameModal}>
                                    <X size={24} />
                                </button>
                            </div>

                            <div className="modal-body">
                                <div className="reports-filename-rect">{selectedFilename}</div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Reports;
