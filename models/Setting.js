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
  seo: {
    ogTitle: { type: String, default: '' },
    ogDescription: { type: String, default: '' },
    ogImage: { type: String, default: '' },
    twitterCard: { type: String, default: 'summary_large_image' },
    robots: { type: String, default: 'index, follow' }
  },
  notifications: {
    emailNotifications: { type: Boolean, default: true },
    contactFormNotifications: { type: Boolean, default: true },
    projectUpdates: { type: Boolean, default: false },
    systemAlerts: { type: Boolean, default: true }
  },
  security: {
    twoFactorAuth: { type: Boolean, default: false },
    sessionTimeout: { type: Number, default: 30 },
    maxLoginAttempts: { type: Number, default: 5 },
    passwordExpiry: { type: Number, default: 90 }
  },
  backup: {
    autoBackup: { type: Boolean, default: true },
    backupFrequency: { type: String, default: 'daily' },
    backupRetention: { type: Number, default: 30 },
    cloudBackup: { type: Boolean, default: false }
  }
}, { timestamps: true })

module.exports = mongoose.model('Setting', SettingSchema)
