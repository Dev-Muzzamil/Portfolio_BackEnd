const express = require('express')
const Setting = require('../models/Setting')
const { auth, adminOnly } = require('../middleware/auth')
const jwt = require('jsonwebtoken')
const User = require('../models/User')

const router = express.Router()

// Get settings (public read-only route)
router.get('/', async (req, res) => {
  try {
    const settings = await Setting.findOne({ key: 'site' }).lean()
    if (!settings) return res.json({ message: 'No settings found', settings: null })

    // If an admin is requesting (has a valid token and admin role), return full settings
    const authHeader = req.headers.authorization || ''
    if (authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7)
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        const user = await User.findById(decoded.userId).select('-password')
        if (user && user.role === 'admin') {
          return res.json({ settings })
        }
      } catch (e) {
        // If token invalid, just fall back to restricted public view
        console.debug('Public settings requested, admin token invalid or expired')
      }
    }

    // Public view - exclude sensitive fields
    const publicFields = {
      site: settings.site,
      appearance: settings.appearance,
      seo: settings.seo
    }
    res.json({ settings: publicFields })
  } catch (err) {
    console.error('Error fetching settings:', err && err.message)
    res.status(500).json({ message: 'Failed to fetch settings', error: err && err.message })
  }
})

// Update settings (admin-only)
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const payload = req.body || {}
    const opts = { upsert: true, new: true, setDefaultsOnInsert: true }
    const updated = await Setting.findOneAndUpdate({ key: 'site' }, payload, opts).lean()
    res.json({ message: 'Settings updated', settings: updated })
  } catch (err) {
    console.error('Error saving settings:', err && err.message)
    res.status(500).json({ message: 'Failed to save settings', error: err && err.message })
  }
})

module.exports = router
