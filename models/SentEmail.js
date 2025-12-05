const mongoose = require('mongoose');

const SentEmailSchema = new mongoose.Schema({
  to: {
    type: String,
    required: true
  },
  cc: {
    type: String,
    default: ''
  },
  bcc: {
    type: String,
    default: ''
  },
  subject: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'sent', 'failed', 'bounced'],
    default: 'pending'
  },
  messageId: {
    type: String,
    default: null
  },
  errorMessage: {
    type: String,
    default: null
  },
  sentAt: {
    type: Date,
    default: null
  },
  deliveredAt: {
    type: Date,
    default: null
  },
  openedAt: {
    type: Date,
    default: null
  },
  // Track if this was a reply to a contact message
  replyToContact: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contact',
    default: null
  }
}, { 
  timestamps: true 
});

// Index for efficient queries
SentEmailSchema.index({ status: 1, createdAt: -1 });
SentEmailSchema.index({ to: 1 });

module.exports = mongoose.models.SentEmail || mongoose.model('SentEmail', SentEmailSchema, 'sent_emails');
