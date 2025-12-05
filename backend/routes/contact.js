const express = require('express');
const nodemailer = require('nodemailer');
const { body, validationResult } = require('express-validator');
const Contact = require('../models/Contact');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();

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
          from: process.env.EMAIL_USER,
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

// Get single contact message (admin only)
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

// Reply to contact message (admin only)
router.put('/:id/reply', auth, adminOnly, [
  body('replyMessage').trim().isLength({ min: 1 }).withMessage('Reply message is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { replyMessage } = req.body;
    const contact = await Contact.findById(req.params.id);

    if (!contact) {
      return res.status(404).json({ message: 'Contact message not found' });
    }

    // Send reply email (skip if CONTACT_DISABLE_EMAIL=true)
    if (process.env.CONTACT_DISABLE_EMAIL === 'true') {
      console.log('Contact reply email disabled by CONTACT_DISABLE_EMAIL=true');
      // Update contact record without sending email
      contact.replied = true;
      contact.replyMessage = replyMessage;
      contact.repliedAt = new Date();
      await contact.save();
      return res.json({ message: 'Reply recorded (email disabled by config)', contact });
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
          from: process.env.EMAIL_USER,
          to: contact.email,
          subject: `Re: ${contact.subject}`,
          html: `
            <h3>Reply to your message</h3>
            <p><strong>Original Message:</strong></p>
            <blockquote>${contact.message.replace(/\n/g, '<br>')}</blockquote>
            <hr>
            <p><strong>Our Response:</strong></p>
            <p>${replyMessage.replace(/\n/g, '<br>')}</p>
            <hr>
            <p><em>Thank you for contacting us!</em></p>
          `
        };

        await transporter.sendMail(mailOptions);

        // Update contact record
        contact.replied = true;
        contact.replyMessage = replyMessage;
        contact.repliedAt = new Date();
        await contact.save();

        res.json({ message: 'Reply sent successfully', contact });
      } catch (emailError) {
        console.error('Email reply error:', emailError);
        res.status(500).json({ message: 'Failed to send reply email' });
      }
    } else {
      res.status(400).json({ message: 'Email not configured. Please set EMAIL_USER and EMAIL_PASS environment variables.' });
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

module.exports = router;