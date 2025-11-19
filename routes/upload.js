const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

console.log('Cloudinary configured:', {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME ? '✓' : '✗',
  api_key: process.env.CLOUDINARY_API_KEY ? '✓' : '✗',
  api_secret: process.env.CLOUDINARY_API_SECRET ? '✓' : '✗'
});

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept if MIME indicates image
    if (file.mimetype && file.mimetype.startsWith('image/')) return cb(null, true);
    // Some clients (e.g., CLI) may send application/octet-stream; allow based on extension as fallback
    const lower = (file.originalname || '').toLowerCase();
    const allowedExt = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
    const hasAllowedExt = allowedExt.some(ext => lower.endsWith(ext));
    if (file.mimetype === 'application/octet-stream' && hasAllowedExt) return cb(null, true);
    cb(new Error('Only image files are allowed!'), false);
  }
});

// Helper: normalize MIME for octet-stream based on extension
function normalizeMime(file) {
  if (file.mimetype && file.mimetype.startsWith('image/')) return file.mimetype;
  const lower = (file.originalname || '').toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/png'; // safe default
}

// Upload image route (admin only) - generic folder
router.post('/image', auth, adminOnly, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image file provided' });
    }

    console.log('File received:', req.file.originalname, 'Size:', req.file.size);

    // Upload to Cloudinary using direct upload method
    const mime = normalizeMime(req.file);
    const base64Image = `data:${mime};base64,${req.file.buffer.toString('base64')}`;

    const result = await cloudinary.uploader.upload(base64Image, {
      resource_type: 'image',
      folder: 'portfolio-images', // legacy generic folder for backward compatibility
      transformation: [
        { width: 1200, height: 1200, crop: 'limit' },
        { quality: 'auto' }
      ]
    });

    console.log('Upload successful:', result.secure_url);

    res.json({
      message: 'Image uploaded successfully',
      url: result.secure_url,
      public_id: result.public_id
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: 'Failed to upload image', error: error.message });
  }
});

// Upload image to a section-specific folder (admin only)
// Endpoint: POST /api/v1/upload/:section/image  field: image=<file>
router.post('/:section/image', auth, adminOnly, upload.single('image'), async (req, res) => {
  try {
    const { section } = req.params;
    if (!req.file) {
      return res.status(400).json({ message: 'No image file provided' });
    }

    // Whitelist sections to avoid arbitrary folder creation
    const allowedSections = [
      'hero', 'projects', 'skills', 'education', 'certifications', 'resumes', 'institutes', 'about', 'contact', 'avatars', 'misc', 'site', 'branding'
    ];
    if (!allowedSections.includes(section)) {
      return res.status(400).json({ message: `Invalid section. Allowed: ${allowedSections.join(', ')}` });
    }

    const mime = normalizeMime(req.file);
    const base64Image = `data:${mime};base64,${req.file.buffer.toString('base64')}`;

    const result = await cloudinary.uploader.upload(base64Image, {
      resource_type: 'image',
      folder: `portfolio/${section}`,
      transformation: [
        { width: 1600, height: 1600, crop: 'limit' },
        { quality: 'auto' }
      ]
    });

    res.json({
      message: 'Image uploaded successfully',
      section,
      url: result.secure_url,
      public_id: result.public_id
    });
  } catch (error) {
    console.error('Sectioned upload error:', error);
    res.status(500).json({ message: 'Failed to upload image', error: error.message });
  }
});

// Test Cloudinary connection (admin only)
router.get('/test', auth, adminOnly, async (req, res) => {
  try {
    // Test Cloudinary connection
    const result = await cloudinary.api.ping();
    res.json({
      message: 'Cloudinary connection successful',
      status: result.status
    });
  } catch (error) {
    console.error('Cloudinary test error:', error);
    res.status(500).json({
      message: 'Cloudinary connection failed',
      error: error.message
    });
  }
});

module.exports = router;