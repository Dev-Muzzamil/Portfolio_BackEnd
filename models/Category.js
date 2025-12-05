const mongoose = require('mongoose');

const CategorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, index: true },
  isDefault: { type: Boolean, default: false }
}, { timestamps: true });

CategorySchema.statics.slugify = function(name) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
};

CategorySchema.pre('validate', function(next) {
  if (this.name && !this.slug) this.slug = this.constructor.slugify(this.name);
  next();
});

const Category = mongoose.models.Category || mongoose.model('Category', CategorySchema, 'categories');

module.exports = Category;
