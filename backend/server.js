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

// Label mapping function (no changes needed here)
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

// =================================================================
// 🚀 MODIFIED SECTION: This function gets the latest N emails.
// =================================================================
const getEmailsFromAllFolders = async (gmail) => {
  // This query excludes drafts and sent items to focus on what you've received.
  // The API returns the newest emails first by default.
  const query = "-in:draft -in:sent";
  
  const allMessages = [];
  
  try {
    const listResponse = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: 30, // We set a limit for the 30 most recent received emails.
    });
    
    if (listResponse.data.messages) {
      allMessages.push(...listResponse.data.messages);
    }
  } catch (err) {
    console.error(`❌ Error fetching emails with query "${query}":`, err.message);
  }
  
  return allMessages;
};
// =================================================================
// End of modified section
// =================================================================

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

// --- Emails endpoint ---
app.get("/emails", async (req, res) => {
  try {
    if (accounts.length === 0) return res.json([]);

    const allEmails = [];

    for (const account of accounts) {
      oAuth2Client.setCredentials(account.tokens);
      const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

      // This now calls the updated function to get the latest N emails
      const messages = await getEmailsFromAllFolders(gmail);
      
      if (messages.length === 0) continue;

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
          const date = headers.find((h) => h.name === "Date")?.value || details.data.internalDate || new Date().toISOString();
          
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
            labelIds: details.data.labelIds,
            threadId: details.data.threadId,
            isRead: !details.data.labelIds?.includes("UNREAD"),
            isSpam: details.data.labelIds?.includes("SPAM")
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
    
    console.log(`📧 Fetched ${allEmails.length} latest emails across ${accounts.length} accounts`);
    
    res.json(allEmails);
  } catch (err) {
    console.error("❌ Failed to fetch emails:", err.message);
    res.status(500).json({ error: "Failed to fetch emails" });
  }
});

// --- Health ---
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    accounts: accounts.length,
    timestamp: new Date().toISOString()
  });
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`🚀 Backend running at https://cognitive-isabella-gmass-9839fc62.koyeb.app`);
});
