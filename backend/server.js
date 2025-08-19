import express from "express";
import { google } from "googleapis";
import cors from "cors";
import bodyParser from "body-parser";

const app = express();

// CORS, body-parser, and environment variable setup... (No changes here)
const FRONTEND_URL = "https://gmail-dashboard-ks0d3rs7t-hamzas-projects-4f002b6e.vercel.app";
app.use(cors({ origin: FRONTEND_URL }));
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const { CLIENT_ID, CLIENT_SECRET, REDIRECT_URI } = process.env;

if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
  console.error("❌ Missing Google OAuth environment variables (CLIENT_ID, CLIENT_SECRET, REDIRECT_URI).");
  process.exit(1);
}

// Initialize OAuth2... (No changes here)
const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
let accounts = [];

// mapGmailLabelsToCategory and getEmailsFromAllFolders functions... (No changes here)
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

const getEmailsFromAllFolders = async (gmail) => {
  const query = "-in:draft -in:sent";
  const allMessages = [];
  try {
    const listResponse = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: 30,
    });
    if (listResponse.data.messages) {
      allMessages.push(...listResponse.data.messages);
    }
  } catch (err) {
    console.error(`❌ Error fetching emails with query "${query}":`, err.message);
  }
  return allMessages;
};

// Auth endpoints... (No changes here)
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

// --- Emails endpoint ---
app.get("/emails", async (req, res) => {
  try {
    if (accounts.length === 0) return res.json([]);
    const allEmails = [];

    for (const account of accounts) {
      oAuth2Client.setCredentials(account.tokens);
      const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

      const messages = await getEmailsFromAllFolders(gmail);
      if (messages.length > 0) {
        const emailPromises = messages.map(async (msg) => {
          try {
            const details = await gmail.users.messages.get({ userId: "me", id: msg.id, format: "full" });
            const headers = details.data.payload.headers || [];
            const subject = headers.find((h) => h.name === "Subject")?.value || "No Subject";
            const from = headers.find((h) => h.name === "From")?.value || "Unknown Sender";
            const date = headers.find((h) => h.name === "Date")?.value || new Date().toISOString();
            const category = mapGmailLabelsToCategory(details.data.labelIds);
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
              isRead: !details.data.labelIds?.includes("UNREAD"),
              isSpam: details.data.labelIds?.includes("SPAM"),
            };
          } catch (emailErr) {
            console.error(`❌ Error processing email ${msg.id}:`, emailErr.message);
            return null;
          }
        });

        const emails = (await Promise.all(emailPromises)).filter(email => email !== null);
        allEmails.push(...emails);
      }

      // =================================================================
      // 🚀 IMPORTANT FIX: Save the potentially refreshed tokens
      // This single line ensures that if the library got a new access token,
      // we save it back to our accounts array for the next poll.
      account.tokens = oAuth2Client.credentials;
      // =================================================================
    }

    allEmails.sort((a, b) => new Date(b.date) - new Date(a.date));
    console.log(`📧 Fetched ${allEmails.length} latest emails across ${accounts.length} accounts`);
    res.json(allEmails);
  } catch (err) {
    console.error("❌ Failed to fetch emails:", err.message);
    res.status(500).json({ error: "Failed to fetch emails" });
  }
});

// Health and Start server... (No changes here)
app.get("/health", (req, res) => {
  res.json({ status: "ok", accounts: accounts.length, timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Backend running at https://cognitive-isabella-gmass-9839fc62.koyeb.app`);
});
