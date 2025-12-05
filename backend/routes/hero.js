const express = require('express');
const { body, validationResult } = require('express-validator');
const Hero = require('../models/Hero');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();

// Ensure Cloudinary is configured (using existing env)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Multer memory storage for optional image endpoints
const memStorage = multer.memoryStorage();
const upload = multer({
  storage: memStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) return cb(null, true);
    const lower = (file.originalname || '').toLowerCase();
    const allowedExt = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
    const hasAllowedExt = allowedExt.some(ext => lower.endsWith(ext));
    if (file.mimetype === 'application/octet-stream' && hasAllowedExt) return cb(null, true);
    cb(new Error('Only image files are allowed'));
  }
});

// Helper to normalize MIME when clients send octet-stream
function normalizeMime(file) {
  if (file.mimetype && file.mimetype.startsWith('image/')) return file.mimetype;
  const lower = (file.originalname || '').toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/png';
}

// Get hero section data (public)
router.get('/', async (req, res) => {
  try {
    const hero = await Hero.findOne({ isActive: true });
    if (!hero) {
      return res.status(404).json({ message: 'Hero section not found' });
    }
    res.json({ hero });
  } catch (error) {
    console.error('Get hero error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create or update hero section (admin only)
router.post('/', auth, adminOnly, [
  body('name').trim().isLength({ min: 1 }).withMessage('Name is required'),
  body('tagline').trim().isLength({ min: 1 }).withMessage('Tagline is required'),
  body('role').trim().isLength({ min: 1 }).withMessage('Role is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    let { name, tagline, role, backgroundImage, resumeUrl, ctaButtons } = req.body;

    // If backgroundImage is a Data URL, upload it to Cloudinary and replace with secure URL
    if (backgroundImage && typeof backgroundImage === 'string' && backgroundImage.startsWith('data:')) {
      try {
        const uploadRes = await cloudinary.uploader.upload(backgroundImage, {
          resource_type: 'image',
          folder: 'portfolio/hero',
          transformation: [
            { width: 1600, height: 900, crop: 'limit' },
            { quality: 'auto' }
          ]
        });
        backgroundImage = uploadRes.secure_url;
      } catch (e) {
        console.warn('Hero background dataURL upload failed:', e.message);
      }
    }

    // Sanitize CTA buttons: allow empty/undefined; remove entries missing url or text
    const sanitizedCtas = Array.isArray(ctaButtons)
      ? ctaButtons
          .filter(btn => btn && (btn.text?.trim() || btn.url?.trim()))
          .map(btn => ({
            text: (btn.text || '').trim(),
            url: (btn.url || '').trim(),
            type: ['primary', 'secondary'].includes(btn.type) ? btn.type : 'primary'
          }))
      : undefined;

    // Find existing hero or create new one
    let hero = await Hero.findOne();
    if (hero) {
      // Update existing
      hero.name = name;
      hero.tagline = tagline;
      hero.role = role;
      if (backgroundImage !== undefined) hero.backgroundImage = backgroundImage;
      if (resumeUrl !== undefined) hero.resumeUrl = resumeUrl;
      if (sanitizedCtas !== undefined) hero.ctaButtons = sanitizedCtas;
    } else {
      // Create new
      hero = new Hero({
        name,
        tagline,
        role,
        backgroundImage: backgroundImage || '',
        resumeUrl: resumeUrl || '',
        ctaButtons: sanitizedCtas || []
      });
    }

    await hero.save();
    res.json({ message: 'Hero section updated successfully', hero });
  } catch (error) {
    console.error('Update hero error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update hero section (admin only)
router.put('/', auth, adminOnly, [
  body('name').optional().trim().isLength({ min: 1 }).withMessage('Name cannot be empty'),
  body('tagline').optional().trim().isLength({ min: 1 }).withMessage('Tagline cannot be empty'),
  body('role').optional().trim().isLength({ min: 1 }).withMessage('Role cannot be empty')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    let { name, tagline, role, backgroundImage, resumeUrl, ctaButtons, isActive } = req.body;

    // Handle Data URL upload on update as well
    if (backgroundImage && typeof backgroundImage === 'string' && backgroundImage.startsWith('data:')) {
      try {
        const uploadRes = await cloudinary.uploader.upload(backgroundImage, {
          resource_type: 'image',
          folder: 'portfolio/hero',
          transformation: [
            { width: 1600, height: 900, crop: 'limit' },
            { quality: 'auto' }
          ]
        });
        backgroundImage = uploadRes.secure_url;
      } catch (e) {
        console.warn('Hero background dataURL upload failed:', e.message);
      }
    }

    // Sanitize CTA buttons on update as well
    const sanitizedCtas = Array.isArray(ctaButtons)
      ? ctaButtons
          .filter(btn => btn && (btn.text?.trim() || btn.url?.trim()))
          .map(btn => ({
            text: (btn.text || '').trim(),
            url: (btn.url || '').trim(),
            type: ['primary', 'secondary'].includes(btn.type) ? btn.type : 'primary'
          }))
      : undefined;

    // Build update document with only provided fields
    const update = {};
    if (name !== undefined) update.name = name;
    if (tagline !== undefined) update.tagline = tagline;
    if (role !== undefined) update.role = role;
    if (backgroundImage !== undefined) update.backgroundImage = backgroundImage;
    if (resumeUrl !== undefined) update.resumeUrl = resumeUrl;
    if (sanitizedCtas !== undefined) update.ctaButtons = sanitizedCtas;
    if (isActive !== undefined) update.isActive = isActive;

    // Upsert atomically to avoid inconsistencies
    const insertDefaults = {
      name: name || 'Your Name',
      tagline: tagline || 'Your tagline goes here',
      role: role || 'Your Role',
      backgroundImage: backgroundImage || '',
      resumeUrl: resumeUrl || '',
      ctaButtons: sanitizedCtas || [],
      isActive: typeof isActive === 'boolean' ? isActive : true
    };
    // Avoid conflicting updates if the same field exists in both $set and $setOnInsert
    for (const k of Object.keys(update)) delete insertDefaults[k];

    const hero = await Hero.findOneAndUpdate(
      {},
      { $set: update, $setOnInsert: insertDefaults },
      { new: true, upsert: true }
    );

    res.json({ message: 'Hero section updated successfully', hero });
  } catch (error) {
    console.error('Update hero error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

// Optional direct image upload that also saves to DB (admin only)
// Usage: POST /api/v1/hero/image  (form-data: image=<file>)
router.post('/image', auth, adminOnly, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No image provided' });

    const mime = normalizeMime(req.file);
    const base64 = `data:${mime};base64,${req.file.buffer.toString('base64')}`;
    const result = await cloudinary.uploader.upload(base64, {
      resource_type: 'image',
      folder: 'portfolio/hero',
      transformation: [ { width: 1600, height: 900, crop: 'limit' }, { quality: 'auto' } ]
    });

    // Prefer updating the active hero; fallback to any or create
    let hero = await Hero.findOneAndUpdate(
      { isActive: true },
      { $set: { backgroundImage: result.secure_url } },
      { new: true }
    );
    if (!hero) {
      hero = await Hero.findOneAndUpdate(
        {},
        { $set: { backgroundImage: result.secure_url, isActive: true } },
        { new: true, upsert: true }
      );
    }

    res.json({ message: 'Hero image updated successfully', url: result.secure_url, hero });
  } catch (err) {
    console.error('Hero image upload error:', err);
    res.status(500).json({ message: 'Failed to update hero image', error: err.message });
  }
});

// Alias: POST /api/v1/hero/img  (same behavior as /image)
router.post('/img', auth, adminOnly, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No image provided' });

    const mime = normalizeMime(req.file);
    const base64 = `data:${mime};base64,${req.file.buffer.toString('base64')}`;
    const result = await cloudinary.uploader.upload(base64, {
      resource_type: 'image',
      folder: 'portfolio/hero',
      transformation: [ { width: 1600, height: 900, crop: 'limit' }, { quality: 'auto' } ]
    });

    let hero = await Hero.findOneAndUpdate(
      { isActive: true },
      { $set: { backgroundImage: result.secure_url } },
      { new: true }
    );
    if (!hero) {
      hero = await Hero.findOneAndUpdate(
        {},
        { $set: { backgroundImage: result.secure_url, isActive: true } },
        { new: true, upsert: true }
      );
    }

    res.json({ message: 'Hero image updated successfully', url: result.secure_url, hero });
  } catch (err) {
    console.error('Hero image upload error (alias):', err);
    res.status(500).json({ message: 'Failed to update hero image', error: err.message });
  }
});