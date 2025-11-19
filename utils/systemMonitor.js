const mongoose = require('mongoose');
const os = require('os');
const { cache } = require('../config/cache');

class SystemMonitor {
  // Get system health status
  async getHealthStatus() {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0',
      services: {
        database: await this.checkDatabaseHealth(),
        cache: await this.checkCacheHealth()
      },
      system: this.getSystemInfo()
    };

    // Determine overall status
    if (!health.services.database.connected || !health.services.cache.healthy) {
      health.status = 'unhealthy';
    }

    return health;
  }

  // Check database health
  async checkDatabaseHealth() {
    try {
      const db = mongoose.connection;
      const ping = await db.db.admin().ping();

      return {
        connected: db.readyState === 1,
        name: db.name,
        ping: ping.ok === 1,
        collections: await db.db.listCollections().toArray().then(cols => cols.length)
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message
      };
    }
  }

  // Check cache health
  async checkCacheHealth() {
    try {
      const testKey = 'health_check_' + Date.now();
      const testValue = { test: true, timestamp: Date.now() };

      await cache.set(testKey, testValue, 10);
      const retrieved = await cache.get(testKey);
      await cache.del(testKey);

      return {
        healthy: retrieved && retrieved.test === true,
        type: 'node-cache'
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }

  // Get system information
  getSystemInfo() {
    return {
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      hostname: os.hostname(),
      cpus: os.cpus().length,
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem(),
        usagePercent: Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100)
      },
      loadAverage: os.loadavg(),
      nodeVersion: process.version
    };
  }

  // Get application metrics
  async getMetrics() {
    const metrics = {
      timestamp: new Date().toISOString(),
      process: {
        pid: process.pid,
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        uptime: process.uptime()
      },
      database: await this.getDatabaseMetrics(),
      cache: await this.getCacheMetrics()
    };

    return metrics;
  }

  // Get database metrics
  async getDatabaseMetrics() {
    try {
      const db = mongoose.connection.db;
      const stats = await db.stats();

      return {
        collections: stats.collections,
        objects: stats.objects,
        dataSize: stats.dataSize,
        storageSize: stats.storageSize,
        indexes: stats.indexes,
        indexSize: stats.indexSize
      };
    } catch (error) {
      return {
        error: error.message
      };
    }
  }

  // Get cache metrics
  async getCacheMetrics() {
    try {
      // This is a basic implementation - would need more sophisticated metrics
      return {
        type: 'node-cache',
        status: 'operational'
      };
    } catch (error) {
      return {
        error: error.message
      };
    }
  }

  // Get content statistics
  async getContentStatistics() {
    try {
      const stats = {
        timestamp: new Date().toISOString(),
        collections: {}
      };

      // Get counts for all main collections
      const collections = ['heroes', 'abouts', 'educations', 'projects', 'skills', 'certifications', 'contacts'];

      for (const collection of collections) {
        try {
          const Model = require(`../models/${collection.slice(0, -1)}`);
          const count = await Model.countDocuments();
          const activeCount = await Model.countDocuments({ isActive: true });
          stats.collections[collection] = {
            total: count,
            active: activeCount
          };
        } catch (error) {
          stats.collections[collection] = {
            error: error.message
          };
        }
      }

      return stats;
    } catch (error) {
      return {
        error: error.message
      };
    }
  }
}

module.exports = new SystemMonitor();