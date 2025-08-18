import express from "express";
import { google } from "googleapis";
import cors from "cors";
import bodyParser from "body-parser";

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Use dynamic port from environment
const PORT = process.env.PORT || 3000;

// Validate required environment variables
if (!process.env.CLIENT_ID || !process.env.CLIENT_SECRET || !process.env.REDIRECT_URI) {
  console.error("❌ Missing Google OAuth environment variables (CLIENT_ID, CLIENT_SECRET, REDIRECT_URI).");
  process.exit(1);
}

// Initialize OAuth2 client using env variables only
const oAuth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

let accounts = [];

// --- Authentication Endpoints ---
app.get("/auth", (req, res) => {
  const url = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/gmail.readonly"],
  });
  res.redirect(url);
});

app.get("/auth/callback", async (req, res) => {
  console.log("⚡ Callback hit with query:", req.query);

  try {
    const { code } = req.query;
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    const gmail = google.gmail({ version: "v1", auth: oAuth2Client });
    const profile = await gmail.users.getProfile({ userId: "me" });

    accounts.push({ email: profile.data.emailAddress, tokens });
    console.log(`✅ Account ${profile.data.emailAddress} connected successfully`);

    res.send(`Account ${profile.data.emailAddress} connected!`);
  } catch (err) {
    console.error("❌ Auth callback error:", err);
    res.status(500).send("Authentication failed");
  }
});

// --- Gmail label mapping ---
const mapGmailLabelToAppLabel = (labelIds) => {
  if (!labelIds || labelIds.length === 0) return "INBOX";

  if (labelIds.includes("SPAM")) return "SPAM";
  if (labelIds.includes("CATEGORY_PROMOTIONS")) return "PROMOTIONS";
  if (labelIds.includes("CATEGORY_UPDATES")) return "UPDATES";
  if (labelIds.includes("CATEGORY_FORUMS")) return "FORUM";
  if (labelIds.includes("CATEGORY_SOCIAL")) return "SOCIAL";
  if (labelIds.includes("IMPORTANT")) return "IMPORTANT";
  if (labelIds.includes("STARRED")) return "STARRED";
  if (labelIds.includes("SENT")) return "SENT";
  if (labelIds.includes("DRAFT")) return "DRAFT";

  return "INBOX";
};

// --- Fetch emails ---
const fetchEmailsForAccount = async (account) => {
  try {
    oAuth2Client.setCredentials(account.tokens);
    const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

    const queries = [
      { query: "in:inbox" },
      { query: "in:spam" },
      { query: "category:promotions" },
      { query: "category:updates" },
      { query: "category:forums" },
      { query: "category:social" },
      { query: "is:important" },
      { query: "is:starred" }
    ];

    let allMessages = [];

    for (const { query } of queries) {
      try {
        const listResponse = await gmail.users.messages.list({
          userId: "me",
          maxResults: 20,
          includeSpamTrash: true,
          q: query
        });

        if (listResponse.data.messages) {
          allMessages.push(...listResponse.data.messages);
        }
      } catch (queryError) {
        console.error(`⚠️ Failed to fetch query "${query}":`, queryError.message);
      }
    }

    // Remove duplicates
    const uniqueMessages = allMessages.filter(
      (msg, index, self) => index === self.findIndex(m => m.id === msg.id)
    );

    if (!uniqueMessages.length) return [];

    const emailPromises = uniqueMessages.map(async (msg) => {
      try {
        const details = await gmail.users.messages.get({
          userId: "me",
          id: msg.id,
          format: "full",
        });

        const headers = details.data.payload.headers || [];
        const subject = headers.find((h) => h.name === "Subject")?.value || "No Subject";
        const from = headers.find((h) => h.name === "From")?.value || "Unknown Sender";
        const date = headers.find((h) => h.name === "Date")?.value;
        const emailDate = date
          ? new Date(date).toISOString()
          : details.data.internalDate
            ? new Date(parseInt(details.data.internalDate)).toISOString()
            : new Date().toISOString();

        const emailLabels = details.data.labelIds || [];
        const mappedLabel = mapGmailLabelToAppLabel(emailLabels);

        return {
          id: details.data.id,
          account: account.email,
          label: mappedLabel,
          labelIds: emailLabels,
          subject,
          from,
          date: emailDate,
          snippet: details.data.snippet || "",
          isUnread: details.data.labelIds?.includes("UNREAD") || false,
        };
      } catch (msgError) {
        console.error(`⚠️ Failed to fetch message ${msg.id}:`, msgError.message);
        return null;
      }
    });

    const emailResults = await Promise.allSettled(emailPromises);

    return emailResults
      .filter(result => result.status === "fulfilled" && result.value !== null)
      .map(result => result.value);

  } catch (err) {
    console.error(`❌ Failed to fetch emails for ${account.email}:`, err.message);
    return [];
  }
};

// --- Routes ---
app.get("/emails", async (req, res) => {
  if (accounts.length === 0) return res.json([]);

  try {
    const accountResults = await Promise.all(accounts.map(account => fetchEmailsForAccount(account)));

    const allEmails = accountResults.flat();

    const sortedEmails = allEmails
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 100);

    res.json(sortedEmails);
  } catch (err) {
    console.error("❌ Error in /emails endpoint:", err);
    res.status(500).json({ error: "Failed to fetch emails" });
  }
});

// Health + accounts
app.get("/health", (req, res) => {
  res.json({ status: "ok", accounts: accounts.length, timestamp: new Date().toISOString() });
});

app.get("/accounts", (req, res) => {
  res.json(accounts.map(acc => ({ email: acc.email })));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Backend running at port ${PORT}`);
});
