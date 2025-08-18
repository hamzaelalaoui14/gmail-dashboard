import { useEffect, useState } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { FiInbox } from "react-icons/fi";
import "./App.css";

function App() {
  const [emails, setEmails] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "https://cognitive-isabella-gmass-9839fc62.koyeb.app";

  // Fetch emails
  useEffect(() => {
    const fetchEmails = async () => {
      try {
        const res = await axios.get(`${BACKEND_URL}/emails`);
        setEmails(res.data);
      } catch (err) {
        console.error("Failed to load emails:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchEmails();
    const interval = setInterval(fetchEmails, 10000); // refresh every 10 sec
    return () => clearInterval(interval);
  }, [BACKEND_URL]);

  // Group emails by account
  const groupedEmails = emails.reduce((acc, mail) => {
    if (!acc[mail.account]) acc[mail.account] = [];
    acc[mail.account].push(mail);
    return acc;
  }, {});

  // Filter emails based on search
  const filterEmails = (emails) =>
    emails.filter(
      (mail) =>
        mail.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
        mail.from.toLowerCase().includes(searchQuery.toLowerCase())
    );

  // Get label color
  const getLabelColor = (label) => {
    switch (label) {
      case "INBOX":
        return "var(--inbox-color)";
      case "PROMOTIONS":
        return "var(--promotions-color)";
      case "UPDATES":
        return "var(--updates-color)";
      case "SOCIAL":
        return "var(--social-color)";
      case "FORUM":
        return "var(--forum-color)";
      case "IMPORTANT":
        return "var(--important-color)";
      case "STARRED":
        return "var(--starred-color)";
      case "SENT":
        return "var(--sent-color)";
      case "DRAFT":
        return "var(--draft-color)";
      case "SPAM":
        return "var(--spam-color)";
      default:
        return "var(--default-color)";
    }
  };

  return (
    <div className="gmass-dashboard">
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
          <div className="accounts-container">
            {Object.entries(groupedEmails).map(([account, accountEmails]) => (
              <div key={account} className="account-section">
                <div className="account-header">
                  <FiInbox className="account-icon" />
                  <h3>{account}</h3>
                </div>

                <div className="emails-horizontal-scroll">
                  <AnimatePresence>
                    {filterEmails(accountEmails).map((mail) => (
                      <motion.div
                        key={mail.id}
                        className="email-card-horizontal"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3 }}
                        layout
                      >
                        <div className="email-header">
                          <div className="avatar">{mail.from.charAt(0).toUpperCase()}</div>
                          <div
                            className="email-label"
                            style={{ backgroundColor: getLabelColor(mail.label) }}
                          >
                            {mail.label}
                          </div>
                        </div>
                        <div className="email-body">
                          <div className="sender">{mail.from}</div>
                          <h3 className="subject">{mail.subject}</h3>
                          <p className="snippet">{mail.snippet}</p>
                        </div>
                        <div className="email-footer">
                          <span className="time">
                            {new Date(mail.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
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

export default App;
