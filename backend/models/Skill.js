const mongoose = require('mongoose');

// Structured skill schema while still allowing extra fields via strict:false
const SkillSchema = new mongoose.Schema({
	name: { type: String, required: true, trim: true },
	category: { type: String, default: 'Technical' },
	proficiency: { type: String, default: 'Beginner' },
	level: { type: Number, default: 50 },
	description: { type: String },
	isActive: { type: Boolean, default: true },
	order: { type: Number, default: 0 },
	sources: { type: [mongoose.Schema.Types.Mixed], default: [] }
}, { strict: false, timestamps: true });

const Model = mongoose.models.Skill || mongoose.model('Skill', SkillSchema, 'skills');

module.exports = Model;
