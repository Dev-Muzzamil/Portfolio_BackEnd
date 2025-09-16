const mongoose = require('mongoose');

const certificateSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  issuer: {
    type: String,
    required: true,
    trim: true
  },
  issueDate: {
    type: Date,
    required: true
  },
  expiryDate: {
    type: Date
  },
  credentialId: {
    type: String,
    trim: true
  },
  credentialUrl: {
    type: String,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  image: {
    url: String,
    alt: String
  },
  files: [{
    url: {
      type: String,
      required: true
    },
    publicId: String,
    originalName: {
      type: String,
      required: true
    },
    mimeType: {
      type: String,
      required: true
    },
    size: Number,
    isPrimary: {
      type: Boolean,
      default: false
    }
  }],
  skills: [{
    type: String,
    trim: true
  }],
  category: {
    type: String,
    enum: ['course', 'workshop', 'certification', 'award', 'other'],
    default: 'certification'
  },
  visible: {
    type: Boolean,
    default: true
  },
  linkedProjects: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  }],
}, {
  timestamps: true
});

module.exports = mongoose.model('Certificate', certificateSchema);


