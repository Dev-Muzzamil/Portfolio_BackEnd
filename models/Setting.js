const mongoose = require('mongoose')

const SettingSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: 'site' },
  site: {
    title: { type: String, default: 'Portfolio' },
    description: { type: String, default: 'Personal Portfolio Website' },
    keywords: { type: String, default: 'portfolio, developer, software engineer' },
    author: { type: String, default: 'Your Name' },
    language: { type: String, default: 'en' },
    timezone: { type: String, default: 'UTC' },
    logoUrl: { type: String, default: '' },
    faviconUrl: { type: String, default: '' }
  },
  appearance: {
    theme: { type: String, default: 'auto' },
    primaryColor: { type: String, default: '#3B82F6' },
    secondaryColor: { type: String, default: '#10B981' },
    fontFamily: { type: String, default: 'Inter' },
    fontSize: { type: String, default: '16px' }
  },
  notifications: {
    emailNotifications: { type: Boolean, default: true },
    contactFormNotifications: { type: Boolean, default: true },
    projectUpdates: { type: Boolean, default: false },
    systemAlerts: { type: Boolean, default: true }
  }
}, { timestamps: true })

module.exports = mongoose.model('Setting', SettingSchema)
