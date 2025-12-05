const mongoose = require('mongoose');

/**
 * Certificate model for professional certificates and achievements
 */
const certificateSchema = new mongoose.Schema({
  // Base content fields
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [200, 'Title must be less than 200 characters'],
    minlength: [3, 'Title must be at least 3 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'published'
  },
  visibility: {
    type: String,
    enum: ['public', 'private', 'hidden'],
    default: 'public'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  featured: {
    type: Boolean,
    default: false
  },
  
  // Certificate-specific fields
  issuer: {
    type: String,
    required: [true, 'Issuer is required'],
    trim: true,
    maxlength: 100
  },
  issuingAuthority: {
    type: String,
    trim: true
  },
  issueDate: {
    type: Date,
    required: [true, 'Issue date is required']
  },
  expiryDate: {
    type: Date,
    validate: {
      validator: function(v) {
        return !v || v > this.issueDate;
      },
      message: 'Expiry date must be after issue date'
    }
  },
  credentialId: {
    type: String,
    trim: true,
    unique: true,
    sparse: true,
    default: null
  },
  credentialUrl: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        return !v || /^https?:\/\/.+/.test(v);
      },
      message: 'Credential URL must be a valid HTTP/HTTPS URL'
    }
  },
  verificationUrl: {
    type: String,
    trim: true
  },
  
  // Certificate Type
  certificateType: {
    type: String,
    enum: ['course', 'workshop', 'certification', 'award', 'degree', 'diploma', 'badge', 'other'],
    default: 'certification'
  },
  level: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced', 'expert', 'professional'],
    default: 'intermediate'
  },
  
  // Skills and Competencies
  skills: [{
    name: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    proficiency: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced', 'expert'],
      default: 'intermediate'
    },
    verified: {
      type: Boolean,
      default: true
    }
  }],
  
  // Skills to show on card preview (if empty, shows first 3 from skills)
  featuredSkills: [String],
  
  // Files and Media
  files: [{
    url: {
      type: String,
      required: true
    },
    publicId: String,
    originalName: {
      type: String,
      required: true
    },
    mimeType: {
      type: String,
      required: true
    },
    size: Number,
    isPrimary: {
      type: Boolean,
      default: false
    },
    thumbnailUrl: String,
    thumbnailPublicId: String,
    category: {
      type: String,
      enum: ['certificate', 'transcript', 'badge', 'verification', 'image', 'other'],
      default: 'certificate'
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Stored file reference for conversion
  certificateFile: {
    // URL to the original uploaded file (PDF/Word), if available
    originalUrl: String,
    originalPublicId: String,
    // URL to the generated preview image (PNG/JPG)
    previewUrl: String,
    previewPublicId: String,
    // A short type label for preview vs original
    fileType: String
  },
  
  // Primary certificate image URL
  certificateUrl: String,
  
  // Institution/Education Context
  completedAtInstitution: {
    type: String,
    trim: true
  },
  educationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Education'
  },
  
  // Verification
  verification: {
    isVerified: {
      type: Boolean,
      default: false
    },
    verifiedAt: Date,
    verifiedBy: String,
    verificationMethod: {
      type: String,
      enum: ['manual', 'api', 'email', 'url'],
      default: 'manual'
    },
    verificationNotes: String
  },
  
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
  
  // Competencies and Learning Outcomes
  competencies: [{
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: String,
    level: {
      type: String,
      enum: ['basic', 'intermediate', 'advanced', 'expert'],
      default: 'intermediate'
    }
  }],
  
  // Validity and Renewal
  validity: {
    isPermanent: {
      type: Boolean,
      default: false
    },
    renewalRequired: {
      type: Boolean,
      default: false
    },
    renewalPeriod: {
      type: Number,
      default: 12
    },
    lastRenewed: Date,
    nextRenewal: Date
  },
  
  // Metrics
  metrics: {
    views: {
      type: Number,
      default: 0
    },
    downloads: {
      type: Number,
      default: 0
    },
    lastViewed: Date
  },
  
  // Admin info
  order: {
    type: Number,
    default: 0
  },
  
  createdBy: mongoose.Schema.Types.ObjectId,
  updatedBy: mongoose.Schema.Types.ObjectId
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
certificateSchema.index({ issuer: 1, status: 1 });
certificateSchema.index({ issueDate: -1 });
certificateSchema.index({ expiryDate: 1 });
certificateSchema.index({ certificateType: 1, status: 1 });
certificateSchema.index({ level: 1 });
certificateSchema.index({ 'skills.name': 1 });
certificateSchema.index({ credentialId: 1 });
certificateSchema.index({ educationId: 1 });
certificateSchema.index({ 'verification.isVerified': 1 });

// Virtual for primary file
certificateSchema.virtual('primaryFile').get(function() {
  const primaryFile = this.files.find(file => file.isPrimary);
  return primaryFile || this.files[0] || null;
});

// Virtual for certificate validity status
certificateSchema.virtual('isValid').get(function() {
  if (this.validity.isPermanent) return true;
  if (!this.expiryDate) return true;
  return new Date() <= this.expiryDate;
});

// Virtual for certificate age in days
certificateSchema.virtual('ageInDays').get(function() {
  const now = new Date();
  const diffTime = Math.abs(now - this.issueDate);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for days until expiry
certificateSchema.virtual('daysUntilExpiry').get(function() {
  if (!this.expiryDate) return null;
  const now = new Date();
  const diffTime = this.expiryDate - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for all skill names
certificateSchema.virtual('skillNames').get(function() {
  return this.skills.map(skill => skill.name);
});

// Pre-save middleware
certificateSchema.pre('save', function(next) {
  if (this.validity.renewalRequired && this.validity.renewalPeriod) {
    const lastRenewal = this.validity.lastRenewed || this.issueDate;
    this.validity.nextRenewal = new Date(lastRenewal);
    this.validity.nextRenewal.setMonth(this.validity.nextRenewal.getMonth() + this.validity.renewalPeriod);
  }
  next();
});

// Instance methods
certificateSchema.methods.addSkill = function(skillData) {
  const existingSkill = this.skills.find(skill => 
    skill.name.toLowerCase() === skillData.name.toLowerCase()
  );
  if (!existingSkill) {
    this.skills.push(skillData);
  } else {
    Object.assign(existingSkill, skillData);
  }
  return this.save();
};

certificateSchema.methods.removeSkill = function(skillName) {
  this.skills = this.skills.filter(skill => 
    skill.name.toLowerCase() !== skillName.toLowerCase()
  );
  return this.save();
};

certificateSchema.methods.addFile = function(fileData) {
  this.files.push(fileData);
  return this.save();
};

certificateSchema.methods.setPrimaryFile = function(fileId) {
  this.files.forEach(file => file.isPrimary = false);
  const file = this.files.id(fileId);
  if (file) {
    file.isPrimary = true;
  }
  return this.save();
};

certificateSchema.methods.addReport = function(reportData) {
  this.reports.push(reportData);
  return this.save();
};

certificateSchema.methods.verify = function(verifiedBy, method = 'manual', notes = '') {
  this.verification.isVerified = true;
  this.verification.verifiedAt = new Date();
  this.verification.verifiedBy = verifiedBy;
  this.verification.verificationMethod = method;
  this.verification.verificationNotes = notes;
  return this.save();
};

certificateSchema.methods.renew = function() {
  if (this.validity.renewalRequired) {
    this.validity.lastRenewed = new Date();
  }
  return this.save();
};

// Static methods
certificateSchema.statics.findByIssuer = function(issuer) {
  return this.find({
    issuer: { $regex: issuer, $options: 'i' },
    status: 'published',
    visibility: 'public'
  });
};

certificateSchema.statics.findBySkill = function(skillName) {
  return this.find({
    'skills.name': { $regex: skillName, $options: 'i' },
    status: 'published',
    visibility: 'public'
  });
};

certificateSchema.statics.findExpiring = function(days = 30) {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);
  return this.find({
    expiryDate: { $lte: futureDate, $gte: new Date() },
    status: 'published',
    visibility: 'public'
  });
};

certificateSchema.statics.findVerified = function() {
  return this.find({
    'verification.isVerified': true,
    status: 'published',
    visibility: 'public'
  });
};

const Certification = mongoose.models.Certification || mongoose.model('Certification', certificateSchema);

module.exports = Certification;
