import { useEffect, useState, useRef } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { FiUser, FiChevronLeft, FiChevronRight, FiCopy } from "react-icons/fi";
import "./App.css";

function App() {
  const [emails, setEmails] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isCopied, setIsCopied] = useState(false);

  // useRef to hold references to the scrollable divs
  const scrollRefs = useRef({});

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

  // --- NEW: Function to handle copying account list to clipboard ---
  const handleCopy = () => {
    const accountString = accountsList.join(';');
    navigator.clipboard.writeText(accountString).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000); // Reset after 2 seconds
    });
  };
  
  // --- NEW: Function to handle scrolling the email rows ---
  const handleScroll = (account, direction) => {
    const element = scrollRefs.current[account];
    if (element) {
      const scrollAmount = direction === 'left' ? -315 : 315; // Card width + gap
      element.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  // --- NEW: Function to get a CSS class based on the email label for card color ---
  const getCardClass = (label) => {
    switch (label) {
      case "INBOX": return "card-inbox";
      case "PROMOTIONS": return "card-promotions";
      case "UPDATES": return "card-updates";
      case "SOCIAL": return "card-social";
      case "FORUMS": return "card-forums";
      case "SPAM": return "card-spam";
      default: return "";
    }
  };

  const getLabelText = (label) => {
    if (!label) return "Inbox";
    return label.charAt(0) + label.slice(1).toLowerCase();
  };

  return (
    <div className="gmass-dashboard">
      <div className="content">
        <div className="search-bar">
          <input
            placeholder="Search all accounts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* --- NEW: Copyable Accounts Section --- */}
        {accountsList.length > 0 && (
          <div className="copy-accounts-section">
            <div className="step">
              <span className="step-number">1</span>
              <p>Start the Free Email Tester by Sending Your Campaign to These Addresses:</p>
            </div>
            <div className="copy-box">
              <code className="account-list">{accountsList.join(';')}</code>
              <button onClick={handleCopy} className="copy-button">
                {isCopied ? "Copied!" : <><FiCopy /> Copy</>}
              </button>
            </div>
             <div className="step step-2">
              <span className="step-number">2</span>
              <p>Watch Your Deliverability Test in Real Time as Your Emails Land in the Accounts Below:</p>
            </div>
          </div>
        )}

        {error && <div className="error-message">{error}</div>}

        {isLoading ? (
          <div className="loading-indicator">Loading emails...</div>
        ) : filteredEmails.length === 0 ? (
          <div className="no-emails">
            {emails.length === 0 ? "No emails found. Try authenticating an account first." : "No emails match your search."}
          </div>
        ) : (
          <div className="accounts-container">
            {accountsList.map((account) => (
              <div key={account} className="account-section">
                <div className="account-header">
                  <FiUser className="account-icon" />
                  <h3>{account}</h3>
                </div>
                <div className="scroll-wrapper">
                  {/* --- NEW: Scroll Buttons --- */}
                  <button className="scroll-arrow left" onClick={() => handleScroll(account, 'left')} aria-label="Scroll left">
                    <FiChevronLeft />
                  </button>
                  <div 
                    className="emails-horizontal-scroll"
                    // --- NEW: Assign ref to the scrollable element ---
                    ref={(el) => (scrollRefs.current[account] = el)}
                  >
                    <AnimatePresence>
                      {groupedEmails[account].map((mail) => (
                        <motion.div
                          key={mail.id}
                          // --- MODIFIED: Added getCardClass for dynamic background colors ---
                          className={`email-card-horizontal ${getCardClass(mail.label)} ${!mail.isRead ? 'unread' : ''}`}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.3 }}
                          layout
                        >
                          <div className="email-header">
                            <div className="avatar">{(mail.senderName || mail.from).charAt(0).toUpperCase()}</div>
                            {/* --- MODIFIED: Removed inline style, now handled by CSS --- */}
                            <div className={`email-label label-${mail.label}`}>{getLabelText(mail.label)}</div>
                          </div>
                          <div className="email-body">
                            <div className="sender">{mail.senderName || mail.from}{mail.isSpam && <span className="spam-warning">⚠️</span>}</div>
                            <h3 className="subject">{mail.subject}</h3>
                            <p className="snippet">{mail.snippet}</p>
                          </div>
                          <div className="email-footer">
                            <span className="time">{new Date(mail.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                            {!mail.isRead && <span className="unread-indicator"></span>}
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                  <button className="scroll-arrow right" onClick={() => handleScroll(account, 'right')} aria-label="Scroll right">
                    <FiChevronRight />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
