import express from "express";
import { google } from "googleapis";
import cors from "cors";
import bodyParser from "body-parser";

const app = express();

// ⚡ CORS - allow your Vercel frontend
const FRONTEND_URL = "https://gmail-dashboard-ks0d3rs7t-hamzas-projects-4f002b6e.vercel.app";
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

    res.redirect(FRONTEND_URL); // back to Vercel frontend
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

      const listResponse = await gmail.users.messages.list({
        userId: "me",
        maxResults: 20,
      });

      if (!listResponse.data.messages) continue;

      const emailPromises = listResponse.data.messages.map(async (msg) => {
        const details = await gmail.users.messages.get({ userId: "me", id: msg.id, format: "full" });
        const headers = details.data.payload.headers || [];
        const subject = headers.find((h) => h.name === "Subject")?.value || "No Subject";
        const from = headers.find((h) => h.name === "From")?.value || "Unknown Sender";
        const date = headers.find((h) => h.name === "Date")?.value || details.data.internalDate || new Date().toISOString();
        const label = details.data.labelIds?.[0] || "INBOX";

        return {
          id: details.data.id,
          account: account.email,
          subject,
          from,
          date: new Date(date).toISOString(),
          snippet: details.data.snippet || "",
          label,
        };
      });

      const emails = await Promise.all(emailPromises);
      allEmails.push(...emails);
    }

    allEmails.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json(allEmails.slice(0, 100));
  } catch (err) {
    console.error("❌ Failed to fetch emails:", err.message);
    res.status(500).json({ error: "Failed to fetch emails" });
  }
});

// --- Health ---
app.get("/health", (req, res) => {
  res.json({ status: "ok", accounts: accounts.length });
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`🚀 Backend running at https://cognitive-isabella-gmass-9839fc62.koyeb.app`);
});
