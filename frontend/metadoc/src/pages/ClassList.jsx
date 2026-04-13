import React, { useState, useEffect, useRef } from 'react';
import {
    Users,
    FileUp,
    CheckCircle2,
    XCircle,
    Search,
    AlertCircle,
    Loader2,
    ArrowUpDown,
    Trash2,
    Archive,
    RotateCcw,
    Plus,
    Save,
    X
} from 'lucide-react';
import { dashboardAPI } from '../services/api';
import Card from '../components/common/Card/Card';
import Button from '../components/common/Button/Button';
import '../styles/ClassList.css';

const ClassList = () => {
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortBy, setSortBy] = useState('none');
    const [teamCodeFilter, setTeamCodeFilter] = useState('none');
    const [subjectFilter, setSubjectFilter] = useState('All');
    const [showArchivedOnly, setShowArchivedOnly] = useState(false);
    const [error, setError] = useState(null);
    const [modalError, setModalError] = useState(null);
    const [selectedIds, setSelectedIds] = useState([]);
    const [fullNameDrafts, setFullNameDrafts] = useState({});

    // Modal state
    const [isActionModalOpen, setIsActionModalOpen] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [currentStudentId, setCurrentStudentId] = useState(null);
    const [formData, setFormData] = useState({
        student_id: '',
        last_name: '',
        first_name: '',
        course_year: '',
        email: '',
        team_code: ''
    });

    const fileInputRef = useRef(null);
    const [classRows, setClassRows] = useState([]);

    const teamCodeOptions = [...new Set(
        classRows
            .map((row) => String(row.teamCode || '').trim())
            .filter(Boolean)
    )].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

    const subjectOptions = [...new Set(
        classRows
            .map((row) => String(row.subjectNo || '').trim())
            .filter(Boolean)
    )].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

    useEffect(() => {
        fetchStudents();
    }, []);

    useEffect(() => {
        if (error) {
            const timer = setTimeout(() => {
                setError(null);
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [error]);

    const fetchStudents = async () => {
        try {
            setLoading(true);
            const response = await dashboardAPI.getDeadlineStudents(); // mapped to -> /students
            const mapped = (response.data.students || []).map(s => ({
                id: s.id,
                studentId: formatStudentId(s.student_id),
                lastName: s.last_name,
                firstName: s.first_name,
                courseYear: s.course_year || '',
                email: s.email,
                teamCode: s.team_code || '',
                subjectNo: s.subject_no ? String(s.subject_no).replace(/[()]/g, '') : 'IT411', // Default to IT411 if undefined in backend for now
                status: s.status,
                isArchived: !!s.is_archived,
                registrationDate: s.registration_date
            }));
            setClassRows(mapped);
            setSelectedIds([]);
        } catch (err) {
            console.error('Failed to fetch students:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleImportClick = () => {
        fileInputRef.current.click();
    };

    const handleFileChange = (e) => {
        const fileInput = e.target;
        const file = fileInput.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const text = event.target.result;
            const rows = text.split('\n');
            const parsedRows = rows.map(r => r.split(',').map(s => s.trim()));

            let headerRowIdx = -1;
            let headers = [];

            for (let i = 0; i < parsedRows.length; i++) {
                const rowUpper = parsedRows[i].map(c => c.toUpperCase());
                if (rowUpper.some(h => h.includes('STUDENT NO') || h.includes('STUDENT ID'))) {
                    headerRowIdx = i;
                    headers = parsedRows[i].map(h => h.toLowerCase());
                    break;
                }
            }

            if (headerRowIdx === -1) {
                headerRowIdx = 0;
                headers = parsedRows[0].map(h => h.toLowerCase());
            }

            let fileSubjectNo = 'IT411';
            for (let i = 0; i <= headerRowIdx; i++) {
                const rowLower = parsedRows[i].map(c => c.toLowerCase());
                const subjLabelIdx = rowLower.findIndex(c => c.includes('subject no'));
                if (subjLabelIdx !== -1) {
                    if (i > 0 && parsedRows[i - 1][subjLabelIdx]) {
                        fileSubjectNo = String(parsedRows[i - 1][subjLabelIdx]).replace(/[()]/g, '');
                        break;
                    }
                }
            }

            const idIdx = headers.findIndex(h => h.includes('id') || h.includes('student no'));
            const nameIdx = headers.findIndex(h => h.includes('name of student') || h.includes('name'));
            const lastIdx = headers.findIndex(h => h === 'last name' || h.includes('surname'));
            const firstIdx = headers.findIndex(h => h === 'first name' || h.includes('given'));
            const courseIdx = headers.findIndex(h => h.includes('course') || h.includes('year'));
            const emailIdx = headers.findIndex(h => h.includes('gmail') || h.includes('email'));
            const teamIdx = headers.findIndex(h => h.includes('team') || h.includes('group') || h.includes('code'));
            const subjIdx = headers.findIndex(h => h.includes('subj') || h.includes('subject'));

            if (idIdx === -1) {
                setError('CSV must contain a "STUDENT NO." or ID column.');
                return;
            }

            const students = [];
            for (let i = headerRowIdx + 1; i < parsedRows.length; i++) {
                const row = parsedRows[i];
                if (row.length < 2) continue;

                const studentId = row[idIdx];
                if (!studentId) continue;

                let lastName = '';
                let firstName = '';

                if (nameIdx !== -1 && row[nameIdx] && nameIdx !== lastIdx && nameIdx !== firstIdx) {
                    const nameParts = row[nameIdx].split(/\s+/);
                    lastName = nameParts.length > 1 ? nameParts.pop() : nameParts[0];
                    firstName = nameParts.length > 0 ? nameParts.join(' ') : '';
                } else {
                    lastName = lastIdx !== -1 ? row[lastIdx] : '';
                    firstName = firstIdx !== -1 ? row[firstIdx] : '';
                }

                students.push({
                    student_id: studentId,
                    last_name: lastName || '',
                    first_name: firstName || '',
                    course_year: courseIdx !== -1 ? row[courseIdx] : '',
                    email: emailIdx !== -1 ? row[emailIdx] : '',
                    team_code: teamIdx !== -1 ? row[teamIdx] : '',
                    subject_no: subjIdx !== -1 && row[subjIdx] ? String(row[subjIdx]).replace(/[()]/g, '') : fileSubjectNo
                });
            }

            try {
                setLoading(true);
                await dashboardAPI.importDeadlineStudents(students);
                fetchStudents();
            } catch (err) {
                console.error('Import failed:', err);
                setError(err.response?.data?.error || 'Failed to import student record.');
            } finally {
                setLoading(false);
                fileInput.value = ''; // Reset input to allow selecting the same file again
            }
        };
        reader.readAsText(file);
    };

    const handleToggleSelect = (id) => {
        setSelectedIds(prev => {
            const isSelected = prev.includes(id);
            if (isSelected) {
                setFullNameDrafts(drafts => {
                    if (!(id in drafts)) return drafts;
                    const next = { ...drafts };
                    delete next[id];
                    return next;
                });
                return prev.filter(i => i !== id);
            }
            return [...prev, id];
        });
    };

    const parseFullName = (fullName, existingFirstName = '', existingLastName = '') => {
        const normalized = (fullName || '').replace(/\s+/g, ' ').trim();
        if (!normalized) {
            return { firstName: existingFirstName, lastName: existingLastName };
        }

        const parts = normalized.split(' ');
        if (parts.length === 1) {
            return {
                firstName: parts[0],
                lastName: existingLastName || ''
            };
        }

        return {
            firstName: parts.slice(0, -1).join(' '),
            lastName: parts[parts.length - 1]
        };
    };

    const handleFullNameDraftChange = (id, value) => {
        setFullNameDrafts(prev => ({ ...prev, [id]: value }));
    };

    const commitFullNameDraft = (id) => {
        const draftValue = fullNameDrafts[id];
        if (draftValue === undefined) return;

        setClassRows(prev => prev.map(row => {
            if (row.id !== id) return row;

            const { firstName, lastName } = parseFullName(draftValue, row.firstName, row.lastName);
            return { ...row, firstName, lastName };
        }));

        setFullNameDrafts(prev => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
    };

    const formatStudentId = (input) => {
        if (!input) return '';
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
        return result;
    };

    const handleRowChange = (id, field, value) => {
        setClassRows(prev => prev.map(row => {
            if (row.id !== id) return row;
            if (field === 'studentId') return { ...row, studentId: formatStudentId(value) };
            return { ...row, [field]: value };
        }));
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter') {
            handleBulkSave();
        }
    };

    const handleBulkSave = async () => {
        if (selectedIds.length === 0) return;
        try {
            setLoading(true);
            const errors = [];
            for (const id of selectedIds) {
                const row = classRows.find(r => r.id === id);
                if (row) {
                    try {
                        const draftFullName = fullNameDrafts[row.id];
                        const { firstName, lastName } = draftFullName !== undefined
                            ? parseFullName(draftFullName, row.firstName, row.lastName)
                            : { firstName: row.firstName, lastName: row.lastName };

                        const updateData = {
                            student_id: row.studentId,
                            last_name: lastName,
                            first_name: firstName,
                            course_year: row.courseYear,
                            email: row.email,
                            team_code: row.teamCode
                        };
                        await dashboardAPI.updateDeadlineStudent(row.id, updateData);
                    } catch (err) {
                        const message = err.response?.data?.error || 'Unknown error';
                        errors.push(`${row.studentId}: ${message}`);
                    }
                }
            }
            if (errors.length > 0) {
                setError(`Failed to save some records (${errors.length}): ${errors.slice(0, 2).join(' | ')}`);
            } else {
                fetchStudents();
                setSelectedIds([]);
                setFullNameDrafts({});
            }
        } catch (err) {
            console.error('Bulk save error:', err);
            setError('An error occurred during save.');
        } finally {
            setLoading(false);
        }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return;
        if (!window.confirm(`Are you sure you want to delete ${selectedIds.length} selected student records?`)) return;
        try {
            setLoading(true);
            const errors = [];
            for (const id of selectedIds) {
                const student = classRows.find(r => r.id === id);
                if (student) {
                    try {
                        await dashboardAPI.deleteDeadlineStudent(student.id);
                    } catch (err) {
                        errors.push(student.studentId);
                    }
                }
            }
            if (errors.length > 0) {
                setError(`Failed to delete some records: ${errors.length} errors occurred.`);
            }
            fetchStudents();
            setSelectedIds([]);
        } catch (err) {
            console.error('Bulk delete error:', err);
            setError('An error occurred during bulk deletion.');
        } finally {
            setLoading(false);
        }
    };

    const handleBulkArchive = async () => {
        if (selectedFilteredIds.length === 0) {
            setError('Please select at least one student to restrict.');
            return;
        }
        if (!window.confirm(`Restrict ${selectedFilteredIds.length} selected student(s)? Restricted students cannot submit files until access is restored.`)) return;
        try {
            setLoading(true);
            await dashboardAPI.archiveStudents(selectedFilteredIds);
            setSelectedIds([]);
            setFullNameDrafts({});
            fetchStudents();
        } catch (err) {
            console.error('Bulk archive error:', err);
            setError(err.response?.data?.error || 'Failed to restrict selected students.');
        } finally {
            setLoading(false);
        }
    };

    const handleBulkUnarchive = async () => {
        if (selectedFilteredIds.length === 0) {
            setError('Please select at least one restricted student to undo.');
            return;
        }
        if (!window.confirm(`Undo restriction for ${selectedFilteredIds.length} selected student(s)? They will regain submission access.`)) return;
        try {
            setLoading(true);
            await dashboardAPI.unarchiveStudents(selectedFilteredIds);
            setSelectedIds([]);
            setFullNameDrafts({});
            fetchStudents();
        } catch (err) {
            console.error('Bulk unarchive error:', err);
            setError(err.response?.data?.error || 'Failed to undo restriction for selected students.');
        } finally {
            setLoading(false);
        }
    };

    const handleOpenAddModal = () => {
        setIsEditing(false);
        setCurrentStudentId(null);
        setModalError(null);
        setFormData({
            student_id: '',
            last_name: '',
            first_name: '',
            course_year: '',
            email: '',
            team_code: ''
        });
        setIsModalOpen(true);
    };

    const handleModalSubmit = async (e) => {
        e.preventDefault();
        try {
            setLoading(true);
            setModalError(null);
            await dashboardAPI.addDeadlineStudent(formData);
            setIsModalOpen(false);
            fetchStudents();
        } catch (err) {
            console.error('Operation failed:', err);
            setModalError(err.response?.data?.error || 'Failed to process student record.');
        } finally {
            setLoading(false);
        }
    };

    const filteredRows = classRows
        .filter(row => {
            const searchStr = searchTerm.toLowerCase();
            const matchesSearch = (
                (row.studentId?.toLowerCase() || '').includes(searchStr) ||
                (row.lastName?.toLowerCase() || '').includes(searchStr) ||
                (row.firstName?.toLowerCase() || '').includes(searchStr) ||
                (row.email?.toLowerCase() || '').includes(searchStr) ||
                (row.teamCode?.toLowerCase() || '').includes(searchStr) ||
                (row.courseYear?.toLowerCase() || '').includes(searchStr) ||
                (row.subjectNo?.toLowerCase() || '').includes(searchStr)
            );

            const matchesTeamCode = teamCodeFilter === 'none'
                ? true
                : String(row.teamCode || '').trim() === teamCodeFilter;

            const matchesSubject = subjectFilter === 'All'
                ? true
                : String(row.subjectNo || '').trim() === subjectFilter;

            const matchesArchive = showArchivedOnly
                ? row.isArchived
                : !row.isArchived;

            return matchesSearch && matchesTeamCode && matchesSubject && matchesArchive;
        })
        .sort((a, b) => {
            if (sortBy === 'name-asc') {
                const nameA = `${a.lastName} ${a.firstName}`.toLowerCase();
                const nameB = `${b.lastName} ${b.firstName}`.toLowerCase();
                return nameA.localeCompare(nameB);
            }
            if (sortBy === 'name-desc') {
                const nameA = `${a.lastName} ${a.firstName}`.toLowerCase();
                const nameB = `${b.lastName} ${b.firstName}`.toLowerCase();
                return nameB.localeCompare(nameA);
            }
            return 0;
        });

    const filteredRowIds = filteredRows.map((row) => row.id);
    const selectedFilteredRows = filteredRows.filter((row) => selectedIds.includes(row.id));
    const selectedFilteredIds = selectedFilteredRows.map((row) => row.id);
    const hasArchivedSelection = selectedFilteredRows.some((row) => row.isArchived);

    return (
        <div className="class-record-page fade-in">
            <div className="class-record-header">
                <div>
                    <h1>Class List</h1>
                    <p className="class-record-subtitle">Manage and track student records for each academic section</p>
                </div>
                <div className="class-record-actions">
                    {classRows.length > 0 && (
                        <span className="record-count">{classRows.length} Students</span>
                    )}
                    <button
                        type="button"
                        className={`restriction-toggle-btn ${showArchivedOnly ? 'active' : ''}`}
                        onClick={() => setShowArchivedOnly((prev) => !prev)}
                        aria-label="Toggle archived students"
                        title="Show restricted students"
                    >
                        <Archive size={16} />
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary btn-add-student"
                        aria-label="Add options"
                        title="Add options"
                        onClick={() => setIsActionModalOpen(true)}
                    >
                        <Plus size={22} />
                    </button>
                </div>
            </div>

            {error && (
                <div className="import-error-banner">
                    <AlertCircle size={20} />
                    <span>{error}</span>
                    <button className="error-close-btn" onClick={() => setError(null)}>×</button>
                </div>
            )}

            <div className="cr-filters">
                <form className="cr-search-form" onSubmit={(e) => e.preventDefault()}>
                    <div className="cr-search-wrapper">
                        <Search size={20} className="cr-search-icon" />
                        <input
                            type="text"
                            className="cr-search-input"
                            placeholder="Search by ID, Name, Email, Team, or Subject No..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </form>
                <div className="cr-filter-group">
                    <select
                        className="cr-filter-select subject-filter-select"
                        value={subjectFilter}
                        onChange={(e) => setSubjectFilter(e.target.value)}
                    >
                        <option value="All">Subject No.</option>
                        {subjectOptions.map((subj) => (
                            <option key={subj} value={subj}>{subj}</option>
                        ))}
                    </select>
                    <select
                        className="cr-filter-select team-code-filter-select"
                        value={teamCodeFilter}
                        onChange={(e) => setTeamCodeFilter(e.target.value)}
                    >
                        <option value="none">Select Code</option>
                        {teamCodeOptions.map((teamCode) => (
                            <option key={teamCode} value={teamCode}>{teamCode}</option>
                        ))}
                    </select>
                    <select
                        className="cr-filter-select"
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                    >
                        <option value="none">Sort By</option>
                        <option value="name-asc">A-Z (Name)</option>
                        <option value="name-desc">Z-A (Name)</option>
                    </select>
                </div>
                {selectedFilteredIds.length > 0 && (
                    <div className="bulk-actions fade-in" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button onClick={hasArchivedSelection ? handleBulkUnarchive : handleBulkArchive} className="action-button-clean" title={`${hasArchivedSelection ? 'Undo' : 'Restrict'} Selected (${selectedFilteredIds.length})`} disabled={loading} style={{ border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {hasArchivedSelection ? <RotateCcw size={16} /> : <Archive size={16} />} <span className="action-label" style={{ fontSize: '14px', fontWeight: '500' }}>{hasArchivedSelection ? 'Undo' : 'Restrict'}</span>
                        </button>
                        <button onClick={handleBulkSave} className="action-button-clean" title="Save Changes" disabled={loading} style={{ border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Save size={16} /> <span className="action-label" style={{ fontSize: '14px', fontWeight: '500' }}>Save</span>
                        </button>
                        <button onClick={handleBulkDelete} className="action-button-clean" title={`Delete Selected (${selectedIds.length})`} disabled={loading} style={{ border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Trash2 size={16} /> <span className="action-label" style={{ fontSize: '14px', fontWeight: '500' }}>Delete</span>
                        </button>
                    </div>
                )}
            </div>

            <div className="cr-table-wrapper">
                <div className="table-container">
                            <table className="record-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: '40px' }}>
                                            <input
                                                type="checkbox"
                                                checked={filteredRows.length > 0 && selectedFilteredIds.length === filteredRows.length}
                                                onChange={() => {
                                                    if (selectedFilteredIds.length === filteredRows.length) {
                                                        setSelectedIds(prev => prev.filter(id => !filteredRowIds.includes(id)));
                                                    } else {
                                                        setSelectedIds(prev => [...new Set([...prev, ...filteredRowIds])]);
                                                    }
                                                }}
                                                className="row-checkbox"
                                            />
                                        </th>
                                        <th style={{ width: '40px' }}>No.</th>
                                        {subjectFilter === 'All' && <th style={{ width: '90px' }}>SUBJECT NO.</th>}
                                        <th>NAME OF STUDENT</th>
                                        <th>STUDENT NO.</th>
                                        <th>COURSE & YEAR</th>
                                        <th>GMAIL</th>
                                        <th>TEAM CODE</th>
                                        <th>STATUS</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(() => {
                                        const rowNumberById = new Map(classRows.map((r, i) => [r.id, i + 1]));
                                        if (classRows.length === 0) {
                                            return (
                                                <tr>
                                                    <td colSpan={9} className="no-padding">
                                                        <div className="empty-state-dashed-inline">
                                                            <Users size={48} className="empty-icon-gray" />
                                                            <h3>No Student Records</h3>
                                                            <p>Import a class list to start managing student registrations.</p>
                                                            <Button
                                                                onClick={handleImportClick}
                                                                variant="primary"
                                                                size="small"
                                                                icon={FileUp}
                                                                disabled={loading}
                                                            >
                                                                {loading ? 'Importing...' : 'Import Record'}
                                                            </Button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        }

                                        if (filteredRows.length === 0) {
                                            return (
                                                <tr>
                                                    <td colSpan={9} className="search-no-results">
                                                        <div className="no-match-message">
                                                            <Search size={32} className="opacity-20" />
                                                            {searchTerm.trim() ? (
                                                                <>
                                                                    <p>No student records match "<strong>{searchTerm}</strong>"</p>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="small"
                                                                        onClick={() => setSearchTerm('')}
                                                                    >
                                                                        Clear Search
                                                                    </Button>
                                                                </>
                                                            ) : (
                                                                <p>No student records found for the current filters.</p>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        }

                                        return filteredRows.map((row, index) => (
                                            <tr key={row.id}>
                                                <td>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedIds.includes(row.id)}
                                                        onChange={() => handleToggleSelect(row.id)}
                                                        className="row-checkbox"
                                                    />
                                                </td>
                                                <td className="font-bold text-gray-500">
                                                    {rowNumberById.get(row.id) ?? index + 1}
                                                </td>
                                                {subjectFilter === 'All' && (
                                                    <td>
                                                        {selectedIds.includes(row.id) ? (
                                                            <input
                                                                className="inline-edit-input font-bold"
                                                                value={row.subjectNo || ''}
                                                                onChange={(e) => handleRowChange(row.id, 'subjectNo', e.target.value)}
                                                                onKeyDown={handleKeyPress}
                                                            />
                                                        ) : (
                                                            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', backgroundColor: '#f1f5f9', color: '#475569', fontWeight: '600' }}>
                                                                {row.subjectNo || 'IT411'}
                                                            </span>
                                                        )}
                                                    </td>
                                                )}
                                                <td className="font-bold">
                                                    {selectedIds.includes(row.id) ? (
                                                        <input
                                                            className="inline-edit-input font-bold"
                                                            value={fullNameDrafts[row.id] ?? `${row.firstName} ${row.lastName}`.trim()}
                                                            onChange={(e) => handleFullNameDraftChange(row.id, e.target.value)}
                                                            onBlur={() => commitFullNameDraft(row.id)}
                                                            onKeyDown={handleKeyPress}
                                                        />
                                                    ) : `${row.firstName} ${row.lastName}`.trim()}
                                                </td>
                                                <td className="font-mono text-gray-600">
                                                    {selectedIds.includes(row.id) ? (
                                                        <input
                                                            className="inline-edit-input"
                                                            value={row.studentId}
                                                            onChange={(e) => handleRowChange(row.id, 'studentId', e.target.value)}
                                                            onKeyDown={handleKeyPress}
                                                        />
                                                    ) : row.studentId}
                                                </td>
                                                <td className="font-mono text-gray-600">
                                                    {selectedIds.includes(row.id) ? (
                                                        <input
                                                            className="inline-edit-input text-gray-800"
                                                            value={row.courseYear}
                                                            onChange={(e) => handleRowChange(row.id, 'courseYear', e.target.value)}
                                                            onKeyDown={handleKeyPress}
                                                        />
                                                    ) : row.courseYear}
                                                </td>
                                                <td>
                                                    {selectedIds.includes(row.id) ? (
                                                        <input
                                                            className="inline-edit-input text-blue-600"
                                                            value={row.email}
                                                            onChange={(e) => handleRowChange(row.id, 'email', e.target.value)}
                                                            onKeyDown={handleKeyPress}
                                                        />
                                                    ) : (
                                                        <span className="text-blue-600 underline">{row.email}</span>
                                                    )}
                                                </td>
                                                <td className="font-mono font-bold text-maroon">
                                                    {selectedIds.includes(row.id) ? (
                                                        <input
                                                            className="inline-edit-input text-maroon font-bold"
                                                            value={row.teamCode}
                                                            onChange={(e) => handleRowChange(row.id, 'teamCode', e.target.value)}
                                                            onKeyDown={handleKeyPress}
                                                        />
                                                    ) : row.teamCode}
                                                </td>
                                                <td>
                                                    <span className={`status-badge ${row.isArchived ? 'status-archived' : (row.status === 'Registered' || row.is_registered ? 'status-registered' : 'status-pending')}`}>
                                                        {row.isArchived ? 'Restricted' : (row.status || (row.is_registered ? 'Registered' : 'Pending'))}
                                                    </span>
                                                </td>
                                            </tr>
                                        ));
                                    })()}
                                </tbody>
                            </table>
                </div>
            </div>

            {/* Action Selection Modal */}
            {isActionModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '320px', padding: '1.5rem', position: 'relative' }}>
                        <div className="modal-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
                            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--color-gray-900)' }}>Choose an Action</h2>
                            <button className="modal-close" onClick={() => setIsActionModalOpen(false)} style={{ position: 'absolute', right: '1rem', top: '1rem' }}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1.25rem' }}>
                            <Button 
                                variant="primary" 
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.75rem' }}
                                onClick={() => {
                                    setIsActionModalOpen(false);
                                    handleOpenAddModal();
                                }}
                            >
                                <Users size={18} />
                                Add Student
                            </Button>
                            <Button 
                                variant="outline" 
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.75rem', border: '1px solid var(--color-gray-300)' }}
                                onClick={() => {
                                    setIsActionModalOpen(false);
                                    handleImportClick();
                                }}
                            >
                                <FileUp size={18} />
                                Import Class List
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Manual Student Add/Edit Modal */}
            {isModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content student-modal">
                        <div className="modal-header">
                            <h2>{isEditing ? 'Edit Student Record' : 'Add New Student'}</h2>
                            <button
                                className="modal-close"
                                onClick={() => {
                                    setModalError(null);
                                    setIsModalOpen(false);
                                }}
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleModalSubmit}>
                            {modalError && (
                                <div className="modal-error-banner">
                                    <AlertCircle size={16} />
                                    <span>{modalError}</span>
                                </div>
                            )}
                            <div className="form-group">
                                <label>Student ID Number</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="22-1686-452"
                                    value={formData.student_id}
                                    onChange={(e) => setFormData({ ...formData, student_id: formatStudentId(e.target.value) })}
                                />
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>First Name</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="Given Name"
                                        value={formData.first_name}
                                        onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Last Name</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="Surname"
                                        value={formData.last_name}
                                        onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Course & Year</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. BSCS 4"
                                        value={formData.course_year}
                                        onChange={(e) => setFormData({ ...formData, course_year: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Team Code</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. TEAM-A"
                                        value={formData.team_code}
                                        onChange={(e) => setFormData({ ...formData, team_code: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Email Address</label>
                                <input
                                    type="email"
                                    placeholder="student@gmail.com"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                />
                            </div>
                            <div className="modal-footer">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => {
                                        setModalError(null);
                                        setIsModalOpen(false);
                                    }}
                                    disabled={loading}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    variant="primary"
                                    disabled={loading}
                                >
                                    {loading ? 'Processing...' : (isEditing ? 'Update Record' : 'Add Student')}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept=".xlsx, .xls, .csv"
                onChange={handleFileChange}
            />
        </div>
    );
};

export default ClassList;
