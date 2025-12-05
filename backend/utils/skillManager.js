const Skill = require('../models/Skill');
const Project = require('../models/Project');
const Certification = require('../models/Certification');
const Education = require('../models/Education');

class SkillManager {
  // Clean skill name helper
  _cleanSkillName(name) {
    if (!name) return '';
    let cleaned = String(name).trim();
    // Remove trailing/leading quotes and parentheses
    cleaned = cleaned.replace(/^["'()]+|["'()]+$/g, '');
    // Remove double quotes inside
    cleaned = cleaned.replace(/"+/g, '');
    // Clean up extra spaces
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    return cleaned;
  }

  // Sync skills and track sources
  async syncSkills(skillNames, source, referenceId) {
    // Normalize and dedupe skill names (preserve first-cased occurrence)
    const seen = new Map();
    const resolvedNames = [];
    for (const item of (skillNames || [])) {
      try {
        if (!item) continue;
        // If it's an object with name/_id
        if (typeof item === 'object') {
          if (item._id) {
            const existing = await Skill.findById(item._id);
            if (existing && existing.name) {
              const k = existing.name.toLowerCase();
              if (!seen.has(k)) { seen.set(k, existing.name); resolvedNames.push(existing.name); }
              continue;
            }
          }
          if (item.name) {
            const n = String(item.name).trim();
            const k = n.toLowerCase();
            if (!seen.has(k)) { seen.set(k, n); resolvedNames.push(n); }
            continue;
          }
        }
        const itemStr = this._cleanSkillName(String(item || ''));
        if (!itemStr) continue;
        // If it looks like an ObjectId, try resolving to an existing skill doc
        if (/^[0-9a-fA-F]{24}$/.test(itemStr)) {
          const existing = await Skill.findById(itemStr);
          if (existing && existing.name) {
            const k = existing.name.toLowerCase();
            if (!seen.has(k)) { seen.set(k, existing.name); resolvedNames.push(existing.name); }
            continue;
          }
        }
        const k = itemStr.toLowerCase();
        if (!seen.has(k)) { seen.set(k, itemStr); resolvedNames.push(itemStr); }
      } catch (err) {
        // ignore problematic entries
      }
    }
    const names = resolvedNames;

    const syncedSkills = [];

    for (const skillName of names) {
      // try to find by exact name match; fallback to case-insensitive match
      let skill = await Skill.findOne({ name: skillName });
      if (!skill) {
        skill = await Skill.findOne({ name: { $regex: new RegExp(`^${skillName}$`, 'i') } });
      }

      if (!skill) {
        // Create new skill with a guessed category based on the name
        const cleanName = this._cleanSkillName(skillName);
        if (!cleanName) continue;
        const guessedCategory = this._getCategoryForSkillName(cleanName);
        skill = new Skill({
          name: cleanName,
          category: guessedCategory,
          proficiency: 'Beginner',
          sources: [{ type: source, referenceId }]
        });
      } else {
        // Add source if not already present
        const existingSource = skill.sources.find(s => s.referenceId.toString() === referenceId.toString());
        if (!existingSource) {
          skill.sources.push({ type: source, referenceId });
        }
      }

      await skill.save();
      syncedSkills.push(skill);
    }

    return syncedSkills;
  }

  // Resolve an identifier (id or name) to a Skill document
  async _resolveSkill(identifier) {
    if (!identifier) return null;
    // If an object with a 'name' prop is passed (e.g., embedded skill), use that
    if (typeof identifier === 'object' && identifier !== null) {
      if (identifier.name) {
        const byName = await Skill.findOne({ name: { $regex: new RegExp(`^${String(identifier.name).trim()}$`, 'i') } });
        return byName;
      }
      // If object contains _id property
      if (identifier._id) {
        const byId = await Skill.findById(identifier._id);
        if (byId) return byId;
      }
    }
    // If it looks like an ObjectId, try find by ID first
    if (String(identifier).match(/^[0-9a-fA-F]{24}$/)) {
      const byId = await Skill.findById(identifier);
      if (byId) return byId;
    }
    // Otherwise, try match by name (case-insensitive)
    const byName = await Skill.findOne({ name: { $regex: new RegExp(`^${String(identifier).trim()}$`, 'i') } });
    return byName;
  }

  // Heuristics to determine a category for a skill name. We return one of the
  // admin-accepted category strings or fallback to 'Other'. Keep this simple
  // and conservative; admins can always move items manually.
  _getCategoryForSkillName(skillName) {
    if (!skillName) return 'Other';
    const name = String(skillName).toLowerCase().trim();

    // Language keywords
    const languageKeywords = ['javascript', 'typescript', 'python', 'java', 'c#', 'c++', 'go', 'rust', 'php', 'ruby', 'kotlin', 'swift', 'dart', 'sql', 'html', 'css'];
    if (languageKeywords.some(k => name === k || name.includes(k))) return 'Language';

    // Frameworks / Libraries
    const frameworkKeywords = ['react', 'next', 'next.js', 'vue', 'nuxt', 'angular', 'svelte', 'redux', 'tailwind', 'bootstrap', 'material ui', 'mui', 'express', 'nestjs', 'django', 'flask', 'fastapi', 'laravel', 'spring', 'spring boot'];
    if (frameworkKeywords.some(k => name === k || name.includes(k))) return 'Framework / Library';

    // Databases
    const databaseKeywords = ['mongodb', 'mongoose', 'mysql', 'postgresql', 'postgres', 'sqlite', 'redis', 'oracle', 'mariadb', 'firebase', 'supabase'];
    if (databaseKeywords.some(k => name === k || name.includes(k))) return 'Database';

    // DevOps / Cloud
    const devopsKeywords = ['docker', 'kubernetes', 'k8s', 'aws', 'azure', 'gcp', 'github actions', 'gitlab ci', 'jenkins', 'ci/cd', 'terraform'];
    if (devopsKeywords.some(k => name === k || name.includes(k))) return 'DevOps / Cloud';

    // Tooling
    const toolingKeywords = ['git', 'github', 'gitlab', 'bitbucket', 'vscode', 'visual studio', 'webstorm', 'eslint', 'prettier', 'webpack', 'vite', 'rollup', 'babel'];
    if (toolingKeywords.some(k => name === k || name.includes(k))) return 'Tooling';

    // Testing
    const testingKeywords = ['jest', 'mocha', 'chai', 'vitest', 'cypress', 'playwright', 'selenium', 'testing library', 'react testing library'];
    if (testingKeywords.some(k => name === k || name.includes(k))) return 'Testing';

    // UI / UX
    const uiuxKeywords = ['figma', 'adobe xd', 'sketch', 'framer', 'tailwind ui', 'chakra ui'];
    if (uiuxKeywords.some(k => name === k || name.includes(k))) return 'UI / UX';

    return 'Other';
  }

  // Remove skill source reference
  async removeSkillSource(skillId, source, referenceId) {
    // Accept a skill ID or a skill name
    const skill = await this._resolveSkill(skillId);
    if (!skill) return;

    skill.sources = skill.sources.filter(s =>
      !(s.type === source && s.referenceId.toString() === referenceId.toString())
    );

    // If no sources left and not manually created, consider deactivating
    if (skill.sources.length === 0) {
      const manualSource = skill.sources.find(s => s.type === 'manual');
      if (!manualSource) {
        skill.isActive = false;
      }
    }

    await skill.save();
    return skill;
  }

  // Get all references to a skill
  async getSkillReferences(skillId) {
    // Accept a skill ID or a skill name
    const skill = await this._resolveSkill(skillId);
    if (!skill) return { projects: [], certifications: [], education: [] };

    const skillName = skill.name;
    const references = {
      projects: [],
      certifications: [],
      education: []
    };

    // Find projects that reference this skill
    // Projects may reference skills by ID (skills array) or by name (technologies)
    const projects = await Project.find({
      $or: [
        { skills: skill._id },
        { technologies: { $regex: new RegExp(`^${skillName}$`, 'i') } }
      ]
    });
    references.projects = projects.map(p => ({
      id: p._id,
      title: p.title,
      isActive: p.isActive
    }));

    // Find certifications that reference this skill
    // Certifications may store skills as embedded objects (by name) or as IDs
    const certifications = await Certification.find({
      $or: [
        { 'skills._id': skill._id },
        { 'skills.name': { $regex: new RegExp(`^${skillName}$`, 'i') } }
      ]
    });
    references.certifications = certifications.map(c => ({
      id: c._id,
      title: c.title,
      isActive: c.isActive
    }));

    // Find education that reference this skill
    const education = await Education.find({
      $or: [
        { skills: skill._id },
        { skills: { $regex: new RegExp(`^${skillName}$`, 'i') } }
      ]
    });
    references.education = education.map(e => ({
      id: e._id,
      degree: e.degree,
      field: e.field,
      isActive: e.isActive
    }));

    return references;
  }

  // Check if skill can be safely deleted
  async canDeleteSkill(skillId) {
    const references = await this.getSkillReferences(skillId);

    const activeReferences = [
      ...references.projects.filter(p => p.isActive),
      ...references.certifications.filter(c => c.isActive),
      ...references.education.filter(e => e.isActive)
    ];

    return {
      canDelete: activeReferences.length === 0,
      activeReferences,
      totalReferences: references.projects.length + references.certifications.length + references.education.length
    };
  }

  // Cascade hide skill (set isActive: false)
  async hideSkill(skillId) {
    const skill = await this._resolveSkill(skillId);
    if (!skill) throw new Error('Skill not found');

    skill.isActive = false;
    await skill.save();

    return skill;
  }

  // Cascade show skill (set isActive: true)
  async showSkill(skillId) {
    const skill = await this._resolveSkill(skillId);
    if (!skill) throw new Error('Skill not found');

    skill.isActive = true;
    await skill.save();

    return skill;
  }

  // Safe delete skill (only if no active references)
  async deleteSkill(skillId, force = false) {
    const skill = await this._resolveSkill(skillId);
    if (!skill) throw new Error('Skill not found');

    if (!force) {
      const check = await this.canDeleteSkill(skill._id);
      if (!check.canDelete) {
        throw new Error(`Cannot delete skill. It is referenced by ${check.activeReferences.length} active items.`);
      }
    }

    // Remove from all inactive references that still have this skill id
    const references = await this.getSkillReferences(skillId);

    // Remove skill from projects.skills (id-based links)
    await Project.updateMany(
      { skills: skill._id },
      { $pull: { skills: skill._id } }
    );

    // Also remove the corresponding technology name from projects.technologies
    if (skill && skill.name) {
      const variants = [skill.name, String(skill.name).toLowerCase(), String(skill.name).toUpperCase()];
      await Project.updateMany(
        { technologies: { $in: variants } },
        { $pull: { technologies: { $in: variants } } }
      );
    }

    // Remove skill from certifications
    // If certifications reference skills by ID, remove them
    await Certification.updateMany(
      { 'skills._id': skill._id },
      { $pull: { skills: { _id: skill._id } } }
    );
    // Also remove embedded skill objects that reference by name
    await Certification.updateMany(
      { 'skills.name': { $regex: new RegExp(`^${skill.name}$`, 'i') } },
      { $pull: { skills: { name: skill.name } } }
    );

    // Remove skill from education entries, supporting both ID and embedded name references
    await Education.updateMany(
      { 'skills._id': skill._id },
      { $pull: { skills: { _id: skill._id } } }
    );
    await Education.updateMany(
      { 'skills.name': { $regex: new RegExp(`^${skill.name}$`, 'i') } },
      { $pull: { skills: { name: skill.name } } }
    );

    // Delete the skill
    const deletedSkill = await Skill.findByIdAndDelete(skill._id);
    return deletedSkill;
  }

  // Link skill to existing entity
  async linkSkillToEntity(skillId, entityType, entityId) {
    const skill = await this._resolveSkill(skillId);
    if (!skill) throw new Error('Skill not found');

    let entity;
    let entitySkillsField;

    switch (entityType) {
      case 'project':
        entity = await Project.findById(entityId);
        entitySkillsField = 'skills';
        break;
      case 'certification':
        entity = await Certification.findById(entityId);
        entitySkillsField = 'skills';
        break;
      case 'education':
        entity = await Education.findById(entityId);
        entitySkillsField = 'skills';
        break;
      default:
        throw new Error('Invalid entity type');
    }

    if (!entity) throw new Error(`${entityType} not found`);

    // If entity stores skill objects (e.g., certifications store embedded skill objects), compare by name
    const alreadyLinked = entity[entitySkillsField].some(s => {
      if (typeof s === 'string') return s === skill.name;
      if (s && s.name) return (s.name || '').toLowerCase() === (skill.name || '').toLowerCase();
      return (s.toString && s.toString() === String(skill._id));
    });
    if (alreadyLinked) {
      throw new Error('Skill is already linked to this entity');
    }

    // Add skill to entity depending on entity storage format
    if (entityType === 'project') {
      // For projects, use 'technologies' as string names
      if (!Array.isArray(entity.technologies)) entity.technologies = [];
      if (!entity.technologies.includes(skill.name)) entity.technologies.push(skill.name);
    } else if (entityType === 'certification' || entityType === 'education') {
      // Embed skill object in certification/education
      if (!Array.isArray(entity[entitySkillsField])) entity[entitySkillsField] = [];
      entity[entitySkillsField].push({ name: skill.name, proficiency: skill.proficiency || 'intermediate', verified: true });
    } else {
      // default to pushing id
      entity[entitySkillsField].push(skill._id);
    }
    await entity.save();

    // Add source reference to skill
    const existingSource = skill.sources.find(s =>
      s.type === entityType && s.referenceId.toString() === entityId.toString()
    );

    if (!existingSource) {
      skill.sources.push({ type: entityType, referenceId: entityId });
      await skill.save();
    }

    return { skill, entity };
  }

  // Unlink skill from entity
  async unlinkSkillFromEntity(skillId, entityType, entityId) {
    const skill = await this._resolveSkill(skillId);
    if (!skill) throw new Error('Skill not found');

    let entity;
    let entitySkillsField;

    switch (entityType) {
      case 'project':
        entity = await Project.findById(entityId);
        entitySkillsField = 'skills';
        break;
      case 'certification':
        entity = await Certification.findById(entityId);
        entitySkillsField = 'skills';
        break;
      case 'education':
        entity = await Education.findById(entityId);
        entitySkillsField = 'skills';
        break;
      default:
        throw new Error('Invalid entity type');
    }

    if (!entity) throw new Error(`${entityType} not found`);

    // Remove skill from entity depending on storage format
    if (entityType === 'project') {
      if (Array.isArray(entity.technologies)) {
        entity.technologies = entity.technologies.filter(t => String(t).toLowerCase() !== skill.name.toLowerCase());
      }
    } else if (entityType === 'certification' || entityType === 'education') {
      if (Array.isArray(entity[entitySkillsField])) {
        entity[entitySkillsField] = entity[entitySkillsField].filter(s => {
          if (!s) return false;
          if (typeof s === 'string') return s.toLowerCase() !== skill.name.toLowerCase();
          if (s.name) return (s.name || '').toLowerCase() !== (skill.name || '').toLowerCase();
          if (s._id) return s._id.toString() !== skill._id.toString();
          return true;
        });
      }
    } else {
      // Default id-based removal
      entity[entitySkillsField] = entity[entitySkillsField].filter(id => id.toString() !== skill._id.toString());
    }
    await entity.save();

    // Remove source reference from skill
    skill.sources = skill.sources.filter(s =>
      !(s.type === entityType && s.referenceId.toString() === entityId.toString())
    );

    // Deactivate skill if no sources left and not manually created
    if (skill.sources.length === 0) {
      const manualSource = skill.sources.find(s => s.type === 'manual');
      if (!manualSource) {
        skill.isActive = false;
      }
    }

    await skill.save();

    return { skill, entity };
  }

  // Bulk link skills to entity
  async bulkLinkSkillsToEntity(skillIds, entityType, entityId) {
    const results = [];

    for (const skillId of skillIds) {
      try {
        const result = await this.linkSkillToEntity(skillId, entityType, entityId);
        results.push({ skillId, status: 'success', data: result });
      } catch (error) {
        results.push({ skillId, status: 'error', error: error.message });
      }
    }

    return results;
  }

  // Bulk unlink skills from entity
  async bulkUnlinkSkillsFromEntity(skillIds, entityType, entityId) {
    const results = [];

    for (const skillId of skillIds) {
      try {
        const result = await this.unlinkSkillFromEntity(skillId, entityType, entityId);
        results.push({ skillId, status: 'success', data: result });
      } catch (error) {
        results.push({ skillId, status: 'error', error: error.message });
      }
    }

    return results;
  }

  // Get skill usage statistics
  async getSkillUsageStats(skillId) {
    const references = await this.getSkillReferences(skillId);

    return {
      totalProjects: references.projects.length,
      activeProjects: references.projects.filter(p => p.isActive).length,
      totalCertifications: references.certifications.length,
      activeCertifications: references.certifications.filter(c => c.isActive).length,
      totalEducation: references.education.length,
      activeEducation: references.education.filter(e => e.isActive).length,
      totalReferences: references.projects.length + references.certifications.length + references.education.length,
      activeReferences: references.projects.filter(p => p.isActive).length +
        references.certifications.filter(c => c.isActive).length +
        references.education.filter(e => e.isActive).length
    };
  }

  // Clean up orphaned skill references
  async cleanupOrphanedReferences() {
    const results = {
      cleanedProjects: 0,
      cleanedCertifications: 0,
      cleanedEducation: 0,
      deactivatedSkills: 0
    };

    // Get all existing skill IDs and names
    const existingSkillDocs = await Skill.find({}, '_id name');
    const skillIdSet = new Set(existingSkillDocs.map(s => s._id.toString()));
    const skillNameSet = new Set(existingSkillDocs.map(s => String(s.name).toLowerCase()));

    // Clean projects: projects may store technologies (strings) or skills (ids)
    const projects = await Project.find({ $or: [{ skills: { $exists: true, $ne: [] } }, { technologies: { $exists: true, $ne: [] } }] });
    for (const project of projects) {
      let changed = false;
      if (Array.isArray(project.skills)) {
        const originalCount = project.skills.length;
        project.skills = project.skills.filter(skillId => skillIdSet.has(String(skillId)));
        if (project.skills.length !== originalCount) changed = true;
      }
      if (Array.isArray(project.technologies)) {
        const originalCount = project.technologies.length;
        project.technologies = project.technologies.filter(t => t && skillNameSet.has(String(t).toLowerCase()));
        if (project.technologies.length !== originalCount) changed = true;
      }
      if (changed) {
        await project.save();
        results.cleanedProjects++;
      }
    }

    // Clean certifications: support embedded skill objects with names and id references
    const certifications = await Certification.find({ skills: { $exists: true, $ne: [] } });
    for (const certification of certifications) {
      const originalCount = certification.skills.length;
      certification.skills = certification.skills.filter(s => {
        if (!s) return false;
        if (typeof s === 'string') return skillNameSet.has(String(s).toLowerCase());
        if (s._id) return skillIdSet.has(String(s._id));
        if (s.name) return skillNameSet.has(String(s.name).toLowerCase());
        return false;
      });
      if (certification.skills.length !== originalCount) {
        await certification.save();
        results.cleanedCertifications++;
      }
    }

    // Clean education: support string names and id references
    if (entityType === 'project') {
      // For projects, use 'technologies' as string names
      if (!Array.isArray(entity.technologies)) entity.technologies = [];
      if (!entity.technologies.includes(skill.name)) entity.technologies.push(skill.name);
    } else if (entityType === 'certification' || entityType === 'education') {
      // Embed skill object in certification/education
      if (!Array.isArray(entity[entitySkillsField])) entity[entitySkillsField] = [];
      entity[entitySkillsField].push({ name: skill.name, proficiency: skill.proficiency || 'intermediate', verified: true });
    } else {
      // default to pushing id
      entity[entitySkillsField].push(skill._id);
    }
    await entity.save();

    // Add source reference to skill
    const existingSource = skill.sources.find(s =>
      s.type === entityType && s.referenceId.toString() === entityId.toString()
    );

    if (!existingSource) {
      skill.sources.push({ type: entityType, referenceId: entityId });
      await skill.save();
    }

    return { skill, entity };
  }

  // Unlink skill from entity
  async unlinkSkillFromEntity(skillId, entityType, entityId) {
    const skill = await this._resolveSkill(skillId);
    if (!skill) throw new Error('Skill not found');

    let entity;
    let entitySkillsField;

    switch (entityType) {
      case 'project':
        entity = await Project.findById(entityId);
        entitySkillsField = 'skills';
        break;
      case 'certification':
        entity = await Certification.findById(entityId);
        entitySkillsField = 'skills';
        break;
      case 'education':
        entity = await Education.findById(entityId);
        entitySkillsField = 'skills';
        break;
      default:
        throw new Error('Invalid entity type');
    }

    if (!entity) throw new Error(`${entityType} not found`);

    // Remove skill from entity depending on storage format
    if (entityType === 'project') {
      if (Array.isArray(entity.technologies)) {
        entity.technologies = entity.technologies.filter(t => String(t).toLowerCase() !== skill.name.toLowerCase());
      }
    } else if (entityType === 'certification' || entityType === 'education') {
      if (Array.isArray(entity[entitySkillsField])) {
        entity[entitySkillsField] = entity[entitySkillsField].filter(s => {
          if (!s) return false;
          if (typeof s === 'string') return s.toLowerCase() !== skill.name.toLowerCase();
          if (s.name) return (s.name || '').toLowerCase() !== (skill.name || '').toLowerCase();
          if (s._id) return s._id.toString() !== skill._id.toString();
          return true;
        });
      }
    } else {
      // Default id-based removal
      entity[entitySkillsField] = entity[entitySkillsField].filter(id => id.toString() !== skill._id.toString());
    }
    await entity.save();

    // Remove source reference from skill
    skill.sources = skill.sources.filter(s =>
      !(s.type === entityType && s.referenceId.toString() === entityId.toString())
    );

    // Deactivate skill if no sources left and not manually created
    if (skill.sources.length === 0) {
      const manualSource = skill.sources.find(s => s.type === 'manual');
      if (!manualSource) {
        skill.isActive = false;
      }
    }

    await skill.save();

    return { skill, entity };
  }

  // Bulk link skills to entity
  async bulkLinkSkillsToEntity(skillIds, entityType, entityId) {
    const results = [];

    for (const skillId of skillIds) {
      try {
        const result = await this.linkSkillToEntity(skillId, entityType, entityId);
        results.push({ skillId, status: 'success', data: result });
      } catch (error) {
        results.push({ skillId, status: 'error', error: error.message });
      }
    }

    return results;
  }

  // Bulk unlink skills from entity
  async bulkUnlinkSkillsFromEntity(skillIds, entityType, entityId) {
    const results = [];

    for (const skillId of skillIds) {
      try {
        const result = await this.unlinkSkillFromEntity(skillId, entityType, entityId);
        results.push({ skillId, status: 'success', data: result });
      } catch (error) {
        results.push({ skillId, status: 'error', error: error.message });
      }
    }

    return results;
  }

  // Get skill usage statistics
  async getSkillUsageStats(skillId) {
    const references = await this.getSkillReferences(skillId);

    return {
      totalProjects: references.projects.length,
      activeProjects: references.projects.filter(p => p.isActive).length,
      totalCertifications: references.certifications.length,
      activeCertifications: references.certifications.filter(c => c.isActive).length,
      totalEducation: references.education.length,
      activeEducation: references.education.filter(e => e.isActive).length,
      totalReferences: references.projects.length + references.certifications.length + references.education.length,
      activeReferences: references.projects.filter(p => p.isActive).length +
        references.certifications.filter(c => c.isActive).length +
        references.education.filter(e => e.isActive).length
    };
  }

  // Clean up orphaned skill references
  async cleanupOrphanedReferences() {
    const results = {
      cleanedProjects: 0,
      cleanedCertifications: 0,
      cleanedEducation: 0,
      deactivatedSkills: 0
    };

    // Get all existing skill IDs and names
    const existingSkillDocs = await Skill.find({}, '_id name');
    const skillIdSet = new Set(existingSkillDocs.map(s => s._id.toString()));
    const skillNameSet = new Set(existingSkillDocs.map(s => String(s.name).toLowerCase()));

    // Clean projects: projects may store technologies (strings) or skills (ids)
    const projects = await Project.find({ $or: [{ skills: { $exists: true, $ne: [] } }, { technologies: { $exists: true, $ne: [] } }] });
    for (const project of projects) {
      let changed = false;
      if (Array.isArray(project.skills)) {
        const originalCount = project.skills.length;
        project.skills = project.skills.filter(skillId => skillIdSet.has(String(skillId)));
        if (project.skills.length !== originalCount) changed = true;
      }
      if (Array.isArray(project.technologies)) {
        const originalCount = project.technologies.length;
        project.technologies = project.technologies.filter(t => t && skillNameSet.has(String(t).toLowerCase()));
        if (project.technologies.length !== originalCount) changed = true;
      }
      if (changed) {
        await project.save();
        results.cleanedProjects++;
      }
    }

    // Clean certifications: support embedded skill objects with names and id references
    const certifications = await Certification.find({ skills: { $exists: true, $ne: [] } });
    for (const certification of certifications) {
      const originalCount = certification.skills.length;
      certification.skills = certification.skills.filter(s => {
        if (!s) return false;
        if (typeof s === 'string') return skillNameSet.has(String(s).toLowerCase());
        if (s._id) return skillIdSet.has(String(s._id));
        if (s.name) return skillNameSet.has(String(s.name).toLowerCase());
        return false;
      });
      if (certification.skills.length !== originalCount) {
        await certification.save();
        results.cleanedCertifications++;
      }
    }

    // Clean education: support string names and id references
    const educationItems = await Education.find({ $or: [{ skills: { $exists: true, $ne: [] } }] });
    for (const educationItem of educationItems) {
      const originalCount = (educationItem.skills || []).length;
      educationItem.skills = (educationItem.skills || []).filter(s => {
        if (!s) return false;
        if (typeof s === 'string') return skillNameSet.has(String(s).toLowerCase());
        if (s._id) return skillIdSet.has(String(s._id));
        if (s.name) return skillNameSet.has(String(s.name).toLowerCase());
        return false;
      });
      if (educationItem.skills.length !== originalCount) {
        await educationItem.save();
        results.cleanedEducation++;
      }
    }

    // Deactivate skills with no references
    const allSkills = await Skill.find({});
    for (const skill of allSkills) {
      const references = await this.getSkillReferences(skill._id);
      const hasActiveReferences = references.projects.some(p => p.isActive) ||
        references.certifications.some(c => c.isActive) ||
        references.education.some(e => e.isActive);

      if (!hasActiveReferences && !skill.sources.some(s => s.type === 'manual')) {
        skill.isActive = false;
        await skill.save();
        results.deactivatedSkills++;
      }
    }

    return results;
  }

  // Recalculate skill visibility based on active references
  async recalculateSkillVisibility(skillId) {
    const skill = await this._resolveSkill(skillId);
    if (!skill) return;

    const references = await this.getSkillReferences(skill._id);
    const hasActiveReferences = references.projects.some(p => p.isActive) ||
      references.certifications.some(c => c.isActive) ||
      references.education.some(e => e.isActive);

    const isManual = skill.sources.some(s => s.type === 'manual');

    // If it has active references OR is manually added, it should be active.
    // Otherwise, if no active references and not manual, it should be inactive.
    const shouldBeActive = hasActiveReferences || isManual;

    if (skill.isActive !== shouldBeActive) {
      skill.isActive = shouldBeActive;
      await skill.save();
      return { updated: true, skill };
    }
    return { updated: false, skill };
  }
}

module.exports = new SkillManager();