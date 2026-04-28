import React, { useState, useEffect } from 'react';
import Card from './common/Card/Card';
import { nlpAPI } from '../services/api';

const RubricEditorModal = ({ isOpen, onClose, rubricToEdit, onSave }) => {
  const [activeRubric, setActiveRubric] = useState(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (rubricToEdit) {
      setActiveRubric(JSON.parse(JSON.stringify(rubricToEdit)));
    } else if (isOpen) {
      setActiveRubric({
        id: `rubric-${Date.now()}`,
        name: 'Untitled Rubric',
        description: '',
        evaluation_goal: '',
        reviewer_persona: 'Academic Reviewer',
        ai_prompt_message: '',
        is_active: false,
        created_at: new Date().toISOString(),
        criteria: []
      });
    }
  }, [rubricToEdit, isOpen]);

  if (!isOpen || !activeRubric) return null;

  const handleAddCriterion = () => {
    const newCriterion = {
      id: `crit-${Date.now()}`,
      name: '',
      description: '',
      weight: 0,
      levels: []
    };
    setActiveRubric({
      ...activeRubric,
      criteria: [...activeRubric.criteria, newCriterion]
    });
  };

  const handleGenerateRandomCriteria = () => {
    setGenerating(true);
    
    // Comprehensive pool of software project proposal evaluation criteria based on academic research
    const researchBasedCriteriaPool = [
      { name: 'Problem Identification', description: 'Evaluates how clearly the proposal identifies and justifies the specific problem or gap being addressed.' },
      { name: 'Technical Feasibility', description: 'Assesses the practicality of the proposed solution and the appropriateness of the chosen technologies.' },
      { name: 'Methodological Rigor', description: 'Reviews the software development lifecycle (SDLC) or research methodology for completeness and sound logic.' },
      { name: 'Innovation and Impact', description: 'Measures the potential contribution to the field and the novelty of the proposed software solution.' },
      { name: 'System Architecture', description: 'Evaluates the quality of the high-level system design, including database, UI/UX, and backend components.' },
      { name: 'Literature Review', description: 'Checks if the proposal situates the work within current research and existing commercial solutions.' },
      { name: 'Ethical and Social Implications', description: 'Considers data privacy, security, and the broader societal impact of the software.' },
      { name: 'Project Timeline', description: 'Assesses the realism of the development phases, milestones, and final delivery schedule.' },
      { name: 'Scalability and Future Work', description: 'Considers how well the system can handle growth and the vision for future enhancements.' },
      { name: 'Resource Allocation', description: 'Evaluates the justification for the hardware, software, and human resources requested.' }
    ];

    // Shuffle and pick 5 random criteria
    const shuffled = [...researchBasedCriteriaPool].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 5);

    // Distribute weights evenly (20% each for 5 items)
    const criteriaWithWeights = selected.map((c, i) => ({
      ...c,
      id: `crit-res-${Date.now()}-${i}`,
      weight: 20,
      levels: []
    }));

    setActiveRubric({
      ...activeRubric,
      criteria: criteriaWithWeights
    });

    // Simulate a brief generation delay for UX feedback
    setTimeout(() => {
      setGenerating(false);
    }, 600);
  };

  const handleDeleteCriterion = (index) => {
    const newCriteria = [...activeRubric.criteria];
    newCriteria.splice(index, 1);
    setActiveRubric({ ...activeRubric, criteria: newCriteria });
  };

  const calculateTotalWeight = () => {
    return activeRubric.criteria.reduce((sum, c) => sum + (parseFloat(c.weight) || 0), 0);
  };

  const totalWeight = calculateTotalWeight();
  const remainingWeight = 100 - totalWeight;
  const isWeightValid = totalWeight === 100;

  const handleSaveInternal = () => {
    setSaving(true);
    setTimeout(() => {
      onSave(activeRubric);
      setSaving(false);
      onClose();
    }, 1000);
  };

  return (
    <div className="modal-overlay rubric-modal-overlay" onClick={onClose}>
      <div className="modal-content rubric-editor-modal-v4" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="simple-modal-header-v4">
          <div className="header-left-v4">
            <div className="header-text-v4">
              <h2>{rubricToEdit ? 'Edit Rubric' : 'Create New Rubric'}</h2>
              <p>Define criteria to evaluate submissions consistently</p>
            </div>
          </div>
          <button className="btn-close-v4" onClick={onClose}>
            &#x2715;
          </button>
        </div>

        {/* Body */}
        <div className="simple-modal-body-v4">
          <div className="form-group-v4">
            <label>TITLE *</label>
            <input
              type="text"
              value={activeRubric.name}
              onChange={(e) => setActiveRubric({ ...activeRubric, name: e.target.value })}
              placeholder="Untitled Rubric"
            />
          </div>

          <div className="form-group-v4">
            <label>DESCRIPTION <span className="optional-text">(Optional)</span></label>
            <textarea
              value={activeRubric.description}
              onChange={(e) => setActiveRubric({ ...activeRubric, description: e.target.value })}
              placeholder="Briefly describe the purpose of this rubric"
              rows={2}
            />
          </div>



          <div className="criteria-section-v4">
            <div className="criteria-header-v4">
              <div className="criteria-header-left">
                <label>EVALUATION CRITERIA</label>
                <div className={`weight-subtitle ${remainingWeight < 0 ? 'weight-negative' : ''}`}>
                  {remainingWeight === 0 ? (
                    <span className="weight-valid">Total weight: 100% (Perfect)</span>
                  ) : (
                    <span>
                      Weight Balance: <b style={{ color: remainingWeight < 0 ? '#ef4444' : 'inherit' }}>{remainingWeight}%</b>
                      {remainingWeight < 0 ? ' (Maximum exceeded)' : ' remaining'}
                    </span>
                  )}
                </div>
              </div>
              <div className="criteria-header-right" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-end' }}>
                <button className="btn-add-crit-v4" onClick={handleAddCriterion}>
                  + Add Criterion
                </button>
                <button
                  className="btn-generate-v4"
                  onClick={handleGenerateRandomCriteria}
                  disabled={generating}
                  style={{
                    fontSize: '0.75rem',
                    color: generating ? '#94a3b8' : '#64748b',
                    background: '#f1f5f9',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: 'none',
                    cursor: generating ? 'not-allowed' : 'pointer',
                    fontWeight: '600'
                  }}
                >
                  {generating ? 'Generating...' : 'Generate'}
                </button>
              </div>
            </div>

            <div className="criteria-list-v4">
              {activeRubric.criteria.map((criterion, index) => (
                <div key={criterion.id} className="criterion-card-v4">
                  <div className="crit-row-1">
                    <div className="drag-handle-v4">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" opacity="0.4"><circle cx="9" cy="12" r="1.5"></circle><circle cx="9" cy="5" r="1.5"></circle><circle cx="9" cy="19" r="1.5"></circle><circle cx="15" cy="12" r="1.5"></circle><circle cx="15" cy="5" r="1.5"></circle><circle cx="15" cy="19" r="1.5"></circle></svg>
                    </div>
                    <input
                      type="text"
                      className="crit-name-v4"
                      placeholder="Criterion Name"
                      value={criterion.name}
                      onChange={(e) => {
                        const newCriteria = [...activeRubric.criteria];
                        newCriteria[index].name = e.target.value;
                        setActiveRubric({ ...activeRubric, criteria: newCriteria });
                      }}
                    />
                    <div className="weight-input-wrapper">
                      <input
                        type="number"
                        className="crit-weight-v4"
                        value={criterion.weight}
                        onChange={(e) => {
                          const newCriteria = [...activeRubric.criteria];
                          newCriteria[index].weight = e.target.value;
                          setActiveRubric({ ...activeRubric, criteria: newCriteria });
                        }}
                      />
                      <span className="percent-sign">%</span>
                    </div>
                    <button
                      className="btn-delete-crit-v4"
                      onClick={() => handleDeleteCriterion(index)}
                      title="Remove Criterion"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'color 0.2s',
                        marginLeft: '4px'
                      }}
                      onMouseOver={(e) => e.currentTarget.style.color = '#ef4444'}
                      onMouseOut={(e) => e.currentTarget.style.color = '#94a3b8'}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    </button>
                  </div>
                  <div className="crit-row-2">
                    <textarea
                      className="crit-desc-v4"
                      placeholder="Description..."
                      value={criterion.description}
                      onChange={(e) => {
                        const newCriteria = [...activeRubric.criteria];
                        newCriteria[index].description = e.target.value;
                        setActiveRubric({ ...activeRubric, criteria: newCriteria });
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="form-group-v4">
            <label>AI PROMPT MESSAGE <span className="optional-text">(Optional)</span></label>
            <textarea
              value={activeRubric.ai_prompt_message || ''}
              onChange={(e) => setActiveRubric({ ...activeRubric, ai_prompt_message: e.target.value })}
              placeholder="Add custom instructions for the AI evaluator. These will be prioritized when scoring. Example: 'Pay special attention to the user interface design. Prioritize feasibility over innovation.'"
              rows={4}
              style={{
                fontFamily: 'Consolas, Monaco, monospace',
                fontSize: '0.85rem',
                padding: '8px 12px',
                border: '1px solid #cbd5e1'
              }}
            />
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ minWidth: '16px' }}
              >
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
              </svg>
              <span>Use this to give the AI specific evaluation guidance. Your instructions will be highlighted as IMPORTANT and prioritized.</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer-v4">
          <div className="footer-left-text">
            {activeRubric.criteria.length} criterion{activeRubric.criteria.length !== 1 && 's'} defined
          </div>
          <div className="footer-actions-v4">
            <button className="btn-cancel-v4" onClick={onClose}>Cancel</button>
            <button
              className="btn-save-v4"
              onClick={handleSaveInternal}
              disabled={saving || !isWeightValid}
              title={!isWeightValid ? 'Total weight must be exactly 100%' : ''}
            >
              {saving ? 'Saving...' : rubricToEdit ? 'Update Rubric' : 'Save Rubric'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RubricEditorModal;
