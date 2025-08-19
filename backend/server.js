import express from "express";
import { google } from "googleapis";
import cors from "cors";
import bodyParser from "body-parser";

const app = express();

const FRONTEND_URL = "https://gmail-dashboard.vercel.app";
app.use(cors({ origin: FRONTEND_URL }));
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const { CLIENT_ID, CLIENT_SECRET, REDIRECT_URI } = process.env;

if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
  console.error("❌ Missing Google OAuth environment variables (CLIENT_ID, CLIENT_SECRET, REDIRECT_URI).");
  process.exit(1);
}

// This is the main client, used ONLY for the initial authentication process.
const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
let accounts = [];

// All other functions (mapGmailLabelsToCategory, getEmailsFromAllFolders, auth endpoints) remain unchanged...
const mapGmailLabelsToCategory = (labelIds) => { /* ... no changes ... */ };
const getEmailsFromAllFolders = async (gmail) => { /* ... no changes ... */ };
app.get("/auth", (req, res) => { /* ... no changes ... */ });
app.get("/auth/callback", async (req, res) => { /* ... no changes ... */ });


// --- Emails endpoint with the CRITICAL bug fix ---
app.get("/emails", async (req, res) => {
  try {
    if (accounts.length === 0) return res.json([]);

    // We now use Promise.all to run all account fetches in parallel, which is more efficient.
    const promises = accounts.map(async (account) => {
      try {
        // =================================================================
        // 🚀 THE FIX: Create a NEW, ISOLATED auth client for EACH account.
        // This prevents the race condition.
        // =================================================================
        const accountOAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
        accountOAuth2Client.setCredentials(account.tokens);
        
        const gmail = google.gmail({ version: "v1", auth: accountOAuth2Client });
        const messages = await getEmailsFromAllFolders(gmail);
        
        if (messages.length === 0) {
          return []; // Return an empty array for this account if no emails
        }

        const emailPromises = messages.map(async (msg) => {
          try {
            const details = await gmail.users.messages.get({
              userId: "me",
              id: msg.id,
              format: "metadata",
              metadataHeaders: ["Subject", "From", "Date", "Received"]
            });
            const headers = details.data.payload.headers || [];
            const subject = headers.find((h) => h.name === "Subject")?.value || "No Subject";
            const from = headers.find((h) => h.name === "From")?.value || "Unknown Sender";

            let parsedDate;
            try {
              const receivedHeader = headers.find(h => h.name === 'Received' || h.name === 'received');
              if (receivedHeader && receivedHeader.value) {
                const parts = receivedHeader.value.split(';');
                const dateString = parts[parts.length - 1].trim();
                parsedDate = new Date(dateString).toISOString();
              }
            } catch (e) { parsedDate = null; }

            const date = parsedDate || (details.data.internalDate ? new Date(parseInt(details.data.internalDate)).toISOString() : new Date().toISOString());
            const category = mapGmailLabelsToCategory(details.data.labelIds);
            const fromMatch = from.match(/^(.+?)\s*<(.+)>$/) || from.match(/^(.+)$/);
            const senderName = fromMatch ? fromMatch[1]?.trim().replace(/^["']|["']$/g, '') : from;

            return {
              id: details.data.id,
              account: account.email, // Correctly label with the current account's email
              subject, from, senderName, date,
              snippet: details.data.snippet || "",
              label: category,
              isRead: !details.data.labelIds?.includes("UNREAD"),
              isSpam: details.data.labelIds?.includes("SPAM"),
            };
          } catch (emailErr) { return null; }
        });

        // After fetching, update the tokens in our main array
        account.tokens = accountOAuth2Client.credentials;

        return await Promise.all(emailPromises);
      } catch (accountErr) {
        console.error(`❌ Failed to process account ${account.email}:`, accountErr.message);
        return []; // Return empty array if an entire account fails
      }
    });

    const results = await Promise.all(promises);
    // Flatten the array of arrays and filter out any nulls
    const allEmails = results.flat().filter(email => email !== null);

    allEmails.sort((a, b) => new Date(b.date) - new Date(a.date));
    console.log(`📧 Fetched ${allEmails.length} latest emails across ${accounts.length} accounts`);
    res.json(allEmails);
  } catch (err) {
    console.error("❌ Failed to fetch emails:", err.message);
    res.status(500).json({ error: "Failed to fetch emails" });
  }
});


// --- Health and Server Start ---
app.get("/health", (req, res) => {
  res.json({ status: "ok", accounts: accounts.length, timestamp: new Date().toISOString() });
});
app.listen(PORT, () => {
  console.log(`🚀 Backend running at https://cognitive-isabella-gmass-9839fc62.koyeb.app`);
});
