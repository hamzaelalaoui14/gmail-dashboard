import { useEffect, useState } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { FiInbox } from "react-icons/fi";
import "./App.css";

function App() {
  const [emails, setEmails] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null); // NEW: Error handling
  
  const BACKEND_URL = "https://cognitive-isabella-gmass-9839fc62.koyeb.app";

  useEffect(() => {
    const fetchEmails = async () => {
      try {
        setError(null); // Clear previous errors
        const res = await axios.get(`${BACKEND_URL}/emails`);
        setEmails(res.data);
        console.log("📧 Emails loaded:", res.data.length);
        
        // Log label distribution for debugging
        const labelCounts = res.data.reduce((acc, email) => {
          acc[email.label] = (acc[email.label] || 0) + 1;
          return acc;
        }, {});
        console.log("📊 Label distribution:", labelCounts);
        
      } catch (err) {
        console.error("Failed to load emails:", err);
        setError("Failed to load emails. Please check your connection.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchEmails();
    const interval = setInterval(fetchEmails, 15000); // Increased to 15s to be safer
    return () => clearInterval(interval);
  }, []);

  const filteredEmails = emails.filter(
    (mail) =>
      mail.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      mail.from.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (mail.senderName && mail.senderName.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // 🚀 UPDATED: Enhanced label color function
  const getLabelColor = (label) => {
    switch (label) {
      case "INBOX": return "var(--inbox-color)";
      case "PROMOTIONS": return "var(--promotions-color)";
      case "UPDATES": return "var(--updates-color)";
      case "SOCIAL": return "var(--social-color)";
      case "FORUMS": return "var(--forums-color)"; // NEW
      case "IMPORTANT": return "var(--important-color)";
      case "STARRED": return "var(--starred-color)";
      case "SENT": return "var(--sent-color)";
      case "DRAFT": return "var(--draft-color)";
      case "SPAM": return "var(--spam-color)"; // NEW
      default: return "var(--default-color)";
    }
  };

  // 🚀 NEW: Get label display text
  const getLabelText = (label) => {
    switch (label) {
      case "PROMOTIONS": return "Promotions";
      case "UPDATES": return "Updates";
      case "SOCIAL": return "Social";
      case "FORUMS": return "Forums";
      case "SPAM": return "Spam";
      case "IMPORTANT": return "Important";
      case "STARRED": return "Starred";
      case "SENT": return "Sent";
      case "DRAFT": return "Draft";
      default: return "Primary";
    }
  };

  return (
    <div className="gmass-dashboard">
      <div className="content">
        <div className="search-bar">
          <input
            placeholder="Search emails by subject, sender, or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* NEW: Error display */}
        {error && (
          <div className="error-message" style={{
            background: '#fee2e2',
            color: '#dc2626',
            padding: '10px',
            borderRadius: '5px',
            marginBottom: '20px'
          }}>
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="loading-indicator">Loading emails...</div>
        ) : filteredEmails.length === 0 ? (
          <div className="no-emails">
            {emails.length === 0 ? "No emails found. Try authenticating first." : "No emails match your search."}
          </div>
        ) : (
          <div>
            {/* NEW: Email count and stats */}
            <div className="email-stats" style={{
              marginBottom: '15px',
              color: 'var(--text-secondary)',
              fontSize: '14px'
            }}>
              Showing {filteredEmails.length} of {emails.length} emails
              {searchQuery && ` matching "${searchQuery}"`}
            </div>

            <div className="emails-horizontal-scroll">
              <AnimatePresence>
                {filteredEmails.map((mail) => (
                  <motion.div
                    key={mail.id}
                    className={`email-card-horizontal ${mail.isSpam ? 'spam' : ''} ${!mail.isRead ? 'unread' : ''}`}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3 }}
                    layout
                  >
                    <div className="email-header">
                      <div className="avatar">
                        {(mail.senderName || mail.from).charAt(0).toUpperCase()}
                      </div>
                      <div
                        className="email-label"
                        style={{ backgroundColor: getLabelColor(mail.label) }}
                      >
                        {getLabelText(mail.label)}
                      </div>
                    </div>
                    <div className="email-body">
                      <div className="sender">
                        {mail.senderName || mail.from}
                        {mail.isSpam && <span style={{color: '#dc2626', marginLeft: '5px'}}>⚠️</span>}
                      </div>
                      <h3 className="subject">{mail.subject}</h3>
                      <p className="snippet">{mail.snippet}</p>
                    </div>
                    <div className="email-footer">
                      <span className="time">
                        {new Date(mail.date).toLocaleTimeString([], { 
                          hour: "2-digit", 
                          minute: "2-digit" 
                        })}
                      </span>
                      {/* NEW: Read status indicator */}
                      {!mail.isRead && (
                        <span style={{
                          marginLeft: '10px',
                          width: '8px',
                          height: '8px',
                          backgroundColor: 'var(--primary-blue)',
                          borderRadius: '50%',
                          display: 'inline-block'
                        }}></span>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
