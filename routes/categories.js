const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth, adminOnly } = require('../middleware/auth');
const Category = require('../models/Category');

const router = express.Router();

const DEFAULT_CATEGORIES = [
  { name: 'Academic', slug: 'academic', isDefault: true },
  { name: 'Personal', slug: 'personal', isDefault: true },
  { name: 'Work', slug: 'work', isDefault: true }
];

function mergeDefaults(dbCats) {
  const all = [...DEFAULT_CATEGORIES];
  for (const c of (dbCats || [])) {
    if (!all.some(d => d.slug === c.slug)) {
      all.push({ name: c.name, slug: c.slug, isDefault: !!c.isDefault, _id: c._id });
    }
  }
  return all;
}

// GET /categories - public list of categories (defaults + custom)
router.get('/', async (req, res) => {
  try {
    const cats = await Category.find({}).sort({ name: 1 });
    res.json({ categories: mergeDefaults(cats) });
  } catch (err) {
    console.error('Get categories error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /categories - create a custom category (admin)
router.post('/', auth, adminOnly, [
  body('name').trim().isLength({ min: 2 }).withMessage('Category name is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const name = req.body.name.trim();
    const slug = Category.slugify(name);

    if (DEFAULT_CATEGORIES.some(c => c.slug === slug)) {
      return res.status(200).json({ message: 'Category already exists (default)', category: DEFAULT_CATEGORIES.find(c => c.slug === slug) });
    }

    const existing = await Category.findOne({ slug });
    if (existing) {
      return res.status(200).json({ message: 'Category already exists', category: existing });
    }

    const created = await Category.create({ name, slug, isDefault: false });
    res.status(201).json({ message: 'Category created', category: created });
  } catch (err) {
    console.error('Create category error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
