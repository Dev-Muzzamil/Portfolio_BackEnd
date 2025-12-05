const mongoose = require('mongoose');

// Define explicit fields for reliable change tracking, but keep strict:false to allow extras
const ProjectSchema = new mongoose.Schema({
	title: String,
	description: String,
	longDescription: String,
	technologies: [String],
	// Technologies to show on card preview (if empty, shows first 3 from technologies)
	featuredTechnologies: [String],
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
	lastSeenLastModified: String,

	// Reports and Documentation
	reports: [{
		title: {
			type: String,
			required: true,
			trim: true
		},
		description: String,
		type: {
			type: String,
			enum: ['file', 'link'],
			required: true
		},
		file: {
			url: String,
			publicId: String,
			originalName: String,
			mimeType: String,
			size: Number
		},
		link: {
			url: String,
			platform: String,
			title: String
		},
		visible: {
			type: Boolean,
			default: true
		},
		createdAt: {
			type: Date,
			default: Date.now
		}
	}],

	// Project Files (additional documents, code samples, etc.)
	files: [{
		url: String,
		publicId: String,
		originalName: String,
		mimeType: String,
		size: Number,
		category: {
			type: String,
			enum: ['report', 'documentation', 'presentation', 'code', 'dataset', 'general', 'other'],
			default: 'general'
		},
		description: String,
		visible: {
			type: Boolean,
			default: true
		},
		downloadCount: {
			type: Number,
			default: 0
		},
		createdAt: {
			type: Date,
			default: Date.now
		}
	}]
}, { strict: false, timestamps: true });

ProjectSchema.methods.incrementDownload = async function () {
	this.downloadCount = (this.downloadCount || 0) + 1;
};

// Method to add a report
ProjectSchema.methods.addReport = function(reportData) {
	this.reports.push(reportData);
	return this.save();
};

// Method to add a file
ProjectSchema.methods.addFile = function(fileData) {
	this.files.push(fileData);
	return this.save();
};

const Project = mongoose.models.Project || mongoose.model('Project', ProjectSchema, 'projects');

module.exports = Project;
