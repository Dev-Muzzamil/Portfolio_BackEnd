const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
require('dotenv').config();

const app = express();

// ========================================
// DATABASE CONNECTION
// ========================================
const rawUri = process.env.MONGODB_ATLAS_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/portfolio';

// Mask URI for logs (don't print credentials)
function maskUri(uri) {
  try {
    const u = new URL(uri.replace('mongodb+srv://', 'http://'));
    const host = u.host || u.hostname;
    return `${u.protocol}//${host}`;
  } catch (e) {
    return 'mongodb://<masked-host>';
  }
}

const masked = maskUri(rawUri);
console.log(`🔗 Attempting MongoDB connection to ${masked}`);

const connectWithRetry = (uri, retries = 3, delayMs = 3000) => {
  return mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('✅ MongoDB connected successfully'))
    .catch(err => {
      console.error('❌ MongoDB connection error:', err && err.message);
      if (retries > 0) {
        console.log(`Retrying connection in ${delayMs}ms... (${retries} retries left)`);
        return new Promise(resolve => setTimeout(resolve, delayMs)).then(() => connectWithRetry(uri, retries - 1, delayMs));
      }
      console.error('All MongoDB connection retries failed. Exiting...');
      process.exit(1);
    });
};

const dbConnectPromise = connectWithRetry(rawUri);

// After DB connects, ensure a default settings document exists
dbConnectPromise.then(async () => {
  try {
    const Setting = require('./models/Setting')
    const existing = await Setting.findOne({ key: 'site' })
    if (!existing) {
      await Setting.create({ key: 'site' })
      console.log('✅ Default site settings created')
    }
  } catch (err) {
    console.debug('Failed to ensure default settings:', err && err.message)
  }
}).catch(() => {})

// ========================================
// MIDDLEWARE
// ========================================

// Security middleware
app.use(helmet());

// Parse multiple frontend URLs from environment variable
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map(url => url.trim());

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Rate limiting
const RATE_LIMIT_DISABLED = String(process.env.RATE_LIMIT_DISABLED || '').toLowerCase() === 'true';
if (!RATE_LIMIT_DISABLED) {
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req, res) => {
        if (req.method === 'OPTIONS') return true;
        const authHeader = req.headers['authorization'] || '';
        if (authHeader.startsWith('Bearer ')) return true; // allow authenticated users (admin dashboard)
        return false;
      },
      message: 'Too many requests from this IP, please try again later.'
  });
    app.use('/api/', limiter);
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Data sanitization
app.use(mongoSanitize());
app.use(xss());
app.use(hpp());

// ========================================
// OPTIMIZED ROUTES
// ========================================

// Import optimized routes (safe: don't throw if missing)
let adminRoutes = null;
let publicRoutes = null;
try {
  adminRoutes = require('./routes/admin/optimized');
} catch (e) {
  console.warn('Optimized admin routes not found:', e && e.message);
  adminRoutes = null;
}

try {
  publicRoutes = require('./routes/public/optimized');
} catch (e) {
  console.warn('Optimized public routes not found:', e && e.message);
  publicRoutes = null;
}

// Authentication routes are loaded from routes/auth.js via the auto-mount below

if (adminRoutes) app.use('/api/v1/admin', adminRoutes);
if (publicRoutes) app.use('/api/v1/public', publicRoutes);

// Fallback: if optimized public/admin routes are not available, auto-load individual route files
const fs = require('fs');
const path = require('path');
if (!publicRoutes) {
  try {
    const publicRouter = require('express').Router();
    const routesDir = path.join(__dirname, 'routes');
    if (fs.existsSync(routesDir)) {
      const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));
      files.forEach(file => {
        try {
          const routePath = `/${path.basename(file, '.js')}`;
          const routeModule = require(path.join(routesDir, file));
          // Special case: auth should be mounted at /api/v1/auth
          if (path.basename(file, '.js') === 'auth') {
            app.use('/api/v1/auth', routeModule);
            console.log('Mounted', file, '-> /api/v1/auth');
          } else {
            // Wrap public routes so only safe methods are allowed for public access
            // Admin/full-CRUD endpoints remain available under /api/v1/admin
            publicRouter.use(routePath,
              (req, res, next) => {
                // Allow only read-only methods for public API
                if (req.method !== 'GET' && req.method !== 'HEAD') {
                  return res.status(403).json({ message: 'Public read-only endpoint' });
                }
                next();
              },
              routeModule
            );
            console.log('Mounted', file, '-> /api/v1/public' + routePath, '(read-only)');
          }
        } catch (err) {
          console.warn('Failed to mount route', file, '-', err && err.message);
        }
      });
      app.use('/api/v1/public', publicRouter);
    }
  } catch (err) {
    console.warn('Auto-mount public routes failed:', err && err.message);
  }
}

if (!adminRoutes) {
  try {
    // It's fine to reuse the same route files under /api/v1/admin so admin-only handlers inside routes work.
    const adminRouter = require('express').Router();
    const rootRouter = require('express').Router();
    const routesDir = path.join(__dirname, 'routes');
    if (fs.existsSync(routesDir)) {
      const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));
      files.forEach(file => {
        try {
          const routePath = `/${path.basename(file, '.js')}`;
          const routeModule = require(path.join(routesDir, file));
          // Skip auth (already mounted at /api/v1/auth)
          if (path.basename(file, '.js') === 'auth') return;
          adminRouter.use(routePath, routeModule);
          rootRouter.use(routePath, routeModule);
          console.log('Mounted', file, '-> /api/v1/admin' + routePath);
          console.log('Mounted', file, '-> /api/v1' + routePath);
        } catch (err) {
          console.warn('Failed to mount admin route', file, '-', err && err.message);
        }
      });
      app.use('/api/v1/admin', adminRouter);
      app.use('/api/v1', rootRouter);
      
    }
  } catch (err) {
    console.warn('Auto-mount admin routes failed:', err && err.message);
  }
}

// ========================================
// HEALTH CHECK
// ========================================
app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date(), uptime: process.uptime(), version: '1.0.0' });
});

// Minimal health endpoint for container orchestrators / Docker
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// ERROR HANDLING
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found', code: 'ROUTE_NOT_FOUND' });
});

// SERVER START
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log('🚀 Optimized API Server running on port', PORT);
  // Schedule periodic screenshot refresh of stale projects if CRON_SECRET is configured
  const cronSecret = process.env.CRON_SECRET;
  const refreshMs = 6 * 60 * 60 * 1000; // 6 hours
  const target = `http://localhost:${PORT}/api/v1/admin/projects/generate-screenshots?onlyStale=true`;

  async function triggerRefresh() {
    try {
      const res = await fetch(target, {
        method: 'POST',
        headers: cronSecret ? { 'x-cron-key': cronSecret } : {},
        timeout: 10000
      });
      if (!res.ok) {
        console.debug(`Screenshot refresh returned ${res.status}`);
      } else {
        const txt = await res.text();
        console.log('🖼️  Screenshot refresh:', res.status, txt.slice(0, 180));
      }
    } catch (e) {
      console.debug('Screenshot refresh skipped:', e && e.message);
    }
  }

  // Kick off once after startup (delayed) to avoid cold DB - but don't let it crash the server
  if (cronSecret) {
    setTimeout(() => {
      triggerRefresh().catch(err => console.warn('Unhandled refresh error:', err && err.message));
    }, 60_000);
    // Repeat every 6 hours only if CRON_SECRET is set
    setInterval(() => {
      triggerRefresh().catch(err => console.warn('Unhandled refresh error:', err && err.message));
    }, refreshMs);
  } else {
    console.log('ℹ️  CRON_SECRET not set, screenshot refresh disabled');
  }
});

module.exports = app;
