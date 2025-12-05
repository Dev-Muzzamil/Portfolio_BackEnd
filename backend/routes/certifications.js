const express = require('express');
const { body, validationResult, param } = require('express-validator');
const Certification = require('../models/Certification');
const { auth, adminOnly } = require('../middleware/auth');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const PDFService = require('../utils/PDFService');
const skillManager = require('../utils/skillManager');
const axios = require('axios');
const sharp = require('sharp');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, images, and Word documents are allowed.'));
    }
  }
});

const router = express.Router();

// ============= PUBLIC ROUTES =============

/**
 * GET /api/v1/public/certifications
 * Get all published public certifications
 */
router.get('/', async (req, res) => {
  try {
    const certifications = await Certification.find({
      isActive: true,
      status: 'published',
      visibility: 'public'
    }).sort({ order: 1, issueDate: -1 });

    res.json({
      success: true,
      certifications,
      count: certifications.length
    });
  } catch (error) {
    console.error('Get certifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

/**
 * GET /api/v1/public/certifications/:id
 * Get single public certification
 */
router.get('/:id', [
  param('id').isMongoId().withMessage('Invalid certification ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const certification = await Certification.findById(req.params.id);
    if (!certification || certification.status !== 'published' || certification.visibility !== 'public' || !certification.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Certification not found'
      });
    }

    res.json({
      success: true,
      certification
    });
  } catch (error) {
    console.error('Get certification by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// ============= ADMIN ROUTES =============

/**
 * GET /api/v1/admin/certifications
 * Get all certifications (admin - all statuses and visibility)
 */
router.get('/admin/all', auth, adminOnly, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const query = {};

    if (req.query.status) {
      query.status = req.query.status;
    }

    if (req.query.search) {
      query.$or = [
        { title: { $regex: req.query.search, $options: 'i' } },
        { issuer: { $regex: req.query.search, $options: 'i' } },
        { credentialId: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    const total = await Certification.countDocuments(query);
    const certifications = await Certification.find(query)
      .sort({ order: 1, issueDate: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      success: true,
      certifications,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get all certifications (admin) error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

/**
 * POST /api/v1/admin/certifications
 * Create new certification
 */
router.post('/', auth, adminOnly, [
  body('title').trim().isLength({ min: 3, max: 200 }).withMessage('Title must be between 3-200 characters'),
  body('issuer').trim().isLength({ min: 2, max: 100 }).withMessage('Issuer must be between 2-100 characters'),
  body('issueDate').isISO8601().withMessage('Valid issue date required'),
  body('credentialId').optional().trim().isString(),
  body('credentialUrl').optional().isURL(),
  body('verificationUrl').optional().isURL(),
  body('description').optional().trim().isString(),
  body('skills').optional().isArray(),
  body('status').optional().isIn(['draft', 'published', 'archived']),
  body('visibility').optional().isIn(['public', 'private', 'hidden']),
  body('isActive').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    // Normalize issuer fields and convert skills
    const skillsData = Array.isArray(req.body.skills)
      ? req.body.skills.map(skill => {
        if (typeof skill === 'string') {
          return {
            name: skill.toLowerCase().trim(),
            proficiency: 'intermediate',
            verified: true
          };
        }
        return skill;
      })
      : [];

    const certData = {
      ...req.body,
      issuer: req.body.issuer || req.body.issuingAuthority,
      issuingAuthority: req.body.issuingAuthority || req.body.issuer,
      skills: skillsData,
      status: req.body.status || 'published',
      visibility: req.body.visibility || 'public',
      isActive: req.body.isActive !== false
    };

    // If an extracted preview or certificateFile was provided by the frontend
    // (e.g., after an autofill upload), persist it in the created certification
    if (req.body.certificateFile) {
      const cf = req.body.certificateFile;
      certData.certificateFile = {
        originalUrl: cf.originalUrl || cf.url || null,
        originalPublicId: cf.originalPublicId || cf.publicId || null,
        originalBytes: cf.originalBytes || cf.size || null,
        previewUrl: cf.previewUrl || cf.url || null,
        previewPublicId: cf.previewPublicId || cf.publicId || null,
        previewBytes: cf.previewBytes || null,
        fileType: cf.fileType || cf.type || 'preview'
      };
    }
    // Also add a files[] entry so routes that expect primaryFile/files can work
    if (certData.certificateFile) {
      certData.files = certData.files || [];
      // Add preview image as primary file (if present)
      if (certData.certificateFile.previewUrl) {
        const previewEntry = {
          url: certData.certificateFile.previewUrl,
          publicId: certData.certificateFile.previewPublicId || null,
          originalName: `${(certData.title || 'certificate')}_preview.png`,
          mimeType: 'image/png',
          size: certData.certificateFile.previewBytes || 0,
          isPrimary: true,
          thumbnailUrl: certData.certificateFile.previewUrl,
          thumbnailPublicId: certData.certificateFile.previewPublicId || null,
          category: 'certificate'
        };
        // Remove any existing primary flag (we're constructing fresh payload)
        certData.files.forEach(f => f.isPrimary = false);
        certData.files.unshift(previewEntry);
      }

      // Add original file (PDF) as a second file entry for references/downloads
      if (certData.certificateFile.originalUrl) {
        const originalMime = certData.certificateFile.originalUrl.startsWith('data:application/pdf') || (certData.certificateFile.originalUrl || '').toLowerCase().endsWith('.pdf')
          ? 'application/pdf' : 'application/octet-stream';
        const origEntry = {
          url: certData.certificateFile.originalUrl,
          publicId: certData.certificateFile.originalPublicId || null,
          originalName: `${(certData.title || 'certificate')}_original.pdf`,
          mimeType: originalMime,
          size: certData.certificateFile.originalBytes || 0,
          isPrimary: false,
          category: 'certificate'
        };
        certData.files.push(origEntry);
      }
    }

    const certification = new Certification(certData);
    await certification.save();

    // Sync skills if provided
    if (certData.skills && certData.skills.length > 0) {
      try {
        const skillNames = certData.skills.map(s => typeof s === 'string' ? s : s.name);
        await skillManager.syncSkills(skillNames, 'certification', certification._id);
      } catch (skillError) {
        console.warn('Failed to sync skills:', skillError.message);
      }
    }

    res.status(201).json({
      success: true,
      message: 'Certification created successfully',
      certification
    });
  } catch (error) {
    console.error('Create certification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

/**
 * GET /api/v1/admin/certifications/:id
 * Get single certification (admin)
 */
router.get('/admin/:id', [
  param('id').isMongoId().withMessage('Invalid certification ID')
], auth, adminOnly, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const certification = await Certification.findById(req.params.id);
    if (!certification) {
      return res.status(404).json({
        success: false,
        message: 'Certification not found'
      });
    }

    res.json({
      success: true,
      certification
    });
  } catch (error) {
    console.error('Get certification (admin) error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

/**
 * PUT /api/v1/admin/certifications/:id
 * Update certification
 */
router.put('/:id', [
  param('id').isMongoId().withMessage('Invalid certification ID'),
  body('title').optional().trim().isLength({ min: 3, max: 200 }),
  body('issuer').optional().trim().isLength({ min: 2, max: 100 }),
  body('issueDate').optional().isISO8601(),
  body('credentialId').optional().trim().isString(),
  body('credentialUrl').optional().isURL(),
  body('verificationUrl').optional().isURL(),
  body('description').optional().trim().isString(),
  body('skills').optional().isArray(),
  body('status').optional().isIn(['draft', 'published', 'archived']),
  body('visibility').optional().isIn(['public', 'private', 'hidden']),
  body('isActive').optional().isBoolean()
], auth, adminOnly, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const certification = await Certification.findById(req.params.id);
    if (!certification) {
      return res.status(404).json({
        success: false,
        message: 'Certification not found'
      });
    }

    const oldSkills = certification.skills || [];
    // Normalize old skill identifiers to strings (names or ids)
    const oldSkillIdsOrNames = oldSkills.map(s => {
      if (!s) return null;
      if (typeof s === 'string') return s;
      if (s._id) return String(s._id);
      if (s.name) return String(s.name).toLowerCase();
      return null;
    }).filter(Boolean);

    // Update fields, handling issuer synchronization
    const updateData = {
      ...req.body,
      issuer: req.body.issuer || req.body.issuingAuthority || certification.issuer,
      issuingAuthority: req.body.issuingAuthority || req.body.issuer || certification.issuingAuthority
    };

    Object.assign(certification, updateData);
    // If a certificateFile preview is sent during update, persist it and ensure it's in files[] as primary
    if (req.body.certificateFile) {
      const cf = req.body.certificateFile;
      certification.certificateFile = {
        originalUrl: cf.originalUrl || cf.url || null,
        originalPublicId: cf.originalPublicId || cf.publicId || null,
        originalBytes: cf.originalBytes || cf.size || null,
        previewUrl: cf.previewUrl || cf.url || null,
        previewPublicId: cf.previewPublicId || cf.publicId || null,
        previewBytes: cf.previewBytes || null,
        fileType: cf.fileType || cf.type || 'preview'
      };
      // Add/replace primary file in `files` to point to this preview
      const fileEntry = {
        url: certification.certificateFile.previewUrl,
        publicId: certification.certificateFile.previewPublicId || null,
        originalName: `${(certification.title || 'certificate')}_preview.png`,
        mimeType: 'image/png',
        size: certification.certificateFile.previewBytes || 0,
        isPrimary: true,
        thumbnailUrl: certification.certificateFile.previewUrl,
        thumbnailPublicId: certification.certificateFile.previewPublicId || null,
        category: 'certificate'
      };
      // Remove existing primary flags
      if (certification.files && certification.files.length > 0) {
        certification.files.forEach(f => f.isPrimary = false);
        certification.files.unshift(fileEntry);
      } else {
        certification.files = [fileEntry];
      }
      // Also add original file entry if present
      if (certification.certificateFile.originalUrl) {
        const originalMime = (certification.certificateFile.originalUrl || '').toLowerCase().startsWith('data:application/pdf') || (certification.certificateFile.originalUrl || '').toLowerCase().endsWith('.pdf')
          ? 'application/pdf' : 'application/octet-stream';
        const origEntry = {
          url: certification.certificateFile.originalUrl,
          publicId: certification.certificateFile.originalPublicId || null,
          originalName: `${(certification.title || 'certificate')}_original.pdf`,
          mimeType: originalMime,
          size: certification.certificateFile.originalBytes || 0,
          isPrimary: false,
          category: 'certificate'
        };
        certification.files.push(origEntry);
      }
    }
    await certification.save();

    // Sync skills if changed
    if (req.body.skills && Array.isArray(req.body.skills)) {
      try {
        // Remove old skill associations: compare by name or ID
        for (const oldIdOrName of oldSkillIdsOrNames) {
          const stillExists = req.body.skills.some(newS => {
            if (!newS) return false;
            if (typeof newS === 'string') return String(newS).toLowerCase() === String(oldIdOrName).toLowerCase();
            if (newS._id) return String(newS._id) === String(oldIdOrName);
            if (newS.name) return String(newS.name).toLowerCase() === String(oldIdOrName).toLowerCase();
            return false;
          });
          if (!stillExists) {
            await skillManager.removeSkillSource(oldIdOrName, 'certification', certification._id);
          }
        }
        // Add new skill associations: pass names or ids to syncSkills
        await skillManager.syncSkills(req.body.skills, 'certification', certification._id);
      } catch (skillError) {
        console.warn('Failed to sync skills:', skillError.message);
      }
    }

    res.json({
      success: true,
      message: 'Certification updated successfully',
      certification
    });
  } catch (error) {
    console.error('Update certification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

/**
 * PUT /api/v1/admin/certifications/:id/toggle-active
 * Toggle certification active status
 */
router.put('/:id/toggle-active', [
  param('id').isMongoId().withMessage('Invalid certification ID')
], auth, adminOnly, async (req, res) => {
  try {
    const certification = await Certification.findById(req.params.id);
    if (!certification) {
      return res.status(404).json({
        success: false,
        message: 'Certification not found'
      });
    }

    certification.isActive = !certification.isActive;
    await certification.save();

    // Cascade visibility check to associated skills
    if (certification.skills && certification.skills.length > 0) {
      // Process in parallel
      // Skills in certifications can be objects or strings, resolve to IDs if possible or names
      // skillManager.recalculateSkillVisibility handles resolution internally if we pass IDs.
      // But certification.skills might be objects with _id if they were populated or just objects.
      // The schema says skills is an array of objects.
      // We need to extract IDs if they exist, or names.
      // Actually skillManager.recalculateSkillVisibility expects a skillId.
      // We need to find the skill IDs associated with these names/objects.

      // Better approach: Get all skills that reference this certification
      // But we don't have a reverse lookup easily without querying Skills.
      // Let's iterate over certification.skills and find the corresponding Skill docs.

      const skillIdentifiers = certification.skills.map(s => s._id || s.name).filter(Boolean);

      // We need to find the actual Skill documents to get their IDs for recalculation
      // This is a bit complex because of the mixed storage.
      // However, skillManager.syncSkills handles the linking.
      // Let's rely on the fact that if they are linked, the Skill document has a source pointing to this certification.

      // Alternative: Find all skills that have this certification as a source
      const skillsToUpdate = await require('../models/Skill').find({
        'sources': { $elemMatch: { type: 'certification', referenceId: certification._id } }
      });

      await Promise.all(skillsToUpdate.map(skill =>
        skillManager.recalculateSkillVisibility(skill._id)
      ));
    }

    res.json({
      success: true,
      message: `Certification ${certification.isActive ? 'activated' : 'deactivated'} successfully`,
      certification
    });
  } catch (error) {
    console.error('Toggle certification active error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

/**
 * DELETE /api/v1/admin/certifications/:id
 * Delete certification
 */
router.delete('/:id', [
  param('id').isMongoId().withMessage('Invalid certification ID')
], auth, adminOnly, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const certification = await Certification.findById(req.params.id);
    if (!certification) {
      return res.status(404).json({
        success: false,
        message: 'Certification not found'
      });
    }

    // Clean up skill references
    if (certification.skills && certification.skills.length > 0) {
      try {
        for (const skillId of certification.skills) {
          await skillManager.removeSkillSource(skillId, 'certification', certification._id);
        }
      } catch (skillError) {
        console.warn('Failed to clean up skills:', skillError.message);
      }
    }

    // Delete associated files from Cloudinary
    if (certification.files && certification.files.length > 0) {
      try {
        for (const file of certification.files) {
          if (file.publicId) {
            await cloudinary.uploader.destroy(file.publicId);
          }
          if (file.thumbnailPublicId) {
            await cloudinary.uploader.destroy(file.thumbnailPublicId);
          }
        }
      } catch (fileError) {
        console.warn('Failed to delete files from Cloudinary:', fileError.message);
      }
    }

    await Certification.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Certification deleted successfully'
    });
  } catch (error) {
    console.error('Delete certification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// ============= FILE PROCESSING ROUTES =============

/**
 * POST /api/v1/admin/certifications/extract-details
 * Extract certificate details from uploaded document
 */
router.post('/extract-details', auth, adminOnly, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    console.log(`📋 Processing certificate file: ${req.file.originalname}`);

    // Use PDFService to extract
    const processingResult = await PDFService.processCertificateFile(req.file);

    if (!processingResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Failed to extract certificate details',
        error: processingResult.error
      });
    }

    const extractedInfo = processingResult.extractedData;
    const missingFields = [];

    // Check for missing required fields
    if (!extractedInfo.title) missingFields.push('title');
    if (!extractedInfo.issuer) missingFields.push('issuingAuthority');
    if (!extractedInfo.issueDate) missingFields.push('issueDate');

    // Extract preview image from PDF or image file
    let previewImageResult = { previewUrl: null };
    let originalFileResult = { originalUrl: null, originalPublicId: null };
    if (req.file.buffer) {
      previewImageResult = await PDFService.extractPDFPreviewImage(
        req.file.buffer,
        req.file.originalname.replace(/\.[^.]+$/, ''),
        extractedInfo,
        req.file.mimetype
      );
      // Upload the original PDF to Cloudinary (raw) if configured
      try {
        const hasCloud = process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET && process.env.CLOUDINARY_CLOUD_NAME;
        if (hasCloud) {
          const buf = req.file.buffer;
          originalFileResult = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream({
              resource_type: 'raw',
              folder: 'portfolio/certificates/originals',
              public_id: `${req.file.originalname.replace(/\.[^/.]+$/, '')}_original_${Date.now()}`,
              format: 'pdf'
            }, (error, result) => {
              if (error) reject(error);
              else resolve({ originalUrl: result.secure_url, originalPublicId: result.public_id, originalBytes: result.bytes || null });
            });
            stream.end(buf);
          });
        } else {
          // Fallback to data URL
          originalFileResult.originalUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
          originalFileResult.originalBytes = req.file.buffer ? req.file.buffer.length : null;
        }
      } catch (err) {
        console.warn('Failed to upload original file, falling back to data URL:', err?.message);
        originalFileResult.originalUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
      }
    }

    // Add preview URL to extracted data if available
    if (previewImageResult.previewUrl) {
      extractedInfo.previewImageUrl = previewImageResult.previewUrl;
      extractedInfo.certificateFile = extractedInfo.certificateFile || {};
      extractedInfo.certificateFile.previewUrl = previewImageResult.previewUrl;
      extractedInfo.certificateFile.previewPublicId = previewImageResult.previewPublicId || null;
      extractedInfo.certificateFile.previewBytes = previewImageResult.previewBytes || null;
    }
    if (originalFileResult.originalUrl) {
      extractedInfo.certificateFile = extractedInfo.certificateFile || {};
      extractedInfo.certificateFile.originalUrl = originalFileResult.originalUrl;
      extractedInfo.certificateFile.originalPublicId = originalFileResult.originalPublicId || null;
      extractedInfo.certificateFile.originalBytes = originalFileResult.originalBytes || null;
    }

    res.json({
      success: true,
      message: 'Extraction successful',
      extractedData: extractedInfo,
      missingFields
    });

  } catch (error) {
    console.error('Extract details error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during extraction',
      error: error.message
    });
  }
});

/**
 * POST /api/v1/admin/certifications/with-autofill
 * Create certification with autofill from file upload
 * Combines extraction and creation in one workflow
 */
router.post('/with-autofill', auth, adminOnly, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    console.log(`📋 Creating certification with autofill: ${req.file.originalname}`);

    // Extract details from file
    const processingResult = await PDFService.processCertificateFile(req.file);

    if (!processingResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Failed to extract certificate details',
        error: processingResult.error
      });
    }

    const extracted = processingResult.extractedData;

    // Convert extracted skills (strings) to skill objects for display
    const skillsData = Array.isArray(extracted.skills)
      ? extracted.skills.map(skill => {
        if (typeof skill === 'string') {
          return {
            name: skill.toLowerCase().trim(),
            proficiency: 'intermediate',
            verified: true
          };
        }
        return skill;
      })
      : [];

    // Prepare cleaned data for preview (before extraction for Puppeteer rendering)
    const previewData = {
      title: extracted.title || '',
      issuer: extracted.issuer || '',
      issuingAuthority: extracted.issuer || '',
      issueDate: extracted.issueDate || '',
      credentialId: extracted.credentialId || '',
      credentialUrl: extracted.credentialUrl || '',
      verificationUrl: extracted.verificationUrl || '',
      description: extracted.description || '',
      skills: skillsData,
      isActive: true,
      status: 'published',
      visibility: 'public'
    };

    // Extract preview image from PDF or image file
    let previewImageResult = { previewUrl: null };
    let originalFileResult = { originalUrl: null, originalPublicId: null };
    if (req.file.buffer) {
      previewImageResult = await PDFService.extractPDFPreviewImage(
        req.file.buffer,
        req.file.originalname.replace(/\.[^.]+$/, ''),
        previewData,
        req.file.mimetype
      );
      console.log('Preview extraction result:', previewImageResult);
      // Upload original PDF similarly to extract-details route
      try {
        const hasCloud = process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET && process.env.CLOUDINARY_CLOUD_NAME;
        if (hasCloud) {
          const buf = req.file.buffer;
          originalFileResult = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream({
              resource_type: 'raw',
              folder: 'portfolio/certificates/originals',
              public_id: `${req.file.originalname.replace(/\.[^/.]+$/, '')}_original_${Date.now()}`,
              format: 'pdf'
            }, (error, result) => {
              if (error) reject(error);
              else resolve({ originalUrl: result.secure_url, originalPublicId: result.public_id, originalBytes: result.bytes || null });
            });
            stream.end(buf);
          });
        } else {
          originalFileResult.originalUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
          originalFileResult.originalBytes = req.file.buffer ? req.file.buffer.length : null;
        }
      } catch (err) {
        console.warn('Failed to upload original file (with-autofill), falling back to data URL:', err?.message);
        originalFileResult.originalUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
      }
    }

    // Add certificate file to preview data
    previewData.certificateFile = {
      previewUrl: previewImageResult.previewUrl || null,
      previewPublicId: previewImageResult.previewPublicId || null,
      previewBytes: previewImageResult.previewBytes || null,
      originalUrl: originalFileResult.originalUrl || null,
      originalPublicId: originalFileResult.originalPublicId || null,
      originalBytes: originalFileResult.originalBytes || null,
      fileType: 'preview'
    };

    // Validate required fields
    const missingFields = [];
    if (!previewData.title) missingFields.push('title');
    if (!previewData.issuer) missingFields.push('issuer');
    if (!previewData.issueDate) missingFields.push('issueDate');

    // Return extracted data for manual review/correction
    // User can review and update before final save
    res.status(422).json({
      success: false,
      message: 'Certificate details extracted. Please review and correct any missing or inaccurate information before saving.',
      extractedData: previewData,
      missingFields: missingFields,
      hasErrors: missingFields.length > 0,
      note: 'This data was extracted from the PDF. Review carefully and update any incorrect fields, then submit to save.'
    });

  } catch (error) {
    console.error('Autofill create certification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

/**
 * POST /api/v1/admin/certifications/:id/generate-image
 * Generate 1080p image from certificate PDF
 */
router.post('/:id/generate-image', [
  param('id').isMongoId().withMessage('Invalid certification ID')
], auth, adminOnly, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const certification = await Certification.findById(req.params.id);
    if (!certification) {
      return res.status(404).json({
        success: false,
        message: 'Certification not found'
      });
    }

    // Determine the source file URL from primaryFile (images/PDFs) or fallback to certificateFile
    const primaryFile = certification.primaryFile || certification.files?.[0];
    // Prefer PDF sources (primary file if PDF, or certificateFile.originalUrl if present)
    let sourceUrl = null;
    if (primaryFile?.mimeType?.includes('pdf')) {
      sourceUrl = primaryFile.url;
    } else if (certification.certificateFile?.originalUrl) {
      sourceUrl = certification.certificateFile.originalUrl;
    } else if (primaryFile?.url) {
      sourceUrl = primaryFile.url;
    } else if (certification.certificateFile?.previewUrl) {
      sourceUrl = certification.certificateFile.previewUrl;
    } else if (certification.certificateFile?.url) {
      sourceUrl = certification.certificateFile.url;
    }
    if (!sourceUrl) {
      return res.status(400).json({
        success: false,
        message: 'No certificate file to convert'
      });
    }

    console.log(`🖼️ Generating 1080p image for certificate ${req.params.id}`);

    // Download or decode certificate file depending on URL type
    let buffer;
    if (/^data:/i.test(sourceUrl)) {
      // Data URL (probably a small PNG preview) - decode base64
      const base64 = sourceUrl.replace(/^data:[^;]+;base64,/, '');
      buffer = Buffer.from(base64, 'base64');
    } else if (/^https?:\/\//i.test(sourceUrl)) {
      const response = await axios.get(sourceUrl, { responseType: 'arraybuffer' });
      buffer = Buffer.from(response.data);
    } else {
      return res.status(400).json({ success: false, message: 'Unsupported certificate file URL format' });
    }

    // Optimize to 1080p
    let optimizedBuffer;
    try {
      optimizedBuffer = await sharp(buffer)
        .resize(1080, 1440, {
          fit: 'inside',
          withoutEnlargement: true,
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        })
        .jpeg({ quality: 90 })
        .toBuffer();
    } catch (sharpError) {
      console.warn('Sharp optimization failed, using original:', sharpError.message);
      optimizedBuffer = buffer;
    }

    // Upload optimized image to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({
        resource_type: 'image',
        folder: 'portfolio/certifications/generated',
        public_id: `${certification._id}_1080p`,
        format: 'jpg',
        width: 1080,
        height: 1440,
        quality: 90
      }, (error, result) => {
        if (error) reject(error);
        else resolve(result);
      });
      stream.end(optimizedBuffer);
    });

    // Update certification with generated image URL
    certification.certificateUrl = uploadResult.secure_url;
    await certification.save();

    res.json({
      success: true,
      message: 'Certificate image generated successfully (1080p)',
      certification,
      imageUrl: uploadResult.secure_url
    });

  } catch (error) {
    console.error('Generate certificate image error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate certificate image',
      error: error.message
    });
  }
});

module.exports = router;

// ============= REPORTS MANAGEMENT ROUTES =============

/**
 * POST /api/v1/certifications/:id/reports
 * Add a report to a certification
 */
router.post('/:id/reports', [
  param('id').isMongoId().withMessage('Invalid certification ID')
], auth, adminOnly, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const certification = await Certification.findById(req.params.id);
    if (!certification) {
      return res.status(404).json({ success: false, message: 'Certification not found' });
    }

    const { title, description, type, file, link, visible } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, message: 'Report title is required' });
    }

    if (!type || !['file', 'link'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Report type must be "file" or "link"' });
    }

    if (type === 'file' && (!file || !file.url)) {
      return res.status(400).json({ success: false, message: 'File URL is required for file type reports' });
    }

    if (type === 'link' && (!link || !link.url)) {
      return res.status(400).json({ success: false, message: 'Link URL is required for link type reports' });
    }

    const report = {
      title,
      description: description || '',
      type,
      file: type === 'file' ? file : undefined,
      link: type === 'link' ? link : undefined,
      visible: visible !== false,
      createdAt: new Date()
    };

    certification.reports.push(report);
    await certification.save();

    res.status(201).json({
      success: true,
      message: 'Report added successfully',
      report: certification.reports[certification.reports.length - 1],
      certification
    });
  } catch (error) {
    console.error('Add report error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/**
 * PUT /api/v1/certifications/:id/reports/:reportId
 * Update a report in a certification
 */
router.put('/:id/reports/:reportId', [
  param('id').isMongoId().withMessage('Invalid certification ID'),
  param('reportId').isMongoId().withMessage('Invalid report ID')
], auth, adminOnly, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const certification = await Certification.findById(req.params.id);
    if (!certification) {
      return res.status(404).json({ success: false, message: 'Certification not found' });
    }

    const report = certification.reports.id(req.params.reportId);
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    const { title, description, type, file, link, visible } = req.body;

    if (title !== undefined) report.title = title;
    if (description !== undefined) report.description = description;
    if (type !== undefined) report.type = type;
    if (file !== undefined) report.file = file;
    if (link !== undefined) report.link = link;
    if (visible !== undefined) report.visible = visible;

    await certification.save();

    res.json({ success: true, message: 'Report updated successfully', report, certification });
  } catch (error) {
    console.error('Update report error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/**
 * DELETE /api/v1/certifications/:id/reports/:reportId
 * Delete a report from a certification
 */
router.delete('/:id/reports/:reportId', [
  param('id').isMongoId().withMessage('Invalid certification ID'),
  param('reportId').isMongoId().withMessage('Invalid report ID')
], auth, adminOnly, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const certification = await Certification.findById(req.params.id);
    if (!certification) {
      return res.status(404).json({ success: false, message: 'Certification not found' });
    }

    const report = certification.reports.id(req.params.reportId);
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    // If it's a file report, we could optionally delete from Cloudinary
    if (report.type === 'file' && report.file?.publicId) {
      try {
        await cloudinary.uploader.destroy(report.file.publicId, { resource_type: 'raw' });
      } catch (cloudErr) {
        console.warn('Failed to delete file from Cloudinary:', cloudErr.message);
      }
    }

    certification.reports.pull({ _id: req.params.reportId });
    await certification.save();

    res.json({ success: true, message: 'Report deleted successfully', certification });
  } catch (error) {
    console.error('Delete report error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});
