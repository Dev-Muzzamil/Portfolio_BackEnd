const express = require('express');
const { body, validationResult } = require('express-validator');
const Project = require('../models/Project');
const { auth, adminOnly } = require('../middleware/auth');
const puppeteer = require('puppeteer');
const cloudinary = require('cloudinary').v2;
const skillManager = require('../utils/skillManager');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const router = express.Router();

// Normalize category values
function normalizeCategory(value) {
  if (!value) return 'personal';
  const v = String(value).toLowerCase().trim();
  if (!v) return 'personal';

  // Map common synonyms
  if (['academic', 'school', 'course', 'thesis', 'research'].includes(v)) return 'academic';
  if (['work', 'job', 'professional', 'client'].includes(v)) return 'work';
  if (['personal', 'side', 'portfolio'].includes(v)) return 'personal';

  // Allow any custom category string
  return v;
}

// Normalize an array of subcategories into known tokens
function normalizeSubcategories(values) {
  if (!values) return [];
  const allowed = new Set(['web', 'mobile', 'ai-ml-dl', 'desktop', 'cloud', 'other', 'academic', 'personal']);

  const mapValue = (v) => {
    if (!v) return null;
    const s = String(v).toLowerCase().trim();
    if (!s) return null;
    if (s === 'ai' || s === 'ml' || s === 'dl' || s === 'ai/ml' || s === 'ai-ml') return 'ai-ml-dl';
    if (s.includes('web')) return 'web';
    if (s.includes('mobile') || s.includes('android') || s.includes('ios')) return 'mobile';
    if (s.includes('cloud') || s.includes('aws') || s.includes('azure') || s.includes('gcp')) return 'cloud';
    if (s.includes('desktop') || s.includes('electron')) return 'desktop';
    if (s === 'academic' || s === 'research' || s === 'thesis' || s === 'course') return 'academic';
    if (allowed.has(s)) return s;
    return 'other';
  };

  const out = Array.isArray(values) ? values.map(mapValue).filter(Boolean) : [mapValue(values)].filter(Boolean);
  // dedupe
  return Array.from(new Set(out));
}

// Normalize academic scale (mini/major) for academic projects
function normalizeAcademicScale(value) {
  if (!value) return undefined;
  const v = String(value).toLowerCase().trim();
  if (v.startsWith('mini')) return 'mini';
  if (v.startsWith('major') || v.startsWith('main')) return 'major';
  return undefined;
}

// Get all projects (public)
router.get('/', async (req, res) => {
  try {
    const { featured, limit, page = 1 } = req.query;
    const query = { isActive: true };

    if (featured === 'true') {
      query.featured = true;
    }

    const limitNum = limit ? parseInt(limit) : 0;
    const skip = limitNum ? (parseInt(page) - 1) * limitNum : 0;

    // Support filtering by linked institute id or institute name
    if (req.query.instituteId) {
      // Match projects that list the institute id in their linkedInstitutes array
      query.linkedInstitutes = req.query.instituteId;
    } else if (req.query.instituteName) {
      // Match projects that have completedAtInstitution equal to provided name (fallback)
      query.$or = [
        { completedAtInstitution: req.query.instituteName },
        { institution: req.query.instituteName }
      ];
    }

    const projects = await Project.find(query)
      .populate('skills', 'name category proficiency level isActive')
      .sort({ featured: -1, order: 1, createdAt: -1 })
      .limit(limitNum)
      .skip(skip);

    const total = await Project.countDocuments(query);

    res.json({
      projects,
      pagination: limitNum ? {
        page: parseInt(page),
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      } : null
    });
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single project (public)
router.get('/:id', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('skills', 'name category proficiency level isActive');
    if (!project || !project.isActive) {
      return res.status(404).json({ message: 'Project not found' });
    }
    res.json({ project });
  } catch (error) {
    console.error('Get project by ID error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create project (admin only)
router.post('/', auth, adminOnly, [
  body('title').trim().isLength({ min: 1 }).withMessage('Title is required'),
  body('description').trim().isLength({ min: 1 }).withMessage('Description is required'),
  body('technologies').isArray({ min: 1 }).withMessage('At least one technology required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const projectBody = { ...req.body, category: normalizeCategory(req.body.category) };
    // Accept legacy single category or a subcategories array
    projectBody.subcategories = normalizeSubcategories(req.body.subcategories || req.body.category);
    if (projectBody.category === 'academic') {
      const scale = normalizeAcademicScale(req.body.academicScale);
      if (scale) projectBody.academicScale = scale;
    } else {
      delete projectBody.academicScale;
    }
    // If project is ongoing/Current, ensure end-date fields aren't saved
    if (projectBody.isCurrent) {
      delete projectBody.endDate;
      delete projectBody.endLabel;
      delete projectBody.endPrecision;
    }
    const project = new Project(projectBody);
    await project.save();

    // Sync skills automatically if technologies are provided
    if (req.body.technologies && req.body.technologies.length > 0) {
      try {
        const syncedSkills = await skillManager.syncSkills(req.body.technologies, 'project', project._id);
        // Link ObjectId references to project.skills
        if (syncedSkills && syncedSkills.length > 0) {
          project.skills = syncedSkills.map(s => s._id);
          await project.save();
        }
      } catch (skillError) {
        console.warn('Failed to sync skills for project:', skillError.message);
        // Don't fail the project creation if skill sync fails
      }
    }

    // Trigger automatic screenshot generation if project has liveUrl
    if (project.liveUrl && project.liveUrl.startsWith('http')) {
      setImmediate(async () => {
        try {
          console.log(`Auto-generating screenshot for new project: ${project.title}`);
          const screenshotUrl = await generateScreenshot(project.liveUrl, project._id);

          if (screenshotUrl) {
            project.screenshots = [screenshotUrl];
            project.screenshotUpdatedAt = new Date();
            await project.save();
            console.log(`Screenshot auto-generated for project: ${project.title}`);
          }
        } catch (error) {
          console.error(`Failed to auto-generate screenshot for project ${project.title}:`, error.message);
        }
      });
    }
    const onlyStale = String(req.query.onlyStale || 'true').toLowerCase() !== 'false';
    const cutoffMs = 6 * 60 * 60 * 1000; // 6 hours
    const cutoffDate = new Date(Date.now() - cutoffMs);

    const baseQuery = { isActive: true, liveUrl: { $exists: true, $ne: '' } };
    const query = onlyStale
      ? { ...baseQuery, $or: [ { screenshotUpdatedAt: { $lt: cutoffDate } }, { screenshotUpdatedAt: { $exists: false } } ] }
      : baseQuery;

    const projects = await Project.find(query);

    res.status(201).json({ message: 'Project created successfully', project });
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update project (admin only)
router.put('/:id', auth, adminOnly, [
  body('title').optional().trim().isLength({ min: 1 }).withMessage('Title cannot be empty'),
  body('description').optional().trim().isLength({ min: 1 }).withMessage('Description cannot be empty'),
  body('technologies').optional().isArray({ min: 1 }).withMessage('At least one technology required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const oldTechnologies = project.technologies || [];
    // Ensure category and subcategories normalized
    const updatedBody = { ...req.body };
    if (req.body.category) updatedBody.category = normalizeCategory(req.body.category);
    if (req.body.subcategories || req.body.category) {
      updatedBody.subcategories = normalizeSubcategories(req.body.subcategories || req.body.category);
    }
    if ((updatedBody.category || project.category) === 'academic') {
      const scale = normalizeAcademicScale(req.body.academicScale);
      if (scale) updatedBody.academicScale = scale; else if (req.body.academicScale === '') updatedBody.academicScale = undefined;
    } else {
      updatedBody.academicScale = undefined;
    }

    // If project marked isCurrent during update, clear end-date fields
    if (updatedBody.isCurrent) {
      updatedBody.endDate = undefined;
      updatedBody.endLabel = undefined;
      updatedBody.endPrecision = undefined;
    }

    // Use direct atomic update for reliability
    const updated = await Project.findByIdAndUpdate(
      req.params.id,
      { $set: updatedBody },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ message: 'Project not found after update' });
    }

    // Sync skills if technologies changed
    if (req.body.technologies) {
      try {
        // Remove old skill references
        for (const tech of oldTechnologies) {
          if (!req.body.technologies.includes(tech)) {
            await skillManager.removeSkillSource(tech, 'project', updated._id);
          }
        }

        // Add new skill references and link ObjectIds
        const syncedSkills = await skillManager.syncSkills(req.body.technologies, 'project', updated._id);
        if (syncedSkills && syncedSkills.length > 0) {
          updated.skills = syncedSkills.map(s => s._id);
          await updated.save();
        }
      } catch (skillError) {
        console.warn('Failed to sync skills for updated project:', skillError.message);
        // Don't fail the project update if skill sync fails
      }
    }

    res.json({ message: 'Project updated successfully', project: updated });
  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete project (admin only)
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Clean up skill references before deleting
    if (project.technologies && project.technologies.length > 0) {
      try {
        for (const tech of project.technologies) {
          await skillManager.removeSkillSource(tech, 'project', project._id);
        }
      } catch (skillError) {
        console.warn('Failed to clean up skill references for deleted project:', skillError.message);
        // Don't fail the project deletion if skill cleanup fails
      }
    }

    await Project.findByIdAndDelete(req.params.id);
    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update order of projects (admin only)
router.put('/order/update', auth, adminOnly, [
  body('projects').isArray().withMessage('Projects array required'),
  body('projects.*.id').isMongoId().withMessage('Valid project ID required'),
  body('projects.*.order').isInt({ min: 0 }).withMessage('Valid order number required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { projects: projectOrder } = req.body;

    // Update order for each project
    const updatePromises = projectOrder.map(item =>
      Project.findByIdAndUpdate(item.id, { order: item.order })
    );

    await Promise.all(updatePromises);
    res.json({ message: 'Project order updated successfully' });
  } catch (error) {
    console.error('Update project order error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get project tags (public)
router.get('/meta/tags', async (req, res) => {
  try {
    const tags = await Project.distinct('tags', { isActive: true });
    res.json({ tags });
  } catch (error) {
    console.error('Get project tags error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get project subcategories (public)
router.get('/meta/subcategories', async (req, res) => {
  try {
    const subs = await Project.distinct('subcategories', { isActive: true });
    // flatten and dedupe
    const flat = (subs || []).flat().filter(Boolean);
    res.json({ subcategories: Array.from(new Set(flat)) });
  } catch (error) {
    console.error('Get project subcategories error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get project technologies (public)
router.get('/meta/technologies', async (req, res) => {
  try {
    const technologies = await Project.distinct('technologies', { isActive: true });
    res.json({ technologies });
  } catch (error) {
    console.error('Get project technologies error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Generate screenshot for a project
async function generateScreenshot(url, projectId) {
  try {
    const launchArgs = (process.env.PUPPETEER_ARGS || '--no-sandbox --disable-setuid-sandbox')
      .split(' ')
      .filter(Boolean);
    const headlessMode = process.env.PUPPETEER_HEADLESS || 'new';
    const execPath = process.env.PUPPETEER_EXECUTABLE_PATH;
    const launchOptions = {
      headless: headlessMode,
      args: launchArgs,
      ...(execPath ? { executablePath: execPath } : {})
    };

    const browser = await puppeteer.launch(launchOptions);

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    const screenshot = await page.screenshot({
      type: 'png',
      fullPage: false
    });

    await browser.close();

    // Upload to Cloudinary
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { resource_type: 'image', folder: 'project-screenshots' },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      ).end(screenshot);
    });

    return result.secure_url;
  } catch (error) {
    console.error('Screenshot generation error:', error);
    return null;
  }
}

// Generate screenshots for all projects (admin or secure cron)
router.post(
  '/generate-screenshots',
  async (req, res, next) => {
    const cronKey = req.headers['x-cron-key'];
    const secret = process.env.CRON_SECRET;
    if (secret && cronKey === secret) return next();
    return auth(req, res, () => adminOnly(req, res, next));
  },
  async (req, res) => {
    try {
      const onlyStale = String(req.query.onlyStale || 'true').toLowerCase() !== 'false';
      const onlyChanged = String(req.query.onlyChanged || 'false').toLowerCase() === 'true';

      const cutoffMs = 6 * 60 * 60 * 1000; // 6 hours
      const cutoffDate = new Date(Date.now() - cutoffMs);

      const baseQuery = { isActive: true, liveUrl: { $exists: true, $ne: '' } };
      const query = onlyChanged
        ? baseQuery
        : (onlyStale
          ? { ...baseQuery, $or: [ { screenshotUpdatedAt: { $lt: cutoffDate } }, { screenshotUpdatedAt: { $exists: false } } ] }
          : baseQuery);

      const projects = await Project.find(query);
      const results = [];

      for (const project of projects) {
        if (!project.liveUrl || !project.liveUrl.startsWith('http')) continue;

        if (onlyChanged) {
          try {
            const headRes = await fetch(project.liveUrl, { method: 'HEAD' });
            const etag = headRes.headers.get('etag') || undefined;
            const lastMod = headRes.headers.get('last-modified') || undefined;
            const sameEtag = etag && project.lastSeenETag && etag === project.lastSeenETag;
            const sameMod = lastMod && project.lastSeenLastModified && lastMod === project.lastSeenLastModified;
            if (sameEtag || sameMod) {
              results.push({ project: project.title, status: 'skipped-unchanged' });
              continue;
            }
          } catch (e) {
            console.warn('HEAD check failed for', project.title, e && e.message);
          }
        }

        console.log(`Generating screenshot for ${project.title}...`);
        const screenshotUrl = await generateScreenshot(project.liveUrl, project._id);

        if (screenshotUrl) {
          project.screenshots = [screenshotUrl];
          project.screenshotUpdatedAt = new Date();
          try {
            const headRes2 = await fetch(project.liveUrl, { method: 'HEAD' });
            project.lastSeenETag = headRes2.headers.get('etag') || project.lastSeenETag;
            project.lastSeenLastModified = headRes2.headers.get('last-modified') || project.lastSeenLastModified;
          } catch {}
          await project.save();
          results.push({ project: project.title, status: 'success', screenshotUrl });
        } else {
          results.push({ project: project.title, status: 'failed' });
        }
      }

      res.json({ message: 'Screenshot generation completed', results });
    } catch (error) {
      console.error('Generate screenshots error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Refresh a single project's screenshot
router.post('/:id/refresh-screenshot', auth, adminOnly, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ message: 'Project not found' });
    if (!project.liveUrl || !/^https?:\/\//i.test(project.liveUrl)) {
      return res.status(400).json({ message: 'Project has no valid liveUrl' });
    }

    const onlyChanged = String(req.query.onlyChanged || 'false').toLowerCase() === 'true';
    if (onlyChanged) {
      try {
        const headRes = await fetch(project.liveUrl, { method: 'HEAD' });
        const etag = headRes.headers.get('etag') || undefined;
        const lastMod = headRes.headers.get('last-modified') || undefined;
        const sameEtag = etag && project.lastSeenETag && etag === project.lastSeenETag;
        const sameMod = lastMod && project.lastSeenLastModified && lastMod === project.lastSeenLastModified;
        if (sameEtag || sameMod) {
          return res.json({ message: 'No changes detected (ETag/Last-Modified)', skipped: true });
        }
      } catch (e) {
        console.warn('HEAD check failed for single refresh', project.title, e && e.message);
      }
    }

    const screenshotUrl = await generateScreenshot(project.liveUrl, project._id);
    if (!screenshotUrl) return res.status(500).json({ message: 'Failed to capture screenshot' });

    project.screenshots = [screenshotUrl];
    project.screenshotUpdatedAt = new Date();
    try {
      const headRes2 = await fetch(project.liveUrl, { method: 'HEAD' });
      project.lastSeenETag = headRes2.headers.get('etag') || project.lastSeenETag;
      project.lastSeenLastModified = headRes2.headers.get('last-modified') || project.lastSeenLastModified;
    } catch {}
    await project.save();

    res.json({ message: 'Screenshot refreshed', screenshotUrl });
  } catch (error) {
    console.error('Single screenshot refresh error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;