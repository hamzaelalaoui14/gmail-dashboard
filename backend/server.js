import express from "express";
import { google } from "googleapis";
import cors from "cors";
import bodyParser from "body-parser";
import fs from "fs";

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// Load OAuth credentials - IMPROVED: Better error handling
let credentials;
try {
  credentials = JSON.parse(fs.readFileSync("credentials.json"));
} catch (err) {
  console.error("Error reading credentials.json:", err);
  console.error("Make sure credentials.json exists and contains valid OAuth2 credentials");
  process.exit(1);
}

const { client_id, client_secret, redirect_uris } = credentials.web || credentials.installed;
const oAuth2Client = new google.auth.OAuth2(
  client_id,
  client_secret,
  process.env.REDIRECT_URI || "http://localhost:3000/auth/callback"
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
    console.log(`Account ${profile.data.emailAddress} connected successfully`);
    
    res.send(`Account ${profile.data.emailAddress} connected!`);
  } catch (err) {
    console.error("Auth callback error:", err);
    res.status(500).send("Authentication failed");
  }
});

// ENHANCED: More precise label mapping based on query source
const mapGmailLabelToAppLabel = (labelIds, subject = "", queryHint = null) => {
  if (!labelIds || labelIds.length === 0) return "INBOX";
  
  // Log all labels for debugging
  console.log(`\nEMAIL: "${subject.substring(0, 40)}..."`);
  console.log(`LABELS:`, labelIds);
  
  // PRIORITY 1: Explicit spam check
  if (labelIds.includes("SPAM")) {
    console.log(`→ MAPPED TO: SPAM`);
    return "SPAM";
  }
  
  // PRIORITY 2: Gmail categories (these override INBOX)
  if (labelIds.includes("CATEGORY_PROMOTIONS")) {
    console.log(`→ MAPPED TO: PROMOTIONS`);
    return "PROMOTIONS";
  }
  if (labelIds.includes("CATEGORY_UPDATES")) {
    console.log(`→ MAPPED TO: UPDATES`);
    return "UPDATES";
  }
  if (labelIds.includes("CATEGORY_FORUMS")) {
    console.log(`→ MAPPED TO: FORUM`);
    return "FORUM";
  }
  if (labelIds.includes("CATEGORY_SOCIAL")) {
    console.log(`→ MAPPED TO: SOCIAL`);
    return "SOCIAL";
  }
  
  // PRIORITY 3: Other important labels
  if (labelIds.includes("IMPORTANT")) {
    console.log(`→ MAPPED TO: IMPORTANT`);
    return "IMPORTANT";
  }
  if (labelIds.includes("STARRED")) {
    console.log(`→ MAPPED TO: STARRED`);
    return "STARRED";
  }
  if (labelIds.includes("SENT")) {
    console.log(`→ MAPPED TO: SENT`);
    return "SENT";
  }
  if (labelIds.includes("DRAFT")) {
    console.log(`→ MAPPED TO: DRAFT`);
    return "DRAFT";
  }
  
  // PRIORITY 4: Default to INBOX
  console.log(`→ MAPPED TO: INBOX (default)`);
  return "INBOX";
};

// IMPROVED: Fetch emails from multiple locations separately
const fetchEmailsForAccount = async (account) => {
  try {
    oAuth2Client.setCredentials(account.tokens);
    const gmail = google.gmail({ version: "v1", auth: oAuth2Client });
    
    let allMessages = [];
    
    // Fetch from different locations separately for better results
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
        console.log(`Fetching from ${location} for ${account.email}...`);
        
        const listResponse = await gmail.users.messages.list({
          userId: "me",
          maxResults: 20, // Smaller batches for each category
          includeSpamTrash: true,
          q: query
        });

        if (listResponse.data.messages) {
          console.log(`Found ${listResponse.data.messages.length} messages in ${location}`);
          allMessages.push(...listResponse.data.messages);
        } else {
          console.log(`No messages found in ${location}`);
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (queryError) {
        console.error(`Failed to fetch from ${location}:`, queryError.message);
        continue; // Continue with other queries
      }
    }

    // Remove duplicates (same email can be in multiple categories)
    const uniqueMessages = allMessages.filter((msg, index, self) => 
      index === self.findIndex(m => m.id === msg.id)
    );
    
    console.log(`Total unique messages for ${account.email}: ${uniqueMessages.length}`);

    if (!uniqueMessages.length) {
      return [];
    }

    // IMPROVED: Batch process messages for better performance
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

        // Use internalDate as fallback for more accurate timestamps
        const emailDate = date 
          ? new Date(date).toISOString()
          : details.data.internalDate 
            ? new Date(parseInt(details.data.internalDate)).toISOString()
            : new Date().toISOString();

        // DEBUGGING: Enhanced logging with subject
        const emailLabels = details.data.labelIds || [];
        const mappedLabel = mapGmailLabelToAppLabel(emailLabels, subject);

        return {
          id: details.data.id,
          account: account.email,
          label: mappedLabel,
          labelIds: emailLabels, // Include raw labels for debugging
          subject,
          from,
          date: emailDate,
          snippet: details.data.snippet || "",
          isUnread: details.data.labelIds?.includes("UNREAD") || false,
        };
      } catch (msgError) {
        console.error(`Failed to fetch message ${msg.id} for ${account.email}:`, msgError.message);
        return null; // Skip failed messages
      }
    });

    // Wait for all email details to be fetched
    const emailResults = await Promise.allSettled(emailPromises);
    
    // Filter out failed requests and return successful ones
    return emailResults
      .filter(result => result.status === 'fulfilled' && result.value !== null)
      .map(result => result.value);

  } catch (err) {
    console.error(`Failed to fetch emails for ${account.email}:`, err.message);
    return []; // Return empty array for failed accounts
  }
};

// IMPROVED: Fetch emails with better error handling and performance
app.get("/emails", async (req, res) => {
  try {
    if (accounts.length === 0) {
      return res.json([]);
    }

    console.log(`Fetching emails for ${accounts.length} account(s)...`);

    // IMPROVED: Process all accounts in parallel instead of sequentially
    const accountPromises = accounts.map(account => fetchEmailsForAccount(account));
    const accountResults = await Promise.allSettled(accountPromises);

    // Combine all emails from all accounts
    let allEmails = [];
    accountResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        allEmails.push(...result.value);
      } else {
        console.error(`Failed to fetch emails for account ${accounts[index].email}:`, result.reason);
      }
    });

    // Sort by date (newest first) and limit results
    const sortedEmails = allEmails
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 100); // Increased limit but still reasonable

    console.log(`Successfully fetched ${sortedEmails.length} emails`);
    res.json(sortedEmails);

  } catch (err) {
    console.error("Error in /emails endpoint:", err);
    res.status(500).json({ 
      error: "Failed to fetch emails",
      message: err.message 
    });
  }
});

// ADDED: Health check endpoint
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    accounts: accounts.length,
    timestamp: new Date().toISOString()
  });
});

// ADDED: Get connected accounts
app.get("/accounts", (req, res) => {
  res.json(accounts.map(acc => ({ email: acc.email })));
});

// IMPROVED: Better error handling middleware
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
  console.log(`Connected accounts: ${accounts.length}`);
});