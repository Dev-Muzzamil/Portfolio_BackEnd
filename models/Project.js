const mongoose = require('mongoose');

// Define explicit fields for reliable change tracking, but keep strict:false to allow extras
const ProjectSchema = new mongoose.Schema({
	title: String,
	description: String,
	longDescription: String,
	technologies: [String],
	skills: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Skill' }],
	githubUrls: [String],
	liveUrls: [String],
	// legacy single-url fallbacks
	githubUrl: String,
	liveUrl: String,
	screenshots: [String],
	screenshotUpdatedAt: Date,
	featured: { type: Boolean, default: false },
	// Allow built-in categories (personal, academic, work) and any custom category names
	category: { type: String, default: 'personal' },
	academicScale: { type: String, enum: ['mini','major'], default: undefined },
	subcategories: [String],
	linkedInstitutes: [mongoose.Schema.Types.Mixed],
	tags: [String],
	startDate: Date,
	startPrecision: { type: String, enum: ['date', 'month', 'year'], default: 'date' },
	startLabel: String,
	endDate: Date,
	endPrecision: { type: String, enum: ['date', 'month', 'year'], default: 'date' },
	endLabel: String,
	isCurrent: { type: Boolean, default: false },
	isActive: { type: Boolean, default: true },
	order: { type: Number, default: 0 },
	// Preview management
	lastSeenETag: String,
	lastSeenLastModified: String
}, { strict: false, timestamps: true });

ProjectSchema.methods.incrementDownload = async function () {
	this.downloadCount = (this.downloadCount || 0) + 1;
};

const Project = mongoose.models.Project || mongoose.model('Project', ProjectSchema, 'projects');

module.exports = Project;
