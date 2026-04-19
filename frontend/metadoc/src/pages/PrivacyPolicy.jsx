import { Link } from 'react-router-dom';
import { Shield, Lock, FileText, Globe, ArrowLeft } from 'lucide-react';
import '../styles/LegalPages.css';

const PrivacyPolicy = () => {
  const lastUpdated = 'April 20, 2026';
  const contactEmail = 'heisenberrg19@gmail.com';

  return (
    <div className="legal-page">
      <div className="legal-shell">
        <div className="legal-topbar">
          <div className="legal-brand">
            <div className="legal-brand-mark">
              <Shield size={18} />
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
            <div className="legal-kicker">Privacy Policy</div>
            <h1 className="legal-title">How MetaDoc handles your data</h1>
            <p className="legal-subtitle">
              This policy explains what information MetaDoc collects, how it is used, and how it is protected when you sign in with Google and use the submission or evaluation features.
            </p>
            <div className="legal-meta">
              <span className="legal-pill"><FileText size={16} /> Last updated: {lastUpdated}</span>
              <span className="legal-pill"><Globe size={16} /> Public app page</span>
              <span className="legal-pill"><Lock size={16} /> Google OAuth integration</span>
            </div>
          </section>

          <div className="legal-content">
            <section className="legal-section">
              <h2>1. Information we collect</h2>
              <p>
                MetaDoc may collect the information you provide directly and the information returned by Google during sign-in.
              </p>
              <ul className="legal-list">
                <li>Google account information such as your name, email address, and profile picture.</li>
                <li>User role and account details used to manage professor and student access.</li>
                <li>Submission data, including uploaded files, Google Drive links, and document metadata.</li>
                <li>Technical information such as session tokens, timestamps, and basic usage logs used for security and troubleshooting.</li>
              </ul>
            </section>

            <section className="legal-section">
              <h2>2. How we use information</h2>
              <ul className="legal-list">
                <li>Authenticate users through Google Sign-In.</li>
                <li>Match student accounts to class-list records.</li>
                <li>Access Google Drive files only for submission validation, document analysis, and related workflow functions.</li>
                <li>Store evaluation results, reports, and submission records for the academic workflow of the application.</li>
                <li>Detect errors, prevent abuse, and maintain service reliability.</li>
              </ul>
            </section>

            <section className="legal-section">
              <h2>3. Data sharing and storage</h2>
              <p>
                MetaDoc does not sell personal data. Data is used only for operating the application and supporting the academic review process.
              </p>
              <ul className="legal-list">
                <li>We may store user and submission records in the application database.</li>
                <li>OAuth access tokens are used only to complete Google-related actions requested by the user.</li>
                <li>Google Drive data is accessed only as needed for the features you use.</li>
                <li>We do not intentionally share your personal data with third parties except where required to run the service or comply with law.</li>
              </ul>
            </section>

            <section className="legal-section">
              <h2>4. Your choices</h2>
              <ul className="legal-list">
                <li>You may stop using the app at any time.</li>
                <li>You can request correction or deletion of your account data by contacting us.</li>
                <li>You may remove app permissions from your Google Account settings if applicable.</li>
              </ul>
            </section>

            <section className="legal-section legal-callout">
              <h2>5. Contact</h2>
              <p>
                If you have questions about this policy or how your information is handled, contact <strong>{contactEmail}</strong>.
              </p>
            </section>
          </div>
        </main>

        <div className="legal-footer">
          <span>MetaDoc - Google Drive-Integrated Metadata Analyzer</span>
          <span>Privacy Policy</span>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
