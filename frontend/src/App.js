import { useEffect, useState } from "react";
import axios from "axios";
import { AnimatePresence, motion } from "framer-motion";
import { FiCopy } from "react-icons/fi";
import "./App.css";

// You can download the Gmail logo and place it in src/ or use this URL
const GMAIL_LOGO_URL = "https://ssl.gstatic.com/ui/v1/icons/mail/rfr/logo_gmail_lockup_default_1x_r5.png";

// --- NEW: Time formatting function ---
function formatTimeAgo(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.round((now - date) / 1000);

  if (seconds < 60) {
    return `${seconds} seconds ago`;
  }

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} minutes ago`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} hours ago`;
  }

  const days = Math.round(hours / 24);
  return `${days} days ago`;
}


function App() {
  const [emails, setEmails] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isCopied, setIsCopied] = useState(false);

  const BACKEND_URL = "https://cognitive-isabella-gmass-9839fc62.koyeb.app";

  useEffect(() => {
    const fetchEmails = async () => {
      try {
        setError(null);
        const res = await axios.get(`${BACKEND_URL}/emails?t=${new Date().getTime()}`);
        setEmails(res.data);
      } catch (err) {
        console.error("Failed to load emails:", err);
        setError("Failed to load emails. Please check your connection.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchEmails();
    const interval = setInterval(fetchEmails, 15000);
    return () => clearInterval(interval);
  }, []);

  const filteredEmails = emails.filter(
    (mail) =>
      mail.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      mail.from.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (mail.senderName && mail.senderName.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const groupedEmails = filteredEmails.reduce((acc, email) => {
    const account = email.account;
    if (!acc[account]) {
      acc[account] = [];
    }
    acc[account].push(email);
    return acc;
  }, {});

  const accountsList = Object.keys(groupedEmails);

  const handleCopy = () => {
    const accountString = accountsList.join(';');
    navigator.clipboard.writeText(accountString).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };
  
  // --- NEW: Class getters for the new design ---
  const getEmailBlockClass = (label) => {
    switch (label) {
      case "INBOX": return "email-inbox";
      case "PROMOTIONS": return "email-promotions";
      case "UPDATES": return "email-updates";
      case "FORUMS": return "email-forums";
      case "SPAM": return "email-spam";
      default: return "email-default";
    }
  };

  const getLabelClass = (label) => {
    switch (label) {
        case "INBOX": return "label-inbox";
        case "PROMOTIONS": return "label-promotions";
        case "UPDATES": return "label-updates";
        case "FORUMS": return "label-forums";
        case "SPAM": return "label-spam";
        default: return "label-default";
    }
  };

  const getLabelText = (label) => {
    if (!label) return "Inbox";
    return label.charAt(0) + label.slice(1).toLowerCase();
  };

  return (
    <div className="dashboard-container">
      {/* Search and Copy section are kept as requested previously */}
      <div className="top-section">
        <div className="search-bar">
          <input
            placeholder="Search all accounts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        {accountsList.length > 0 && (
          <div className="copy-accounts-section">
            <p>1. Start the Free Email Tester by Sending Your Campaign to These Addresses:</p>
            <div className="copy-box">
              <code className="copy-text">{accountsList.join(';')}</code>
              <button onClick={handleCopy} className="copy-button">
                {isCopied ? "Copied!" : <FiCopy />}
              </button>
            </div>
            <p>2. Watch Your Deliverability Test in Real Time as Your Emails Land in the Accounts Below:</p>
          </div>
        )}
      </div>

      <div className="main-content">
        {error && <div className="error-message">{error}</div>}
        {isLoading ? (
          <div className="loading-indicator">Loading emails...</div>
        ) : (
          <div className="accounts-container">
            {accountsList.map((account) => (
              <div key={account} className="account-row">
                {/* --- NEW: Account Info Block --- */}
                <div className="account-info">
                  <img src={GMAIL_LOGO_URL} alt="Gmail Logo" className="gmail-logo"/>
                  <p className="account-email">{account}</p>
                  <p className="account-desc">10-year-old Gmail account</p>
                </div>

                {/* --- NEW: Horizontally Scrolling Emails Container --- */}
                <div className="emails-scroll-container">
                  <AnimatePresence>
                    {groupedEmails[account].map((mail) => (
                      <motion.div
                        key={mail.id}
                        className={`email-block ${getEmailBlockClass(mail.label)}`}
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 280 }}
                        exit={{ opacity: 0, width: 0 }}
                        transition={{ duration: 0.4 }}
                        layout
                      >
                        <div className="email-content">
                           <div className="sender">
                            <strong>{mail.senderName}</strong> {mail.senderEmail}
                          </div>
                          <div className="subject">{mail.subject}</div>
                          <div className="snippet">{mail.snippet}</div>
                        </div>
                        <div className="email-meta">
                          <div className="labels-container">
                            <span className={`label ${getLabelClass(mail.label)}`}>
                              {getLabelText(mail.label)}
                            </span>
                             {/* You can add more labels here if your backend provides them */}
                          </div>
                          <span className="timestamp">{formatTimeAgo(mail.date)}</span>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            ))}
             {filteredEmails.length === 0 && !isLoading && (
              <div className="no-emails">
                {emails.length === 0 ? "No emails found. Connect an account." : "No emails match your search."}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
