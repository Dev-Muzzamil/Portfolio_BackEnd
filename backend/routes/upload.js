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

// Image upload configuration
const imageUpload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for images
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

// Document upload configuration (for reports, files, etc.)
const documentUpload = multer({
  storage: storage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit for documents
  },
  fileFilter: (req, file, cb) => {
    const lower = (file.originalname || '').toLowerCase();
    const allowedExt = [
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
      '.txt', '.rtf', '.csv', '.json', '.xml',
      '.zip', '.rar', '.7z',
      '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'
    ];
    const allowedMimes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain', 'text/csv', 'text/rtf',
      'application/json', 'application/xml', 'text/xml',
      'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed',
      'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'
    ];
    
    const hasAllowedExt = allowedExt.some(ext => lower.endsWith(ext));
    const hasAllowedMime = allowedMimes.includes(file.mimetype);
    
    if (hasAllowedMime || hasAllowedExt) return cb(null, true);
    cb(new Error('File type not allowed. Supported: PDF, Word, Excel, PowerPoint, images, archives, and text files.'), false);
  }
});

// Legacy alias for backward compatibility
const upload = imageUpload;

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

// Helper to wrap multer with proper error handling
const handleMulterError = (uploadMiddleware) => (req, res, next) => {
  uploadMiddleware(req, res, (err) => {
    if (err) {
      console.error('Multer error:', err);
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ message: 'File too large. Maximum size is 25MB.' });
        }
        return res.status(400).json({ message: `Upload error: ${err.message}` });
      }
      return res.status(400).json({ message: err.message || 'File upload failed' });
    }
    next();
  });
};

// Upload document/file to a section-specific folder (admin only)
// Endpoint: POST /api/v1/upload/:section/file  field: file=<file>
router.post('/:section/file', auth, adminOnly, handleMulterError(documentUpload.single('file')), async (req, res) => {
  try {
    const { section } = req.params;
    console.log('File upload request received for section:', section);
    console.log('Request file:', req.file ? { name: req.file.originalname, size: req.file.size, mime: req.file.mimetype } : 'No file');
    
    if (!req.file) {
      return res.status(400).json({ message: 'No file provided' });
    }

    // Whitelist sections for files
    const allowedSections = ['projects', 'certifications', 'reports', 'documents'];
    if (!allowedSections.includes(section)) {
      return res.status(400).json({ message: `Invalid section for files. Allowed: ${allowedSections.join(', ')}` });
    }

    const isImage = req.file.mimetype && req.file.mimetype.startsWith('image/');
    const resourceType = isImage ? 'image' : 'raw';
    
    console.log('Uploading to Cloudinary as', resourceType);
    
    // For raw files, use base64 upload
    const base64File = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

    const uploadOptions = {
      resource_type: resourceType,
      folder: `portfolio/${section}/files`,
      public_id: `${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`,
    };

    // Add transformations only for images
    if (isImage) {
      uploadOptions.transformation = [
        { width: 1600, height: 1600, crop: 'limit' },
        { quality: 'auto' }
      ];
    }

    const result = await cloudinary.uploader.upload(base64File, uploadOptions);
    console.log('Cloudinary upload successful:', result.secure_url);

    res.json({
      message: 'File uploaded successfully',
      section,
      url: result.secure_url,
      publicId: result.public_id,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size
    });
  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({ message: 'Failed to upload file', error: error.message });
  }
});

// Upload multiple files (admin only)
// Endpoint: POST /api/v1/upload/:section/files  field: files=<files>
router.post('/:section/files', auth, adminOnly, handleMulterError(documentUpload.array('files', 10)), async (req, res) => {
  try {
    const { section } = req.params;
    console.log('Multiple files upload request received for section:', section);
    console.log('Files count:', req.files?.length || 0);
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files provided' });
    }

    const allowedSections = ['projects', 'certifications', 'reports', 'documents'];
    if (!allowedSections.includes(section)) {
      return res.status(400).json({ message: `Invalid section for files. Allowed: ${allowedSections.join(', ')}` });
    }

    const uploadResults = [];

    for (const file of req.files) {
      const isImage = file.mimetype && file.mimetype.startsWith('image/');
      const resourceType = isImage ? 'image' : 'raw';
      
      const base64File = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;

      const uploadOptions = {
        resource_type: resourceType,
        folder: `portfolio/${section}/files`,
        public_id: `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`,
      };

      if (isImage) {
        uploadOptions.transformation = [
          { width: 1600, height: 1600, crop: 'limit' },
          { quality: 'auto' }
        ];
      }

      const result = await cloudinary.uploader.upload(base64File, uploadOptions);

      uploadResults.push({
        url: result.secure_url,
        publicId: result.public_id,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size
      });
    }

    res.json({
      message: `${uploadResults.length} file(s) uploaded successfully`,
      section,
      files: uploadResults
    });
  } catch (error) {
    console.error('Multiple file upload error:', error);
    res.status(500).json({ message: 'Failed to upload files', error: error.message });
  }
});

// Delete a file from Cloudinary (admin only)
router.delete('/file/:publicId(*)', auth, adminOnly, async (req, res) => {
  try {
    const { publicId } = req.params;
    if (!publicId) {
      return res.status(400).json({ message: 'Public ID is required' });
    }

    // Try deleting as raw first, then as image
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
    } catch {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    }

    res.json({ message: 'File deleted successfully', publicId });
  } catch (error) {
    console.error('File delete error:', error);
    res.status(500).json({ message: 'Failed to delete file', error: error.message });
  }
});

module.exports = router;