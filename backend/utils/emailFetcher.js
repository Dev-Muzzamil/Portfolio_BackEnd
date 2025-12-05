const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');
const cloudinary = require('cloudinary').v2;
const Contact = require('../models/Contact');
const EventEmitter = require('events');

// Event emitter for real-time email notifications
const emailEvents = new EventEmitter();

// Configure Cloudinary (if not already configured elsewhere)
if (!cloudinary.config().cloud_name) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

// IMAP configuration for Gmail
const getImapConfig = () => ({
  imap: {
    user: process.env.EMAIL_USER,
    password: process.env.EMAIL_PASS,
    host: 'imap.gmail.com',
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
    authTimeout: 10000,
    keepalive: {
      interval: 10000,
      idleInterval: 300000,
      forceNoop: true
    }
  }
});

// Global connection for IDLE
let idleConnection = null;
let isWatching = false;

// Extract email address from header format like "Name <email@domain.com>"
const extractEmail = (str) => {
  if (!str) return '';
  const match = str.match(/<([^>]+)>/);
  return match ? match[1] : str;
};

// Extract name from header format
const extractName = (str) => {
  if (!str) return '';
  const match = str.match(/^([^<]+)</);
  return match ? match[1].trim().replace(/"/g, '') : str.split('@')[0];
};

// Check if email was sent to syedmuzzamilali.me domain
const isSentToCustomDomain = (email) => {
  const toAddresses = email.to?.value || [];
  const ccAddresses = email.cc?.value || [];
  const allRecipients = [...toAddresses, ...ccAddresses];
  
  return allRecipients.some(addr => 
    addr.address && addr.address.toLowerCase().includes('@syedmuzzamilali.me')
  );
};

// Get the syedmuzzamilali.me address that was used
const getCustomDomainAddress = (email) => {
  const toAddresses = email.to?.value || [];
  const ccAddresses = email.cc?.value || [];
  const allRecipients = [...toAddresses, ...ccAddresses];
  
  const customAddr = allRecipients.find(addr => 
    addr.address && addr.address.toLowerCase().includes('@syedmuzzamilali.me')
  );
  
  return customAddr ? customAddr.address : null;
};

// Upload attachment to Cloudinary
const uploadAttachmentToCloudinary = async (attachment) => {
  try {
    if (!attachment.content) {
      console.log(`[EMAIL] Skipping attachment ${attachment.filename} - no content`);
      return null;
    }

    // Determine resource type based on mime type
    let resourceType = 'raw';
    if (attachment.contentType?.startsWith('image/')) {
      resourceType = 'image';
    } else if (attachment.contentType?.startsWith('video/')) {
      resourceType = 'video';
    }

    // Convert buffer to base64
    const base64Data = `data:${attachment.contentType || 'application/octet-stream'};base64,${attachment.content.toString('base64')}`;

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(base64Data, {
      resource_type: resourceType,
      folder: 'portfolio/email-attachments',
      public_id: `${Date.now()}-${(attachment.filename || 'attachment').replace(/[^a-zA-Z0-9.-]/g, '_')}`,
    });

    console.log(`[EMAIL] Uploaded attachment: ${attachment.filename} -> ${result.secure_url}`);

    return {
      filename: result.public_id.split('/').pop(),
      originalName: attachment.filename || 'attachment',
      mimeType: attachment.contentType || 'application/octet-stream',
      size: attachment.size || attachment.content.length,
      url: result.secure_url,
      publicId: result.public_id
    };
  } catch (error) {
    console.error(`[EMAIL] Failed to upload attachment ${attachment.filename}:`, error.message);
    return null;
  }
};

// Parse and save a single email with attachments
const parseAndSaveEmail = async (message, connection) => {
  try {
    const all = message.parts.find(part => part.which === '');
    if (!all || !all.body) return null;
    
    const parsed = await simpleParser(all.body);
    
    // Check if it's addressed to our domain
    if (!isSentToCustomDomain(parsed)) {
      return null;
    }

    const fromAddress = extractEmail(parsed.from?.text || '');
    const fromName = extractName(parsed.from?.text || '') || fromAddress.split('@')[0];
    const subject = parsed.subject || '(No Subject)';
    const messageText = parsed.text || parsed.html?.replace(/<[^>]*>/g, '') || '';
    const messageId = parsed.messageId;
    const receivedTo = getCustomDomainAddress(parsed);
    const threadId = parsed.headers?.get('x-gm-thrid') || parsed.headers?.get('references')?.split(' ')[0] || null;

    // Check if this email already exists
    const existingContact = await Contact.findOne({ emailMessageId: messageId });
    if (existingContact) {
      return null;
    }

    // Process attachments
    const attachments = [];
    if (parsed.attachments && parsed.attachments.length > 0) {
      console.log(`[EMAIL] Processing ${parsed.attachments.length} attachment(s)...`);
      
      for (const attachment of parsed.attachments) {
        // Skip inline images (CID) unless they're significant
        if (attachment.contentDisposition === 'inline' && attachment.contentType?.startsWith('image/') && attachment.size < 10000) {
          continue;
        }
        
        const uploadedAttachment = await uploadAttachmentToCloudinary(attachment);
        if (uploadedAttachment) {
          attachments.push(uploadedAttachment);
        }
      }
    }

    // Check if this is a reply to an existing thread
    let parentContact = null;
    if (threadId) {
      parentContact = await Contact.findOne({ threadId: threadId }).sort({ createdAt: 1 });
    }

    // If this is a reply to an existing conversation, add it as a reply
    if (parentContact && parentContact.email.toLowerCase() === fromAddress.toLowerCase()) {
      // This is a follow-up from the same person - add as a reply
      const reply = {
        from: 'contact',
        message: messageText.substring(0, 10000),
        attachments: attachments,
        sentAt: parsed.date || new Date(),
        emailMessageId: messageId,
        status: 'received'
      };
      
      parentContact.replies.push(reply);
      parentContact.status = 'new'; // Reset to new since they replied
      parentContact.isRead = false;
      await parentContact.save();
      
      console.log(`[EMAIL] Added reply to existing thread: ${fromAddress} - ${subject}`);
      emailEvents.emit('newReply', { contact: parentContact, reply });
      
      return parentContact;
    }

    // Create new contact entry
    const contact = new Contact({
      name: fromName,
      email: fromAddress.toLowerCase(),
      subject: subject,
      message: messageText.substring(0, 10000),
      attachments: attachments,
      isRead: false,
      status: 'new',
      source: 'email_import',
      emailMessageId: messageId,
      receivedTo: receivedTo,
      threadId: threadId,
      createdAt: parsed.date || new Date()
    });

    await contact.save();
    console.log(`[EMAIL] Imported: ${fromAddress} - ${subject} (${attachments.length} attachments)`);
    
    // Emit event for real-time updates
    emailEvents.emit('newEmail', contact);
    
    return contact;
  } catch (error) {
    console.error('[EMAIL] Error parsing email:', error.message);
    return null;
  }
};

// Fetch ALL emails from Gmail to @syedmuzzamilali.me (full sync)
const fetchAllDomainEmails = async (options = {}) => {
  const { onProgress } = options;
  
  let connection;
  const results = {
    fetched: 0,
    imported: 0,
    skipped: 0,
    errors: []
  };

  try {
    console.log('[EMAIL] Starting full email sync...');
    connection = await imaps.connect(getImapConfig());
    
    await connection.openBox('INBOX');
    
    // Search for ALL emails to our domain (no date limit)
    const searchCriteria = [
      ['TO', '@syedmuzzamilali.me']
    ];
    
    const fetchOptions = {
      bodies: ['HEADER', 'TEXT', ''],
      markSeen: false,
      struct: true
    };

    console.log('[EMAIL] Searching for all emails to @syedmuzzamilali.me...');
    const messages = await connection.search(searchCriteria, fetchOptions);
    
    console.log(`[EMAIL] Found ${messages.length} emails`);
    results.fetched = messages.length;

    // Process each message
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      
      try {
        const contact = await parseAndSaveEmail(message, connection);
        if (contact) {
          results.imported++;
        } else {
          results.skipped++;
        }
        
        // Progress callback
        if (onProgress) {
          onProgress({
            current: i + 1,
            total: messages.length,
            imported: results.imported,
            skipped: results.skipped
          });
        }
      } catch (emailError) {
        console.error('[EMAIL] Error processing email:', emailError.message);
        results.errors.push(emailError.message);
        results.skipped++;
      }
    }

    await connection.end();
    console.log(`[EMAIL] Sync complete: ${results.imported} imported, ${results.skipped} skipped`);
    
    return results;

  } catch (error) {
    console.error('[EMAIL] IMAP connection error:', error);
    if (connection) {
      try { await connection.end(); } catch (e) {}
    }
    throw error;
  }
};

// Start watching for new emails using IMAP IDLE
const startEmailWatch = async () => {
  if (isWatching) {
    console.log('[EMAIL] Already watching for new emails');
    return;
  }

  try {
    console.log('[EMAIL] Starting real-time email watch...');
    idleConnection = await imaps.connect(getImapConfig());
    
    await idleConnection.openBox('INBOX');
    isWatching = true;
    
    // Get the highest UID to track new emails
    let lastUid = 0;
    const initialSearch = await idleConnection.search([['TO', '@syedmuzzamilali.me']], {
      bodies: [],
      struct: false
    });
    if (initialSearch.length > 0) {
      lastUid = Math.max(...initialSearch.map(m => m.attributes.uid));
    }
    
    console.log(`[EMAIL] Watching for new emails (last UID: ${lastUid})`);
    
    // Set up mail listener
    idleConnection.on('mail', async (numNewMsgs) => {
      console.log(`[EMAIL] ${numNewMsgs} new email(s) detected!`);
      
      try {
        // Fetch new emails (UID greater than last known)
        const searchCriteria = [
          ['TO', '@syedmuzzamilali.me'],
          ['UID', `${lastUid + 1}:*`]
        ];
        
        const fetchOptions = {
          bodies: ['HEADER', 'TEXT', ''],
          markSeen: false,
          struct: true
        };
        
        const newMessages = await idleConnection.search(searchCriteria, fetchOptions);
        
        for (const message of newMessages) {
          const uid = message.attributes.uid;
          if (uid > lastUid) {
            lastUid = uid;
            await parseAndSaveEmail(message, idleConnection);
          }
        }
      } catch (error) {
        console.error('[EMAIL] Error fetching new emails:', error.message);
      }
    });
    
    // Handle connection errors
    idleConnection.on('error', (error) => {
      console.error('[EMAIL] IMAP error:', error.message);
      isWatching = false;
      // Attempt to reconnect after 30 seconds
      setTimeout(() => {
        if (!isWatching) {
          startEmailWatch();
        }
      }, 30000);
    });
    
    idleConnection.on('close', () => {
      console.log('[EMAIL] IMAP connection closed');
      isWatching = false;
    });
    
    return true;
  } catch (error) {
    console.error('[EMAIL] Failed to start email watch:', error);
    isWatching = false;
    throw error;
  }
};

// Stop watching for emails
const stopEmailWatch = async () => {
  if (idleConnection) {
    try {
      await idleConnection.end();
    } catch (e) {}
    idleConnection = null;
  }
  isWatching = false;
  console.log('[EMAIL] Stopped watching for emails');
};

// Check if watching
const isWatchingEmails = () => isWatching;

// Fetch recent emails (quick sync)
const fetchRecentEmails = async (days = 1) => {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  let connection;
  const results = {
    fetched: 0,
    imported: 0,
    skipped: 0
  };

  try {
    connection = await imaps.connect(getImapConfig());
    await connection.openBox('INBOX');
    
    const searchCriteria = [
      ['SINCE', since.toISOString().split('T')[0]],
      ['TO', '@syedmuzzamilali.me']
    ];
    
    const fetchOptions = {
      bodies: ['HEADER', 'TEXT', ''],
      markSeen: false,
      struct: true
    };

    const messages = await connection.search(searchCriteria, fetchOptions);
    results.fetched = messages.length;

    for (const message of messages) {
      const contact = await parseAndSaveEmail(message, connection);
      if (contact) {
        results.imported++;
      } else {
        results.skipped++;
      }
    }

    await connection.end();
    return results;
  } catch (error) {
    if (connection) {
      try { await connection.end(); } catch (e) {}
    }
    throw error;
  }
};

module.exports = {
  fetchAllDomainEmails,
  fetchRecentEmails,
  startEmailWatch,
  stopEmailWatch,
  isWatchingEmails,
  emailEvents,
  isSentToCustomDomain,
  getCustomDomainAddress
};
