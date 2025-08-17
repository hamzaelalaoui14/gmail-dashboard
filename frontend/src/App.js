import { useEffect, useState, useRef } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { FiInbox, FiChevronLeft, FiChevronRight } from "react-icons/fi";
import "./App.css";

function App() {
  const [emails, setEmails] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const scrollRefs = useRef({});

  const formatTimeDisplay = (mail) => {
    let emailDate = null;
    if (mail.date) emailDate = new Date(mail.date);
    if ((!emailDate || isNaN(emailDate.getTime())) && mail.internalDate) {
      emailDate = new Date(parseInt(mail.internalDate));
    }
    if (!emailDate || isNaN(emailDate.getTime())) return "Unknown";

    const now = new Date();
    const seconds = Math.floor((now - emailDate) / 1000);
    if (seconds < 60) return `${seconds} second${seconds !== 1 ? "s" : ""} ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minute${Math.floor(seconds / 60) !== 1 ? "s" : ""} ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hour${Math.floor(seconds / 3600) !== 1 ? "s" : ""} ago`;

    return emailDate.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

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

  // REMOVED: Unnecessary timer that recreated arrays every second
  // useEffect(() => {
  //   const timer = setInterval(() => setEmails((prev) => [...prev]), 1000);
  //   return () => clearInterval(timer);
  // }, []);

  const groupedEmails = emails.reduce((acc, mail) => {
    if (!acc[mail.account]) acc[mail.account] = [];
    acc[mail.account].push(mail);
    return acc;
  }, {});

  const filterEmails = (emails) =>
    emails.filter(
      (mail) =>
        mail.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
        mail.from.toLowerCase().includes(searchQuery.toLowerCase())
    );

  const handleScroll = (account, direction) => {
    const scrollContainer = scrollRefs.current[account];
    if (scrollContainer) {
      const scrollAmount = 300;
      scrollContainer.scrollLeft += direction === "left" ? -scrollAmount : scrollAmount;
    }
  };

  const handleTouchStart = (account, e) => {
    scrollRefs.current[account].touchStart = e.targetTouches[0].clientX;
  };

  const handleTouchMove = (account, e) => {
    scrollRefs.current[account].touchEnd = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = (account) => {
    const container = scrollRefs.current[account];
    if (container.touchStart - container.touchEnd > 50) handleScroll(account, "right");
    else if (container.touchStart - container.touchEnd < -50) handleScroll(account, "left");
  };

  // REMOVED: getLabelFromEmail() - no longer needed since backend provides accurate labels

  // Enhanced label colors to support more Gmail label types
  const getLabelColor = (label) => {
    switch (label) {
      case "INBOX":
        return "#4CAF50"; // Green
      case "SPAM":
        return "#F44336"; // Red
      case "UPDATES":
        return "#FF9800"; // Orange
      case "FORUM":
        return "#9C27B0"; // Purple
      case "PROMOTIONS":
        return "#8BC34A"; // Light Green
      case "SOCIAL":
        return "#2196F3"; // Blue
      case "IMPORTANT":
        return "#FF5722"; // Deep Orange
      case "STARRED":
        return "#FFC107"; // Amber
      case "SENT":
        return "#607D8B"; // Blue Grey
      default:
        return "#9E9E9E"; // Grey
    }
  };

  // Extract name and email from From header
  const parseFrom = (from) => {
    const match = from.match(/"?([^"]*)"?\s*<(.+)>/);
    if (match) return { name: match[1], email: match[2] };
    return { name: from, email: "" };
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

                <div className="scroll-controls">
                  <button className="scroll-button" onClick={() => handleScroll(account, "left")}>
                    <FiChevronLeft />
                  </button>

                  <div
                    className="emails-horizontal-scroll"
                    ref={(el) => (scrollRefs.current[account] = el)}
                    onTouchStart={(e) => handleTouchStart(account, e)}
                    onTouchMove={(e) => handleTouchMove(account, e)}
                    onTouchEnd={() => handleTouchEnd(account)}
                  >
                    <AnimatePresence>
                      {filterEmails(accountEmails).map((mail) => {
                        const fromData = parseFrom(mail.from);
                        // CHANGED: Use label directly from backend instead of prediction
                        const label = mail.label;

                        return (
                          <motion.div
                            key={mail.id}
                            className="email-card-horizontal"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.3 }}
                            layout
                          >
                            <div className="email-header">
                              <div className="avatar">{fromData.name.charAt(0).toUpperCase()}</div>
                              <div className="email-label" style={{ backgroundColor: getLabelColor(label) }}>
                                {label}
                              </div>
                            </div>

                            <div className="email-body">
                              <div className="sender-name">{fromData.name}</div>
                              <div className="sender-email">{fromData.email}</div>
                              <h3 className="subject">{mail.subject}</h3>
                            </div>

                            <div className="email-footer">
                              <span className="time-ago">{formatTimeDisplay(mail)}</span>
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>

                  <button className="scroll-button" onClick={() => handleScroll(account, "right")}>
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