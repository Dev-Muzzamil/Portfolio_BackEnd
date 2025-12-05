const express = require('express');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const Resume = require('../models/Resume');
const { auth, adminOnly } = require('../middleware/auth');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure multer for file uploads
const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'image/jpeg',
      'image/jpg',
      'image/png'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, Word documents, text files, and images are allowed.'));
    }
  }
});

const router = express.Router();

// Get all resumes (public)
router.get('/', async (req, res) => {
  try {
    const { type, isActive, isDefault } = req.query;
    const query = {};

    if (type && type !== 'all') {
      query.type = type;
    }

    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    if (isDefault !== undefined) {
      query.isDefault = isDefault === 'true';
    }

    const resumes = await Resume.find(query)
      .sort({ isDefault: -1, createdAt: -1 })
      .populate({ path: 'uploadedBy', select: 'username email', strictPopulate: false });

    res.json({ resumes });
  } catch (error) {
    console.error('Get resumes error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single resume (public)
router.get('/:id', async (req, res) => {
  try {
    const resume = await Resume.findById(req.params.id)
      .populate({ path: 'uploadedBy', select: 'username email', strictPopulate: false });
    
    if (!resume || !resume.isActive) {
      return res.status(404).json({ message: 'Resume not found' });
    }
    res.json({ resume });
  } catch (error) {
    console.error('Get resume by ID error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Upload resume (admin only)
router.post('/upload', auth, adminOnly, upload.single('file'), [
  body('title').trim().isLength({ min: 1 }).withMessage('Title is required'),
  body('type').isIn(['resume', 'cv', 'cover-letter', 'portfolio', 'other']).withMessage('Invalid resume type'),
  body('description').optional().trim(),
  body('version').optional().trim(),
  body('tags').optional().isArray().withMessage('Tags must be an array')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Upload to Cloudinary
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { 
          resource_type: 'raw',
          folder: 'resumes',
          public_id: `resume_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      ).end(req.file.buffer);
    });

    // Get file extension
    const fileExtension = req.file.originalname.split('.').pop().toLowerCase();

    const resumeData = {
      title: req.body.title,
      type: req.body.type,
      description: req.body.description || '',
      version: req.body.version || '',
      fileName: req.file.filename || req.file.originalname,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      fileExtension: fileExtension,
      size: req.file.size,
      url: result.secure_url,
      publicId: result.public_id,
      tags: req.body.tags ? JSON.parse(req.body.tags) : [],
      isActive: req.body.isActive !== 'false',
      isDefault: req.body.isDefault === 'true',
      uploadedBy: req.user.id
    };

    const resume = new Resume(resumeData);
    await resume.save();

    res.status(201).json({ message: 'Resume uploaded successfully', resume });
  } catch (error) {
    console.error('Upload resume error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update resume (admin only)
router.put('/:id', auth, adminOnly, [
  body('title').optional().trim().isLength({ min: 1 }).withMessage('Title cannot be empty'),
  body('type').optional().isIn(['resume', 'cv', 'cover-letter', 'portfolio', 'other']).withMessage('Invalid resume type'),
  body('description').optional().trim(),
  body('version').optional().trim(),
  body('tags').optional().isArray().withMessage('Tags must be an array')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const resume = await Resume.findById(req.params.id);
    if (!resume) {
      return res.status(404).json({ message: 'Resume not found' });
    }

    const updateData = { ...req.body };
    if (updateData.tags) {
      updateData.tags = updateData.tags.filter(tag => tag.trim() !== '');
    }

    Object.assign(resume, updateData);
    await resume.save();

    res.json({ message: 'Resume updated successfully', resume });
  } catch (error) {
    console.error('Update resume error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete resume (admin only)
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const resume = await Resume.findById(req.params.id);
    if (!resume) {
      return res.status(404).json({ message: 'Resume not found' });
    }

    // Delete from Cloudinary
    try {
      await cloudinary.uploader.destroy(resume.publicId, { resource_type: 'raw' });
    } catch (cloudinaryError) {
      console.warn('Failed to delete from Cloudinary:', cloudinaryError.message);
      // Continue with database deletion even if Cloudinary deletion fails
    }

    await Resume.findByIdAndDelete(req.params.id);
    res.json({ message: 'Resume deleted successfully' });
  } catch (error) {
    console.error('Delete resume error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Set default resume (admin only)
router.put('/:id/set-default', auth, adminOnly, async (req, res) => {
  try {
    const resume = await Resume.findById(req.params.id);
    if (!resume) {
      return res.status(404).json({ message: 'Resume not found' });
    }

    // Remove default status from other resumes of the same type
    await Resume.updateMany(
      { 
        _id: { $ne: resume._id }, 
        type: resume.type, 
        isDefault: true 
      },
      { isDefault: false }
    );

    // Set this resume as default
    resume.isDefault = true;
    await resume.save();

    res.json({ message: 'Default resume updated successfully', resume });
  } catch (error) {
    console.error('Set default resume error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Download resume (public)
router.get('/:id/download', async (req, res) => {
  try {
    const resume = await Resume.findById(req.params.id);
    if (!resume || !resume.isActive) {
      return res.status(404).json({ message: 'Resume not found' });
    }

    // Increment download count
    await resume.incrementDownload();

    // Redirect to Cloudinary URL for download
    res.redirect(resume.url);
  } catch (error) {
    console.error('Download resume error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get resume statistics (admin only)
router.get('/admin/statistics', auth, adminOnly, async (req, res) => {
  try {
    const totalResumes = await Resume.countDocuments();
    const activeResumes = await Resume.countDocuments({ isActive: true });
    const defaultResumes = await Resume.countDocuments({ isDefault: true });
    
    const typeStats = await Resume.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);

    const totalDownloads = await Resume.aggregate([
      { $group: { _id: null, total: { $sum: '$downloadCount' } } }
    ]);

    const recentUploads = await Resume.find({ isActive: true })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('title type createdAt downloadCount');

    res.json({
      totalResumes,
      activeResumes,
      defaultResumes,
      typeStats,
      totalDownloads: totalDownloads[0]?.total || 0,
      recentUploads
    });
  } catch (error) {
    console.error('Get resume statistics error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Search resumes (public)
router.get('/search/:query', async (req, res) => {
  try {
    const query = req.params.query;
    const resumes = await Resume.find({
      isActive: true,
      $or: [
        { title: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } },
        { tags: { $regex: query, $options: 'i' } }
      ]
    })
    .sort({ isDefault: -1, createdAt: -1 })
    .limit(10);

    res.json({ resumes });
  } catch (error) {
    console.error('Search resumes error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
