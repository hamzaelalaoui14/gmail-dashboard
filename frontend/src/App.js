import { useEffect, useState } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { FiInbox, FiAlertCircle, FiTag, FiUsers } from "react-icons/fi";
import "./App.css";

function App() {
  const [emails, setEmails] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  // Fetch emails - unchanged from your backend
  useEffect(() => {
    const fetchEmails = async () => {
      try {
        const res = await axios.get("http://localhost:3000/emails");
        setEmails(res.data);
      } catch (err) {
        console.error("Failed to load emails:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchEmails();
    const interval = setInterval(fetchEmails, 10000);
    return () => clearInterval(interval);
  }, []);

  // Filter logic unchanged
  const filteredEmails = emails
    .filter((mail) => !selectedAccount || mail.account === selectedAccount)
    .filter((mail) => 
      mail.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      mail.from.toLowerCase().includes(searchQuery.toLowerCase())
    );

  // Extract accounts unchanged
  const accounts = [...new Set(emails.map((mail) => mail.account))];

  // Helper functions for the UI
  const getLabelFromEmail = (email) => {
    // Mock label detection - adapt based on your actual data
    if (email.subject.toLowerCase().includes("promo")) return "PROMOTIONS";
    if (email.from.toLowerCase().includes("notification")) return "UPDATES";
    if (email.from.toLowerCase().includes("linkedin")) return "SOCIAL";
    return "INBOX";
  };

  const getLabelColor = (label) => {
    switch(label) {
      case 'INBOX': return 'var(--inbox-color)';
      case 'PROMOTIONS': return 'var(--promotions-color)';
      case 'UPDATES': return 'var(--updates-color)';
      case 'SOCIAL': return 'var(--social-color)';
      default: return 'var(--default-color)';
    }
  };

  return (
    <div className="gmass-dashboard">
      {/* Sidebar - enhanced but same functionality */}
      <div className="sidebar">
        <div className="account-switcher">
          <div 
            className={`account ${!selectedAccount ? "active" : ""}`}
            onClick={() => setSelectedAccount(null)}
          >
            <FiUsers className="account-icon" />
            All Accounts
          </div>
          {accounts.map((account) => (
            <div 
              key={account} 
              className={`account ${selectedAccount === account ? "active" : ""}`}
              onClick={() => setSelectedAccount(account)}
            >
              <FiInbox className="account-icon" />
              {account}
            </div>
          ))}
        </div>
      </div>

      {/* Main Content - enhanced with animations */}
      <div className="content">
        <div className="search-bar">
          <input
            type="text"
            placeholder="Search emails..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {isLoading ? (
          <div className="loading-indicator">Loading emails...</div>
        ) : (
          <div className="email-grid">
            <AnimatePresence>
              {filteredEmails.map((mail) => (
                <motion.div
                  key={mail.id}
                  className="email-card"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  layout
                >
                  <div className="email-header">
                    <div className="avatar">
                      {mail.from.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="sender">{mail.from}</div>
                      <div className="account-name">{mail.account}</div>
                    </div>
                    <div 
                      className="email-label"
                      style={{ backgroundColor: getLabelColor(getLabelFromEmail(mail)) }}
                    >
                      {getLabelFromEmail(mail)}
                    </div>
                  </div>
                  <div className="email-body">
                    <h3 className="subject">{mail.subject}</h3>
                    <p className="snippet">{mail.snippet}</p>
                  </div>
                  <div className="email-footer">
                    <span className="time">
                      {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
