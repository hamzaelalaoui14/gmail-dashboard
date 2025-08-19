// --- Emails endpoint with advanced date parsing ---
app.get("/emails", async (req, res) => {
  try {
    if (accounts.length === 0) return res.json([]);
    const allEmails = [];

    for (const account of accounts) {
      // --- FIX: Create a NEW and ISOLATED OAuth2 client for each user ---
      const userOAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
      userOAuth2Client.setCredentials(account.tokens);

      // Pass this new, isolated client to the Gmail service
      const gmail = google.gmail({ version: "v1", auth: userOAuth2Client });
      
      const messages = await getEmailsFromAllFolders(gmail);
      
      if (messages.length > 0) {
        const emailPromises = messages.map(async (msg) => {
          try {
            const details = await gmail.users.messages.get({ 
              userId: "me", 
              id: msg.id, 
              format: "metadata",
              metadataHeaders: ["Subject", "From", "Date", "Received"]
            });

            // ... (the rest of your email processing logic remains the same)
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
            } catch (e) {
              console.error("Could not parse Received header, falling back.", e);
              parsedDate = null;
            }
            
            const date = parsedDate || (details.data.internalDate ? new Date(parseInt(details.data.internalDate)).toISOString() : new Date().toISOString());
            
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
              date: date,
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
      
      // --- FIX: Update the account's tokens from the isolated client ---
      // This is important for saving refreshed tokens
      account.tokens = userOAuth2Client.credentials;
    }

    allEmails.sort((a, b) => new Date(b.date) - new Date(a.date));
    console.log(`📧 Fetched ${allEmails.length} latest emails across ${accounts.length} accounts`);
    res.json(allEmails);
  } catch (err) {
    console.error("❌ Failed to fetch emails:", err.message);
    res.status(500).json({ error: "Failed to fetch emails" });
  }
});
