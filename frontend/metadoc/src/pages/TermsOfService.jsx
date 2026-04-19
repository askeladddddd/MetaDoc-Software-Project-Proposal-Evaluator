import { Link } from 'react-router-dom';
import { FileCheck, Users, Scale, ArrowLeft, ShieldCheck } from 'lucide-react';
import '../styles/LegalPages.css';

const TermsOfService = () => {
  const lastUpdated = 'April 20, 2026';
  const contactEmail = 'heisenberrg19@gmail.com';

  return (
    <div className="legal-page">
      <div className="legal-shell">
        <div className="legal-topbar">
          <div className="legal-brand">
            <div className="legal-brand-mark">
              <Scale size={18} />
            </div>
            <span>MetaDoc</span>
          </div>
          <Link to="/" className="legal-nav-link">
            <ArrowLeft size={16} style={{ verticalAlign: 'text-bottom', marginRight: '0.35rem' }} />
            Back to login
          </Link>
        </div>

        <main className="legal-card">
          <section className="legal-hero">
            <div className="legal-kicker">Terms of Service</div>
            <h1 className="legal-title">Rules for using MetaDoc</h1>
            <p className="legal-subtitle">
              These terms explain who may use MetaDoc, how the service may be used, and the responsibilities that apply when you sign in and submit or review academic documents.
            </p>
            <div className="legal-meta">
              <span className="legal-pill"><FileCheck size={16} /> Last updated: {lastUpdated}</span>
              <span className="legal-pill"><Users size={16} /> Academic users</span>
              <span className="legal-pill"><ShieldCheck size={16} /> Security-focused access</span>
            </div>
          </section>

          <div className="legal-content">
            <section className="legal-section">
              <h2>1. Eligibility</h2>
              <p>
                MetaDoc is intended for students, professors, and authorized reviewers who have permission to use the system. You must use your own account and follow your institution’s access rules.
              </p>
            </section>

            <section className="legal-section">
              <h2>2. Acceptable use</h2>
              <ul className="legal-list">
                <li>Use the app only for legitimate academic document submission, review, and evaluation purposes.</li>
                <li>Do not upload malicious, illegal, offensive, or unauthorized files.</li>
                <li>Do not attempt to bypass authentication, access other users’ data, or disrupt the service.</li>
                <li>Do not use the app in a way that violates your school policies or Google’s terms.</li>
              </ul>
            </section>

            <section className="legal-section">
              <h2>3. User responsibilities</h2>
              <ul className="legal-list">
                <li>You are responsible for the accuracy of the information and files you submit.</li>
                <li>If you share a submission link, make sure you are authorized to do so.</li>
                <li>You are responsible for maintaining the security of your Google account and session.</li>
                <li>Student users should only use the submission portal for the class and deadline they were invited to join.</li>
              </ul>
            </section>

            <section className="legal-section">
              <h2>4. Service and content</h2>
              <ul className="legal-list">
                <li>MetaDoc may analyze documents, store evaluation results, and generate reports based on the data available.</li>
                <li>Analysis results are provided to support academic review and should not be treated as a final legal or institutional decision.</li>
                <li>We may modify, suspend, or discontinue parts of the service when needed for maintenance, security, or updates.</li>
              </ul>
            </section>

            <section className="legal-section legal-callout">
              <h2>5. Limitation and contact</h2>
              <p>
                MetaDoc is provided as an academic project and is offered as-is. If you have questions about these terms, contact <strong>{contactEmail}</strong>.
              </p>
            </section>
          </div>
        </main>

        <div className="legal-footer">
          <span>MetaDoc - Google Drive-Integrated Metadata Analyzer</span>
          <span>Terms of Service</span>
        </div>
      </div>
    </div>
  );
};

export default TermsOfService;
