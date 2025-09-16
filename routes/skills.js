const express = require('express');
const { body, validationResult } = require('express-validator');
const Skill = require('../models/Skill');
const Certificate = require('../models/Certificate');
const Project = require('../models/Project');
const auth = require('../middleware/auth');

const router = express.Router();

// Function to get all unified skills (certificates + projects + manual)
async function getUnifiedSkills() {
  try {
    // Get regular skills
    const regularSkills = await Skill.find({ visible: true }).sort({ order: 1, category: 1 });
    
    // Get skills from visible certificates
    const visibleCertificates = await Certificate.find({ visible: true }).select('skills title');
    const certificateSkills = [];
    visibleCertificates.forEach(certificate => {
      if (certificate.skills && certificate.skills.length > 0) {
        let skillsArray = certificate.skills;
        
        if (Array.isArray(skillsArray) && skillsArray.length === 1 && typeof skillsArray[0] === 'string' && skillsArray[0].startsWith('[')) {
          try {
            skillsArray = JSON.parse(skillsArray[0]);
          } catch (e) {
            // Keep as is if parsing fails
          }
        } else if (typeof skillsArray === 'string') {
          try {
            skillsArray = JSON.parse(skillsArray);
          } catch (e) {
            skillsArray = skillsArray.split(',').map(s => s.trim()).filter(s => s.length > 0);
          }
        }
        
        if (Array.isArray(skillsArray)) {
          skillsArray.forEach(skillName => {
            if (skillName && skillName.trim().length > 0) {
              const skillType = classifySkill(skillName.trim());
              certificateSkills.push({
                name: skillName.trim(),
                category: skillType.category,
                group: skillType.group,
                color: skillType.color,
                visible: true,
                source: 'certificate',
                sourceName: certificate.title,
                _id: `cert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
              });
            }
          });
        }
      }
    });
    
    // Get skills from visible projects
    const visibleProjects = await Project.find({ visible: true }).select('technologies title');
    const projectSkills = [];
    visibleProjects.forEach(project => {
      if (project.technologies && project.technologies.length > 0) {
        project.technologies.forEach(technology => {
          if (technology && technology.trim().length > 0) {
            const skillType = classifySkill(technology.trim());
            projectSkills.push({
              name: technology.trim(),
              category: skillType.category,
              group: skillType.group,
              color: skillType.color,
              visible: true,
              source: 'project',
              sourceName: project.title,
              _id: `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            });
          }
        });
      }
    });
    
    // Combine all skills
    const allSkills = [...regularSkills, ...certificateSkills, ...projectSkills];
    
    // Remove duplicates and combine source names
    const skillMap = new Map();
    allSkills.forEach(skill => {
      const key = skill.name.toLowerCase().trim();
      if (!skillMap.has(key)) {
        skillMap.set(key, skill);
      } else {
        const existingSkill = skillMap.get(key);
        if (existingSkill.sourceName !== skill.sourceName) {
          existingSkill.sourceName = `${existingSkill.sourceName}, ${skill.sourceName}`;
        }
      }
    });
    
    return Array.from(skillMap.values());
  } catch (error) {
    console.error('Error getting unified skills:', error);
    return [];
  }
}

// Function to classify skills by type
function classifySkill(skillName) {
  const skill = skillName.toLowerCase().trim();
  
  // Programming Languages
  if (['python', 'javascript', 'typescript', 'java', 'c++', 'c#', 'php', 'ruby', 'go', 'rust', 'swift', 'kotlin', 'scala', 'r', 'matlab', 'sql', 'html', 'css', 'sass', 'scss', 'less'].includes(skill)) {
    return { category: 'languages', group: 'languages', color: '#3B82F6' };
  }
  
  // Frameworks & Libraries
  if (['react', 'vue', 'angular', 'node.js', 'express', 'django', 'flask', 'spring', 'laravel', 'rails', 'asp.net', 'jquery', 'bootstrap', 'tailwind css', 'material-ui', 'framer motion', 'next.js', 'nuxt.js', 'svelte', 'ember.js', 'express.js', 'formik', 'yup', 'vite'].includes(skill)) {
    return { category: 'frameworks', group: 'frameworks', color: '#10B981' };
  }
  
  // Databases
  if (['mysql', 'postgresql', 'mongodb', 'redis', 'sqlite', 'oracle', 'sql server', 'mariadb', 'cassandra', 'elasticsearch', 'neo4j', 'dynamodb', 'firebase', 'supabase'].includes(skill)) {
    return { category: 'databases', group: 'databases', color: '#8B5CF6' };
  }
  
  // Cloud & DevOps
  if (['aws', 'azure', 'google cloud', 'docker', 'kubernetes', 'jenkins', 'gitlab', 'github actions', 'terraform', 'ansible', 'nginx', 'apache', 'linux', 'ubuntu', 'centos'].includes(skill)) {
    return { category: 'cloud', group: 'cloud', color: '#F59E0B' };
  }
  
  // AI/ML Tools
  if (['tensorflow', 'pytorch', 'scikit-learn', 'pandas', 'numpy', 'opencv', 'nltk', 'spacy', 'hugging face', 'keras', 'xgboost', 'lightgbm', 'catboost', 'ai', 'machine learning', 'deep learning', 'computer vision', 'nlp', 'data analysis', 'data science'].includes(skill)) {
    return { category: 'ai-ml', group: 'ai-ml', color: '#EC4899' };
  }
  
  // Development Tools
  if (['git', 'github', 'gitlab', 'bitbucket', 'vscode', 'intellij', 'webstorm', 'postman', 'insomnia', 'figma', 'adobe xd', 'sketch', 'zeplin'].includes(skill)) {
    return { category: 'tools', group: 'tools', color: '#6B7280' };
  }
  
  // Security
  if (['cybersecurity', 'penetration testing', 'ethical hacking', 'owasp', 'ssl', 'tls', 'encryption', 'vulnerability assessment', 'security auditing', 'network security', 'vulnerabilities'].includes(skill)) {
    return { category: 'security', group: 'security', color: '#EF4444' };
  }
  
  // Methodologies & Concepts
  if (['agile', 'scrum', 'devops', 'ci/cd', 'microservices', 'api development', 'rest', 'graphql', 'oauth', 'jwt', 'tcp/ip', 'http', 'https', 'compliance', 'frameworks', 'standards', 'regulations', 'system administration', 'operating system', 'networking', 'cryptography', 'digital forensics'].includes(skill)) {
    return { category: 'concepts', group: 'concepts', color: '#8B5CF6' };
  }
  
  // Data & Analytics
  if (['data analysis', 'data science', 'machine learning', 'deep learning', 'nlp', 'computer vision', 'statistics', 'data visualization', 'tableau', 'power bi'].includes(skill)) {
    return { category: 'data', group: 'data', color: '#06B6D4' };
  }
  
  // Default category
  return { category: 'other', group: 'other', color: '#6B7280' };
}

// Get all skills (public) - includes skills from visible certificates and projects
router.get('/', async (req, res) => {
  try {
    console.log('🔗 DEBUG: Fetching all unified skills');
    const allSkills = await getUnifiedSkills();
    console.log('🔗 DEBUG: Total unified skills:', allSkills.length);
    res.json(allSkills);
  } catch (error) {
    console.error('Error fetching skills:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get skills by category (public) - includes skills from visible certificates
router.get('/category/:category', async (req, res) => {
  try {
    const category = req.params.category;
    console.log('🔗 DEBUG: Fetching skills for category:', category);
    
    // Get regular skills for this category
    const regularSkills = await Skill.find({ category, visible: true }).sort({ order: 1 });
    console.log('🔗 DEBUG: Regular skills for category:', regularSkills.length);
    
    // Get all skills and filter by category
    const allSkills = await getUnifiedSkills();
    const filteredSkills = allSkills.filter(skill => skill.category === category);
    
    console.log(`🔗 DEBUG: Total skills for ${category} category:`, filteredSkills.length);
    res.json(filteredSkills);
  } catch (error) {
    console.error('Error fetching skills by category:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create skill (admin only)
router.post('/', auth, [
  body('name').notEmpty().withMessage('Name is required')
  // Other fields are now optional
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const skill = new Skill(req.body);
    await skill.save();
    res.status(201).json(skill);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Bulk delete skills (admin only) - MUST come before /:id routes
router.delete('/bulk', auth, [
  body('skillIds').isArray().withMessage('Skill IDs must be an array'),
  body('skillIds.*').isMongoId().withMessage('Invalid skill ID format')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { skillIds } = req.body;
    
    const result = await Skill.deleteMany({ _id: { $in: skillIds } });
    
    res.json({ 
      message: `${result.deletedCount} skills deleted successfully`,
      deletedCount: result.deletedCount 
    });
  } catch (error) {
    console.error('Bulk delete skills error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update skill (admin only)
router.put('/:id', auth, async (req, res) => {
  try {
    const skill = await Skill.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!skill) {
      return res.status(404).json({ message: 'Skill not found' });
    }
    
    res.json(skill);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete skill (admin only)
router.delete('/:id', auth, async (req, res) => {
  try {
    const skill = await Skill.findByIdAndDelete(req.params.id);
    
    if (!skill) {
      return res.status(404).json({ message: 'Skill not found' });
    }
    
    res.json({ message: 'Skill deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;


