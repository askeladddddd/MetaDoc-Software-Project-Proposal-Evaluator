import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  Folder,
  LayoutDashboard,
  FileBarChart,
  LogOut,
  Menu,
  X,
  User,
  Users,
  XCircle,
  Code2,
  Globe,
  Database,
  ClipboardList,
  ChevronLeft,
  CircleHelp,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import logo from '../../assets/images/MainLogo.png';
import citLogo from '../../assets/images/cit_logo.png';
import quindaoProfile from '../../assets/images/members/Quindao_Profile.jpg';
import abellanaProfile from '../../assets/images/members/Abellana_Profile.jpg';
import velosoProfile from '../../assets/images/members/Veloso_Profile.jpg';
import garingProfile from '../../assets/images/members/Garing_Profile.jpg';
import '../../styles/DashboardLayout.css';

const DashboardLayout = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [showInstructionModal, setShowInstructionModal] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [activeFaqIndex, setActiveFaqIndex] = useState(null);
  const [sidebarHidden, setSidebarHidden] = useState(() => {
    const saved = localStorage.getItem('sidebar-hidden-all-pages');
    return saved ? JSON.parse(saved) : false;
  });

  const isSpecialPage = location.pathname.includes('/reports') || 
                        location.pathname.includes('/dashboard/class-list') || 
                        location.pathname.includes('/dashboard/deliverables') ||
                        location.pathname.includes('/dashboard/submissions') ||
                        location.pathname === '/dashboard';

  const handleLogout = async () => {
    setShowLogoutModal(false);
    await logout();
    navigate('/login');
  };

  const navItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Overview' },
    { path: '/dashboard/deliverables', icon: Folder, label: 'Deliverable' },
    { path: '/dashboard/class-list', icon: Users, label: 'Class List' },
    { path: '/dashboard/reports', icon: FileBarChart, label: 'Reports' },
  ];

  const teamMembers = [
    {
      name: 'Quindao',
      role: 'Project Manager',
      Icon: ClipboardList,
      photo: quindaoProfile,
      description: 'Leads planning, sprint coordination, and delivery timelines for MetaDoc. Ensures features are aligned with project goals and keeps the team on track through milestone-based execution.',
    },
    {
      name: 'Abellana',
      role: 'NLP & Backend',
      Icon: Database,
      photo: abellanaProfile,
      description: 'Specializes in Natural Language Processing and backend architecture. Responsible for developing data models, APIs, and machine learning integrations for automated document evaluation.',
    },
    {
      name: 'Veloso',
      role: 'Frontend Developer',
      Icon: Globe,
      photo: velosoProfile,
      description: 'Builds and refines the MetaDoc user interface, focusing on usability, consistency, and responsive behavior. Translates functional requirements into clean and intuitive UI components.',
    },
    {
      name: 'Garing',
      role: 'Full Stack Developer',
      Icon: Code2,
      photo: garingProfile,
      description: 'Implements end-to-end features across frontend and backend. Handles API integration, data flow, and system behavior to ensure seamless functionality throughout the MetaDoc platform.',
    },
  ];

  const professorFlow = [
    'Create deliverables and set deadlines in the Deliverables page to generate a submission link.',
    'Manage your student roster and monitor team assignments via the Class List page.',
    'Share the generated submission link with students to allow them to upload their proposals via the Student Portal.',
    'Review AI-driven document insights, metadata analysis, and compliance checks in the Reports page.',
    'Track overall progress, late submissions, and class metrics on the Dashboard Overview.',
  ];

  const faqItems = [
    {
      question: 'How do students submit their proposals?',
      answer: 'Students use the submission link generated in the Deliverables page to access the Student Portal, where they log in and upload their documents securely.',
    },
    {
      question: 'How does the system evaluate the submitted documents?',
      answer: 'MetaDoc utilizes NLP and metadata extraction to automatically analyze submissions for proper formatting, compliance, and content structure, displaying the results in the Reports page.',
    },
    {
      question: 'Where can I check if submissions are late or on time?',
      answer: 'Both the Dashboard Overview and Reports pages provide a clear breakdown of on-time versus late submissions based on the active deadlines you established.',
    },
    {
      question: 'Can I manage student teams and individual records?',
      answer: 'Yes, you can use the Class List page to review student profiles, verify group assignments, and track individual student involvement.',
    },
    {
      question: 'What should I do if a student submits an incorrect file?',
      answer: 'Locate their submission in the Reports page, delete or archive the invalid entry, and instruct the student to re-submit their correct document using the same submission link.',
    },
  ];

  const isActive = (path) => {
    if (path === '/dashboard') {
      return location.pathname === '/dashboard';
    }
    return location.pathname.startsWith(path);
  };

  useEffect(() => {
    localStorage.setItem('sidebar-hidden-all-pages', JSON.stringify(sidebarHidden));
    const layoutElement = document.querySelector('.dashboard-layout');
    if (layoutElement) {
      if (sidebarHidden && isSpecialPage) {
        layoutElement.classList.add('sidebar-hidden-reports');
      } else {
        layoutElement.classList.remove('sidebar-hidden-reports');
      }
    }
  }, [sidebarHidden, isSpecialPage]);

  const toggleSidebar = () => {
    if (isSpecialPage) {
      setSidebarHidden(!sidebarHidden);
    }
  };

  return (
    <div className="dashboard-layout">
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <img src={logo} alt="MetaDoc Logo" className="sidebar-logo-img" />
            <span className="logo-text">MetaDoc</span>
          </div>
          <button
            className="sidebar-close"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={24} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-item ${isActive(item.path) ? 'nav-item-active' : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </Link>
          ))}

          <button
            type="button"
            className="nav-item nav-item-button"
            onClick={() => {
              setShowTeamModal(true);
              setSidebarOpen(false);
            }}
          >
            <Code2 size={20} />
            <span>Team 7</span>
          </button>

          <button
            type="button"
            className="nav-item nav-item-button"
            onClick={() => {
              setShowInstructionModal(true);
              setSidebarOpen(false);
            }}
          >
            <CircleHelp size={20} />
            <span>Instruction</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <button className="btn-logout" onClick={() => setShowLogoutModal(true)}>
            <LogOut size={18} />
            <span>Logout</span>
          </button>
          <div className="sidebar-version">MetaDoc V1.0</div>
          <div className="sidebar-cit">
            <span>CIT University</span>
          </div>
        </div>
      </aside>

      {/* Mini Icon Navbar for Hidden Sidebar State */}
      <nav className="mini-navbar">
        <div className="mini-nav-items">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`mini-nav-item ${isActive(item.path) ? 'mini-nav-item-active' : ''}`}
              title={item.label}
            >
              <item.icon size={20} />
            </Link>
          ))}
          <button
            type="button"
            className="mini-nav-item"
            onClick={() => {
              setShowTeamModal(true);
            }}
            title="Team 7"
          >
            <Code2 size={20} />
          </button>
          <button
            type="button"
            className="mini-nav-item"
            onClick={() => {
              setShowInstructionModal(true);
            }}
            title="Instruction"
          >
            <CircleHelp size={20} />
          </button>
        </div>
        
        <div className="mini-nav-footer">
          <button
            type="button"
            className="mini-nav-footer-item mini-nav-logout"
            onClick={() => setShowLogoutModal(true)}
            title="Logout"
          >
            <LogOut size={20} />
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <div className="main-content">
        {/* Top Bar */}
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="menu-toggle"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <Menu size={24} />
            </button>
            {isSpecialPage && (
              <button
                className="topbar-sidebar-toggle"
                onClick={toggleSidebar}
                title={sidebarHidden ? 'Show Sidebar' : 'Hide Sidebar'}
              >
                {sidebarHidden ? <Menu size={20} /> : <ChevronLeft size={20} />}
              </button>
            )}
          </div>

          <div className="topbar-right">
            <div className="user-badge">
              <div className="user-avatar-small">
                {user?.profile_picture ? (
                  <img src={user.profile_picture} alt={user.name} />
                ) : (
                  <User size={16} />
                )}
              </div>
              <span className="user-name-small">{user?.name}</span>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="page-content">{children}</main>
      </div>

      {/* Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        ></div>
      )}

      {showTeamModal && (
        <div className="team-modal-overlay" onClick={() => { setShowTeamModal(false); setSelectedMember(null); }}>
          <div className={`team-modal${selectedMember ? ' team-modal-wide' : ''}`} onClick={(e) => e.stopPropagation()}>
            {/* Left panel */}
            <div className="team-panel-left">
              <div className="team-modal-header">
                <div className="team-modal-title-wrap">
                  <h2>Team 7</h2>
                  <p>Core developers behind MetaDoc</p>
                </div>
                <button
                  type="button"
                  className="team-modal-close"
                  onClick={() => { setShowTeamModal(false); setSelectedMember(null); }}
                  aria-label="Close Team 7 modal"
                >
                  <XCircle size={20} />
                </button>
              </div>
              <div className="team-grid">
                {teamMembers.map((member) => (
                  <article
                    key={member.name}
                    className={`team-card team-card-clickable${selectedMember?.name === member.name ? ' team-card-active' : ''}`}
                    onClick={() => setSelectedMember(member)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && setSelectedMember(member)}
                  >
                    {member.photo ? (
                      <img src={member.photo} alt={member.name} className="team-card-avatar" />
                    ) : (
                      <div className="team-card-icon">
                        <member.Icon size={18} />
                      </div>
                    )}
                    <div className="team-card-content">
                      <h3>{member.name}</h3>
                      <p>{member.role}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            {/* Right panel — slides in when a member is selected */}
            {selectedMember && (
              <div className="team-panel-right">
                <div className="team-panel-right-header">
                  <h3>{selectedMember.name}</h3>
                  <button
                    type="button"
                    className="team-modal-close"
                    onClick={() => setSelectedMember(null)}
                    aria-label="Close member details"
                  >
                    <XCircle size={18} />
                  </button>
                </div>
                {selectedMember.photo ? (
                  <img src={selectedMember.photo} alt={selectedMember.name} className="team-member-photo-large" />
                ) : (
                  <div className="team-member-icon-large">
                    <selectedMember.Icon size={36} />
                  </div>
                )}
                <p className="team-member-role-label">{selectedMember.role}</p>
                <p className="team-member-description">{selectedMember.description}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {showInstructionModal && (
        <div className="instruction-modal-overlay" onClick={() => { setShowInstructionModal(false); setActiveFaqIndex(null); }}>
          <div className="instruction-modal" onClick={(e) => e.stopPropagation()}>
            <div className="instruction-modal-header">
              <div>
                <h2>Professor Instructions</h2>
                <p>Quick guide for using MetaDoc effectively</p>
              </div>
              <button
                type="button"
                className="team-modal-close"
                onClick={() => { setShowInstructionModal(false); setActiveFaqIndex(null); }}
                aria-label="Close instructions"
              >
                <XCircle size={20} />
              </button>
            </div>

            <div className="instruction-modal-body">
              <section className="instruction-section">
                <h3>Basic Flow</h3>
                <ol className="instruction-flow-list">
                  {professorFlow.map((step, index) => (
                    <li key={step}>
                      <span className="instruction-step-badge">{index + 1}</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </section>

              <section className="instruction-section">
                <h3>FAQ</h3>
                <div className="instruction-faq-list">
                  {faqItems.map((item, index) => {
                    const isOpen = activeFaqIndex === index;
                    return (
                      <article key={item.question} className={`instruction-faq-item${isOpen ? ' open' : ''}`}>
                        <button
                          type="button"
                          className="instruction-faq-question"
                          onClick={() => setActiveFaqIndex(isOpen ? null : index)}
                        >
                          <span>{item.question}</span>
                          {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                        {isOpen && <p className="instruction-faq-answer">{item.answer}</p>}
                      </article>
                    );
                  })}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* Logout Modal */}
      {showLogoutModal && (
        <div className="logout-modal-overlay" onClick={() => setShowLogoutModal(false)}>
          <div className="logout-prompt-container" onClick={(e) => e.stopPropagation()}>
            <div className="logout-prompt-body">
              <h2 className="logout-prompt-title">Logging Out</h2>
              <p className="logout-prompt-text">
                Are you sure you want to end your session?
              </p>
              <div className="logout-prompt-actions">
                <button 
                  className="logout-action-btn cancel-btn" 
                  onClick={() => setShowLogoutModal(false)}
                >
                  Cancel
                </button>
                <button 
                  className="logout-action-btn confirm-btn" 
                  onClick={handleLogout}
                >
                  Yes, Log Out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardLayout;
