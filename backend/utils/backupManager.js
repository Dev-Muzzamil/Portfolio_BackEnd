const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');
const { cache } = require('../config/cache');

class BackupManager {
  constructor() {
    // Backup functionality is disabled because backup settings were removed from admin.
    this.backupDir = null
  }

  // Create backup directory if it doesn't exist
  async ensureBackupDir() {
    try {
      await fs.access(this.backupDir);
    } catch {
      await fs.mkdir(this.backupDir, { recursive: true });
    }
  }

  // Create full backup of all collections
  async createFullBackup(description = '') {
    try {
      console.warn('BackupManager.createFullBackup called but backup functionality is disabled.')
      throw new Error('Backup functionality disabled')

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = `backup-${timestamp}`;
      const backupPath = path.join(this.backupDir, backupName);

      await fs.mkdir(backupPath);

      const collections = [
        'Hero', 'About', 'Education', 'Project', 'Skill', 'Certification', 'Contact', 'User'
      ];

      const backupData = {
        metadata: {
          timestamp: new Date().toISOString(),
          description,
          version: '1.0.0',
          collections: {}
        },
        data: {}
      };

      for (const collectionName of collections) {
        try {
          const Model = require(`../models/${collectionName}`);
          const documents = await Model.find({}).lean();

          backupData.data[collectionName.toLowerCase()] = documents;
          backupData.metadata.collections[collectionName.toLowerCase()] = documents.length;

          console.log(`✅ Backed up ${documents.length} ${collectionName} documents`);
        } catch (error) {
          console.warn(`⚠️ Failed to backup ${collectionName}:`, error.message);
          backupData.metadata.collections[collectionName.toLowerCase()] = `Error: ${error.message}`;
        }
      }

      // Save backup to file
      const backupFile = path.join(backupPath, 'backup.json');
      await fs.writeFile(backupFile, JSON.stringify(backupData, null, 2));

      // Create metadata file
      const metadataFile = path.join(backupPath, 'metadata.json');
      await fs.writeFile(metadataFile, JSON.stringify(backupData.metadata, null, 2));

      console.log(`✅ Full backup created: ${backupName}`);
      return {
        success: true,
        backupName,
        path: backupPath,
        collections: backupData.metadata.collections
      };
    } catch (error) {
      console.error('Backup creation error:', error);
      throw new Error('Failed to create backup');
    }
  }

  // List all backups
  async listBackups() {
    try {
      console.warn('BackupManager.listBackups called but backup functionality is disabled')
      return []

      const items = await fs.readdir(this.backupDir);
      const backups = [];

      for (const item of items) {
        const itemPath = path.join(this.backupDir, item);
        const stat = await fs.stat(itemPath);

        if (stat.isDirectory()) {
          const metadataPath = path.join(itemPath, 'metadata.json');

          try {
            const metadataContent = await fs.readFile(metadataPath, 'utf8');
            const metadata = JSON.parse(metadataContent);

            backups.push({
              name: item,
              path: itemPath,
              created: metadata.timestamp,
              description: metadata.description,
              collections: metadata.collections,
              size: await this.getDirectorySize(itemPath)
            });
          } catch (error) {
            // If metadata doesn't exist, create basic info
            backups.push({
              name: item,
              path: itemPath,
              created: stat.birthtime.toISOString(),
              description: 'Legacy backup',
              size: await this.getDirectorySize(itemPath)
            });
          }
        }
      }

      // Sort by creation date (newest first)
      backups.sort((a, b) => new Date(b.created) - new Date(a.created));

      return backups;
    } catch (error) {
      console.error('List backups error:', error);
      throw new Error('Failed to list backups');
    }
  }

  // Restore from backup
  async restoreBackup(backupName, options = {}) {
    const { dryRun = false, collections = null } = options;

    try {
      console.warn('BackupManager.restoreBackup called but backup functionality is disabled')
      throw new Error('Backup functionality disabled')
      const backupFile = path.join(backupPath, 'backup.json');

      // Check if backup exists
      await fs.access(backupFile);

      const backupContent = await fs.readFile(backupFile, 'utf8');
      const backupData = JSON.parse(backupContent);

      const results = {
        backupName,
        timestamp: backupData.metadata.timestamp,
        restored: {},
        errors: []
      };

      const collectionsToRestore = collections || Object.keys(backupData.data);

      for (const collectionName of collectionsToRestore) {
        try {
          if (!backupData.data[collectionName]) {
            results.errors.push(`${collectionName}: No data found in backup`);
            continue;
          }

          const Model = require(`../models/${collectionName.charAt(0).toUpperCase() + collectionName.slice(1)}`);
          const documents = backupData.data[collectionName];

          if (!dryRun) {
            // Clear existing data
            await Model.deleteMany({});

            // Insert backup data
            if (documents.length > 0) {
              await Model.insertMany(documents);
            }
          }

          results.restored[collectionName] = {
            count: documents.length,
            dryRun
          };

          console.log(`${dryRun ? '📋 Would restore' : '✅ Restored'} ${documents.length} ${collectionName} documents`);
        } catch (error) {
          const errorMsg = `${collectionName}: ${error.message}`;
          results.errors.push(errorMsg);
          console.error(`❌ Failed to restore ${collectionName}:`, error.message);
        }
      }

      // Clear cache after restore
      if (!dryRun) {
        await cache.clear();
        console.log('🧹 Cache cleared after restore');
      }

      return results;
    } catch (error) {
      console.error('Restore backup error:', error);
      throw new Error('Failed to restore backup');
    }
  }

  // Get directory size
  async getDirectorySize(dirPath) {
    try {
      let totalSize = 0;

      async function calculateSize(itemPath) {
        const stat = await fs.stat(itemPath);

        if (stat.isFile()) {
          totalSize += stat.size;
        } else if (stat.isDirectory()) {
          const items = await fs.readdir(itemPath);
          for (const item of items) {
            await calculateSize(path.join(itemPath, item));
          }
        }
      }

      console.warn('BackupManager.getDirectorySize called but backup functionality is disabled')
      return 0
    } catch (error) {
      return 0;
    }
  }

  // Clean old backups
  async cleanupOldBackups(keepLast = 10) {
    try {
      const backups = []

      if (backups.length <= keepLast) {
        return { deleted: 0, message: 'No old backups to clean' };
      }

      const toDelete = backups.slice(keepLast);
      let deletedCount = 0;

      for (const backup of toDelete) {
        try {
          await fs.rm(backup.path, { recursive: true, force: true });
          deletedCount++;
          console.log(`🗑️ Deleted old backup: ${backup.name}`);
        } catch (error) {
          console.warn(`Failed to delete backup ${backup.name}:`, error.message);
        }
      }

      return {
        deleted: 0,
        kept: keepLast,
        message: 'Backup functionality disabled'
      };
    } catch (error) {
      console.error('Cleanup error:', error);
      throw new Error('Failed to cleanup old backups');
    }
  }
}

module.exports = new BackupManager();