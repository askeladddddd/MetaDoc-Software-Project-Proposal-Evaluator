import { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import DashboardLayout from './components/Layout/DashboardLayout';
import Login from './pages/Login';
import OAuthCallback from './pages/OAuthCallback';
import TokenBasedSubmission from './pages/TokenBasedSubmission';
import Dashboard from './pages/Dashboard';
import Deliverable from './pages/Deliverable';
import SubmissionDetailView from './pages/SubmissionDetailView';
import Reports from './pages/Reports';
import ClassList from './pages/ClassList';
import StudentLogin from './pages/StudentLogin';
import './App.css';

const Register = lazy(() =>
  import('./pages/Register').then((module) => ({
    default: module.default || module.Register,
  }))
);

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Prevent students from accessing professor pages
  if (user?.role === 'student' || user?.role === 'STUDENT') {
    return <Navigate to="/" replace />;
  }

  return children;
};

// Public Route Component (redirect to dashboard if already authenticated)
const PublicRoute = ({ children }) => {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  // Redirect authenticated users to appropriate landing pages
  if (isAuthenticated) {
    if (user?.role === 'professor' || user?.role === 'admin') {
      return <Navigate to="/dashboard" replace />;
    } else if (user?.role === 'student' || user?.role === 'STUDENT') {
      return <Navigate to="/student/login" replace />;
    }
  }

  return children;
};

function App() {
  return (
    <Router>
      <AuthProvider>
        <Suspense
          fallback={
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
              <div className="spinner"></div>
            </div>
          }
        >
          <Routes>
          {/* Public Routes */}
          <Route
            path="/"
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            }
          />
          <Route
            path="/register"
            element={
              <PublicRoute>
                <Register />
              </PublicRoute>
            }
          />
          <Route path="/submit" element={<TokenBasedSubmission />} />
          <Route path="/student/login" element={<StudentLogin />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/auth/callback" element={<OAuthCallback />} />

          {/* Protected Routes */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Dashboard />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/deliverables"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Deliverable />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route path="/dashboard/folders" element={<Navigate to="/dashboard/deliverables" replace />} />
          <Route
            path="/dashboard/submissions"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Deliverable />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/submissions/:id"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <SubmissionDetailView />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard/class-list"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <ClassList />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/reports"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Reports />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          {/* Default redirect */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </Router>
  );
}

export default App;
