const headers = details.data.payload.headers || [];
          const subject = headers.find((h) => h.name === "Subject")?.value || "No Subject";
          const from = headers.find((h) => h.name === "From")?.value || "Unknown Sender";
          const dateHeader = headers.find((h) => h.name === "Date")?.value;
          const date = dateHeader || new Date(parseInt(details.data.internalDate)).toISOString();
          
          // 🚀 NEW: Double-check time filter (Gmail search might be imprecise)
          if (!isWithinLastHour(date)) {
            return null; // Skip emails older than 1 hour
          }
          
          const category = mapGmailLabelsToCategory(details.data.labelIds);
          
          // Parse sender name and email
          const fromMatch = from.match(/^(.+?)\s*<(.+)>$/) || from.match(/^(.+)$/);
          const senderName = fromMatch ? fromMatch[1]?.trim().replace(/^["']|["']$/g, '') : from;
          const senderEmail = fromMatch && fromMatch[2] ? fromMatch[2].trim() : from;

          return {
            id: details.data.id,
            account: account.email,
            subject,
            from,
            senderName,
            senderEmail,
            date: new Date(date).toISOString(),
            snippet: details.data.snippet || "",
            label: category,
            labelIds: details.data.labelIds,
            threadId: details.data.threadId,
            isRead: !details.data.labelIds?.includes("UNREAD"),
            isSpam: details.data.labelIds?.includes("SPAM"),
            // 🚀 NEW: Add time info for debugging
            receivedMinutesAgo: Math.floor((new Date() - new Date(date)) / (1000 * 60))
          };import express from "express";
import { google } from "googleapis";
import cors from "cors";
import bodyParser from "body-parser";

const app = express();

// ⚡ CORS - allow your Vercel frontend
const FRONTEND_URL = "https://gmail-dashboard.vercel.app";
app.use(cors({ origin: FRONTEND_URL }));
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const { CLIENT_ID, CLIENT_SECRET, REDIRECT_URI } = process.env;

if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
  console.error("❌ Missing Google OAuth environment variables (CLIENT_ID, CLIENT_SECRET, REDIRECT_URI).");
  process.exit(1);
}

// Initialize OAuth2
const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
let accounts = [];

// 🚀 NEW: Function to get Gmail search query for ALL received emails in last hour
const getLastHourReceivedQuery = () => {
  const oneHourAgo = new Date();
  oneHourAgo.setHours(oneHourAgo.getHours() - 1);
  
  // Format date for Gmail search (YYYY/MM/DD)
  const year = oneHourAgo.getFullYear();
  const month = String(oneHourAgo.getMonth() + 1).padStart(2, '0');
  const day = String(oneHourAgo.getDate()).padStart(2, '0');
  
  // 🎯 KEY: Search ALL folders (inbox, spam, promotions, etc.) - exclude only sent/drafts
  return `-in:sent -in:drafts after:${year}/${month}/${day}`;
};

// 🚀 NEW: Enhanced label mapping
const mapGmailLabelsToCategory = (labelIds) => {
  if (!labelIds || labelIds.length === 0) return "INBOX";
  
  // Priority order for label detection
  if (labelIds.includes("SPAM")) return "SPAM";
  if (labelIds.includes("CATEGORY_PROMOTIONS")) return "PROMOTIONS";
  if (labelIds.includes("CATEGORY_SOCIAL")) return "SOCIAL";
  if (labelIds.includes("CATEGORY_UPDATES")) return "UPDATES";
  if (labelIds.includes("CATEGORY_FORUMS")) return "FORUMS";
  if (labelIds.includes("IMPORTANT")) return "IMPORTANT";
  if (labelIds.includes("STARRED")) return "STARRED";
  if (labelIds.includes("SENT")) return "SENT";
  if (labelIds.includes("DRAFT")) return "DRAFT";
  if (labelIds.includes("INBOX")) return "INBOX";
  
  return "INBOX";
};

// 🚀 NEW: Get ALL received emails from last hour (any folder)
const getRecentReceivedEmails = async (gmail) => {
  const lastHourReceivedQuery = getLastHourReceivedQuery();
  
  try {
    console.log(`🔍 Searching for RECEIVED emails with query: ${lastHourReceivedQuery}`);
    
    const listResponse = await gmail.users.messages.list({
      userId: "me",
      q: lastHourReceivedQuery, // All received emails from last hour (inbox, spam, promotions, etc.)
      maxResults: 100, // Increased since we want all received emails
    });
    
    if (!listResponse.data.messages) {
      console.log("📭 No emails RECEIVED in the last hour");
      return [];
    }
    
    console.log(`📥 Found ${listResponse.data.messages.length} RECEIVED emails from last hour`);
    return listResponse.data.messages;
    
  } catch (err) {
    console.error(`❌ Error fetching recent RECEIVED emails:`, err.message);
    return [];
  }
};

// 🚀 NEW: Check if email is within last hour (additional filter)
const isWithinLastHour = (emailDate) => {
  const oneHourAgo = new Date();
  oneHourAgo.setHours(oneHourAgo.getHours() - 1);
  
  const emailTime = new Date(emailDate);
  return emailTime >= oneHourAgo;
};

// --- Auth endpoints ---
app.get("/auth", (req, res) => {
  const url = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/gmail.readonly"],
  });
  res.redirect(url);
});

app.get("/auth/callback", async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).send("❌ Missing code in query");

    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    const gmail = google.gmail({ version: "v1", auth: oAuth2Client });
    const profile = await gmail.users.getProfile({ userId: "me" });

    accounts.push({ email: profile.data.emailAddress, tokens });
    console.log(`✅ Account ${profile.data.emailAddress} connected`);
    res.redirect(FRONTEND_URL);
  } catch (err) {
    console.error("❌ Auth callback error:", err.message);
    res.status(500).send("Authentication failed");
  }
});

// --- 🚀 UPDATED: Recent emails endpoint (last hour only) ---
app.get("/emails", async (req, res) => {
  try {
    if (accounts.length === 0) {
      return res.json({ 
        emails: [], 
        message: "No authenticated accounts",
        timeRange: "last 1 hour"
      });
    }

    const allEmails = [];
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    for (const account of accounts) {
      oAuth2Client.setCredentials(account.tokens);
      const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

      // 🚀 NEW: Get only recent RECEIVED emails from ALL folders
      const messages = await getRecentReceivedEmails(gmail);
      
      if (messages.length === 0) {
        console.log(`📭 No recent emails for ${account.email}`);
        continue;
      }

      const emailPromises = messages.map(async (msg) => {
        try {
          const details = await gmail.users.messages.get({ 
            userId: "me", 
            id: msg.id, 
            format: "full" 
          });

          const headers = details.data.payload.headers || [];
          const subject = headers.find((h) => h.name === "Subject")?.value || "No Subject";
          const from = headers.find((h) => h.name === "From")?.value || "Unknown Sender";
          const dateHeader = headers.find((h) => h.name === "Date")?.value;
          const date = dateHeader || new Date(parseInt(details.data.internalDate)).toISOString();
          
          // 🚀 NEW: Double-check time filter (Gmail search might be imprecise)
          if (!isWithinLastHour(date)) {
            return null; // Skip emails older than 1 hour
          }
          
          const category = mapGmailLabelsToCategory(details.data.labelIds);
          
          // Parse sender name and email
          const fromMatch = from.match(/^(.+?)\s*<(.+)>$/) || from.match(/^(.+)$/);
          const senderName = fromMatch ? fromMatch[1]?.trim().replace(/^["']|["']$/g, '') : from;
          const senderEmail = fromMatch && fromMatch[2] ? fromMatch[2].trim() : from;

          return {
            id: details.data.id,
            account: account.email,
            subject,
            from,
            senderName,
            senderEmail,
            date: new Date(date).toISOString(),
            snippet: details.data.snippet || "",
            label: category,
            labelIds: details.data.labelIds,
            threadId: details.data.threadId,
            isRead: !details.data.labelIds?.includes("UNREAD"),
            isSpam: details.data.labelIds?.includes("SPAM"),
            // 🚀 NEW: Add time info for debugging
            receivedMinutesAgo: Math.floor((new Date() - new Date(date)) / (1000 * 60))
          };
        } catch (emailErr) {
          console.error(`❌ Error processing email ${msg.id}:`, emailErr.message);
          return null;
        }
      });

      const emails = await Promise.all(emailPromises);
      const validEmails = emails.filter(email => email !== null);
      allEmails.push(...validEmails);
    }

    // Sort by date (newest first)
    allEmails.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    console.log(`📥 Found ${allEmails.length} RECEIVED emails from last hour across ${accounts.length} accounts`);
    
    // 🚀 NEW: Log time distribution for debugging
    const timeDistribution = allEmails.reduce((acc, email) => {
      const minutesAgo = email.receivedMinutesAgo;
      if (minutesAgo <= 15) acc['0-15min']++;
      else if (minutesAgo <= 30) acc['15-30min']++;
      else if (minutesAgo <= 45) acc['30-45min']++;
      else acc['45-60min']++;
      return acc;
    }, {'0-15min': 0, '15-30min': 0, '30-45min': 0, '45-60min': 0});
    
    console.log("⏰ Time distribution:", timeDistribution);

    res.json({
      emails: allEmails,
      totalCount: allEmails.length,
      timeRange: "last 1 hour",
      accounts: accounts.length,
      searchCriteria: getLastHourQuery()
    });
  } catch (err) {
    console.error("❌ Failed to fetch recent emails:", err.message);
    res.status(500).json({ 
      error: "Failed to fetch emails",
      timeRange: "last 1 hour"
    });
  }
});

// 🚀 NEW: Endpoint to get emails from different time ranges
app.get("/emails/:timeRange", async (req, res) => {
  const { timeRange } = req.params; // hour, day, week
  
  let query;
  switch (timeRange) {
    case 'hour':
      query = getLastHourReceivedQuery();
      break;
    case 'day':
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);
      query = `after:${oneDayAgo.getFullYear()}/${String(oneDayAgo.getMonth() + 1).padStart(2, '0')}/${String(oneDayAgo.getDate()).padStart(2, '0')}`;
      break;
    case 'week':
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      query = `after:${oneWeekAgo.getFullYear()}/${String(oneWeekAgo.getMonth() + 1).padStart(2, '0')}/${String(oneWeekAgo.getDate()).padStart(2, '0')}`;
      break;
    default:
      return res.status(400).json({ error: "Invalid time range. Use: hour, day, or week" });
  }
  
  // Implementation similar to main endpoint but with custom query
  // ... (implementation would be similar to main /emails endpoint)
  res.json({ message: `Emails from last ${timeRange}`, query });
});

// --- Health ---
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    accounts: accounts.length,
    timestamp: new Date().toISOString(),
    timeFilter: "last 1 hour"
  });
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`🚀 Backend running at https://cognitive-isabella-gmass-9839fc62.koyeb.app`);
  console.log(`⏰ Filtering RECEIVED emails to show only last 1 hour from ALL folders`);
});
