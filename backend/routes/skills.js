const express = require('express');
const { body, validationResult } = require('express-validator');
const Skill = require('../models/Skill');
const { auth, adminOnly } = require('../middleware/auth');
const axios = require('axios');
const skillManager = require('../utils/skillManager');

const router = express.Router();

// Get all skills (public)
router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    const query = { isActive: true };

    if (category) {
      query.category = category;
    }

    const skills = await Skill.find(query).sort({ category: 1, order: 1, proficiency: -1 });
    res.json({ skills });
  } catch (error) {
    console.error('Get skills error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all skills including inactive (admin only)
router.get('/admin/all', auth, adminOnly, async (req, res) => {
  try {
    const { category } = req.query;
    const query = {};

    if (category) {
      query.category = category;
    }

    const skills = await Skill.find(query).sort({ category: 1, order: 1, proficiency: -1 });
    res.json({ skills });
  } catch (error) {
    console.error('Get all skills (admin) error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single skill (public)
router.get('/:id', async (req, res) => {
  try {
    const skill = await Skill.findById(req.params.id);
    if (!skill || !skill.isActive) {
      return res.status(404).json({ message: 'Skill not found' });
    }
    res.json({ skill });
  } catch (error) {
    console.error('Get skill by ID error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

const CATEGORY_VALUES = [
  'Language',
  'Framework / Library',
  'Database',
  'DevOps / Cloud',
  'Tooling',
  'Testing',
  'UI / UX',
  'Other'
];

// Create skill (admin only)
router.post('/', auth, adminOnly, [
  body('name').trim().isLength({ min: 1 }).withMessage('Name is required'),
  body('category').isIn(CATEGORY_VALUES).withMessage('Valid category required'),
  body('proficiency').isIn(['Beginner', 'Intermediate', 'Advanced', 'Expert']).withMessage('Valid proficiency required'),
  body('level').optional().isInt({ min: 1, max: 100 }).withMessage('Level must be between 1 and 100')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Check if skill already exists
    const existingSkill = await Skill.findOne({ name: req.body.name });
    if (existingSkill) {
      return res.status(400).json({ message: 'Skill already exists' });
    }

    const skill = new Skill({
      ...req.body,
      sources: [{ type: 'manual' }] // Mark as manually created
    });
    await skill.save();
    res.status(201).json({ message: 'Skill created successfully', skill });
  } catch (error) {
    console.error('Create skill error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update skill (admin only)
router.put('/:id', auth, adminOnly, [
  body('name').optional().trim().isLength({ min: 1 }).withMessage('Name cannot be empty'),
  body('category').optional().isIn(CATEGORY_VALUES).withMessage('Valid category required'),
  body('proficiency').optional().isIn(['Beginner', 'Intermediate', 'Advanced', 'Expert']).withMessage('Valid proficiency required'),
  body('level').optional().isInt({ min: 1, max: 100 }).withMessage('Level must be between 1 and 100')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const skill = await Skill.findById(req.params.id);
    if (!skill) {
      return res.status(404).json({ message: 'Skill not found' });
    }

    // Check if new name conflicts with existing skill
    if (req.body.name && req.body.name !== skill.name) {
      const existingSkill = await Skill.findOne({ name: req.body.name });
      if (existingSkill) {
        return res.status(400).json({ message: 'Skill name already exists' });
      }
    }

    Object.assign(skill, req.body);
    await skill.save();
    res.json({ message: 'Skill updated successfully', skill });
  } catch (error) {
    console.error('Update skill error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Toggle skill visibility (admin only) - Cascade hide/show
router.put('/:id/toggle-active', auth, adminOnly, async (req, res) => {
  try {
    const skill = await Skill.findById(req.params.id);
    if (!skill) {
      return res.status(404).json({ message: 'Skill not found' });
    }

    skill.isActive = !skill.isActive;
    await skill.save();

    // Note: Hide/show is handled by public API filters (isActive: true)
    // No need to modify entity documents - they filter by skill.isActive
    
    res.json({ 
      message: `Skill ${skill.isActive ? 'activated' : 'deactivated'} successfully`, 
      skill 
    });
  } catch (error) {
    console.error('Toggle skill active error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete skill (admin only) - Cascade delete with auto-cleanup
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const cascade = req.query.cascade === 'true' || req.query.force === 'true';
    
    if (!cascade) {
      // Check for references and inform user
      const check = await skillManager.canDeleteSkill(req.params.id);
      if (!check.canDelete) {
        console.warn(`Attempt to delete skill ${req.params.id} blocked: ${check.activeReferences.length} active references`);
        return res.status(400).json({ 
          message: `Cannot delete skill. It is referenced by ${check.activeReferences.length} active items.`, 
          details: check,
          hint: 'Use ?cascade=true to force delete and remove all references'
        });
      }
    }

    // Delete skill and cascade remove from all entities
    // Pass force=true when cascade is enabled to bypass reference check
    const skill = await skillManager.deleteSkill(req.params.id, cascade);
    res.json({ 
      message: 'Skill deleted successfully and removed from all references', 
      skill 
    });
  } catch (error) {
    console.error('Delete skill error:', error);
    res.status(400).json({ message: error.message });
  }
});

// Clean up existing skill names (remove extra quotes, parentheses, etc.)
router.post('/cleanup-names', auth, adminOnly, async (req, res) => {
  try {
    const skills = await Skill.find({});
    let cleaned = 0;
    
    for (const skill of skills) {
      const originalName = skill.name;
      let cleanName = String(originalName).trim();
      // Remove trailing/leading quotes and parentheses
      cleanName = cleanName.replace(/^["'()]+|["'()]+$/g, '');
      // Remove double quotes inside
      cleanName = cleanName.replace(/"+/g, '');
      // Clean up extra spaces
      cleanName = cleanName.replace(/\s+/g, ' ').trim();
      
      if (cleanName !== originalName && cleanName.length > 0) {
        // Check if cleaned name already exists
        const escapedName = cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const existing = await Skill.findOne({ 
          name: { $regex: new RegExp(`^${escapedName}$`, 'i') },
          _id: { $ne: skill._id }
        });
        
        if (existing) {
          // Merge into existing skill
          existing.sources = [...existing.sources, ...skill.sources];
          await existing.save();
          await Skill.findByIdAndDelete(skill._id);
          console.log(`Merged duplicate: "${originalName}" -> "${cleanName}"`);
        } else {
          // Just rename
          skill.name = cleanName;
          await skill.save();
          console.log(`Cleaned: "${originalName}" -> "${cleanName}"`);
        }
        cleaned++;
      }
    }
    
    res.json({ 
      message: `Cleaned ${cleaned} skill names`,
      cleaned 
    });
  } catch (error) {
    console.error('Cleanup names error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Sync all existing technologies and skills into Skills collection (admin only)
router.post('/sync-all', auth, adminOnly, async (req, res) => {
  try {
    const Project = require('../models/Project');
    const Certification = require('../models/Certification');
    const Education = require('../models/Education');
    
    const results = {
      projects: { processed: 0, skillsSynced: 0 },
      certifications: { processed: 0, skillsSynced: 0 },
      education: { processed: 0, skillsSynced: 0 },
      totalSkills: 0
    };

    // Sync from projects (technologies field) and link ObjectIds to skills array
    const projects = await Project.find({});
    for (const project of projects) {
      if (project.technologies && project.technologies.length > 0) {
        const syncedSkills = await skillManager.syncSkills(project.technologies, 'project', project._id);
        // Link ObjectId references to project.skills array
        if (syncedSkills && syncedSkills.length > 0) {
          project.skills = syncedSkills.map(s => s._id);
          await project.save();
        }
        results.projects.processed++;
        results.projects.skillsSynced += project.technologies.length;
      }
    }

    // Sync from certifications (skills field)
    const certifications = await Certification.find({});
    for (const cert of certifications) {
      if (cert.skills && cert.skills.length > 0) {
        const skillNames = cert.skills.map(s => typeof s === 'string' ? s : s.name).filter(Boolean);
        if (skillNames.length > 0) {
          await skillManager.syncSkills(skillNames, 'certification', cert._id);
          results.certifications.processed++;
          results.certifications.skillsSynced += skillNames.length;
        }
      }
    }

    // Sync from education (skills field)
    const educationItems = await Education.find({});
    for (const edu of educationItems) {
      if (edu.skills && edu.skills.length > 0) {
        const skillNames = edu.skills.map(s => typeof s === 'string' ? s : s.name).filter(Boolean);
        if (skillNames.length > 0) {
          await skillManager.syncSkills(skillNames, 'education', edu._id);
          results.education.processed++;
          results.education.skillsSynced += skillNames.length;
        }
      }
    }

    // Get total unique skills count
    results.totalSkills = await Skill.countDocuments();

    res.json({ 
      message: 'Successfully synced all skills from projects, certifications, and education',
      results 
    });
  } catch (error) {
    console.error('Sync all skills error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update order of skills (admin only)
router.put('/order/update', auth, adminOnly, [
  body('skills').isArray().withMessage('Skills array required'),
  body('skills.*.id').isMongoId().withMessage('Valid skill ID required'),
  body('skills.*.order').isInt({ min: 0 }).withMessage('Valid order number required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { skills: skillOrder } = req.body;

    // Update order for each skill
    const updatePromises = skillOrder.map(item =>
      Skill.findByIdAndUpdate(item.id, { order: item.order })
    );

    await Promise.all(updatePromises);
    res.json({ message: 'Skill order updated successfully' });
  } catch (error) {
    console.error('Update skill order error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get skill categories (public)
router.get('/meta/categories', async (req, res) => {
  try {
    const categories = await Skill.distinct('category', { isActive: true });
    res.json({ categories });
  } catch (error) {
    console.error('Get skill categories error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get skill references (admin only)
router.get('/:id/references', auth, adminOnly, async (req, res) => {
  try {
    const references = await skillManager.getSkillReferences(req.params.id);
    const usageStats = await skillManager.getSkillUsageStats(req.params.id);
    res.json({ references, usageStats });
  } catch (error) {
    console.error('Get skill references error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Hide skill (admin only)
router.put('/:id/hide', auth, adminOnly, async (req, res) => {
  try {
    const skill = await skillManager.hideSkill(req.params.id);
    res.json({ message: 'Skill hidden successfully', skill });
  } catch (error) {
    console.error('Hide skill error:', error);
    res.status(400).json({ message: error.message });
  }
});

// Show skill (admin only)
router.put('/:id/show', auth, adminOnly, async (req, res) => {
  try {
    const skill = await skillManager.showSkill(req.params.id);
    res.json({ message: 'Skill shown successfully', skill });
  } catch (error) {
    console.error('Show skill error:', error);
    res.status(400).json({ message: error.message });
  }
});

// Link skill to entity (admin only)
router.post('/:skillId/link/:entityType/:entityId', auth, adminOnly, async (req, res) => {
  try {
    const { skillId, entityType, entityId } = req.params;

    if (!['project', 'certification', 'education'].includes(entityType)) {
      return res.status(400).json({ message: 'Invalid entity type. Must be project, certification, or education' });
    }

    const result = await skillManager.linkSkillToEntity(skillId, entityType, entityId);
    res.json({ message: 'Skill linked successfully', result });
  } catch (error) {
    console.error('Link skill error:', error);
    res.status(400).json({ message: error.message });
  }
});

// Unlink skill from entity (admin only)
router.delete('/:skillId/link/:entityType/:entityId', auth, adminOnly, async (req, res) => {
  try {
    const { skillId, entityType, entityId } = req.params;

    if (!['project', 'certification', 'education'].includes(entityType)) {
      return res.status(400).json({ message: 'Invalid entity type. Must be project, certification, or education' });
    }

    const result = await skillManager.unlinkSkillFromEntity(skillId, entityType, entityId);
    res.json({ message: 'Skill unlinked successfully', result });
  } catch (error) {
    console.error('Unlink skill error:', error);
    res.status(400).json({ message: error.message });
  }
});

// Bulk link skills to entity (admin only)
router.post('/bulk-link/:entityType/:entityId', auth, adminOnly, [
  body('skillIds').isArray().withMessage('Skill IDs array required'),
  body('skillIds.*').isMongoId().withMessage('Valid skill ID required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { entityType, entityId } = req.params;
    const { skillIds } = req.body;

    if (!['project', 'certification', 'education'].includes(entityType)) {
      return res.status(400).json({ message: 'Invalid entity type. Must be project, certification, or education' });
    }

    const results = await skillManager.bulkLinkSkillsToEntity(skillIds, entityType, entityId);
    res.json({ message: 'Bulk link operation completed', results });
  } catch (error) {
    console.error('Bulk link skills error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Bulk unlink skills from entity (admin only)
router.post('/bulk-unlink/:entityType/:entityId', auth, adminOnly, [
  body('skillIds').isArray().withMessage('Skill IDs array required'),
  body('skillIds.*').isMongoId().withMessage('Valid skill ID required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { entityType, entityId } = req.params;
    const { skillIds } = req.body;

    if (!['project', 'certification', 'education'].includes(entityType)) {
      return res.status(400).json({ message: 'Invalid entity type. Must be project, certification, or education' });
    }

    const results = await skillManager.bulkUnlinkSkillsFromEntity(skillIds, entityType, entityId);
    res.json({ message: 'Bulk unlink operation completed', results });
  } catch (error) {
    console.error('Bulk unlink skills error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Cleanup orphaned references (admin only)
router.post('/cleanup-orphaned', auth, adminOnly, async (req, res) => {
  try {
    const results = await skillManager.cleanupOrphanedReferences();
    res.json({ message: 'Cleanup completed', results });
  } catch (error) {
    console.error('Cleanup orphaned references error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Bulk create/update skills from projects/certifications/education (admin only)
router.post('/sync', auth, adminOnly, async (req, res) => {
  try {
    const { skills, source, referenceId } = req.body;

    // Special-case: infer skills from all projects when requested
    if (source === 'project-bulk' && referenceId === 'all') {
      const Project = require('../models/Project');

      const projects = await Project.find({});
      const technologySet = new Set();

      projects.forEach(project => {
        if (Array.isArray(project.technologies)) {
          project.technologies
            .filter(Boolean)
            .forEach(name => technologySet.add(name));
        }
      });

      const allTechNames = Array.from(technologySet);

      if (allTechNames.length === 0) {
        return res.status(400).json({ message: 'No technologies found in projects to sync' });
      }

      const syncedSkills = await skillManager.syncSkills(allTechNames, 'project', 'bulk-all-projects');
      return res.json({ message: 'Skills synchronized from all projects successfully', skills: syncedSkills });
    }

    if (!skills || !Array.isArray(skills) || !source || !referenceId) {
      return res.status(400).json({ message: 'Skills array, source, and referenceId required' });
    }

    const syncedSkills = await skillManager.syncSkills(skills, source, referenceId);
    res.json({ message: 'Skills synchronized successfully', skills: syncedSkills });
  } catch (error) {
    console.error('Sync skills error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Auto-populate skills from GitHub (admin only)
router.post('/auto-populate/github/:username', auth, adminOnly, async (req, res) => {
  try {
    const { username } = req.params;

    // Get GitHub languages stats
    const response = await axios.get(`https://api.github.com/users/${username}/repos`, {
      params: {
        per_page: 100,
        type: 'owner'
      },
      headers: {
        'Authorization': `token ${process.env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    const repos = response.data;
    const languageStats = {};

    // Get language stats for each repository
    for (const repo of repos.slice(0, 20)) { // Limit to first 20 repos for performance
      if (repo.fork) continue; // Skip forks

      try {
        const langResponse = await axios.get(repo.languages_url, {
          headers: {
            'Authorization': `token ${process.env.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        });

        const languages = langResponse.data;
        for (const [language, bytes] of Object.entries(languages)) {
          languageStats[language] = (languageStats[language] || 0) + bytes;
        }
      } catch (langError) {
        console.warn(`Failed to fetch languages for ${repo.name}:`, langError.message);
      }
    }

    // Create skills from languages
    const createdSkills = [];
    const languageMappings = {
      'JavaScript': { category: 'Language', proficiency: 'Expert' },
      'TypeScript': { category: 'Language', proficiency: 'Advanced' },
      'Python': { category: 'Language', proficiency: 'Advanced' },
      'Java': { category: 'Language', proficiency: 'Intermediate' },
      'C++': { category: 'Language', proficiency: 'Intermediate' },
      'C#': { category: 'Language', proficiency: 'Intermediate' },
      'Go': { category: 'Language', proficiency: 'Intermediate' },
      'Rust': { category: 'Language', proficiency: 'Beginner' },
      'PHP': { category: 'Language', proficiency: 'Intermediate' },
      'Ruby': { category: 'Language', proficiency: 'Intermediate' },
      'HTML': { category: 'Language', proficiency: 'Expert' },
      'CSS': { category: 'Language', proficiency: 'Expert' },
      'SCSS': { category: 'Language', proficiency: 'Advanced' },
      'SQL': { category: 'Language', proficiency: 'Advanced' },
      'Shell': { category: 'Language', proficiency: 'Intermediate' }
    };

    for (const [language, bytes] of Object.entries(languageStats)) {
      const mapping = languageMappings[language];
      if (mapping) {
        // Check if skill already exists
        let skill = await Skill.findOne({ name: language });

        if (!skill) {
          // Calculate level based on bytes (simple heuristic)
          let level = Math.min(Math.floor(bytes / 10000) + 20, 95);

          skill = new Skill({
            name: language,
            category: mapping.category,
            proficiency: mapping.proficiency,
            level: level,
            sources: [{ type: 'github', referenceId: username }]
          });

          await skill.save();
          createdSkills.push(skill);
        }
      }
    }

    res.json({
      message: 'Auto-population completed',
      createdSkills: createdSkills.length,
      skills: createdSkills
    });
  } catch (error) {
    console.error('Auto-populate skills error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;