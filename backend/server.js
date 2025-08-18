import express from "express";
import { google } from "googleapis";
import cors from "cors";
import bodyParser from "body-parser";

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// ✅ Use environment variables instead of credentials.json
if (!process.env.CLIENT_ID || !process.env.CLIENT_SECRET) {
  console.error("❌ Missing Google OAuth environment variables (CLIENT_ID, CLIENT_SECRET).");
  process.exit(1);
}

const oAuth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI || "https://gmail-dashboard-production.up.railway.app/auth/callback"
);

let accounts = [];

// Authentication endpoints
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

// ---- Gmail label mapping function (unchanged) ----
const mapGmailLabelToAppLabel = (labelIds, subject = "", queryHint = null) => {
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

// ---- Fetch emails per account (unchanged except using env OAuth2 client) ----
const fetchEmailsForAccount = async (account) => {
  try {
    oAuth2Client.setCredentials(account.tokens);
    const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

    let allMessages = [];
    const queries = [
      { query: "in:inbox", location: "INBOX" },
      { query: "in:spam", location: "SPAM" },
      { query: "category:promotions", location: "PROMOTIONS" },
      { query: "category:updates", location: "UPDATES" },
      { query: "category:forums", location: "FORUMS" },
      { query: "category:social", location: "SOCIAL" },
      { query: "is:important", location: "IMPORTANT" },
      { query: "is:starred", location: "STARRED" }
    ];

    for (const { query, location } of queries) {
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

        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (queryError) {
        console.error(`⚠️ Failed to fetch from ${location}:`, queryError.message);
      }
    }

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
        const mappedLabel = mapGmailLabelToAppLabel(emailLabels, subject);

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
      .filter(result => result.status === 'fulfilled' && result.value !== null)
      .map(result => result.value);

  } catch (err) {
    console.error(`❌ Failed to fetch emails for ${account.email}:`, err.message);
    return [];
  }
};

// ---- Routes ----
app.get("/emails", async (req, res) => {
  try {
    if (accounts.length === 0) return res.json([]);

    const accountPromises = accounts.map(account => fetchEmailsForAccount(account));
    const accountResults = await Promise.allSettled(accountPromises);

    let allEmails = [];
    accountResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        allEmails.push(...result.value);
      }
    });

    const sortedEmails = allEmails
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 100);

    res.json(sortedEmails);
  } catch (err) {
    console.error("❌ Error in /emails endpoint:", err);
    res.status(500).json({ error: "Failed to fetch emails" });
  }
});

// Health check + accounts
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

app.listen(PORT, () => {
  console.log(`🚀 Backend running at http://localhost:${PORT}`);
});
