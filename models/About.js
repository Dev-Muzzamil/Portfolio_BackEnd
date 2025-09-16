const mongoose = require('mongoose');

const aboutSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  bio: {
    type: String,
    required: true
  },
  shortBio: {
    type: String,
    required: true,
    maxlength: 200
  },
  photo: {
    url: String,
    publicId: String
  },
  resumes: [{
    url: String,
    publicId: String,
    originalName: String,
    mimeType: String,
    size: Number,
    title: String,
    isActive: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
  }],
  activeResumeId: String,
  location: {
    type: String,
    trim: true
  },
  email: {
    type: String,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  socialLinks: {
    github: String,
    linkedin: String,
    twitter: String,
    instagram: String,
    website: String
  },
  experience: [{
    company: String,
    position: String,
    duration: String,
    description: String,
    current: { type: Boolean, default: false }
  }],
  education: [{
    institution: String,
    degree: String,
    field: String,
    duration: String,
    description: String
  }]
}, {
  timestamps: true
});

module.exports = mongoose.model('About', aboutSchema);


