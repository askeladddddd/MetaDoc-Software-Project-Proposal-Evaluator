import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { dashboardAPI, rubricAPI } from '../services/api';
import {
  ArrowLeft,
  RefreshCw,
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
  X,
  Sparkles,
  CheckCircle,
  ClipboardList
} from '../components/common/Icons';
import Card from '../components/common/Card/Card';
import Badge from '../components/common/Badge/Badge';
import logo4 from '../assets/images/Logo4.jpg';
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
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('Initializing...');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);
  const hasAttemptedAutoAnalysis = useRef(false);

  useEffect(() => {
    if (analysisError) {
      const timer = setTimeout(() => setAnalysisError(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [analysisError]);

  useEffect(() => {
    fetchSubmissionDetail();
  }, [id]);

  useEffect(() => {
    if (submission && !loading && !isAnalyzing) {
      const checkAndRunAnalysis = async () => {
        const analysis = submission.analysis_result;
        let needsAnalysis = false;
        let reason = "";

        // Case 1: No analysis at all or empty evaluation
        if (!analysis || !analysis.rubric_evaluation || analysis.rubric_evaluation.length === 0) {
          needsAnalysis = true;
          reason = "No existing analysis found";
        } else {
          try {
            // Case 2: Check if rubric has been updated
            const rubricResponse = await rubricAPI.getRubrics();
            const rubrics = rubricResponse.data;

            // Use the rubric specifically assigned to this deadline
            const targetId = submission.deadline?.rubric_id;
            const activeRubric = rubrics.find(r => String(r.id) === String(targetId)) ||
              rubrics.find(r => r.is_active) ||
              rubrics[0];

            if (activeRubric) {
              const rubricDate = activeRubric.updated_at ? new Date(activeRubric.updated_at) : null;
              const analysisDate = analysis.updated_at ? new Date(analysis.updated_at) : null;

              // Case 3: Number of criteria has changed
              const rubricCriteriaCount = activeRubric.criteria?.length || 0;
              const analysisEvaluationCount = analysis.rubric_evaluation?.length || 0;

              if (rubricCriteriaCount !== analysisEvaluationCount) {
                needsAnalysis = true;
                reason = `Criteria count mismatch: Rubric has ${rubricCriteriaCount}, Analysis has ${analysisEvaluationCount}`;
              } else {
                const rubricNames = (activeRubric.criteria || []).map(c => c.name).sort().join('|');
                const analysisNames = (analysis.rubric_evaluation || []).map(e => e.criterion_name).sort().join('|');

                if (rubricNames !== analysisNames) {
                  needsAnalysis = true;
                  reason = "Criteria names have changed";
                } else if (rubricDate && analysisDate && rubricDate.getTime() > analysisDate.getTime()) {
                  needsAnalysis = true;
                  reason = `Rubric updated (${rubricDate.toLocaleTimeString()}) after last analysis (${analysisDate.toLocaleTimeString()})`;
                } else if (!analysisDate && rubricDate) {
                  needsAnalysis = true;
                  reason = "Analysis has no timestamp but rubric does";
                }
              }
            }
          } catch (e) {
            console.error("[AutoAnalysis] Failed to check rubric for updates", e);
          }
        }

        if (needsAnalysis && !isAnalyzing && !hasAttemptedAutoAnalysis.current) {
          hasAttemptedAutoAnalysis.current = true;
          console.log(`[AutoAnalysis] Triggering analysis. Reason: ${reason}`);
          handleRunAIEvaluation();
        }
      };

      checkAndRunAnalysis();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submission, loading, isAnalyzing]);

  /* Ensure loading state lasts at least 2 seconds */
  /* Ensure loading state lasts at least 2 seconds */
  const fetchSubmissionDetail = async () => {
    try {
      setLoading(true);
      setShowSuccessModal(false);

      const response = await dashboardAPI.getSubmissionDetail(id, { forceRefresh: true });

      setSubmission(response.data);
    } catch (err) {
      setError('Failed to load submission details');
      console.error('Submission detail error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="detail-page" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <div className="spinner-maroon"></div>
        <p style={{ marginTop: '1rem', color: 'var(--color-maroon)', fontWeight: '600' }}>Loading submission...</p>
      </div>
    );
  }

  if (error || !submission) {
    const analysis = submission?.analysis_result;

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

  const analysis = submission?.analysis_result;

  const handleRunAIEvaluation = async () => {
    setIsAnalyzing(true);
    setProgress(0);
    setProgressText('Preparing AI analysis...');

    // Clear existing analysis so the user only sees the loading state
    setSubmission(prev => ({
      ...prev,
      analysis_result: null
    }));

    try {
      // 1. Try to get the rubric assigned to the deadline from DB first
      let activeRubric = null;
      try {
        const rubricResponse = await rubricAPI.getRubrics();
        const rubrics = rubricResponse.data;

        // Match by deadline's rubric_id or find the active one
        const targetId = submission.deadline?.rubric_id;
        activeRubric = rubrics.find(r => String(r.id) === String(targetId)) ||
          rubrics.find(r => r.is_active) ||
          rubrics[0];
      } catch (e) {
        console.warn("Failed to fetch rubrics from DB, falling back to localStorage", e);
        const savedRubrics = JSON.parse(localStorage.getItem('metadoc_rubrics') || '[]');
        const targetId = submission.deadline?.rubric_id;
        activeRubric = savedRubrics.find(r => String(r.id) === String(targetId)) ||
          savedRubrics.find(r => r.is_active) ||
          savedRubrics[0];
      }

      if (!activeRubric || !activeRubric.criteria || activeRubric.criteria.length === 0) {
        alert("Please create and save a rubric in the Rubric Management page first.");
        setIsAnalyzing(false);
        return;
      }

      const duration = 3000;
      const intervalMs = 50;
      const steps = duration / intervalMs;
      let currentStep = 0;

      const progressInterval = setInterval(() => {
        currentStep++;
        const targetProgress = Math.min(95, (currentStep / steps) * 95);
        setProgress(targetProgress);

        if (targetProgress < 30) setProgressText('Reading document context...');
        else if (targetProgress < 60) setProgressText('Evaluating against rubric...');
        else if (targetProgress < 90) setProgressText('Synthesizing feedback...');
        else setProgressText('Finalizing AI report...');
      }, intervalMs);

      // 2. Call the real AI evaluation API
      const response = await dashboardAPI.runAIEvaluation(id, activeRubric);

      clearInterval(progressInterval);
      setProgress(100);
      setProgressText('Complete');

      // Wait for 1 second at 100% before completing analysis
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Update local state with fresh analysis
      setSubmission(prev => ({
        ...prev,
        analysis_result: {
          ...prev.analysis_result,
          ...response.data
        }
      }));

      setShowSuccessModal(true);
      setAnalysisError(null);
      setTimeout(() => setShowSuccessModal(false), 4000);

      // If we are in a "Pending" state, refresh the whole submission to get the 'Completed' status
      if (submission.status !== 'completed') {
        const detailResponse = await dashboardAPI.getSubmissionDetail(id);
        setSubmission(detailResponse.data);
      }

    } catch (err) {
      console.error('AI Evaluation error:', err);
      const errorMsg = err.response?.data?.error || err.message || 'Failed to perform AI evaluation.';

      if (errorMsg.includes('429')) {
        alert("Gemini AI Quota Exceeded. Please wait a minute before trying again.");
      } else if (errorMsg.includes('404')) {
        alert("Gemini AI Model not found. Attempting to recover...");
      } else {
        setAnalysisError(`AI Evaluation Error: ${errorMsg}`);
        alert(`AI Evaluation Error: ${errorMsg}`);
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="detail-page">
      {showSuccessModal && (
        <div className="success-header-modal">
          <CheckCircle size={20} />
          <span>Report Generated Successfully!</span>
        </div>
      )}

      <button className="btn btn-ghost mb-lg" onClick={handleBack}>
        <ArrowLeft size={20} />
        Back
      </button>

      <div className="detail-header">
        <div className="detail-title-section">
          <h1>{submission.original_filename}</h1>
        </div>

        <button className="btn btn-primary btn-sm" onClick={handleViewFile} title="View original file">
          <ExternalLink size={16} className="mr-2" />
          View File
        </button>
      </div>


      <div className="detail-grid">
        {/* Basic Information & Document Metadata side by side */}
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
                <span className="info-label">Last Activity</span>
                <span className="info-value">
                  {(analysis.document_metadata.modified_date || analysis.document_metadata.last_modified_date)
                    ? new Date(analysis.document_metadata.modified_date || analysis.document_metadata.last_modified_date).toLocaleString([], {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true
                    }).replace(/\s(?=[AP]M)/i, '')
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
            <div className="pt-8 border-t border-gray-100">
              <h4 className="section-subtitle">
                <Users size={20} />
                Group Members / Contributors
              </h4>
              <div className="contributors-list">
                {(() => {
                  let contributors = [];

                  // Use backend provided contributors list if available
                  if (analysis.document_metadata.contributors && analysis.document_metadata.contributors.length > 0) {
                    contributors = analysis.document_metadata.contributors;
                  } else {
                    // Fallback logic
                    if (analysis.document_metadata.author) {
                      contributors.push({
                        name: analysis.document_metadata.author,
                        role: 'Author',
                        date: analysis.document_metadata.created_date || analysis.document_metadata.creation_date,
                      });
                    }
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
                    contributors.map((contributor, index) => {
                      const role = normalizeContributorRole(contributor.role);
                      return (
                        <div key={index} className="contributor-item">
                          <div className="contributor-details">
                            <div className="contributor-name-row">
                              <span className="contributor-name">{contributor.name}</span>
                              <span className={`contributor-role-tag tag-${role.toLowerCase()}`}>
                                {role}
                              </span>
                            </div>
                            {(contributor.date || contributor.email) && (
                              <div className="contributor-meta" title="Time of last document contribution">
                                {contributor.date && !isNaN(Date.parse(contributor.date)) ? (
                                  <>
                                    <span className="meta-prefix">Last activity:</span>
                                    <Calendar size={14} />
                                    <span>
                                      {new Date(contributor.date).toLocaleDateString([], {
                                        year: 'numeric',
                                        month: 'long',
                                        day: 'numeric'
                                      })}
                                    </span>
                                    <Clock size={14} className="ml-2" />
                                    <span>
                                      {new Date(contributor.date).toLocaleTimeString([], {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        hour12: true
                                      }).replace(/\s(?=[AP]M)/i, '')}
                                    </span>
                                  </>
                                ) : (
                                  <span>{contributor.email}</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-muted">No contributor information available</p>
                  );
                })()}
              </div>
            </div>

          </Card>
        )}

        {/* AI Proposal Analysis Section */}
        <div className="card-full-width">
          <Card
            title={
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <FileText size={20} />
                  <span>AI Analysis & Evaluation</span>
                </div>
                <div className="flex items-center gap-2">
                  {showSuccessModal && (
                    <Badge variant="success">
                      <CheckCircle size={12} className="mr-1" />
                      Success
                    </Badge>
                  )}
                  {analysisError && (
                    <Badge variant="error">
                      <AlertCircle size={12} className="mr-1" />
                      Error
                    </Badge>
                  )}
                </div>
              </div>
            }
            className="h-full"
          >
            <div className="space-y-8">
              {/* Premium Overall Score Section */}
              {analysis && !isAnalyzing && (
                <div className="ai-overall-score-container">
                  <div className="ai-score-text-content">
                    <h4 className="ai-overall-score-label">OVERALL SCORE</h4>
                    <p className="ai-overall-score-subtext">Aggregated across all evaluation criteria.</p>
                  </div>
                  <div className="ai-score-visual-wrapper">
                    <div className="score-circle-container">
                      <svg viewBox="0 0 100 100" className="score-svg">
                        <circle cx="50" cy="50" r="45" className="score-circle-bg" />
                        <circle
                          cx="50"
                          cy="50"
                          r="45"
                          className="score-circle-fg"
                          style={{
                            strokeDasharray: '282.7',
                            strokeDashoffset: 282.7 - (282.7 * (analysis?.score || 0) / 100)
                          }}
                        />
                      </svg>
                      <div className="score-display">
                        <span className="score-main">{Math.round(analysis?.score || 0)}</span>
                        <span className="score-denominator">/ 100</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {isAnalyzing || showSuccessModal || analysisError ? (
                <div className={`processing-card is-analyzing-card ${analysisError ? 'has-error' : ''} ${showSuccessModal ? 'is-completed' : ''}`}>
                  <div className="processing-header-row">
                    <div className="processing-icon-box">
                      {analysisError ? (
                        <AlertCircle size={24} className="text-error" />
                      ) : showSuccessModal ? (
                        <CheckCircle size={24} className="text-success" />
                      ) : (
                        <img src={logo4} alt="Loading" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '8px' }} />
                      )}
                    </div>
                    <h3 className="processing-title">
                      {analysisError ? 'Analysis Failed' : showSuccessModal ? 'Report Completed!' : 'Generating Report...'}
                    </h3>
                  </div>
                  <div className="processing-progress-container">
                    <div className="processing-progress-bar-bg">
                      <div
                        className={`processing-progress-bar-fill ${analysisError ? 'bg-error' : showSuccessModal ? 'bg-success' : ''}`}
                        style={{ width: `${analysisError ? 100 : progress}%` }}
                      ></div>
                    </div>
                  </div>
                  <div className="processing-footer-row">
                    <span className="processing-subtext">
                      {analysisError ? analysisError : showSuccessModal ? 'The AI analysis has been successfully generated.' : progressText}
                    </span>
                    <span className="processing-percentage">
                      {analysisError ? 'Error' : showSuccessModal ? '100%' : `${Math.round(progress)}%`}
                    </span>
                  </div>
                </div>
              ) : null}

              {(!isAnalyzing && !showSuccessModal && !analysisError && (!analysis || !analysis.rubric_evaluation || analysis.rubric_evaluation.length === 0)) && (
                <div className="unavailable-state">
                  <AlertCircle size={32} className="text-slate-300" />
                  <h4>Analysis Unavailable</h4>
                  <p>Unable to generate AI evaluation for this document.</p>
                </div>
              )}

              {analysis?.ai_summary && !isAnalyzing && !showSuccessModal && !analysisError && (
                <div className="ai-analysis-container">
                  {/* Executive Summary */}
                  <div className="ai-exec-summary">
                    <h3>
                      <Sparkles size={16} className="text-maroon" /> Executive Summary
                    </h3>
                    <p>
                      {analysis.ai_summary}
                    </p>
                  </div>

                  {/* Strengths and Weaknesses */}
                  <div className="ai-feedback-grid">
                    {analysis?.strengths && (
                      <div className="ai-strengths">
                        <h3>
                          <CheckCircle size={16} /> Key Strengths
                        </h3>
                        <ul className="ai-list strengths">
                          {(Array.isArray(analysis.strengths) ? analysis.strengths : [analysis.strengths]).map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {analysis?.weaknesses && (
                      <div className="ai-weaknesses">
                        <h3>
                          <AlertCircle size={16} /> Areas for Improvement
                        </h3>
                        <ul className="ai-list weaknesses">
                          {(Array.isArray(analysis.weaknesses) ? analysis.weaknesses : [analysis.weaknesses]).map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Detailed Rubric Evaluation */}
                  {analysis?.rubric_evaluation && (
                    <div className="ai-detailed-eval">
                      <h3 className="ai-detailed-eval-header">
                        <ClipboardList size={18} /> DETAILED EVALUATION
                      </h3>
                      <div className="ai-criteria-list">
                        {analysis.rubric_evaluation.map((item, index) => (
                          <div key={index} className="ai-criterion-card">
                            <div className="ai-criterion-content">
                              <div className="ai-criterion-header">
                                <span className="ai-criterion-index">
                                  {(index + 1)}
                                </span>
                                <h4 className="ai-criterion-name">{item.criterion_name}</h4>
                              </div>
                              <p className="ai-criterion-feedback">
                                {item.feedback}
                              </p>
                            </div>
                            <div className="ai-criterion-score">
                              <div className="ai-score-val">{item.score}</div>
                              <div className="ai-score-label">SCORE / 100</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>

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
