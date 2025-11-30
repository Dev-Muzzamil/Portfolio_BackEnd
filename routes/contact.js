const express = require('express');
const nodemailer = require('nodemailer');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { body, validationResult } = require('express-validator');
const Contact = require('../models/Contact');
const SentEmail = require('../models/SentEmail');
const { auth, adminOnly } = require('../middleware/auth');
const { 
  fetchAllDomainEmails, 
  fetchRecentEmails, 
  startEmailWatch, 
  stopEmailWatch, 
  isWatchingEmails,
  emailEvents 
} = require('../utils/emailFetcher');

const router = express.Router();

// Configure Cloudinary (if not already configured elsewhere)
if (!cloudinary.config().cloud_name) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit for attachments
  },
  fileFilter: (req, file, cb) => {
    // Allow common file types for email attachments
    const allowedMimes = [
      // Images
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
      // Documents
      'application/pdf', 'application/msword', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain', 'text/csv', 'text/html',
      // Archives
      'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed',
      // Audio
      'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/webm',
      // Video
      'video/mp4', 'video/webm', 'video/ogg',
      // Code/data
      'application/json', 'application/xml'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      // Allow octet-stream but check extension
      const ext = file.originalname.toLowerCase().split('.').pop();
      const allowedExts = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 
        'txt', 'csv', 'json', 'xml', 'zip', 'rar', '7z',
        'mp3', 'wav', 'ogg', 'm4a', 'mp4', 'webm',
        'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
      if (allowedExts.includes(ext)) {
        cb(null, true);
      } else {
        cb(new Error(`File type not allowed: ${file.mimetype}`), false);
      }
    }
  }
});

// Helper function to create email transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};

// Helper function to get the from address
const getFromAddress = () => {
  return process.env.EMAIL_FROM || process.env.EMAIL_USER;
};

// Create contact message (public)
router.post('/', [
  body('name').trim().isLength({ min: 1 }).withMessage('Name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('subject').trim().isLength({ min: 1 }).withMessage('Subject is required'),
  body('message').trim().isLength({ min: 10 }).withMessage('Message must be at least 10 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, subject, message } = req.body;

    // Create contact message
    const contact = new Contact({
      name,
      email,
      subject,
      message
    });

    await contact.save();

    // Send email notification (skip if CONTACT_DISABLE_EMAIL=true)
    if (process.env.CONTACT_DISABLE_EMAIL === 'true') {
      console.log('Contact email disabled by CONTACT_DISABLE_EMAIL=true');
    } else if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      try {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
          }
        });

        const mailOptions = {
          from: getFromAddress(),
          to: process.env.EMAIL_USER, // Send to admin
          subject: `Portfolio Contact: ${subject}`,
          html: `
            <h3>New Contact Message</h3>
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Subject:</strong> ${subject}</p>
            <p><strong>Message:</strong></p>
            <p>${message.replace(/\n/g, '<br>')}</p>
            <hr>
            <p><em>Sent from portfolio contact form</em></p>
          `
        };

        await transporter.sendMail(mailOptions);
        console.log('Contact email sent successfully');
      } catch (emailError) {
        console.error('Email sending error:', emailError);
        // Don't fail the request if email fails
      }
    } else {
      console.log('Email not configured - contact message saved without email notification');
    }

    res.status(201).json({ message: 'Message sent successfully' });
  } catch (error) {
    console.error('Create contact error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all contact messages (admin only)
router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const { page = 1, limit = 10, isRead } = req.query;
    const query = {};

    if (isRead !== undefined) {
      query.isRead = isRead === 'true';
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const contacts = await Contact.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await Contact.countDocuments(query);

    res.json({
      contacts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get contacts error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================
// IMPORTANT: Specific routes MUST come before /:id
// ============================================

// Check email configuration status (admin only)
router.get('/email-config-status', auth, adminOnly, async (req, res) => {
  try {
    console.log('Email config check:', {
      CONTACT_DISABLE_EMAIL: process.env.CONTACT_DISABLE_EMAIL,
      EMAIL_USER: process.env.EMAIL_USER ? 'set' : 'not set',
      EMAIL_PASS: process.env.EMAIL_PASS ? 'set' : 'not set'
    });
    
    const status = {
      emailDisabled: process.env.CONTACT_DISABLE_EMAIL === 'true',
      hasEmailUser: !!process.env.EMAIL_USER,
      hasEmailPass: !!process.env.EMAIL_PASS,
      emailUser: process.env.EMAIL_USER ? process.env.EMAIL_USER.substring(0, 3) + '***' : null,
      canSendEmail: process.env.CONTACT_DISABLE_EMAIL !== 'true' && !!process.env.EMAIL_USER && !!process.env.EMAIL_PASS,
      disableEmailValue: process.env.CONTACT_DISABLE_EMAIL
    };
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Full sync - Import ALL emails from Gmail (admin only)
router.post('/import-emails', auth, adminOnly, async (req, res) => {
  try {
    const { fullSync = false } = req.body;
    
    console.log(`[EMAIL] Starting ${fullSync ? 'FULL' : 'recent'} email sync...`);
    
    let results;
    if (fullSync) {
      // Full sync - get ALL emails ever sent to the domain
      results = await fetchAllDomainEmails();
    } else {
      // Quick sync - last 24 hours
      results = await fetchRecentEmails(1);
    }
    
    res.json({
      message: `Email sync complete`,
      ...results
    });
  } catch (error) {
    console.error('[EMAIL] Import error:', error);
    res.status(500).json({ 
      message: 'Failed to import emails: ' + error.message,
      error: error.message 
    });
  }
});

// Start real-time email watching (admin only)
router.post('/watch-emails/start', auth, adminOnly, async (req, res) => {
  try {
    if (isWatchingEmails()) {
      return res.json({ message: 'Already watching for emails', watching: true });
    }
    
    await startEmailWatch();
    res.json({ message: 'Started watching for new emails', watching: true });
  } catch (error) {
    console.error('[EMAIL] Watch start error:', error);
    res.status(500).json({ 
      message: 'Failed to start email watch: ' + error.message,
      watching: false 
    });
  }
});

// Stop real-time email watching (admin only)
router.post('/watch-emails/stop', auth, adminOnly, async (req, res) => {
  try {
    await stopEmailWatch();
    res.json({ message: 'Stopped watching for emails', watching: false });
  } catch (error) {
    res.status(500).json({ message: 'Failed to stop email watch: ' + error.message });
  }
});

// Get email watch status (admin only)
router.get('/watch-emails/status', auth, adminOnly, async (req, res) => {
  res.json({ watching: isWatchingEmails() });
});

// Upload attachment(s) for contact/email (admin only)
router.post('/upload-attachment', auth, adminOnly, upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files provided' });
    }

    const uploadedAttachments = [];

    for (const file of req.files) {
      try {
        // Determine resource type for Cloudinary
        let resourceType = 'auto';
        if (file.mimetype.startsWith('image/')) {
          resourceType = 'image';
        } else if (file.mimetype.startsWith('video/')) {
          resourceType = 'video';
        } else {
          resourceType = 'raw'; // For docs, audio, etc.
        }

        // Convert buffer to base64 for Cloudinary upload
        const base64Data = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;

        // Upload to Cloudinary
        const result = await cloudinary.uploader.upload(base64Data, {
          resource_type: resourceType,
          folder: 'portfolio/email-attachments',
          public_id: `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`,
        });

        uploadedAttachments.push({
          filename: result.public_id.split('/').pop(),
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          url: result.secure_url,
          publicId: result.public_id
        });

        console.log(`[UPLOAD] Attachment uploaded: ${file.originalname} -> ${result.secure_url}`);
      } catch (uploadError) {
        console.error(`[UPLOAD] Failed to upload ${file.originalname}:`, uploadError.message);
        // Continue with other files
      }
    }

    if (uploadedAttachments.length === 0) {
      return res.status(500).json({ message: 'Failed to upload any files' });
    }

    res.json({
      message: `${uploadedAttachments.length} file(s) uploaded successfully`,
      attachments: uploadedAttachments
    });
  } catch (error) {
    console.error('Upload attachment error:', error);
    res.status(500).json({ message: 'Server error during upload' });
  }
});

// Delete attachment from Cloudinary (admin only)
router.delete('/attachment/:publicId(*)', auth, adminOnly, async (req, res) => {
  try {
    const publicId = req.params.publicId;
    
    // Try to delete as different resource types
    let deleted = false;
    for (const resourceType of ['image', 'raw', 'video']) {
      try {
        const result = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
        if (result.result === 'ok') {
          deleted = true;
          break;
        }
      } catch (e) {
        // Try next resource type
      }
    }

    if (deleted) {
      res.json({ message: 'Attachment deleted successfully' });
    } else {
      res.status(404).json({ message: 'Attachment not found or already deleted' });
    }
  } catch (error) {
    console.error('Delete attachment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all sent emails (admin only)
router.get('/sent', auth, adminOnly, async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const query = {};

    if (status && status !== 'all') {
      query.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sentEmails = await SentEmail.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .populate('replyToContact', 'name email subject');

    const total = await SentEmail.countDocuments(query);

    const stats = {
      total: await SentEmail.countDocuments(),
      sent: await SentEmail.countDocuments({ status: 'sent' }),
      failed: await SentEmail.countDocuments({ status: 'failed' }),
      pending: await SentEmail.countDocuments({ status: 'pending' })
    };

    res.json({
      sentEmails,
      stats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get sent emails error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single sent email (admin only)
router.get('/sent/:id', auth, adminOnly, async (req, res) => {
  try {
    const sentEmail = await SentEmail.findById(req.params.id)
      .populate('replyToContact', 'name email subject message');
    
    if (!sentEmail) {
      return res.status(404).json({ message: 'Sent email not found' });
    }
    
    res.json({ sentEmail });
  } catch (error) {
    console.error('Get sent email error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================
// Generic /:id route - MUST come after specific routes
// ============================================

// Get single contact message with full thread (admin only)
router.get('/:id', auth, adminOnly, async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    if (!contact) {
      return res.status(404).json({ message: 'Contact message not found' });
    }
    res.json({ contact });
  } catch (error) {
    console.error('Get contact by ID error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get full conversation thread (admin only)
router.get('/:id/thread', auth, adminOnly, async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    if (!contact) {
      return res.status(404).json({ message: 'Contact message not found' });
    }
    
    // Build thread from replies array
    const thread = [
      {
        type: 'original',
        from: 'contact',
        name: contact.name,
        email: contact.email,
        message: contact.message,
        subject: contact.subject,
        attachments: contact.attachments || [],
        date: contact.createdAt,
        id: contact._id
      }
    ];
    
    // Add all replies to thread
    if (contact.replies && contact.replies.length > 0) {
      contact.replies.forEach((reply, index) => {
        thread.push({
          type: 'reply',
          from: reply.from,
          name: reply.from === 'admin' ? 'Admin' : contact.name,
          email: reply.from === 'admin' ? (process.env.EMAIL_FROM || process.env.EMAIL_USER) : contact.email,
          message: reply.message,
          attachments: reply.attachments || [],
          date: reply.sentAt || reply.createdAt,
          status: reply.status,
          id: reply._id || `reply-${index}`
        });
      });
    }
    
    res.json({ 
      contact,
      thread,
      threadCount: thread.length
    });
  } catch (error) {
    console.error('Get thread error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Mark contact as read/unread (admin only)
router.put('/:id/read', auth, adminOnly, async (req, res) => {
  try {
    const { isRead } = req.body;
    const contact = await Contact.findById(req.params.id);

    if (!contact) {
      return res.status(404).json({ message: 'Contact message not found' });
    }

    contact.isRead = isRead !== undefined ? isRead : true;
    await contact.save();

    res.json({ message: 'Contact status updated successfully', contact });
  } catch (error) {
    console.error('Update contact read status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Reply to contact message (admin only) - supports threaded replies with attachments
router.put('/:id/reply', auth, adminOnly, [
  body('replyMessage').trim().isLength({ min: 1 }).withMessage('Reply message is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { replyMessage, attachments = [] } = req.body;
    const contact = await Contact.findById(req.params.id);

    if (!contact) {
      return res.status(404).json({ message: 'Contact message not found' });
    }

    // Create reply object for thread
    const reply = {
      from: 'admin',
      message: replyMessage,
      attachments: attachments,
      sentAt: new Date(),
      status: 'pending'
    };

    // Create sent email record
    const sentEmail = new SentEmail({
      to: contact.email,
      subject: `Re: ${contact.subject}`,
      message: replyMessage,
      status: 'pending',
      replyToContact: contact._id
    });
    await sentEmail.save();

    // Send reply email (skip if CONTACT_DISABLE_EMAIL=true)
    if (process.env.CONTACT_DISABLE_EMAIL === 'true') {
      console.log('Contact reply email disabled by CONTACT_DISABLE_EMAIL=true');
      sentEmail.status = 'failed';
      sentEmail.errorMessage = 'Email disabled by config';
      await sentEmail.save();
      
      reply.status = 'failed';
      reply.emailMessageId = null;
      
      // Add reply to thread
      if (!contact.replies) contact.replies = [];
      contact.replies.push(reply);
      contact.status = 'replied';
      contact.replyMessage = replyMessage; // Legacy compatibility
      contact.repliedAt = new Date();
      await contact.save();
      
      return res.json({ message: 'Reply recorded (email disabled by config)', contact, emailId: sentEmail._id });
    } else if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      try {
        const transporter = createTransporter();

        // Build attachment HTML if any
        let attachmentHtml = '';
        if (attachments && attachments.length > 0) {
          attachmentHtml = `
            <p style="margin-top: 20px;"><strong>Attachments:</strong></p>
            <ul>
              ${attachments.map(att => `<li><a href="${att.url}" target="_blank">${att.originalName}</a> (${(att.size / 1024).toFixed(1)} KB)</li>`).join('')}
            </ul>
          `;
        }

        const mailOptions = {
          from: getFromAddress(),
          to: contact.email,
          subject: `Re: ${contact.subject}`,
          html: `
            <h3>Reply to your message</h3>
            <p><strong>Original Message:</strong></p>
            <blockquote style="border-left: 3px solid #ccc; padding-left: 10px; color: #666;">${contact.message.replace(/\n/g, '<br>')}</blockquote>
            <hr>
            <p><strong>Our Response:</strong></p>
            <p>${replyMessage.replace(/\n/g, '<br>')}</p>
            ${attachmentHtml}
            <hr>
            <p><em>Thank you for contacting us!</em></p>
          `
        };

        // Add actual file attachments if they exist
        if (attachments && attachments.length > 0) {
          mailOptions.attachments = attachments.map(att => ({
            filename: att.originalName,
            path: att.url
          }));
        }

        const info = await transporter.sendMail(mailOptions);

        // Update sent email record
        sentEmail.status = 'sent';
        sentEmail.messageId = info.messageId;
        sentEmail.sentAt = new Date();
        await sentEmail.save();

        // Update reply status
        reply.status = 'sent';
        reply.emailMessageId = info.messageId;

        // Add reply to thread
        if (!contact.replies) contact.replies = [];
        contact.replies.push(reply);
        contact.status = 'replied';
        contact.isRead = true;
        contact.replyMessage = replyMessage; // Legacy compatibility
        contact.repliedAt = new Date();
        await contact.save();

        res.json({ message: 'Reply sent successfully', contact, emailId: sentEmail._id });
      } catch (emailError) {
        console.error('Email reply error:', emailError);
        sentEmail.status = 'failed';
        sentEmail.errorMessage = emailError.message;
        await sentEmail.save();
        
        reply.status = 'failed';
        
        // Still save the reply even if email failed
        if (!contact.replies) contact.replies = [];
        contact.replies.push(reply);
        await contact.save();
        
        res.status(500).json({ message: 'Failed to send reply email', emailId: sentEmail._id });
      }
    } else {
      sentEmail.status = 'failed';
      sentEmail.errorMessage = 'Email not configured';
      await sentEmail.save();
      res.status(400).json({ message: 'Email not configured. Please set EMAIL_USER and EMAIL_PASS environment variables.', emailId: sentEmail._id });
    }
  } catch (error) {
    console.error('Reply to contact error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete contact message (admin only)
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const contact = await Contact.findByIdAndDelete(req.params.id);
    if (!contact) {
      return res.status(404).json({ message: 'Contact message not found' });
    }
    res.json({ message: 'Contact message deleted successfully' });
  } catch (error) {
    console.error('Delete contact error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get contact statistics (admin only)
router.get('/stats/overview', auth, adminOnly, async (req, res) => {
  try {
    const total = await Contact.countDocuments();
    const unread = await Contact.countDocuments({ isRead: false });
    const replied = await Contact.countDocuments({ replied: true });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMessages = await Contact.countDocuments({ createdAt: { $gte: today } });

    res.json({
      total,
      unread,
      replied,
      today: todayMessages
    });
  } catch (error) {
    console.error('Get contact stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Verify email address format and domain (admin only)
router.post('/verify-email', auth, adminOnly, [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ valid: false, errors: errors.array() });
    }

    const { email } = req.body;
    
    // Basic email format validation passed (from express-validator)
    // Additional checks
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.json({ valid: false, message: 'Invalid email format' });
    }

    // Check for common disposable email domains
    const disposableDomains = ['tempmail.com', 'throwaway.com', 'fakeinbox.com', 'guerrillamail.com', 'mailinator.com'];
    const domain = email.split('@')[1].toLowerCase();
    
    if (disposableDomains.includes(domain)) {
      return res.json({ valid: true, warning: 'This appears to be a disposable email address' });
    }

    // Try DNS lookup for MX records (optional advanced validation)
    const dns = require('dns').promises;
    try {
      const mxRecords = await dns.resolveMx(domain);
      if (mxRecords && mxRecords.length > 0) {
        return res.json({ valid: true, message: 'Email address is valid', hasMxRecords: true });
      } else {
        return res.json({ valid: true, warning: 'No mail server found for this domain', hasMxRecords: false });
      }
    } catch (dnsError) {
      // DNS lookup failed, but email format is valid
      return res.json({ valid: true, warning: 'Could not verify mail server for this domain', hasMxRecords: false });
    }
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({ valid: false, message: 'Server error during verification' });
  }
});

// Compose and send new email (admin only)
router.post('/compose', auth, adminOnly, [
  body('to').isEmail().normalizeEmail().withMessage('Valid recipient email required'),
  body('subject').trim().isLength({ min: 1 }).withMessage('Subject is required'),
  body('message').trim().isLength({ min: 1 }).withMessage('Message is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { to, subject, message, cc, bcc } = req.body;

    // Create sent email record first with pending status
    const sentEmail = new SentEmail({
      to,
      cc: cc || '',
      bcc: bcc || '',
      subject,
      message,
      status: 'pending'
    });
    await sentEmail.save();

    // Check if email is configured
    if (process.env.CONTACT_DISABLE_EMAIL === 'true') {
      sentEmail.status = 'failed';
      sentEmail.errorMessage = 'Email sending is disabled in configuration';
      await sentEmail.save();
      return res.status(400).json({ message: 'Email sending is disabled in configuration', emailId: sentEmail._id });
    }

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      sentEmail.status = 'failed';
      sentEmail.errorMessage = 'Email not configured';
      await sentEmail.save();
      return res.status(400).json({ message: 'Email not configured. Please set EMAIL_USER and EMAIL_PASS environment variables.', emailId: sentEmail._id });
    }

    try {
      const transporter = createTransporter();

      const mailOptions = {
        from: getFromAddress(),
        to: to,
        subject: subject,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            ${message.replace(/\n/g, '<br>')}
            <hr style="margin-top: 30px; border: none; border-top: 1px solid #eee;">
            <p style="color: #666; font-size: 12px; margin-top: 20px;">
              <em>Sent from my portfolio website</em>
            </p>
          </div>
        `
      };

      // Add CC if provided
      if (cc && cc.trim()) {
        mailOptions.cc = cc;
      }

      // Add BCC if provided
      if (bcc && bcc.trim()) {
        mailOptions.bcc = bcc;
      }

      const info = await transporter.sendMail(mailOptions);

      // Update sent email record with success
      sentEmail.status = 'sent';
      sentEmail.messageId = info.messageId;
      sentEmail.sentAt = new Date();
      await sentEmail.save();

      res.json({ 
        message: 'Email sent successfully',
        emailId: sentEmail._id,
        details: {
          to,
          subject,
          messageId: info.messageId,
          sentAt: sentEmail.sentAt.toISOString()
        }
      });
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      
      // Update sent email record with failure
      sentEmail.status = 'failed';
      sentEmail.errorMessage = emailError.message;
      await sentEmail.save();

      res.status(500).json({ 
        message: 'Failed to send email: ' + emailError.message,
        emailId: sentEmail._id
      });
    }
  } catch (error) {
    console.error('Compose email error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Retry failed email (admin only)
router.post('/sent/:id/retry', auth, adminOnly, async (req, res) => {
  try {
    const sentEmail = await SentEmail.findById(req.params.id);
    
    if (!sentEmail) {
      return res.status(404).json({ message: 'Sent email not found' });
    }

    if (sentEmail.status === 'sent') {
      return res.status(400).json({ message: 'Email was already sent successfully' });
    }

    // Check if email is configured
    if (process.env.CONTACT_DISABLE_EMAIL === 'true') {
      return res.status(400).json({ message: 'Email sending is disabled in configuration' });
    }

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      return res.status(400).json({ message: 'Email not configured' });
    }

    try {
      const transporter = createTransporter();

      const mailOptions = {
        from: getFromAddress(),
        to: sentEmail.to,
        subject: sentEmail.subject,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            ${sentEmail.message.replace(/\n/g, '<br>')}
            <hr style="margin-top: 30px; border: none; border-top: 1px solid #eee;">
            <p style="color: #666; font-size: 12px; margin-top: 20px;">
              <em>Sent from my portfolio website</em>
            </p>
          </div>
        `
      };

      if (sentEmail.cc) mailOptions.cc = sentEmail.cc;
      if (sentEmail.bcc) mailOptions.bcc = sentEmail.bcc;

      const info = await transporter.sendMail(mailOptions);

      sentEmail.status = 'sent';
      sentEmail.messageId = info.messageId;
      sentEmail.sentAt = new Date();
      sentEmail.errorMessage = null;
      await sentEmail.save();

      res.json({ 
        message: 'Email sent successfully on retry',
        sentEmail
      });
    } catch (emailError) {
      sentEmail.errorMessage = emailError.message;
      await sentEmail.save();
      res.status(500).json({ message: 'Retry failed: ' + emailError.message });
    }
  } catch (error) {
    console.error('Retry email error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete sent email record (admin only)
router.delete('/sent/:id', auth, adminOnly, async (req, res) => {
  try {
    const sentEmail = await SentEmail.findByIdAndDelete(req.params.id);
    if (!sentEmail) {
      return res.status(404).json({ message: 'Sent email not found' });
    }
    res.json({ message: 'Sent email record deleted successfully' });
  } catch (error) {
    console.error('Delete sent email error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Verify email delivery status (admin only) - checks if message ID exists
router.get('/sent/:id/verify', auth, adminOnly, async (req, res) => {
  try {
    const sentEmail = await SentEmail.findById(req.params.id);
    
    if (!sentEmail) {
      return res.status(404).json({ message: 'Sent email not found' });
    }

    // For Gmail, we can only verify that we have a messageId
    // True delivery verification would require SMTP DSN or a webhook from the email provider
    const verification = {
      emailId: sentEmail._id,
      to: sentEmail.to,
      subject: sentEmail.subject,
      status: sentEmail.status,
      messageId: sentEmail.messageId,
      sentAt: sentEmail.sentAt,
      verified: sentEmail.status === 'sent' && !!sentEmail.messageId,
      verificationNote: sentEmail.status === 'sent' 
        ? 'Email was accepted by the mail server. Delivery to recipient inbox depends on their mail server.'
        : sentEmail.status === 'failed'
        ? `Email failed to send: ${sentEmail.errorMessage}`
        : 'Email is still pending'
    };

    res.json({ verification });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
