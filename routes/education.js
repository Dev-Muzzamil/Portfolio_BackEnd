const express = require('express');
const { body, validationResult } = require('express-validator');
const Education = require('../models/Education');
const { auth, adminOnly } = require('../middleware/auth');
const skillManager = require('../utils/skillManager');

const router = express.Router();

// Get all education entries (public)
router.get('/', async (req, res) => {
  try {
    const education = await Education.find({ isActive: true }).sort({ order: 1, startDate: -1 });
    res.json({ education });
  } catch (error) {
    console.error('Get education error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single education entry (public)
router.get('/:id', async (req, res) => {
  try {
    const education = await Education.findById(req.params.id);
    if (!education || !education.isActive) {
      return res.status(404).json({ message: 'Education entry not found' });
    }
    res.json({ education });
  } catch (error) {
    console.error('Get education by ID error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create education entry (admin only)
router.post('/', auth, adminOnly, [
  body('institution').trim().isLength({ min: 1 }).withMessage('Institution is required'),
  body('degree').trim().isLength({ min: 1 }).withMessage('Degree is required'),
  body('startDate').optional().isISO8601().withMessage('Valid start date required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const education = new Education(req.body);
    await education.save();

    // Sync skills automatically if skills are provided
    if (req.body.skills && req.body.skills.length > 0) {
      try {
        // Get skill names from the skills array (assuming they are skill names, not IDs)
        const skillNames = req.body.skills;
        await skillManager.syncSkills(skillNames, 'education', education._id);
      } catch (skillError) {
        console.warn('Failed to sync skills for education:', skillError.message);
        // Don't fail the education creation if skill sync fails
      }
    }

    res.status(201).json({ message: 'Education entry created successfully', education });
  } catch (error) {
    console.error('Create education error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// NOTE: Place specific routes BEFORE dynamic :id to avoid conflicts
// Update order of education entries (admin only)
router.put('/order/update', auth, adminOnly, [
  body('education').isArray().withMessage('Education array required'),
  body('education.*.id').isMongoId().withMessage('Valid education ID required'),
  body('education.*.order').isInt({ min: 0 }).withMessage('Valid order number required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { education: educationOrder } = req.body;

    // Update order for each education entry
    const updatePromises = educationOrder.map(item =>
      Education.findByIdAndUpdate(item.id, { order: item.order })
    );

    await Promise.all(updatePromises);
    res.json({ message: 'Education order updated successfully' });
  } catch (error) {
    console.error('Update education order error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update education entry (admin only)
router.put('/:id', auth, adminOnly, [
  body('institution').optional().trim().isLength({ min: 1 }).withMessage('Institution cannot be empty'),
  body('degree').optional().trim().isLength({ min: 1 }).withMessage('Degree cannot be empty'),
  body('startDate').optional().isISO8601().withMessage('Valid start date required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const id = req.params.id;
    const existing = await Education.findById(id);
    if (!existing) {
      return res.status(404).json({ message: 'Education entry not found' });
    }

    const oldSkills = existing.skills || [];
    const oldSkillIdsOrNames = oldSkills.map(s => {
      if (!s) return null;
      if (typeof s === 'string') return s;
      if (s._id) return String(s._id);
      if (s.name) return String(s.name).toLowerCase();
      return null;
    }).filter(Boolean);
    const updates = { ...req.body };
    // Prevent accidental ID overwrite
    delete updates._id;
    delete updates.createdAt;
    delete updates.updatedAt;

    // Use atomic update to avoid Mixed tracking issues (schema is strict:false)
    await Education.updateOne({ _id: id }, { $set: updates }, { upsert: false });
    const education = await Education.findById(id);

    // Sync skills if skills changed
    if (req.body.skills) {
      try {
        // Remove old skill references: compare by name or id
        for (const oldIdOrName of oldSkillIdsOrNames) {
          const stillExists = req.body.skills.some(newS => {
            if (!newS) return false;
            if (typeof newS === 'string') return String(newS).toLowerCase() === String(oldIdOrName).toLowerCase();
            if (newS._id) return String(newS._id) === String(oldIdOrName);
            if (newS.name) return String(newS.name).toLowerCase() === String(oldIdOrName).toLowerCase();
            return false;
          });
          if (!stillExists) {
            await skillManager.removeSkillSource(oldIdOrName, 'education', education._id);
          }
        }

        // Add new skill references (sync accepts names or IDs)
        await skillManager.syncSkills(req.body.skills, 'education', education._id);
      } catch (skillError) {
        console.warn('Failed to sync skills for updated education:', skillError.message);
        // Don't fail the education update if skill sync fails
      }
    }

    res.json({ message: 'Education entry updated successfully', education });
  } catch (error) {
    console.error('Update education error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete education entry (admin only)
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const education = await Education.findById(req.params.id);
    if (!education) {
      return res.status(404).json({ message: 'Education entry not found' });
    }

    // Clean up skill references before deleting
    if (education.skills && education.skills.length > 0) {
      try {
        for (const skillId of education.skills) {
          await skillManager.removeSkillSource(skillId, 'education', education._id);
        }
      } catch (skillError) {
        console.warn('Failed to clean up skill references for deleted education:', skillError.message);
        // Don't fail the education deletion if skill cleanup fails
      }
    }

    await Education.findByIdAndDelete(req.params.id);
    res.json({ message: 'Education entry deleted successfully' });
  } catch (error) {
    console.error('Delete education error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;