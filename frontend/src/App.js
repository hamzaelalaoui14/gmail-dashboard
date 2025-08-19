import { useEffect, useState } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { FiClock, FiRefreshCw } from "react-icons/fi";
import "./App.css";

function App() {
  const [emails, setEmails] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  
  const BACKEND_URL = "https://cognitive-isabella-gmass-9839fc62.koyeb.app";

  // 🚀 NEW: Calculate time ago for recent emails
  const getTimeAgo = (dateString) => {
    const now = new Date();
    const emailDate = new Date(dateString);
    const diffInMinutes = Math.floor((now - emailDate) / (1000 * 60));
    
    if (diffInMinutes < 1) return "Just now";
    if (diffInMinutes === 1) return "1 minute ago";
    if (diffInMinutes < 60) return `${diffInMinutes} minutes ago`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours === 1) return "1 hour ago";
    return `${diffInHours} hours ago`;
  };

  // 🚀 NEW: Check if email is very recent (last 5 minutes)
  const isVeryRecent = (dateString) => {
    const now = new Date();
    const emailDate = new Date(dateString);
    const diffInMinutes = Math.floor((now - emailDate) / (1000 * 60));
    return diffInMinutes <= 5;
  };

  const fetchEmails = async () => {
    try {
      setError(null);
      const res = await axios.get(`${BACKEND_URL}/emails`);
      
      // Handle new response format
      const emailData = res.data.emails || res.data;
      setEmails(emailData);
      setLastUpdate(new Date());
      
      console.log("📧 Recent emails loaded:", emailData.length);
      console.log("📊 Time range:", res.data.timeRange || "last hour");
      
      // Log recent activity
      const veryRecentCount = emailData.filter(email => isVeryRecent(email.date)).length;
      if (veryRecentCount > 0) {
        console.log(`🔥 ${veryRecentCount} emails received in last 5 minutes!`);
      }
      
    } catch (err) {
      console.error("Failed to load emails:", err);
      setError("Failed to load recent emails. Please check your connection.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEmails();
    // 🚀 NEW: More frequent refresh for recent activity (every 30 seconds)
    const interval = setInterval(fetchEmails, 30000);
    return () => clearInterval(interval);
  }, []);

  const filteredEmails = emails.filter(
    (mail) =>
      mail.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      mail.from.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (mail.senderName && mail.senderName.toLowerCase().includes(searchQuery.toLowerCase()))
  );

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
        {/* 🚀 NEW: Recent Activity Header */}
        <div className="dashboard-header" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
          padding: '15px',
          background: 'var(--card-bg)',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FiClock size={20} color="var(--primary-blue)" />
            <h1 style={{ margin: 0, color: 'var(--text-primary)' }}>Recent Received Emails</h1>
            <span style={{ 
              background: 'var(--primary-blue)', 
              color: 'white', 
              padding: '2px 8px', 
              borderRadius: '12px', 
              fontSize: '12px' 
            }}>
              Last Hour
            </span>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            {lastUpdate && (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Updated: {lastUpdate.toLocaleTimeString()}
              </span>
            )}
            <button 
              onClick={fetchEmails}
              disabled={isLoading}
              style={{
                background: 'var(--primary-blue)',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 12px',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <FiRefreshCw size={14} className={isLoading ? 'spinning' : ''} />
              Refresh
            </button>
          </div>
        </div>

        <div className="search-bar">
          <input
            placeholder="Search recent emails..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {error && (
          <div className="error-message" style={{
            background: '#fee2e2',
            color: '#dc2626',
            padding: '15px',
            borderRadius: '8px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            ⚠️ {error}
          </div>
        )}

        {isLoading ? (
          <div className="loading-indicator">
            <FiRefreshCw className="spinning" size={24} />
            <p>Loading recent emails...</p>
          </div>
        ) : filteredEmails.length === 0 ? (
          <div className="no-emails" style={{
            textAlign: 'center',
            padding: '60px 20px',
            background: 'var(--card-bg)',
            borderRadius: '8px',
            color: 'var(--text-secondary)'
          }}>
            <FiClock size={48} style={{ marginBottom: '15px', opacity: 0.5 }} />
            <h3>No Recent Emails Received</h3>
            <p>
              {emails.length === 0 
                ? "No emails received in the last hour from any folder (inbox, spam, promotions, etc.). Try again later or check your authentication." 
                : `No received emails match "${searchQuery}" in recent activity.`
              }</p>
          </div>
        ) : (
          <div>
            {/* 🚀 NEW: Enhanced stats */}
            <div className="email-stats" style={{
              marginBottom: '15px',
              padding: '10px 15px',
              background: 'var(--card-bg)',
              borderRadius: '6px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '14px',
              color: 'var(--text-secondary)'
            }}>
              <span>
                📥 {filteredEmails.length} received emails
                {searchQuery && ` matching "${searchQuery}"`}
              </span>
              <span>
                🔥 {filteredEmails.filter(email => isVeryRecent(email.date)).length} in last 5 minutes
              </span>
            </div>

            <div className="emails-horizontal-scroll">
              <AnimatePresence>
                {filteredEmails.map((mail) => (
                  <motion.div
                    key={mail.id}
                    className={`email-card-horizontal ${mail.isSpam ? 'spam' : ''} ${!mail.isRead ? 'unread' : ''} ${isVeryRecent(mail.date) ? 'very-recent' : ''}`}
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
                        {isVeryRecent(mail.date) && <span style={{color: '#22c55e', marginLeft: '5px'}}>🔥</span>}
                      </div>
                      <h3 className="subject">{mail.subject}</h3>
                      <p className="snippet">{mail.snippet}</p>
                    </div>
                    
                    <div className="email-footer">
                      {/* 🚀 NEW: Show relative time */}
                      <span className="time-ago">
                        {getTimeAgo(mail.date)}
                      </span>
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
