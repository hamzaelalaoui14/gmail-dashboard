import express from "express";
import { google } from "googleapis";
import cors from "cors";
import bodyParser from "body-parser";

const app = express();

// ✅ Replace with your Vercel frontend URL
app.use(cors({
  origin: "https://gmail-dashboard-ks0d3rs7t-hamzas-projects-4f002b6e.vercel.app"
}));
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// ✅ Check environment variables
const { CLIENT_ID, CLIENT_SECRET, REDIRECT_URI } = process.env;
if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
  console.error("❌ Missing Google OAuth environment variables (CLIENT_ID, CLIENT_SECRET, REDIRECT_URI).");
  process.exit(1);
}

// Initialize OAuth2 client
const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

let accounts = [];

// --- Authentication ---
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
    console.log(`✅ Account ${profile.data.emailAddress} connected successfully`);

    res.send(`Account ${profile.data.emailAddress} connected!`);
  } catch (err) {
    console.error("❌ Auth callback error:", err.message);
    res.status(500).send("Authentication failed");
  }
});

// --- Fetch emails ---
const mapLabel = (labelIds) => {
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

const fetchEmailsForAccount = async (account) => {
  try {
    oAuth2Client.setCredentials(account.tokens);
    const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

    const listResponse = await gmail.users.messages.list({
      userId: "me",
      maxResults: 20
    });

    if (!listResponse.data.messages) return [];

    const emails = await Promise.all(
      listResponse.data.messages.map(async (msg) => {
        const details = await gmail.users.messages.get({
          userId: "me",
          id: msg.id,
          format: "full",
        });

        const headers = details.data.payload.headers || [];
        const subject = headers.find(h => h.name === "Subject")?.value || "No Subject";
        const from = headers.find(h => h.name === "From")?.value || "Unknown Sender";
        const date = headers.find(h => h.name === "Date")?.value;
        const emailDate = date ? new Date(date).toISOString() : new Date().toISOString();
        const labelIds = details.data.labelIds || [];
        const label = mapLabel(labelIds);

        return {
          id: details.data.id,
          account: account.email,
          subject,
          from,
          date: emailDate,
          label,
          snippet: details.data.snippet || "",
          isUnread: labelIds.includes("UNREAD")
        };
      })
    );

    return emails;
  } catch (err) {
    console.error(`❌ Failed to fetch emails for ${account.email}:`, err.message);
    return [];
  }
};

// --- Emails endpoint ---
app.get("/emails", async (req, res) => {
  if (!accounts.length) return res.json([]);
  const allEmails = await Promise.all(accounts.map(fetchEmailsForAccount));
  res.json(allEmails.flat().sort((a, b) => new Date(b.date) - new Date(a.date)));
});

// --- Simple health check ---
app.get("/health", (req, res) => {
  res.json({ status: "ok", accounts: accounts.length, timestamp: new Date().toISOString() });
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`🚀 Backend running at ${REDIRECT_URI.replace("/auth/callback", "")}`);
});
