import { useEffect, useState } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { FiUser } from "react-icons/fi";
import "./App.css";

function App() {
  const [emails, setEmails] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const BACKEND_URL = "https://cognitive-isabella-gmass-9839fc62.koyeb.app";

  useEffect(() => {
    const fetchEmails = async () => {
      try {
        setError(null);
        // 🚀 THE FIX IS HERE: Added a timestamp to prevent caching
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
    const interval = setInterval(fetchEmails, 15000); // Polls every 15 seconds
    return () => clearInterval(interval);
  }, []);

  // The rest of your component remains exactly the same...

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
    switch (label) {
      case "PROMOTIONS": return "Promotions";
      case "UPDATES": return "Updates";
      case "SOCIAL": return "Social";
      case "FORUMS": return "Forums";
      case "SPAM": return "Spam";
      default: return label;
    }
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

        {error && <div className="error-message">{error}</div>}

        {isLoading ? (
          <div className="loading-indicator">Loading emails...</div>
        ) : filteredEmails.length === 0 ? (
          <div className="no-emails">
            {emails.length === 0 ? "No emails found. Try authenticating first." : "No emails match your search."}
          </div>
        ) : (
          <div className="accounts-container">
            {Object.keys(groupedEmails).map((account) => (
              <div key={account} className="account-section">
                <div className="account-header">
                  <FiUser className="account-icon" />
                  <h3>{account}</h3>
                </div>
                <div className="emails-horizontal-scroll">
                  <AnimatePresence>
                    {groupedEmails[account].map((mail) => (
                      <motion.div
                        key={mail.id}
                        className={`email-card-horizontal ${mail.isSpam ? 'spam' : ''} ${!mail.isRead ? 'unread' : ''}`}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3 }}
                        layout
                      >
                        <div className="email-header">
                          <div className="avatar">{(mail.senderName || mail.from).charAt(0).toUpperCase()}</div>
                          <div className="email-label" style={{ backgroundColor: getLabelColor(mail.label) }}>{getLabelText(mail.label)}</div>
                        </div>
                        <div className="email-body">
                          <div className="sender">{mail.senderName || mail.from}{mail.isSpam && <span style={{color: '#dc2626', marginLeft: '5px'}}>⚠️</span>}</div>
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
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;```

This simple frontend change should completely solve the issue and give you the real-time updates you are looking for.
