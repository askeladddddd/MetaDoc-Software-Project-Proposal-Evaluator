import axios from 'axios';

// Use relative URL in development to leverage Vite proxy, absolute URL in production
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('session_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Unauthorized - clear token and redirect based on active auth flow
      const storedUserType = localStorage.getItem('user_type');
      const redirectAfterAuth = localStorage.getItem('redirect_after_auth') || '';
      const isStudentFlow =
        storedUserType === 'student' ||
        window.location.pathname.startsWith('/student') ||
        redirectAfterAuth === '/student/login' ||
        redirectAfterAuth.startsWith('/submit');

      localStorage.removeItem('session_token');
      localStorage.removeItem('user');
      window.location.href = isStudentFlow ? '/student/login' : '/login';
    }
    return Promise.reject(error);
  }
);

// Authentication API
export const authAPI = {
  initiateLogin: (userType = 'professor', provider = 'google') =>
    api.get('/auth/login', { params: { user_type: userType, provider: provider } }),
  validateSession: (sessionToken) => api.post('/auth/validate', { session_token: sessionToken }),
  logout: (sessionToken) => api.post('/auth/logout', { session_token: sessionToken }),
  getProfile: () => api.get('/auth/profile'),
  generateSubmissionToken: (deadlineId = null) => api.post('/auth/generate-submission-token', { deadline_id: deadlineId }),
};

// Submission API
export const submissionAPI = {
  uploadFile: (formData) => {
    return api.post('/submission/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  submitDriveLink: (data) => api.post('/submission/drive-link', data),
  getStatus: (jobId) => api.get(`/submission/status/${jobId}`),
  validateDriveLink: (driveLink) => api.post('/submission/validate-link', { drive_link: driveLink }),
  getStudentStatus: (token) => api.get(`/submission/student-status`, { params: { token } }),
  registerStudent: (data) => api.post('/submission/student-register', data),
  getStudentLinks: () => api.get('/submission/student-links'),
};

// Dashboard API
export const dashboardAPI = {
  getOverview: () => api.get('/dashboard/overview'),
  getSubmissions: (params) => api.get('/dashboard/submissions', { params }),
  getSubmissionDetail: (submissionId, options = {}) => api.get(
    `/dashboard/submissions/${submissionId}`,
    {
      params: options.forceRefresh ? { force_refresh: true } : undefined,
    }
  ),
  deleteSubmission: (submissionId) => api.delete(`/dashboard/submissions/${submissionId}`),
  getDeadlines: (includePast = false) => api.get('/dashboard/deadlines', { params: { include_past: includePast } }),
  createDeadline: (data) => api.post('/dashboard/deadlines', data),
  updateDeadline: (deadlineId, data) => api.put(`/dashboard/deadlines/${deadlineId}`, data),
  deleteDeadline: (deadlineId) => api.delete(`/dashboard/deadlines/${deadlineId}`),
  getSubmissionFile: (submissionId) => api.get(`/dashboard/submissions/${submissionId}/download`, { responseType: 'blob' }),
  downloadDeadlineFiles: (deadlineId) => api.get(`/dashboard/deadlines/${deadlineId}/download-all`, { responseType: 'blob' }),
  getDeadlineStudents: () => api.get('/dashboard/students'),
  getArchivedStudents: () => api.get('/dashboard/students', { params: { archived: true } }),
  importDeadlineStudents: (students) => api.post('/dashboard/students/import', { students }),
  deleteDeadlineStudent: (studentId) => api.delete(`/dashboard/students/${studentId}`),
  addDeadlineStudent: (data) => api.post('/dashboard/students/add', data),
  updateDeadlineStudent: (studentId, data) => api.put(`/dashboard/students/${studentId}`, data),
  archiveStudents: (studentIds) => api.post('/dashboard/students/archive', { student_ids: studentIds }),
  unarchiveStudents: (studentIds) => api.post('/dashboard/students/unarchive', { student_ids: studentIds }),
  getContributionReport: (submissionId, options = {}) => api.get(
    `/dashboard/submissions/${submissionId}/contribution-report`,
    {
      params: {
        ...(options.refresh ? { refresh: true } : {}),
      },
      timeout: 60000,
    }
  ),
};

// Metadata API
export const metadataAPI = {
  analyzeSubmission: (submissionId) => api.post(`/metadata/analyze/${submissionId}`),
  getResult: (submissionId) => api.get(`/metadata/result/${submissionId}`),
};

// Insights API
export const insightsAPI = {
  analyzeSubmission: (submissionId) => api.post(`/insights/analyze/${submissionId}`),
  getTimeliness: (submissionId) => api.get(`/insights/timeliness/${submissionId}`),
  getContribution: (submissionId) => api.get(`/insights/contribution/${submissionId}`),
};

// NLP API
export const nlpAPI = {
  analyzeSubmission: (submissionId) => api.post(`/nlp/analyze/${submissionId}`),
  getReadability: (submissionId) => api.get(`/nlp/readability/${submissionId}`),
  getEntities: (submissionId) => api.get(`/nlp/entities/${submissionId}`),
};

// Reports API
// Reports API
export const reportsAPI = {
  // Accepts { submission_ids: [...] } OR { filters: { ... } }
  exportPDF: (data) => api.post('/reports/export/pdf', data),
  exportCSV: (data) => api.post('/reports/export/csv', data),
  downloadExport: (exportId) => api.get(`/reports/download/${exportId}`, { responseType: 'blob' }),
  getExports: () => api.get('/reports/exports'),
};

export default api;
