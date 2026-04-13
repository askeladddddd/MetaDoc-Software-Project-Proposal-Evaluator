import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { dashboardAPI, reportsAPI } from '../services/api';
import {
  FileText,
  Search,
  ChevronRight,
  Link as LinkIcon,
  Users,
  Calendar,
  FileType,
  Hash,
  Trash2,
  X,
  AlertTriangle,
  Clock,
  Folder as FolderIcon,
  ArrowLeft,
  Download,
  Archive,
  Edit2,
  Plus,
  CheckCircle
} from 'lucide-react';
import '../styles/Deliverable.css';

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

const resolveSchoolYear = () => {
  const currentYear = new Date().getFullYear();
  return `${currentYear}-${currentYear + 1}`;
};

const resolveSemester = (value) => {
  const date = value ? new Date(value) : new Date();
  const normalizedDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const month = normalizedDate.getMonth();

  return month >= 7 ? '1ST' : '2ND';
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

const isLongFilename = (value = '') => String(value).length > 20;

const normalizeContributorRole = (role) => {
  const normalized = String(role || '').trim().toLowerCase();
  if (normalized === 'author' || normalized === 'owner') return 'Author';
  if (['editor', 'last editor', 'writer', 'contributor', 'commenter', 'reader'].includes(normalized)) return 'Editor';
  return 'Editor';
};

const Deliverable = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Restore files view immediately when navigating back from a submission detail
  const initialDeadlineData = location.state?.selectedDeadlineData || null;
  const initialActiveOnly = !!location.state?.activeOnly;

  // View State: 'folders' | 'files'
  const [viewMode, setViewMode] = useState(initialDeadlineData ? 'files' : 'folders');

  // Data State
  const [deadlines, setDeadlines] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [students, setStudents] = useState([]);
  const [selectedDeadline, setSelectedDeadline] = useState(initialDeadlineData);

  // Loading State
  const [loading, setLoading] = useState(!!initialDeadlineData); // Start as loading when restoring files view to prevent empty-state flash
  const [deadlinesLoading, setDeadlinesLoading] = useState(true);

  // Filter/Sort State
  const [searchTerm, setSearchTerm] = useState('');
  const [folderSearchTerm, setFolderSearchTerm] = useState('');
  const [pagination, setPagination] = useState({
    page: 1,
    per_page: 20,
    total: 0,
  });
  const [sortOption, setSortOption] = useState('none'); // 'none', 'newest', 'oldest', 'a_z'
  const [teamCodeFilter, setTeamCodeFilter] = useState('none');
  const [showActiveOnly] = useState(initialActiveOnly);

  // Modal State
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewSubmission, setPreviewSubmission] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showFilenameModal, setShowFilenameModal] = useState(false);
  const [selectedFilename, setSelectedFilename] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteType, setDeleteType] = useState('submission'); // 'submission' | 'folder'

  // Folder Management State
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [editingFolder, setEditingFolder] = useState(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [folderFormData, setFolderFormData] = useState({
    title: '',
    description: '',
    deadline_datetime: '',
  });
  const [folderFormError, setFolderFormError] = useState(null);

  // Description Modal State
  const [showDescriptionModal, setShowDescriptionModal] = useState(false);
  const [selectedDescription, setSelectedDescription] = useState({ title: '', content: '' });

  const teamCodeOptions = [...new Set(
    students
      .map((student) => String(student.team_code || '').trim())
      .filter(Boolean)
  )].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

  // Initial Fetch
  useEffect(() => {
    fetchDeadlines();
    fetchStudents();
  }, []);

  // Handle deep link from Dashboard (deadlineId only, no full object)
  useEffect(() => {
    if (location.state?.deadlineId && deadlines.length > 0) {
      const targetDeadline = deadlines.find(
        d => d.id === location.state.deadlineId || String(d.id) === String(location.state.deadlineId)
      );
      if (targetDeadline) {
        handleFolderClick(targetDeadline);
        // Clear state to prevent loop when going back to deliverables
        navigate(location.pathname, { replace: true, state: {} });
      }
    }
  }, [deadlines, location.state, navigate, location.pathname]);

  // When coming back from SubmissionDetail, selectedDeadlineData was already consumed
  // by the useState initializer above — clear it from route state to prevent stale nav
  useEffect(() => {
    if (location.state?.selectedDeadlineData || location.state?.activeOnly) {
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch submissions when view mode changes to files or pagination changes
  useEffect(() => {
    if (viewMode === 'files' && selectedDeadline) {
      fetchSubmissions();
    }
  }, [viewMode, pagination.page, selectedDeadline, sortOption, teamCodeFilter, searchTerm]);

  const fetchDeadlines = async () => {
    try {
      setDeadlinesLoading(true);
      const [response] = await Promise.all([
        dashboardAPI.getDeadlines(true), // Include past
        new Promise(resolve => setTimeout(resolve, 1200))
      ]);
      setDeadlines(response.data.deadlines || []);
    } catch (err) {
      console.error('Failed to fetch deadlines:', err);
    } finally {
      setDeadlinesLoading(false);
    }
  };

  const fetchSubmissions = async () => {
    if (!selectedDeadline) return;

    try {
      setLoading(true);
      let sortBy = null;
      let sortOrder = null;

      if (sortOption === 'newest') {
        sortBy = 'created_at';
        sortOrder = 'desc';
      } else if (sortOption === 'oldest') {
        sortBy = 'created_at';
        sortOrder = 'asc';
      } else if (sortOption === 'a_z') {
        sortBy = 'filename';
        sortOrder = 'asc';
      }

      const params = {
        page: pagination.page,
        per_page: pagination.per_page,
        deadline_id: selectedDeadline.id
      };

      if (sortBy && sortOrder) {
        params.sort_by = sortBy;
        params.sort_order = sortOrder;
      }

      if (searchTerm) {
        params.search = searchTerm;
      }

      if (teamCodeFilter !== 'none') {
        params.team_code = teamCodeFilter;
      }

      const [response] = await Promise.all([
        dashboardAPI.getSubmissions(params),
        new Promise(resolve => setTimeout(resolve, 1200))
      ]);

      setSubmissions(response.data.submissions || []);
      setPagination({
        ...pagination,
        total: response.data.total || 0,
      });
    } catch (err) {
      console.error('Failed to fetch submissions:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStudents = async () => {
    try {
      const response = await dashboardAPI.getDeadlineStudents();
      setStudents(response.data.students || []);
    } catch (err) {
      console.error('Failed to fetch class list students:', err);
      setStudents([]);
    }
  };

  const handleNewFolder = () => {
    setEditingFolder(null);
    setFolderFormData({ title: '', description: '', deadline_datetime: '' });
    setFolderFormError(null);
    setShowFolderModal(true);
  };

  const handleEditFolder = (folder) => {
    setEditingFolder(folder);

    const dt = new Date(folder.deadline_datetime);
    const year = dt.getFullYear();
    const month = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    const hours = String(dt.getHours()).padStart(2, '0');
    const minutes = String(dt.getMinutes()).padStart(2, '0');
    const formattedDateTime = `${year}-${month}-${day}T${hours}:${minutes}`;

    setFolderFormData({
      title: folder.title,
      description: folder.description || '',
      deadline_datetime: formattedDateTime,
    });
    setFolderFormError(null);
    setShowFolderModal(true);
  };

  const handleFolderSubmit = async (e) => {
    e.preventDefault();
    setFolderFormError(null);

    const selectedDate = new Date(folderFormData.deadline_datetime);
    const now = new Date();

    if (selectedDate <= now) {
      setFolderFormError('Deadline cannot be set to a past date or current time. Please select a future date and time.');
      return;
    }

    const payload = {
      ...folderFormData,
    };

    try {
      if (editingFolder) {
        await dashboardAPI.updateDeadline(editingFolder.id, payload);
      } else {
        await dashboardAPI.createDeadline(payload);
        setShowSuccessModal(true);
      }

      setShowFolderModal(false);
      setFolderFormData({ title: '', description: '', deadline_datetime: '' });
      setEditingFolder(null);
      setFolderFormError(null);
      fetchDeadlines();
    } catch (err) {
      console.error('Failed to save folder:', err);
      const errorMessage = err.response?.data?.error || 'Failed to save folder. Please try again.';
      setFolderFormError(errorMessage);
    }
  };

  // --- ACTIONS ---

  const handleFolderClick = (deadline) => {
    setSelectedDeadline(deadline);
    setViewMode('files');
    setPagination({ ...pagination, page: 1 }); // Reset pagination
    setSearchTerm(''); // Reset search
    setTeamCodeFilter('none');
  };

  const handleBackToFolders = () => {
    setViewMode('folders');
    setSelectedDeadline(null);
    setSubmissions([]); // Clear submissions
    setTeamCodeFilter('none');
  };

  const handleSearch = (e) => {
    e.preventDefault();
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      if (deleteType === 'submission') {
        await dashboardAPI.deleteSubmission(deleteTarget.id);
        setSubmissions(submissions.filter(s => s.id !== deleteTarget.id));
      } else if (deleteType === 'folder') {
        await dashboardAPI.deleteDeadline(deleteTarget.id);
        setDeadlines(deadlines.filter(d => d.id !== deleteTarget.id));
      }
      setShowDeleteModal(false);
      setDeleteTarget(null);
    } catch (err) {
      console.error('Delete failed:', err);
      alert(`Failed to delete ${deleteType}`);
    }
  };

  // --- EXPORT LOGIC ---

  const handleExportCSV = async () => {
    if (!selectedDeadline) return;

    try {
      const confirmExport = window.confirm(`Export overview for "${selectedDeadline.title}" as CSV?`);
      if (!confirmExport) return;

      const response = await reportsAPI.exportCSV({
        filters: { deadline_id: selectedDeadline.id }
      });

      if (response.data && response.data.export_id) {
        // Trigger download
        const exportId = response.data.export_id;
        const downloadUrl = `/api/v1/reports/download/${exportId}`;

        // Use authenticated download via API or direct if cookie/token handled? 
        // Best to use the blob approach to ensure auth headers are sent
        const blobResponse = await reportsAPI.downloadExport(exportId);
        const url = window.URL.createObjectURL(new Blob([blobResponse.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', response.data.filename || 'export.csv');
        document.body.appendChild(link);
        link.click();
        link.remove();
      } else {
        alert('Export failed: No export ID returned.');
      }
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to generate export. Please try again.');
    }
  };

  // --- PREVIEW LOGIC ---

  const openPreview = async (e, submission) => {
    e.stopPropagation();
    setPreviewSubmission(submission);
    setShowPreviewModal(true);
    setPreviewLoading(true);

    try {
      const response = await dashboardAPI.getSubmissionDetail(submission.id);
      setPreviewSubmission(response.data);
    } catch (err) {
      console.error('Detail fetch failed:', err);
    } finally {
      setPreviewLoading(false);
    }
  };

  const openFilenameModal = (e, filename) => {
    e.stopPropagation();
    setSelectedFilename(filename || 'Untitled');
    setShowFilenameModal(true);
  };

  // --- HELPERS ---

  const getDurationString = (diffMs) => {
    const diffSeconds = Math.abs(diffMs) / 1000;
    const days = Math.floor(diffSeconds / (3600 * 24));
    const hours = Math.floor((diffSeconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((diffSeconds % 3600) / 60);

    if (days > 0) return `${days} day${days !== 1 ? 's' : ''}`;
    if (hours > 0) return `${hours} hour${hours !== 1 ? 's' : ''}`;
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  };

  const getTimeliness = (submissionDateStr, deadlineDateStr) => {
    if (!deadlineDateStr) return null;
    const subDate = new Date(submissionDateStr);
    const deadDate = new Date(deadlineDateStr);
    const diff = subDate - deadDate; // + is late, - is early

    if (diff > 0) {
      return {
        isLate: true,
        text: 'LATE',
        detail: `Late by ${getDurationString(diff)}`,
        className: 'status-late',
        badgeClass: 'late'
      };
    }
    return {
      isLate: false,
      text: 'ON TIME',
      detail: `Submitted ${getDurationString(diff)} early`,
      className: 'status-ontime',
      badgeClass: 'ontime'
    };
  };

  const handleDownloadZip = async () => {
    if (!selectedDeadline) return;

    try {
      const confirmDownload = window.confirm(`Download all submission files for "${selectedDeadline.title}" as a ZIP?`);
      if (!confirmDownload) return;

      const response = await dashboardAPI.downloadDeadlineFiles(selectedDeadline.id);

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${selectedDeadline.title.replace(/\s+/g, '_')}_Submissions.zip`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Download failed:', err);
      if (err.response && err.response.status === 404) {
        alert('No files available to download.');
      } else {
        alert('Failed to download ZIP archive.');
      }
    }
  };

  // --- RENDER ---

  const renderFolders = () => {
    const now = new Date();
    const filteredDeadlines = deadlines.filter((deadline) => {
      const matchesSearch = deadline.title.toLowerCase().includes(folderSearchTerm.toLowerCase());
      const isActiveDeadline = new Date(deadline.deadline_datetime) >= now;
      return matchesSearch && (!showActiveOnly || isActiveDeadline);
    });

    return (
      <div className="folders-section">
        <div className="submissions-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--spacing-xl)' }}>
          <div>
            <h1>Deliverable Management</h1>
            <p>{showActiveOnly ? 'Showing active deliverables only' : 'Select a Folder to view student submissions'}</p>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-add-deliverable"
            aria-label="Create new deliverable"
            title="Create new deliverable"
            onClick={handleNewFolder}
          >
            <Plus size={22} />
          </button>
        </div>

        <div className="submissions-filters">
          <div className="search-form">
            <div className="search-input-wrapper">
              <Search size={20} className="search-icon" />
              <input
                type="text"
                className="search-input"
                placeholder="Search deliverables..."
                value={folderSearchTerm}
                onChange={(e) => setFolderSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>

        {deadlinesLoading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading deliverables...</p>
          </div>
        ) : filteredDeadlines.length === 0 ? (
          <div className="empty-state">
            <FolderIcon size={64} />
            <h3>{folderSearchTerm ? 'No deliverables match your search' : 'No Deliverables Created'}</h3>
            <p>{folderSearchTerm ? 'Try a different search term' : 'Create a deadline in "Deadlines" to generate a deliverable.'}</p>
          </div>
        ) : (
          <div className="folders-grid">
            {filteredDeadlines.map(deadline => {
              const isPast = new Date(deadline.deadline_datetime) < new Date();

              return (
                <div
                  key={deadline.id}
                  className="folder-card"
                  onClick={() => handleFolderClick(deadline)}
                >
                  <div className="folder-card-inner">
                    <div className="folder-header">
                      <div className="folder-title-group">
                        <h3 className="folder-title" title={deadline.title}>{deadline.title}</h3>
                        <div className="folder-meta">
                          <Calendar size={14} />
                          <span>Due: {new Date(deadline.deadline_datetime).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="folder-actions flex gap-1">
                      <button
                        className="btn-edit-folder"
                        title="Edit Deliverable"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditFolder(deadline);
                        }}
                      >
                        <Edit2 size={18} />
                      </button>
                      <button
                        className="btn-edit-folder"
                        title="Delete Deliverable"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget({ id: deadline.id, filename: deadline.title });
                          setDeleteType('folder');
                          setShowDeleteModal(true);
                        }}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                    <div className="folder-card-body">
                      {deadline.description ? (
                        <div className="folder-description-container">
                          <p className="folder-description">
                            {deadline.description}
                          </p>
                          {deadline.description.length > 50 && (
                            <button
                              className="btn-see-more btn-see-more-description"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedDescription({ title: deadline.title, content: deadline.description });
                                setShowDescriptionModal(true);
                              }}
                            >
                              See More
                            </button>
                          )}
                        </div>
                      ) : (
                        <p className="folder-description" style={{ fontStyle: 'italic', color: 'var(--color-gray-500)' }}>
                          No description provided.
                        </p>
                      )}
                    </div>
                    <div className="folder-card-footer">
                      <span className="stat-badge">
                        {deadline.submission_count || 0} Files
                      </span>
                      <span className={`stat-badge ${isPast ? 'status-closed' : 'status-active'}`}>
                        {isPast ? 'Closed' : 'Active'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderFiles = () => (
    <div className="files-section">
      {/* Header with Back Button */}
      <div className="files-view-header">
        <button className="btn-back" onClick={handleBackToFolders}>
          <ArrowLeft size={18} />
          Back to Deliverables
        </button>
        <div className="folder-info">
          <h2>{selectedDeadline?.title}</h2>
          <p>Due: {new Date(selectedDeadline?.deadline_datetime).toLocaleString()}</p>
          {selectedDeadline?.description && (
            <div className={`folder-info-description ${selectedDeadline.description.length > 15 ? 'is-long' : ''}`}>
              <span className="text-gray-600">
                {selectedDeadline.description.length > 15
                  ? `${selectedDeadline.description.substring(0, 15)}...`
                  : selectedDeadline.description}
              </span>
              {selectedDeadline.description.length > 15 && (
                <button
                  className="btn-see-more btn-see-more-inline"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedDescription({ title: selectedDeadline.title, content: selectedDeadline.description });
                    setShowDescriptionModal(true);
                  }}
                >
                  See More
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Filter / Search */}
      <div className="submissions-filters">
        <form onSubmit={handleSearch} className="search-form">
          <div className="search-input-wrapper">
            <Search size={20} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="Search student ID, student name, or team code..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
            />
          </div>
        </form>
        <div className="filter-group">
          <select
            className="filter-select team-code-filter-select"
            value={teamCodeFilter}
            onChange={(e) => {
              setTeamCodeFilter(e.target.value);
              setPagination({ ...pagination, page: 1 });
            }}
          >
            <option value="none">Select Code</option>
            {teamCodeOptions.map((teamCode) => (
              <option key={teamCode} value={teamCode}>{teamCode}</option>
            ))}
          </select>
          <select
            className="filter-select"
            value={sortOption}
            onChange={(e) => {
              setSortOption(e.target.value);
              setPagination({ ...pagination, page: 1 });
            }}
          >
            <option value="none">Sort By</option>
            <option value="newest">Newest Date</option>
            <option value="oldest">Oldest Date</option>
            <option value="a_z">Name (A-Z)</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading submissions...</p>
        </div>
      ) : submissions.length === 0 ? (
        <div className="empty-state">
          <FileText size={64} />
          <h3>No Files Submitted Yet</h3>
          <p>Students haven't submitted anything for this deadline yet.</p>
        </div>
      ) : (
        <>

          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>File Name</th>
                  <th>Student ID</th>
                  <th>Student Name</th>
                  <th>Date Submitted</th>
                  <th>Last Modified</th>
                  <th>Course & Year</th>
                  <th>Team Code</th>
                  <th>SY</th>
                  <th>Semester</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map(submission => {
                  const timeliness = getTimeliness(submission.created_at, selectedDeadline.deadline_datetime);
                  const displayFilename = formatFilenameInitials(submission.original_filename || 'Untitled', 20);

                  return (
                    <tr
                      key={submission.id}
                      onClick={() => navigate(`/dashboard/submissions/${submission.id}`, {
                        state: {
                          from: '/dashboard/deliverables',
                          fromState: selectedDeadline ? { deadlineId: selectedDeadline.id, selectedDeadlineData: selectedDeadline } : {},
                        },
                      })}
                      className="clickable-row"
                    >
                      <td>
                        <div className="file-info-cell">
                          <div
                            className="file-icon-mini clickable-icon"
                            onClick={(e) => openPreview(e, submission)}
                          >
                            <FileText size={18} />
                          </div>
                          <span className="file-name" title={submission.original_filename}>
                            {displayFilename}
                          </span>
                          {isLongFilename(submission.original_filename || '') && (
                            <button
                              type="button"
                              className="deliverable-see-more"
                              onClick={(e) => openFilenameModal(e, submission.original_filename)}
                            >
                              See more
                            </button>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className="student-id-pill">
                          <Users size={14} className="icon-subtle" />
                          {formatStudentId(submission.student_id)}
                        </span>
                      </td>
                      <td>{submission.student_name || '-'}</td>
                      <td>
                        <div className="date-cell">
                          <Calendar size={14} className="icon-subtle" />
                          {new Date(submission.created_at).toLocaleDateString()}
                          <span className="time-subtle">
                            {new Date(submission.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </td>
                      <td>
                        {submission.last_modified ? (
                          <div className="date-cell">
                            <Calendar size={14} className="icon-subtle" />
                            {new Date(submission.last_modified).toLocaleDateString()}
                            <span className="time-subtle">
                              {new Date(submission.last_modified).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td>{submission.course_year || '-'}</td>
                      <td>{submission.team_code || '-'}</td>
                      <td>{resolveSchoolYear()}</td>
                      <td>{submission.semester || resolveSemester(submission.created_at)}</td>
                      <td>
                        {timeliness && (
                          <div className={`status-pill ${timeliness.isLate ? 'status-late' : 'status-ontime'}`}>
                            {timeliness.isLate ? <AlertTriangle size={12} /> : <Clock size={12} />}
                            <span>{timeliness.text}</span>
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="actions-cell">
                          <button
                            className="btn-icon btn-view"
                            title="View Details"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/dashboard/submissions/${submission.id}`, {
                                state: {
                                  from: '/dashboard/deliverables',
                                  fromState: selectedDeadline ? { deadlineId: selectedDeadline.id, selectedDeadlineData: selectedDeadline } : {},
                                },
                              });
                            }}
                          >
                            <ChevronRight size={18} />
                          </button>
                          <button
                            className="btn-icon btn-delete-row"
                            title="Delete Submission"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget({ id: submission.id, filename: submission.original_filename });
                              setDeleteType('submission');
                              setShowDeleteModal(true);
                            }}
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.total > pagination.per_page && (
            <div className="pagination">
              <button
                className="btn btn-outline btn-sm"
                disabled={pagination.page === 1}
                onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })}
              >
                Previous
              </button>
              <span className="pagination-info">
                Page {pagination.page} of {Math.ceil(pagination.total / pagination.per_page)}
              </span>
              <button
                className="btn btn-outline btn-sm"
                disabled={pagination.page >= Math.ceil(pagination.total / pagination.per_page)}
                onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <div className="submissions-page">
      {viewMode === 'folders' ? renderFolders() : renderFiles()}

      {/* --- MODALS --- */}

      {/* Preview Modal */}
      {showPreviewModal && (
        <div className="modal-overlay" onClick={() => setShowPreviewModal(false)}>
          <div className="modal-content preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>File Preview</h2>
              <button className="btn-close" onClick={() => setShowPreviewModal(false)}>
                <X size={24} />
              </button>
            </div>
            <div className="modal-body">
              {previewLoading ? (
                <div className="loading-state"><div className="spinner"></div></div>
              ) : previewSubmission ? (
                <div className="preview-content-wrapper">
                  <h3 className="preview-title-large">{previewSubmission.original_filename}</h3>

                  <div className="preview-info-row">
                    <span className="preview-info-item"><strong>Student ID:</strong> {formatStudentId(previewSubmission.student_id)}</span>
                    <span className="preview-info-item"><strong>Submitted:</strong> {new Date(previewSubmission.created_at).toLocaleString()}</span>
                  </div>

                  <div className="preview-info-row">
                    <span className="preview-info-item"><strong>Word Count:</strong> {previewSubmission.analysis_result?.content_statistics?.word_count || 'N/A'}</span>
                  </div>

                  {/* Content Placeholder / Preview */}
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

                  {/* Metadata Section */}
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
                          {(previewSubmission.file_size / 1024 / 1024).toFixed(2)} MB
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

                  {/* Contributors Section */}
                  <div className="preview-section">
                    <h4 className="preview-section-header">Contributors:</h4>
                    <div className="contributors-list-simple">
                      {previewSubmission.analysis_result?.document_metadata?.contributors ? (
                        previewSubmission.analysis_result.document_metadata.contributors.map((c, i) => (
                          <div key={i} className="contributor-row">
                            <strong>{c.name}</strong> <span>({normalizeContributorRole(c.role)})</span>
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
                <div className="preview-error">Failed to load</div>
              )}
            </div>
            <div className="modal-footer-full">
              <button className="btn btn-primary btn-block" onClick={() => {
                setShowPreviewModal(false);
                navigate(`/dashboard/submissions/${previewSubmission?.id}`, {
                  state: {
                    from: '/dashboard/deliverables',
                    fromState: selectedDeadline ? { deadlineId: selectedDeadline.id, selectedDeadlineData: selectedDeadline } : {},
                  },
                });
              }}>
                View Full Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showFilenameModal && (
        <div className="modal-overlay" onClick={() => setShowFilenameModal(false)}>
          <div className="modal-content deliverable-filename-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>File Name</h2>
              <button className="btn-close" onClick={() => setShowFilenameModal(false)}>
                <X size={24} />
              </button>
            </div>

            <div className="modal-body">
              <div className="deliverable-filename-rect">{selectedFilename}</div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteModal && deleteTarget && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal-content delete-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="delete-icon"><AlertTriangle size={20} /></div>
              <h2>Delete {deleteType === 'folder' ? 'Deliverable' : 'File'}</h2>
            </div>
            <div className="modal-body">
              <p>Permanently delete <strong>"{deleteTarget.filename}"</strong>?</p>
              {deleteType === 'folder' && (
                <p className="warning-text">This will delete all submissions inside this deliverable!</p>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowDeleteModal(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleConfirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Folder Modal */}
      {showFolderModal && (
        <div className="modal-overlay" onClick={() => setShowFolderModal(false)}>
          <div className="modal-content folder-form-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header folder-form-header">
              <h2 className="folder-form-title">{editingFolder ? 'Edit Deliverable' : 'Create New Deliverable'}</h2>
              <button type="button" className="btn-close folder-form-close" aria-label="Close deliverable form" onClick={() => setShowFolderModal(false)}>
                <X size={20} className="icon-close" />
              </button>
            </div>

            <form onSubmit={handleFolderSubmit}>
              {folderFormError && (
                <div className="alert alert-error">
                  <AlertTriangle size={20} />
                  <span>{folderFormError}</span>
                </div>
              )}

              <div className="form-group folder-form-group">
                <label className="folder-form-label" htmlFor="title">TITLE *</label>
                <input
                  type="text"
                  id="title"
                  className="form-control"
                  value={folderFormData.title}
                  onChange={(e) => setFolderFormData({ ...folderFormData, title: e.target.value })}
                  required
                  placeholder="e.g., Final Project Submission"
                />
              </div>

              <div className="form-group folder-form-group">
                <label className="folder-form-label" htmlFor="description">DESCRIPTION (OPTIONAL)</label>
                <textarea
                  id="description"
                  className="form-control"
                  rows="3"
                  value={folderFormData.description}
                  onChange={(e) => setFolderFormData({ ...folderFormData, description: e.target.value })}
                  placeholder="Optional description or instructions"
                />
              </div>

              <div className="form-group folder-form-group">
                <label className="folder-form-label" htmlFor="deadline_datetime">DEADLINE DATE & TIME *</label>
                <input
                  type="datetime-local"
                  id="deadline_datetime"
                  className="form-control"
                  value={folderFormData.deadline_datetime}
                  onChange={(e) => setFolderFormData({ ...folderFormData, deadline_datetime: e.target.value })}
                  min={new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                  required
                />
                <small className="form-text">Select a future date and time</small>
              </div>

              <div className="folder-form-footer">
                <button type="submit" className="btn btn-folder-create">
                  {editingFolder ? 'Update Deliverable' : 'Create Deliverable'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Description Modal */}
      {showDescriptionModal && (
        <div className="modal-overlay" onClick={() => setShowDescriptionModal(false)}>
          <div className="modal-content deliverable-description-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header deliverable-description-header">
              <h2 className="deliverable-description-title">{selectedDescription.title}</h2>
              <button className="btn-close" onClick={() => setShowDescriptionModal(false)}>
                <X size={24} />
              </button>
            </div>
            <div className="modal-body deliverable-description-body">
              <p className="deliverable-description-content">
                {selectedDescription.content}
              </p>
            </div>
            <div className="modal-footer deliverable-description-footer">
              <button className="btn btn-primary" onClick={() => setShowDescriptionModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="modal-overlay" onClick={() => setShowSuccessModal(false)}>
          <div className="modal-content success-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="success-icon">
                <CheckCircle size={24} />
              </div>
              <h2>Success!</h2>
            </div>
            <div className="modal-body">
              <p>Deliverable has been successfully created.</p>
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

export default Deliverable;
