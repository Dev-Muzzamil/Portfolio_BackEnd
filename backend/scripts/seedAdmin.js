require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

(async function run() {
  try {
    const mongoUri = process.env.MONGODB_ATLAS_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/portfolio';
    await mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('✅ MongoDB connected');

    const email = process.env.ADMIN_EMAIL || 'admin@example.com';
    const username = process.env.ADMIN_USERNAME || 'admin';
    const password = process.env.ADMIN_PASSWORD || 'admin123';

    let user = await User.findOne({ email });
    if (user) {
      console.log(`ℹ️  Admin already exists: ${email}`);
    } else {
      user = await User.create({ email, username, password, role: 'admin', isActive: true });
      console.log(`✅ Admin created: ${email}`);
      console.log('⚠️ Note: Password is stored as provided (no hashing in current User model). Use only for local/dev.');
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed admin error:', err.message);
    process.exit(1);
  }
})();
