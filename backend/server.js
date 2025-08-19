import express from "express";
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

// 🚀 Gmail search query: ALL received emails in last hour
const getLastHourReceivedQuery = () => {
  const oneHourAgo = new Date();
  oneHourAgo.setHours(oneHourAgo.getHours() - 1);

  const year = oneHourAgo.getFullYear();
  const month = String(oneHourAgo.getMonth() + 1).padStart(2, "0");
  const day = String(oneHourAgo.getDate()).padStart(2, "0");

  return `-in:sent -in:drafts after:${year}/${month}/${day}`;
};

// 🚀 Enhanced label mapping
const mapGmailLabelsToCategory = (labelIds) => {
  if (!labelIds || labelIds.length === 0) return "INBOX";

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

// 🚀 Fetch emails for a given query
const fetchEmailsWithQuery = async (gmail, query, account) => {
  const listResponse = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults: 100,
  });

  if (!listResponse.data.messages) return [];

  const emailPromises = listResponse.data.messages.map(async (msg) => {
    try {
      const details = await gmail.users.messages.get({
        userId: "me",
        id: msg.id,
        format: "full",
      });

      const headers = details.data.payload.headers || [];
      const subject = headers.find((h) => h.name === "Subject")?.value || "No Subject";
      const from = headers.find((h) => h.name === "From")?.value || "Unknown Sender";
      const dateHeader = headers.find((h) => h.name === "Date")?.value;
      const date = dateHeader || new Date(parseInt(details.data.internalDate)).toISOString();

      const category = mapGmailLabelsToCategory(details.data.labelIds);

      // Parse sender name and email
      const fromMatch = from.match(/^(.+?)\s*<(.+)>$/) || from.match(/^(.+)$/);
      const senderName = fromMatch ? fromMatch[1]?.trim().replace(/^["']|["']$/g, "") : from;
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
        receivedMinutesAgo: Math.floor((new Date() - new Date(date)) / (1000 * 60)),
      };
    } catch (emailErr) {
      console.error(`❌ Error processing email ${msg.id}:`, emailErr.message);
      return null;
    }
  });

  const emails = await Promise.all(emailPromises);
  return emails.filter((email) => email !== null);
};

// 🚀 Time distribution helper
const getTimeDistribution = (emails) => {
  return emails.reduce((acc, email) => {
    const minutesAgo = email.receivedMinutesAgo;
    let bucket = "";
    if (minutesAgo <= 15) bucket = "0-15min";
    else if (minutesAgo <= 30) bucket = "15-30min";
    else if (minutesAgo <= 45) bucket = "30-45min";
    else bucket = "45-60min";
    acc[bucket] = (acc[bucket] || 0) + 1;
    return acc;
  }, {});
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

// --- Emails endpoint (last hour by default) ---
app.get("/emails", async (req, res) => {
  try {
    if (accounts.length === 0) {
      return res.json({
        emails: [],
        message: "No authenticated accounts",
        timeRange: "last 1 hour",
      });
    }

    const allEmails = [];

    for (const account of accounts) {
      oAuth2Client.setCredentials(account.tokens);
      const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

      const emails = await fetchEmailsWithQuery(gmail, getLastHourReceivedQuery(), account);
      allEmails.push(...emails);
    }

    allEmails.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({
      emails: allEmails,
      totalCount: allEmails.length,
      timeRange: "last 1 hour",
      accounts: accounts.length,
      searchCriteria: getLastHourReceivedQuery(),
      timeDistribution: getTimeDistribution(allEmails),
    });
  } catch (err) {
    console.error("❌ Failed to fetch recent emails:", err.message);
    res.status(500).json({
      error: "Failed to fetch emails",
      timeRange: "last 1 hour",
    });
  }
});

// --- Flexible time ranges (hour, day, week) ---
app.get("/emails/:timeRange", async (req, res) => {
  const { timeRange } = req.params;
  let query;

  switch (timeRange) {
    case "hour":
      query = getLastHourReceivedQuery();
      break;
    case "day": {
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);
      query = `after:${oneDayAgo.getFullYear()}/${String(oneDayAgo.getMonth() + 1).padStart(2, "0")}/${String(oneDayAgo.getDate()).padStart(2, "0")}`;
      break;
    }
    case "week": {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      query = `after:${oneWeekAgo.getFullYear()}/${String(oneWeekAgo.getMonth() + 1).padStart(2, "0")}/${String(oneWeekAgo.getDate()).padStart(2, "0")}`;
      break;
    }
    default:
      return res.status(400).json({ error: "Invalid time range. Use: hour, day, or week" });
  }

  try {
    if (accounts.length === 0) {
      return res.json({ emails: [], message: "No authenticated accounts", timeRange });
    }

    const allEmails = [];

    for (const account of accounts) {
      oAuth2Client.setCredentials(account.tokens);
      const gmail = google.gmail({ version: "v1", auth: oAuth2Client });
      const emails = await fetchEmailsWithQuery(gmail, query, account);
      allEmails.push(...emails);
    }

    allEmails.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({
      emails: allEmails,
      totalCount: allEmails.length,
      timeRange: `last ${timeRange}`,
      accounts: accounts.length,
      searchCriteria: query,
    });
  } catch (err) {
    console.error(`❌ Failed to fetch emails for ${timeRange}:`, err.message);
    res.status(500).json({ error: "Failed to fetch emails", timeRange });
  }
});

// --- Health check ---
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    accounts: accounts.length,
    timestamp: new Date().toISOString(),
    timeFilter: "last 1 hour",
  });
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
  console.log(`⏰ Filtering RECEIVED emails to show only last 1 hour from ALL folders`);
});
