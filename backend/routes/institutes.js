const express = require('express');
const router = express.Router();
const Institute = require('../models/Institute');
const { auth } = require('../middleware/auth');

// Get all institutes
router.get('/', async (req, res) => {
  try {
    const institutes = await Institute.find({ isActive: true })
      .sort({ name: 1 });
    res.json(institutes);
  } catch (error) {
    console.error('Error fetching institutes:', error);
    res.status(500).json({ error: 'Failed to fetch institutes' });
  }
});

// Get institute by ID
router.get('/:id', async (req, res) => {
  try {
    const institute = await Institute.findById(req.params.id);
    if (!institute) {
      return res.status(404).json({ error: 'Institute not found' });
    }
    res.json(institute);
  } catch (error) {
    console.error('Error fetching institute:', error);
    res.status(500).json({ error: 'Failed to fetch institute' });
  }
});

// Create new institute
router.post('/', auth, async (req, res) => {
  try {
    const instituteData = {
      name: req.body.name,
      type: req.body.type,
      location: req.body.location,
      website: req.body.website,
      contactEmail: req.body.contactEmail,
      contactPhone: req.body.contactPhone,
      accreditation: req.body.accreditation,
      description: req.body.description,
      logoUrl: req.body.logoUrl,
      isActive: req.body.isActive !== undefined ? req.body.isActive : true
    };

    const institute = new Institute(instituteData);
    await institute.save();
    res.status(201).json(institute);
  } catch (error) {
    console.error('Error creating institute:', error);
    if (error.code === 11000) {
      res.status(400).json({ error: 'Institute with this name already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create institute' });
    }
  }
});

// Update institute
router.put('/:id', auth, async (req, res) => {
  try {
    const institute = await Institute.findByIdAndUpdate(
      req.params.id,
      {
        name: req.body.name,
        type: req.body.type,
        location: req.body.location,
        website: req.body.website,
        contactEmail: req.body.contactEmail,
        contactPhone: req.body.contactPhone,
        accreditation: req.body.accreditation,
        description: req.body.description,
        logoUrl: req.body.logoUrl,
        isActive: req.body.isActive
      },
      { new: true, runValidators: true }
    );

    if (!institute) {
      return res.status(404).json({ error: 'Institute not found' });
    }

    res.json(institute);
  } catch (error) {
    console.error('Error updating institute:', error);
    if (error.code === 11000) {
      res.status(400).json({ error: 'Institute with this name already exists' });
    } else {
      res.status(500).json({ error: 'Failed to update institute' });
    }
  }
});

// Delete institute (soft delete)
router.delete('/:id', auth, async (req, res) => {
  try {
    const institute = await Institute.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!institute) {
      return res.status(404).json({ error: 'Institute not found' });
    }

    res.json({ message: 'Institute deleted successfully' });
  } catch (error) {
    console.error('Error deleting institute:', error);
    res.status(500).json({ error: 'Failed to delete institute' });
  }
});

// Search institutes
router.get('/search/:query', async (req, res) => {
  try {
    const query = req.params.query;
    const institutes = await Institute.find({
      isActive: true,
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { location: { $regex: query, $options: 'i' } },
        { type: { $regex: query, $options: 'i' } }
      ]
    }).limit(10);

    res.json(institutes);
  } catch (error) {
    console.error('Error searching institutes:', error);
    res.status(500).json({ error: 'Failed to search institutes' });
  }
});

module.exports = router;