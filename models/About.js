const mongoose = require('mongoose');

const aboutSchema = new mongoose.Schema({
  summary: { type: String, required: true },
  professionalBackground: { type: String, required: true },
  photo: String,
  keyAchievements: [String],
  email: String,
  phone: String,
  address: String,
  social: {
    linkedin: String,
    github: String,
    twitter: String,
    instagram: String,
    youtube: String,
    facebook: String,
    tiktok: String,
    snapchat: String,
    pinterest: String,
    reddit: String,
    discord: String,
    twitch: String,
    medium: String,
    stackoverflow: String,
    dribbble: String,
    behance: String,
    whatsapp: String,
    telegram: String,
    website: String,
    customLinks: [{
      label: String,
      url: String
    }]
  },
  // New socialLinks array for better management with visibility control
  socialLinks: [{
    platform: { type: String, required: true },
    url: { type: String, required: true },
    isActive: { type: Boolean, default: true }
  }],
  yearsExperience: { type: Number, default: 0 },
  projectsCount: { type: Number, default: 0 },
  technologiesCount: { type: Number, default: 0 },
  certificatesCount: { type: Number, default: 0 },
  showStatistics: { type: Boolean, default: true },
  statistics: [{
    label: String,
    value: Number,
    isActive: { type: Boolean, default: true }
  }],
  bio: [String],
  experience: [mongoose.Schema.Types.Mixed],
  education: [mongoose.Schema.Types.Mixed],
  resumes: [mongoose.Schema.Types.Mixed],
  isActive: { type: Boolean, default: true }
}, {
  timestamps: true,
  strict: false // Allow additional fields for flexibility
});

module.exports = mongoose.models.About || mongoose.model('About', aboutSchema, 'abouts');
