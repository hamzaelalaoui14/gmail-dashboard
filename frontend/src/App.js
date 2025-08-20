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

  const handleCopy = () => {
    const accountString = accountsList.join(';');
    navigator.clipboard.writeText(accountString).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  const handleScroll = (account, direction) => {
    const element = scrollRefs.current[account];
    if (element) {
      const scrollAmount = direction === 'left' ? -315 : 315;
      element.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };
  
  const getCardClass = (label) => {
    switch (label) {
      case "INBOX": return "card-inbox";
      case "PROMOTIONS": return "card-promotions";
      case "UPDATES": return "card-updates";
      case "FORUMS": return "card-forums";
      case "SPAM": return "card-spam";
      default: return "";
    }
  };

  const getLabelColor = (label) => {
    switch (label) {
      case "INBOX": return "var(--inbox-color)";
      case "PROMOTIONS": return "var(--promotions-color)";
      case "UPDATES": return "var(--updates-color)";
      case "SOCIAL": return "var(--social-color)";
      case "FORUMS": return "var(--forums-color)";
      case "IMPORTANT": return "var(--important-color)";
      case "STARRED": return "var(--starred-color)";
      case "SENT": return "var(--sent-color)";
      case "DRAFT": return "var(--draft-color)";
      case "SPAM": return "var(--spam-color)";
      default: return "var(--default-color)";
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
        
        {accountsList.length > 0 && (
          <div className="copy-accounts-section">
            <h4>1. Start the Free Email Tester by Sending Your Campaign to These Addresses:</h4>
            <div className="copy-box">
              <span className="copy-text">{accountsList.join(';')}</span>
              <button onClick={handleCopy} className="copy-button">
                {isCopied ? "Copied!" : "Copy these addresses to clipboard"}
              </button>
            </div>
            <h4>2. Watch Your Deliverability Test in Real Time as Your Emails Land in the Accounts Below:</h4>
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
                  <button className="scroll-arrow left" onClick={() => handleScroll(account, 'left')} aria-label="Scroll left"><FiChevronLeft /></button>
                  <div 
                    className="emails-horizontal-scroll" 
                    ref={el => scrollRefs.current[account] = el}
                  >
                    <AnimatePresence>
                      {groupedEmails[account].map((mail) => (
                        <motion.div
                          key={mail.id}
                          className={`email-card-horizontal ${getCardClass(mail.label)} ${mail.isSpam ? 'spam' : ''} ${!mail.isRead ? 'unread' : ''}`}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.3 }}
                          layout
                        >
                          <div className="email-header">
                            <div className="avatar">{(mail.senderName || mail.from).charAt(0).toUpperCase()}</div>
                            <div className="email-label" style={{ backgroundColor: getLabelColor(mail.label) }}>{getLabelText(mail.label)}</div>
                          </div>
                          <div className="email-body">
                            <div className="sender">{mail.senderName || mail.from}{mail.isSpam && <span className="spam-warning">⚠️</span>}</div>
                            <h3 className="subject">{mail.subject}</h3>
                            {/* SNIPPET REMOVED TO RESTORE ORIGINAL DESIGN */}
                          </div>
                          <div className="email-footer">
                            <span className="time">{new Date(mail.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                            {!mail.isRead && <span className="unread-indicator"></span>}
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                   <button className="scroll-arrow right" onClick={() => handleScroll(account, 'right')} aria-label="Scroll right"><FiChevronRight /></button>
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
