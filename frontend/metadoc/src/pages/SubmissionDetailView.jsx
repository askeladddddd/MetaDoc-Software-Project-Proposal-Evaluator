import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { dashboardAPI } from '../services/api';
import {
  ArrowLeft,
  FileText,
  User,
  Calendar,
  Clock,
  BarChart3,
  BookOpen,
  AlertCircle,
  TrendingUp,
  ExternalLink,
  Users,
  Flag,
  X
} from 'lucide-react';
import Card from '../components/common/Card/Card';
import Badge from '../components/common/Badge/Badge';
import '../styles/SubmissionDetail.css';

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

const normalizeContributorRole = (role) => {
  const normalized = String(role || '').trim().toLowerCase();
  if (normalized === 'author' || normalized === 'owner') return 'Author';
  if (['editor', 'last editor', 'writer', 'contributor', 'commenter', 'reader'].includes(normalized)) return 'Editor';
  return 'Editor';
};

const SubmissionDetailView = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [submission, setSubmission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [contributionReport, setContributionReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [expandedFeedback, setExpandedFeedback] = useState({
    primary: false,
    contributor: false,
  });

  useEffect(() => {
    fetchSubmissionDetail();
  }, [id]);

  /* Ensure loading state lasts at least 2 seconds */
  const fetchSubmissionDetail = async () => {
    try {
      setLoading(true);
      const [response] = await Promise.all([
        dashboardAPI.getSubmissionDetail(id, { forceRefresh: true }),
        new Promise(resolve => setTimeout(resolve, 1200))
      ]);
      setSubmission(response.data);

      // Fetch contribution report if it's a Drive link
      if (response.data.submission_type === 'drive_link') {
        fetchContributionReport({ refresh: true });
      }
    } catch (err) {
      setError('Failed to load submission details');
      console.error('Submission detail error:', err);
    } finally {
      setLoading(false);
    }
  };

  const [reportError, setReportError] = useState(null);

  const fetchContributionReport = async (options = {}) => {
    try {
      setReportError(null);
      setReportLoading(true);
      const response = await dashboardAPI.getContributionReport(id, { refresh: !!options.refresh });
      setContributionReport(response.data);
    } catch (err) {
      console.error('Failed to load contribution report:', err);
      const msg = err.response?.data?.error || 'Unable to generate revision report.';
      setReportError(msg);
    } finally {
      setReportLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="detail-loading">
        <div className="spinner"></div>
        <p>Loading submission details...</p>
      </div>
    );
  }

  if (error || !submission) {
    return (
      <div className="detail-error">
        <AlertCircle size={48} />
        <h3>{error || 'Submission not found'}</h3>
        <button className="btn btn-primary" onClick={() => navigate('/dashboard/deliverables')}>
          Back to Deliverables
        </button>
      </div>
    );
  }

  const handleBack = () => {
    const fromPath = location.state?.from;
    const fromState = location.state?.fromState;

    if (fromPath) {
      navigate(fromPath, { state: fromState || {} });
      return;
    }

    if (window.history.length > 1) {
      navigate(-1);
      return;
    }

    navigate('/dashboard/deliverables');
  };

  const handleViewFile = async () => {
    // If it's a Google Drive link, open it directly in a new tab (best for GDocs)
    if (submission.google_drive_link) {
      window.open(submission.google_drive_link, '_blank');
      return;
    }

    try {
      // For file uploads (or fallback), we download/view via API
      const response = await dashboardAPI.getSubmissionFile(id);

      // Create a blob from the response
      const file = new Blob([response.data], { type: submission.mime_type || 'application/pdf' });
      const fileURL = URL.createObjectURL(file);
      window.open(fileURL, '_blank');
    } catch (err) {
      console.error('Error viewing file:', err);

      let errorMessage = 'Failed to open file. It might not exist or there was an error.';

      // Check if the error response is a Blob (since we requested blob)
      if (err.response && err.response.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const json = JSON.parse(text);
          if (json.error) errorMessage = json.error;
        } catch (e) {
          // ignore parse error
        }
      } else if (err.response?.data?.error) {
        errorMessage = err.response.data.error;
      }

      alert(errorMessage);
    }
  };

  const analysis = submission.analysis_result;

  const buildContributorFeedback = (contributor, roleLabel) => {
    if (!contributor) {
      return 'As the AI reviewer, I cannot identify a reliable contributor profile from the current revision evidence. Please verify whether the file has enough measurable editing activity.';
    }

    const name = contributor.name || roleLabel;
    const contributionPercent = Number(contributor.contributionPercent || 0).toFixed(2);
    const revisions = Number(contributor.revisionCount || 0);
    const sessions = Number(contributor.sessionCount || 0);
    const minutes = Number(contributor.activeEditingMinutes || 0).toFixed(2);
    const workStatus = String(contributor.workStatus || roleLabel).toLowerCase();
    const aiReason = String(contributor.aiReason || '').trim();

    const summarySentence = `As the AI reviewer, I classify ${name} as ${roleLabel} with ${contributionPercent}% measured contribution from ${revisions} revisions, ${sessions} sessions, and ${minutes} active editing minutes.`;

    const interpretationSentence = aiReason
      ? `This aligns with the behavioral signal that ${aiReason.charAt(0).toLowerCase()}${aiReason.slice(1)}`
      : `The activity pattern indicates ${workStatus}, which is consistent with the contributor's current role in the document workflow.`;

    const recommendationSentence = roleLabel === 'Primary Worker'
      ? 'Recommendation: keep this member leading core drafting while distributing smaller revision tasks to others for balance.'
      : 'Recommendation: increase planned edit ownership in earlier drafting stages to strengthen contribution depth.';

    return `${summarySentence} ${interpretationSentence} ${recommendationSentence}`;
  };

  const resolveFeedbackSummary = () => {
    const contributors = (contributionReport?.contributors || []).filter((contributor) => {
      const revisions = Number(contributor.revisionCount || 0);
      const sessions = Number(contributor.sessionCount || 0);
      const minutes = Number(contributor.activeEditingMinutes || 0);
      return revisions > 0 || sessions > 0 || minutes > 0;
    });

    if (!contributors.length) {
      return {
        primary: null,
        contributor: null,
      };
    }

    const sorted = [...contributors].sort(
      (left, right) => Number(right.contributionPercent || 0) - Number(left.contributionPercent || 0)
    );

    const primary = sorted.find((c) => c.workStatus === 'Primary Worker') || sorted[0] || null;
    const contributor =
      sorted.find((c) => c.name !== primary?.name && c.workStatus === 'Contributing') ||
      sorted.find((c) => c.name !== primary?.name) ||
      null;

    return {
      primary,
      contributor,
    };
  };

  const feedbackSummary = resolveFeedbackSummary();
  const longFeedbackLimit = 210;

  const renderFeedbackText = (text, keyName) => {
    const safeText = String(text || 'No summary feedback available.');
    const isLong = safeText.length > longFeedbackLimit;
    const isExpanded = !!expandedFeedback[keyName];
    const displayText = isLong && !isExpanded
      ? `${safeText.slice(0, longFeedbackLimit).trim()}...`
      : safeText;

    return (
      <>
        <p className="feedback-message-text">{displayText}</p>
        {isLong && (
          <button
            type="button"
            className="feedback-see-more-btn"
            onClick={() => setExpandedFeedback((prev) => ({
              ...prev,
              [keyName]: !prev[keyName],
            }))}
          >
            {isExpanded ? 'See less' : 'See more'}
          </button>
        )}
      </>
    );
  };

  return (
    <div className="detail-page">
      <button className="btn btn-ghost mb-lg" onClick={handleBack}>
        <ArrowLeft size={20} />
        Back
      </button>

      <div className="detail-header">
        <div className="detail-title-section">
          <h1 className="text-3xl font-bold text-gray-900">{submission.original_filename}</h1>
          <Badge variant={getStatusColor(submission.status)}>
            {submission.status}
          </Badge>
        </div>

        <button className="btn btn-primary btn-sm" onClick={handleViewFile} title="View original file">
          <ExternalLink size={16} className="mr-2" />
          View File
        </button>

      </div>

      <div className="detail-grid">
        {/* Basic Information */}
        <Card title="Basic Information" className="h-full">
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">Student Name</span>
              <span className="info-value">{submission.student_name || 'Not provided'}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Student ID</span>
              <span className="info-value">{formatStudentId(submission.student_id)}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Submission Date</span>
              <span className="info-value">
                {new Date(submission.created_at).toLocaleString([], {
                  year: 'numeric',
                  month: 'numeric',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">File Size</span>
              <span className="info-value">
                {(submission.file_size / 1024 / 1024).toFixed(2)} MB
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">File Type</span>
              <span className="info-value">{submission.mime_type}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Job ID</span>
              <span className="info-value font-mono">{submission.job_id}</span>
            </div>
          </div>
        </Card>

        {/* Content Statistics */}
        {analysis?.content_statistics && (
          <Card title="Content Statistics" className="h-full">
            <div className="stats-list">
              <div className="stat-item">
                <span className="stat-label">Word Count</span>
                <span className="stat-number">{analysis.content_statistics?.word_count || 0}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Character Count</span>
                <span className="stat-number">{analysis.content_statistics?.character_count || 0}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Sentence Count</span>
                <span className="stat-number">{analysis.content_statistics?.sentence_count || 0}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Page Count</span>
                <span className="stat-number">{analysis.content_statistics?.page_count || 0}</span>
              </div>
            </div>
          </Card>
        )}

        {/* Document Metadata */}
        {analysis?.document_metadata && (
          <Card title="Document Metadata" className="h-full">
            <div className="info-grid mb-6">
              <div className="info-item">
                <span className="info-label">Author</span>
                <span className="info-value">
                  {analysis.document_metadata.author || 'Unavailable'}
                </span>
              </div>
              <div className="info-item">
                <span className="info-label">Created Date</span>
                <span className="info-value">
                  {(analysis.document_metadata.created_date || analysis.document_metadata.creation_date)
                    ? new Date(analysis.document_metadata.created_date || analysis.document_metadata.creation_date).toLocaleString([], {
                      year: 'numeric',
                      month: 'numeric',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })
                    : 'Unavailable'}
                </span>
              </div>
              <div className="info-item">
                <span className="info-label">Last Modified</span>
                <span className="info-value">
                  {(analysis.document_metadata.modified_date || analysis.document_metadata.last_modified_date)
                    ? new Date(analysis.document_metadata.modified_date || analysis.document_metadata.last_modified_date).toLocaleString([], {
                      year: 'numeric',
                      month: 'numeric',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })
                    : 'Unavailable'}
                </span>
              </div>
              <div className="info-item">
                <span className="info-label">Last Editor</span>
                <span className="info-value">
                  {analysis.document_metadata.last_editor || 'Unavailable'}
                </span>
              </div>
            </div>

            {/* Group Members / Contributors */}
            <div className="pt-6 border-t border-gray-100">
              <h4 className="section-subtitle">
                <User size={16} />
                Group Members / Contributors
              </h4>
              <div className="contributors-list">
                {(() => {
                  let contributors = [];

                  // Use backend provided contributors list if available
                  if (analysis.document_metadata.contributors && analysis.document_metadata.contributors.length > 0) {
                    contributors = analysis.document_metadata.contributors; // Assume simple shape for now
                  } else {
                    // Fallback logic
                    // Add author with creation date
                    // Add author with creation date
                    if (analysis.document_metadata.author) {
                      contributors.push({
                        name: analysis.document_metadata.author,
                        role: 'Author',
                        date: analysis.document_metadata.created_date || analysis.document_metadata.creation_date,
                      });
                    }

                    // Add last editor with modification date (if different from author)
                    if (analysis.document_metadata.last_editor &&
                      analysis.document_metadata.last_editor !== analysis.document_metadata.author) {
                      contributors.push({
                        name: analysis.document_metadata.last_editor,
                        role: 'Editor',
                        date: analysis.document_metadata.modified_date || analysis.document_metadata.last_modified_date,
                      });
                    }
                  }

                  return contributors.length > 0 ? (
                    contributors.map((contributor, index) => (
                      <div key={index} className="contributor-item">
                        <div className="contributor-icon">
                          <User size={14} />
                        </div>
                        <div className="contributor-details">
                          <div className="contributor-name">
                            <strong>{contributor.name}</strong>
                            <span className="contributor-role">({normalizeContributorRole(contributor.role)})</span>
                          </div>
                          {(contributor.date || contributor.email) && (
                            <div className="contributor-date">
                              {contributor.date && !isNaN(Date.parse(contributor.date)) ? new Date(contributor.date).toLocaleString([], {
                                year: 'numeric',
                                month: 'numeric',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit',
                              }) : contributor.email}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-muted">No contributor information available</p>
                  );
                })()}
              </div>
            </div>
          </Card>
        )}

        {/* Collaborative Effort Report (Google Drive Only) */}
        {submission.submission_type === 'drive_link' && (
          <Card
            title={
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--spacing-sm)', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                  <Users size={20} />
                  Collaborative Effort Report
                </div>
                <button
                  type="button"
                  className="feedback-flag-btn"
                  title="View Summary Feedback"
                  onClick={() => {
                    setExpandedFeedback({ primary: false, contributor: false });
                    setShowFeedbackModal(true);
                  }}
                >
                  <Flag size={16} />
                </button>
              </div>
            }
            className="h-full"
          >
            {reportLoading ? (
              <div className="flex flex-col items-center justify-center p-8 text-gray-500">
                <div className="spinner-small mb-4"></div>
                <p>Generating contribution report...</p>
              </div>
            ) : contributionReport ? (
              <div className="space-y-6">
                <div className="text-sm text-gray-500 mb-4">
                  Total Revisions Analyzed: <strong>{contributionReport.totalRevisions}</strong>
                </div>

                {(() => {
                  const visibleContributors = (contributionReport.contributors || []).filter((contributor) => {
                    const revisions = Number(contributor.revisionCount || 0);
                    const sessions = Number(contributor.sessionCount || 0);
                    const minutes = Number(contributor.activeEditingMinutes || 0);
                    return revisions > 0 || sessions > 0 || minutes > 0;
                  });

                  return (
                    <div className="space-y-4">
                      {visibleContributors.map((contributor, idx) => (
                        <div key={idx} className="contribution-item">
                          <div className="flex justify-between items-center mb-1">
                            <div className="flex flex-col">
                              <span className="font-semibold text-gray-800">
                                {contributor.name}
                              </span>
                              {contributor.workStatus && (
                                <span className={`text-[11px] ${contributor.workStatus === 'No Work Detected' ? 'text-red-600' : 'text-emerald-600'}`}>
                                  {contributor.workStatus}
                                </span>
                              )}
                              {contributor.email && (
                                <span className="text-xs text-gray-500">
                                  {contributor.email}
                                </span>
                              )}
                              {contributor.studentProfile?.studentId && (
                                <span className="text-[11px] text-gray-500">
                                  {contributor.studentProfile.studentId}
                                  {contributor.studentProfile.teamCode ? ` | Team ${contributor.studentProfile.teamCode}` : ''}
                                </span>
                              )}
                            </div>
                            <div className="text-right">
                              <span className="text-sm font-bold text-maroon">
                                {contributor.contributionPercent}%
                              </span>
                              <div className="text-xs text-gray-400">
                                {contributor.revisionCount} revisions
                              </div>
                              <div className="text-xs text-gray-500">
                                {contributor.sessionCount || 0} sessions | {contributor.activeEditingMinutes || 0} mins
                              </div>
                              {Array.isArray(contributor.heuristics) && contributor.heuristics.length > 0 && (
                                <div className="text-xs text-amber-700 mt-1" style={{ maxWidth: '260px' }}>
                                  {contributor.heuristics.join(' | ')}
                                </div>
                              )}
                              {contributor.aiEffortLabel && (
                                <div className="text-xs text-indigo-700 mt-1" style={{ maxWidth: '260px' }}>
                                  AI: {contributor.aiEffortLabel}
                                </div>
                              )}
                              {contributor.documentMetadataConnection && (
                                <div className="text-[11px] text-gray-500 mt-1" style={{ maxWidth: '260px' }}>
                                  {contributor.documentMetadataConnection.isDriveOwner ? 'Drive owner' : ''}
                                  {contributor.documentMetadataConnection.isDriveOwner && contributor.documentMetadataConnection.isDriveLastModifier ? ' | ' : ''}
                                  {contributor.documentMetadataConnection.isDriveLastModifier ? 'Last modifier' : ''}
                                  {(contributor.documentMetadataConnection.isDriveOwner || contributor.documentMetadataConnection.isDriveLastModifier) && contributor.documentMetadataConnection.emailSeenInDocumentMetadata ? ' | ' : ''}
                                  {contributor.documentMetadataConnection.emailSeenInDocumentMetadata ? 'Seen in doc metadata' : ''}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Custom Progress Bar */}
                          <div style={{
                            height: '8px',
                            width: '100%',
                            background: '#f3f4f6',
                            borderRadius: '4px',
                            overflow: 'hidden'
                          }}>
                            <div style={{
                              height: '100%',
                              width: `${contributor.contributionPercent}%`,
                              background: contributor.name === 'Unverified Contributor' ? '#9ca3af' : 'var(--color-maroon)',
                              transition: 'width 1s ease-out'
                            }}></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {Array.isArray(contributionReport.flags) && contributionReport.flags.length > 0 && (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] text-amber-700">
                    <p className="m-0">
                      {contributionReport.flags.join(' | ')}
                    </p>
                  </div>
                )}

                <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-[11px] text-gray-500">
                  <div className="flex items-start gap-2.5 leading-5">
                    <span className="mt-[2px] shrink-0 text-gray-400">
                      <AlertCircle size={12} />
                    </span>
                    <p className="m-0">
                      Contribution is calculated from active edit sessions ({contributionReport.scoring?.sessionWindowMinutes || 30}-minute windows) using Google Drive revision metadata only. Flags are investigative and should be used as conversation starters, not automatic grade deductions.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-8 text-gray-400 text-center">
                <AlertCircle size={32} className="mb-2" />
                <p>{reportError || 'Unable to generate revision report for this document.'}</p>
                {reportError?.includes('permissions') && (
                  <p className="text-xs mt-4 bg-gray-50 p-2 rounded border border-gray-100 italic">
                    Tip: Ensure the document is shared as "Anyone with the link can edit/view" for revision history access.
                  </p>
                )}
              </div>
            )}
          </Card>
        )}

        {showFeedbackModal && (
          <div className="feedback-modal-overlay" onClick={() => setShowFeedbackModal(false)}>
            <div className="feedback-modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="feedback-modal-header">
                <h3>Summary Feedback</h3>
                <button type="button" className="feedback-modal-close" onClick={() => setShowFeedbackModal(false)}>
                  <X size={18} />
                </button>
              </div>

              <div className="feedback-modal-body">
                <div className="feedback-block">
                  <div className="feedback-label">Primary Worker</div>
                  <div className="feedback-name">
                    {feedbackSummary.primary?.name || 'Not identified'}
                  </div>
                  {renderFeedbackText(buildContributorFeedback(feedbackSummary.primary, 'Primary Worker'), 'primary')}
                </div>

                <div className="feedback-block">
                  <div className="feedback-label">Contributor</div>
                  <div className="feedback-name">
                    {feedbackSummary.contributor?.name || 'Not identified'}
                  </div>
                  {renderFeedbackText(buildContributorFeedback(feedbackSummary.contributor, 'Contributor'), 'contributor')}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* AI Summary and Evaluation */}
        {analysis?.ai_summary && (
          <div className="card-full-width space-y-6">
            <Card title="AI-Generated Summary">
              <p className="ai-summary">{analysis.ai_summary}</p>
            </Card>
          </div>
        )}

        {/* Validation Warnings */}
        {analysis?.validation_warnings && analysis.validation_warnings.length > 0 && (
          <Card title="Validation Warnings" className="card-full-width">
            <div className="warnings-list">
              {analysis.validation_warnings.map((warning, index) => (
                <div key={index} className="warning-item">
                  <AlertCircle size={16} />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

const getStatusColor = (status) => {
  const colors = {
    pending: 'warning',
    processing: 'info',
    completed: 'success',
    failed: 'error',
    warning: 'warning',
  };
  return colors[status] || 'info';
};

const getTimelinessColor = (timeliness) => {
  const colors = {
    on_time: 'success',
    late: 'error',
    last_minute_rush: 'warning',
    no_deadline: 'info',
  };
  return colors[timeliness] || 'info';
};

const formatTimeliness = (timeliness) => {
  const labels = {
    on_time: 'On Time',
    late: 'Late',
    last_minute_rush: 'Last Minute Rush',
    no_deadline: 'No Deadline',
  };
  return labels[timeliness] || timeliness;
};

export default SubmissionDetailView;
