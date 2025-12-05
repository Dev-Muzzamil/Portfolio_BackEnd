const express = require('express');
const { body, validationResult } = require('express-validator');
const Experience = require('../models/Experience');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();

// Public: list experiences (active only), order by order asc then startDate desc
router.get('/', async (req, res) => {
  try {
    const experience = await Experience.find({ isActive: true }).sort({ order: 1, startDate: -1 });
    res.json({ experience });
  } catch (error) {
    console.error('Get experience error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: list ALL experiences (including inactive) for admin UI
router.get('/admin/all', auth, adminOnly, async (req, res) => {
  try {
    const experience = await Experience.find({}).sort({ order: 1, startDate: -1 });
    res.json({ experience });
  } catch (error) {
    console.error('Get all experiences (admin) error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Public: single experience by id
router.get('/:id', async (req, res) => {
  try {
    const exp = await Experience.findById(req.params.id);
    if (!exp || !exp.isActive) return res.status(404).json({ message: 'Experience entry not found' });
    res.json({ experience: exp });
  } catch (error) {
    console.error('Get experience by ID error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: create
router.post('/', auth, adminOnly, [
  body('title').optional().isString(),
  body('company').optional().isString(),
  body('startDate').optional().isISO8601().withMessage('Valid start date required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const experience = new Experience(req.body);
    await experience.save();
    res.status(201).json({ message: 'Experience entry created successfully', experience });
  } catch (error) {
    console.error('Create experience error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: update
router.put('/:id', auth, adminOnly, [
  body('title').optional().isString(),
  body('company').optional().isString(),
  body('startDate').optional().isISO8601().withMessage('Valid start date required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const id = req.params.id;
    const existing = await Experience.findById(id);
    if (!existing) return res.status(404).json({ message: 'Experience entry not found' });

    const updates = { ...req.body };
    delete updates._id; delete updates.createdAt; delete updates.updatedAt;

    await Experience.updateOne({ _id: id }, { $set: updates }, { upsert: false });
    const experience = await Experience.findById(id);

    res.json({ message: 'Experience entry updated successfully', experience });
  } catch (error) {
    console.error('Update experience error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: update ordering
router.put('/order/update', auth, adminOnly, [
  body('experience').isArray().withMessage('Experience array required'),
  body('experience.*.id').isMongoId().withMessage('Valid experience ID required'),
  body('experience.*.order').isInt({ min: 0 }).withMessage('Valid order number required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { experience: orderArr } = req.body;
    const updatePromises = orderArr.map(item => Experience.findByIdAndUpdate(item.id, { order: item.order }));
    await Promise.all(updatePromises);
    res.json({ message: 'Experience order updated successfully' });
  } catch (error) {
    console.error('Update experience order error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: delete
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const experience = await Experience.findById(req.params.id);
    if (!experience) return res.status(404).json({ message: 'Experience entry not found' });
    await Experience.findByIdAndDelete(req.params.id);
    res.json({ message: 'Experience entry deleted successfully' });
  } catch (error) {
    console.error('Delete experience error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
