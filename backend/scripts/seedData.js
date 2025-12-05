const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Import models
const User = require('../models/user/User');
const About = require('../models/content/About');
const Project = require('../models/content/Project');
const Certificate = require('../models/content/Certificate');
const Skill = require('../models/content/Skill');

const seedDatabase = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/portfolio');
    console.log('Connected to MongoDB');

    // Create admin user if doesn't exist
    const existingAdmin = await User.findOne({ email: 'admin@portfolio.com' });
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash('admin123', 12);
      const adminUser = new User({
        username: 'admin',
        email: 'admin@portfolio.com',
        password: hashedPassword,
        role: 'admin'
      });
      await adminUser.save();
      console.log('Created admin user');
    } else {
      console.log('Admin user already exists');
    }

    // Create default about if doesn't exist
    const existingAbout = await About.findOne();
    if (!existingAbout) {
      const about = new About({
        name: 'Portfolio Admin',
        title: 'Full Stack Developer',
        bio: 'Welcome to the portfolio admin panel.',
        description: 'This is a sample portfolio description.',
        email: 'admin@portfolio.com'
      });
      await about.save();
      console.log('Created default about data');
    } else {
      console.log('About data already exists');
    }

    console.log('Database seeded successfully!');
    console.log('Admin credentials:');
    console.log('Email: admin@portfolio.com');
    console.log('Password: admin123');
    
  } catch (error) {
    console.error('Error seeding database:', error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
};

seedDatabase();


