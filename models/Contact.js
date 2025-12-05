const mongoose = require('mongoose');

// Attachment schema for files
const AttachmentSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  originalName: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  url: { type: String, required: true }, // Cloudinary or local URL
  publicId: { type: String }, // Cloudinary public ID for deletion
}, { _id: true });

// Reply schema for nested conversations
const ReplySchema = new mongoose.Schema({
  from: { type: String, enum: ['admin', 'contact'], required: true },
  message: { type: String, required: true },
  attachments: [AttachmentSchema],
  sentAt: { type: Date, default: Date.now },
  emailMessageId: { type: String }, // For tracking email delivery
  status: { type: String, enum: ['pending', 'sent', 'failed'], default: 'sent' }
}, { timestamps: true });

const ContactSchema = new mongoose.Schema({
  // Sender info
  name: { type: String, required: true },
  email: { type: String, required: true, lowercase: true },
  
  // Original message
  subject: { type: String, required: true },
  message: { type: String, required: true },
  
  // Attachments on original message
  attachments: [AttachmentSchema],
  
  // Conversation thread
  replies: [ReplySchema],
  
  // Status tracking
  isRead: { type: Boolean, default: false },
  status: { 
    type: String, 
    enum: ['new', 'replied', 'closed', 'spam'], 
    default: 'new' 
  },
  
  // Email import metadata
  source: { type: String, enum: ['contact_form', 'email_import'], default: 'contact_form' },
  emailMessageId: { type: String, index: true }, // Gmail message ID
  receivedTo: { type: String }, // Which @syedmuzzamilali.me address received it
  threadId: { type: String, index: true }, // Gmail thread ID for grouping
  
  // Threading - reference to parent conversation
  parentContact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
  
  // For legacy compatibility
  replyMessage: { type: String }, // Old single reply field
  repliedAt: { type: Date }
}, { 
  timestamps: true,
  strict: false // Allow additional fields for backward compatibility
});

// Indexes for efficient queries
ContactSchema.index({ email: 1, createdAt: -1 });
ContactSchema.index({ status: 1, isRead: 1 });
ContactSchema.index({ threadId: 1 });
ContactSchema.index({ 'replies.sentAt': -1 });

// Virtual for total reply count
ContactSchema.virtual('replyCount').get(function() {
  return this.replies ? this.replies.length : 0;
});

// Virtual for last activity
ContactSchema.virtual('lastActivity').get(function() {
  if (this.replies && this.replies.length > 0) {
    return this.replies[this.replies.length - 1].sentAt;
  }
  return this.createdAt;
});

// Ensure virtuals are included in JSON
ContactSchema.set('toJSON', { virtuals: true });
ContactSchema.set('toObject', { virtuals: true });

module.exports = mongoose.models.Contact || mongoose.model('Contact', ContactSchema, 'contacts');
