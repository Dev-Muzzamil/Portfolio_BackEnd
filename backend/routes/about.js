const express = require('express');
const { body, validationResult } = require('express-validator');
const About = require('../models/About');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();

// Get about section data (public)
router.get('/', async (req, res) => {
  try {
    // Serve active-only for public endpoints; return first doc for admin/internal mounts
    const base = req.baseUrl || '';
    const isPublic = base.includes('/public');
    const filter = isPublic ? { isActive: true } : {};
    const about = await About.findOne(filter);
    if (!about) {
      return res.status(404).json({ message: 'About section not found' });
    }
    res.json({ about });
  } catch (error) {
    console.error('Get about error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create or update about section (admin only)
router.post('/', auth, adminOnly, [
  body('summary').trim().isLength({ min: 1 }).withMessage('Summary is required'),
  body('professionalBackground').trim().isLength({ min: 1 }).withMessage('Professional background is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      summary,
      professionalBackground,
      photo,
      keyAchievements,
      email,
      phone,
      address,
      social,
      yearsExperience,
      projectsCount,
      technologiesCount,
      certificatesCount,
      showStatistics,
      statistics,
      bio,
      experience,
      education,
      resumes
    } = req.body;

    // Build atomic update document to avoid Mixed-type change tracking issues
    const update = {};
    if (summary !== undefined) update.summary = summary;
    if (professionalBackground !== undefined) update.professionalBackground = professionalBackground;
    if (photo !== undefined) update.photo = photo || '';
    if (keyAchievements !== undefined) update.keyAchievements = Array.isArray(keyAchievements) ? keyAchievements : [];
    if (email !== undefined) update.email = email;
    if (phone !== undefined) update.phone = phone;
    if (address !== undefined) update.address = address;
    if (social !== undefined) update.social = social;
    if (yearsExperience !== undefined) update.yearsExperience = Number(yearsExperience) || 0;
    if (projectsCount !== undefined) update.projectsCount = Number(projectsCount) || 0;
    if (technologiesCount !== undefined) update.technologiesCount = Number(technologiesCount) || 0;
    if (certificatesCount !== undefined) update.certificatesCount = Number(certificatesCount) || 0;
    if (showStatistics !== undefined) update.showStatistics = !!showStatistics;
    if (statistics !== undefined) {
      const arr = Array.isArray(statistics) ? statistics : [];
      update.statistics = arr.map(s => ({
        label: s && s.label ? String(s.label) : '',
        value: Number(s && s.value) || 0,
        isActive: s && s.isActive === false ? false : true
      }));
    }
    if (bio !== undefined) update.bio = Array.isArray(bio) ? bio : (typeof bio === 'string' && bio ? [bio] : []);
    if (experience !== undefined) update.experience = Array.isArray(experience) ? experience : [];
    if (education !== undefined) update.education = Array.isArray(education) ? education : [];
    if (resumes !== undefined) update.resumes = Array.isArray(resumes) ? resumes : [];

    await About.updateOne({}, { $set: update }, { upsert: true });
    const about = await About.findOne({});
    res.json({ message: 'About section updated successfully', about });
  } catch (error) {
    console.error('Update about error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update about section (admin only)
router.put('/', auth, adminOnly, [
  body('summary').optional().trim().isLength({ min: 1 }).withMessage('Summary cannot be empty'),
  body('professionalBackground').optional().trim().isLength({ min: 1 }).withMessage('Professional background cannot be empty')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      summary,
      professionalBackground,
      photo,
      keyAchievements,
      email,
      phone,
      address,
      social,
      yearsExperience,
      projectsCount,
      technologiesCount,
      certificatesCount,
      showStatistics,
      statistics,
      bio,
      experience,
      education,
      resumes,
      isActive
    } = req.body;

    const update = {};
    if (summary !== undefined) update.summary = summary;
    if (professionalBackground !== undefined) update.professionalBackground = professionalBackground;
    if (photo !== undefined) update.photo = photo;
    if (keyAchievements !== undefined) update.keyAchievements = Array.isArray(keyAchievements) ? keyAchievements : [];
    if (email !== undefined) update.email = email;
    if (phone !== undefined) update.phone = phone;
    if (address !== undefined) update.address = address;
    if (social !== undefined) update.social = social;
    if (yearsExperience !== undefined) update.yearsExperience = Number(yearsExperience) || 0;
    if (projectsCount !== undefined) update.projectsCount = Number(projectsCount) || 0;
    if (technologiesCount !== undefined) update.technologiesCount = Number(technologiesCount) || 0;
    if (certificatesCount !== undefined) update.certificatesCount = Number(certificatesCount) || 0;
    if (showStatistics !== undefined) update.showStatistics = !!showStatistics;
    if (statistics !== undefined) {
      const arr = Array.isArray(statistics) ? statistics : [];
      update.statistics = arr.map(s => ({
        label: s && s.label ? String(s.label) : '',
        value: Number(s && s.value) || 0,
        isActive: s && s.isActive === false ? false : true
      }));
    }
    if (bio !== undefined) update.bio = Array.isArray(bio) ? bio : (typeof bio === 'string' && bio ? [bio] : []);
    if (experience !== undefined) update.experience = Array.isArray(experience) ? experience : [];
    if (education !== undefined) update.education = Array.isArray(education) ? education : [];
    if (resumes !== undefined) update.resumes = Array.isArray(resumes) ? resumes : [];
    if (isActive !== undefined) update.isActive = isActive;

    await About.updateOne({}, { $set: update }, { upsert: true });
    const about = await About.findOne({});
    res.json({ message: 'About section updated successfully', about });
  } catch (error) {
    console.error('Update about error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;