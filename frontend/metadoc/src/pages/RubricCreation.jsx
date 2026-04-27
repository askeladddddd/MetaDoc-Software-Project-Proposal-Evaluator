import { useState, useEffect } from 'react';
import {
  ClipboardList,
  Plus,
  Trash2,
  Save,
  AlertCircle,
  CheckCircle,
  FileText,
  Settings,
  Pencil,
  Search,
  Info
} from '../components/common/Icons';
import RubricEditorModal from '../components/RubricEditorModal';
import { rubricAPI } from '../services/api';
import { useLoadingState } from '../hooks/useLoadingState';
import '../styles/RubricCreation.css';

const RubricCreation = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [rubrics, setRubrics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRubric, setEditingRubric] = useState(null);
  const [error, setError] = useState(null);
  const [notification, setNotification] = useState(null);
  const { showLongLoading } = useLoadingState(loading);

  // Load rubrics from backend
  useEffect(() => {
    fetchRubrics();
  }, []);

  const fetchRubrics = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const response = await rubricAPI.getRubrics();
      const dbRubrics = response.data;

      // Data fetched successfully
      setRubrics(dbRubrics);
    } catch (err) {
      console.error("Failed to fetch rubrics", err);
      setError('Failed to Connect to Server');
      setRubrics([]);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const handleCreateNew = () => {
    setEditingRubric(null);
    setIsModalOpen(true);
  };

  const handleEditRubric = (rubric) => {
    setEditingRubric(rubric);
    setIsModalOpen(true);
  };

  const handleSaveRubric = async (updatedRubric) => {
    try {
      if (updatedRubric.id && !updatedRubric.id.startsWith('rubric-')) {
        // Update existing in DB
        await rubricAPI.updateRubric(updatedRubric.id, updatedRubric);
      } else {
        // Create new in DB
        const cleanedRubric = { ...updatedRubric };
        delete cleanedRubric.id; // Let backend generate ID
        await rubricAPI.createRubric(cleanedRubric);
      }

      await fetchRubrics(false); // Refresh list
      setNotification({ type: 'success', message: 'Rubric saved!' });
      setTimeout(() => setNotification(null), 3000);
    } catch (err) {
      console.error("Failed to save rubric", err);
      setNotification({ type: 'error', message: 'Failed to save rubric.' });
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleDeleteRubric = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this rubric?")) return;

    try {
      await rubricAPI.deleteRubric(id);
      setRubrics(prevRubrics => prevRubrics.filter(rubric => rubric.id !== id));
      setNotification({ type: 'success', message: 'Rubric deleted.' });
    } catch (err) {
      setNotification({ type: 'error', message: 'Failed to delete.' });
    }
    setTimeout(() => setNotification(null), 3000);
  };

  const filteredRubrics = rubrics.filter(r =>
    r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (error) {
    return (
      <div className="dashboard-error" style={{ height: '70vh' }}>
        <AlertCircle size={48} />
        <h3>{error}</h3>
        <p>Unable to load rubrics. Please check your backend connection and try again.</p>
      </div>
    );
  }

  return (
    <div className="rubric-creation-page fade-in">
      {notification && (
        <div className={`notification notification-${notification.type} animate-slide-in`}>
          {notification.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          <span>{notification.message}</span>
        </div>
      )}

      <div className="rubrics-list-view">
        <div className="submissions-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--spacing-xl)' }}>
          <div>
            <h1>Rubric Management</h1>
            <p>Design and manage AI evaluation frameworks for proposal submissions.</p>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-add-rubric-main"
            onClick={handleCreateNew}
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
                placeholder="Search rubrics..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="rubrics-grid">
          {loading ? (
            showLongLoading ? (
              <div className="spinner-container-maroon" style={{ gridColumn: '1 / -1' }}>
                <div className="spinner-maroon"></div>
                <p style={{ marginTop: '1rem', color: 'var(--color-maroon)', fontWeight: '600' }}>Loading Rubric Management...</p>
              </div>
            ) : (
              // Show skeletons while loading
              [...Array(6)].map((_, i) => (
                <div key={`skeleton-${i}`} className="rubric-card-skeleton">
                  <div className="skeleton-header">
                    <div className="skeleton skeleton-icon"></div>
                  </div>
                  <div className="skeleton-body">
                    <div className="skeleton skeleton-title"></div>
                    <div className="skeleton-description">
                      <div className="skeleton skeleton-text"></div>
                      <div className="skeleton skeleton-text-half"></div>
                    </div>
                  </div>
                  <div className="skeleton skeleton-stat"></div>
                </div>
              ))
            )
          ) : filteredRubrics.length > 0 ? (
              filteredRubrics.map(rubric => (
                <div
                  key={rubric.id}
                  className="rubric-card"
                  onClick={() => handleEditRubric(rubric)}
                >
                  <div className="rubric-card-inner">
                    <div className="rubric-header">
                      <div className="rubric-icon-box">
                        <ClipboardList size={20} />
                      </div>
                      <div className="rubric-hover-actions">
                        <button
                          className="rubric-hover-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditRubric(rubric);
                          }}
                          title="Edit Rubric"
                        >
                          <Pencil size={18} />
                        </button>
                        <button
                          className="rubric-hover-btn delete"
                          onClick={(e) => handleDeleteRubric(e, rubric.id)}
                          title="Delete Rubric"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>

                    <div className="rubric-content">
                      <h3 className="rubric-title" title={rubric.name}>{rubric.name}</h3>
                      <p className="rubric-description">
                        {rubric.description || 'No description provided.'}
                      </p>
                    </div>

                    <div className="rubric-stats-row">
                      <div className="rubric-stat">
                        <FileText size={16} />
                        <span>{rubric.criteria?.length || 0} Criteria</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
            <div className="rubric-empty-state">
              <div className="empty-icon-container">
                <Info size={48} />
              </div>
              <h3>No rubrics created</h3>
              <p>You haven't designed any evaluation frameworks yet.</p>
            </div>
          )}
        </div>
      </div>

      <RubricEditorModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        rubricToEdit={editingRubric}
        onSave={handleSaveRubric}
      />
    </div>
  );
};

export default RubricCreation;
