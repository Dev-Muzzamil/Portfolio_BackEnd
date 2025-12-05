require('dotenv').config();
const mongoose = require('mongoose');

async function seedDummyData() {
  try {
    const mongoUri = process.env.MONGODB_ATLAS_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/portfolio';
    await mongoose.connect(mongoUri, { 
      useNewUrlParser: true, 
      useUnifiedTopology: true 
    });
    console.log('✅ MongoDB connected');

    const db = mongoose.connection.db;

    // Clear existing data
    console.log('\n🗑️  Clearing existing data...');
    const collections = await db.listCollections().toArray();
    for (const col of collections) {
      if (col.name !== 'users') {
        await db.collection(col.name).deleteMany({});
        console.log(`  Cleared ${col.name}`);
      }
    }

    // Seed Hero
    console.log('\n📝 Seeding Hero...');
    await db.collection('heros').insertOne({
      name: 'John Doe',
      tagline: 'Full Stack Developer & Tech Enthusiast',
      role: 'Senior Developer',
      backgroundImage: 'https://via.placeholder.com/1920x1080',
      resumeUrl: 'https://example.com/resume.pdf',
      ctaButtons: [
        { text: 'Download CV', url: '#', type: 'primary' },
        { text: 'View Projects', url: '#', type: 'secondary' }
      ],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    console.log('  ✅ Hero created');

    // Seed About
    console.log('📝 Seeding About...');
    await db.collection('abouts').insertOne({
      summary: 'I am a passionate full-stack developer with 5+ years of experience building scalable web applications.',
      professionalBackground: 'Started as a junior developer and now leading technical teams',
      photo: 'https://via.placeholder.com/400x400',
      keyAchievements: [
        'Led development of 20+ successful projects',
        'Mentored 10+ junior developers',
        'Improved application performance by 60%'
      ],
      email: 'john@example.com',
      phone: '+1-234-567-8900',
      location: 'San Francisco, CA',
      yearsExperience: 5,
      projectsCount: 20,
      technologiesCount: 15,
      certificatesCount: 8,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    console.log('  ✅ About created');

    // Seed Education
    console.log('📝 Seeding Education...');
    await db.collection('educations').insertMany([
      {
        degree: 'Bachelor of Science in Computer Science',
        institution: 'University of California',
        startDate: new Date('2015-09-01'),
        endDate: new Date('2019-05-31'),
        description: 'Focused on web development and software engineering',
        isActive: true,
        order: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        degree: 'Master of Science in Software Engineering',
        institution: 'Stanford University',
        startDate: new Date('2019-09-01'),
        endDate: new Date('2021-05-31'),
        description: 'Advanced topics in distributed systems and cloud computing',
        isActive: true,
        order: 2,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
    console.log('  ✅ Education created');

    // Seed Projects
    console.log('📝 Seeding Projects...');
    await db.collection('projects').insertMany([
      {
        title: 'E-Commerce Platform',
        description: 'Full-stack e-commerce solution with payment integration',
        longDescription: 'Built a complete e-commerce platform using React, Node.js, and MongoDB with Stripe payment integration',
        thumbnail: 'https://via.placeholder.com/400x300',
        images: ['https://via.placeholder.com/800x600'],
        technologies: ['React', 'Node.js', 'MongoDB', 'Stripe'],
        githubUrl: 'https://github.com/example/ecommerce',
        liveUrl: 'https://ecommerce.example.com',
        featured: true,
        isActive: true,
        order: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        title: 'Task Management App',
        description: 'Real-time collaborative task management application',
        longDescription: 'Created a real-time task management app using Vue.js, Firebase, and Socket.io',
        thumbnail: 'https://via.placeholder.com/400x300',
        images: ['https://via.placeholder.com/800x600'],
        technologies: ['Vue.js', 'Firebase', 'Socket.io'],
        githubUrl: 'https://github.com/example/taskapp',
        liveUrl: 'https://taskapp.example.com',
        featured: true,
        isActive: true,
        order: 2,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        title: 'AI Chat Bot',
        description: 'Machine learning powered chatbot application',
        longDescription: 'Developed an AI-powered chatbot using Python, TensorFlow, and FastAPI',
        thumbnail: 'https://via.placeholder.com/400x300',
        images: ['https://via.placeholder.com/800x600'],
        technologies: ['Python', 'TensorFlow', 'FastAPI'],
        githubUrl: 'https://github.com/example/chatbot',
        featured: false,
        isActive: true,
        order: 3,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
    console.log('  ✅ Projects created');

    // Seed Skills
    console.log('📝 Seeding Skills...');
    await db.collection('skills').insertMany([
      {
        category: 'Frontend',
        skills: [
          { name: 'React', proficiency: 90 },
          { name: 'Vue.js', proficiency: 85 },
          { name: 'TypeScript', proficiency: 88 },
          { name: 'Tailwind CSS', proficiency: 92 }
        ],
        isActive: true,
        order: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        category: 'Backend',
        skills: [
          { name: 'Node.js', proficiency: 90 },
          { name: 'Python', proficiency: 85 },
          { name: 'MongoDB', proficiency: 88 },
          { name: 'PostgreSQL', proficiency: 85 }
        ],
        isActive: true,
        order: 2,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        category: 'DevOps',
        skills: [
          { name: 'Docker', proficiency: 80 },
          { name: 'Kubernetes', proficiency: 75 },
          { name: 'AWS', proficiency: 82 },
          { name: 'GitHub Actions', proficiency: 85 }
        ],
        isActive: true,
        order: 3,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
    console.log('  ✅ Skills created');

    // Seed Institutes
    console.log('📝 Seeding Institutes...');
    await db.collection('institutes').insertMany([
      {
        name: 'Tech Academy',
        description: 'Leading tech training institute',
        coursesCount: 50,
        studentsCount: 1000,
        isActive: true,
        order: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Code Masters',
        description: 'Advanced programming courses',
        coursesCount: 30,
        studentsCount: 500,
        isActive: true,
        order: 2,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
    console.log('  ✅ Institutes created');

    // Seed Resumes
    console.log('📝 Seeding Resumes...');
    await db.collection('resumes').insertMany([
      {
        title: 'Full Stack Developer Resume',
        filename: 'resume-fullstack.pdf',
        url: 'https://example.com/resume-fullstack.pdf',
        size: 250,
        type: 'pdf',
        downloadCount: 42,
        isActive: true,
        isPrimary: true,
        order: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        title: 'Data Scientist Resume',
        filename: 'resume-datascience.pdf',
        url: 'https://example.com/resume-datascience.pdf',
        size: 280,
        type: 'pdf',
        downloadCount: 15,
        isActive: true,
        isPrimary: false,
        order: 2,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
    console.log('  ✅ Resumes created');

    // Seed Contacts
    console.log('📝 Seeding Contacts...');
    await db.collection('contacts').insertMany([
      {
        name: 'Jane Smith',
        email: 'jane@example.com',
        phone: '+1-555-1234',
        subject: 'Project Inquiry',
        message: 'Interested in discussing a potential project collaboration',
        isRead: false,
        isReplied: false,
        createdAt: new Date('2025-10-20'),
        updatedAt: new Date('2025-10-20')
      },
      {
        name: 'Bob Johnson',
        email: 'bob@example.com',
        phone: '+1-555-5678',
        subject: 'Job Opportunity',
        message: 'We have an exciting senior developer position for you',
        isRead: true,
        isReplied: true,
        createdAt: new Date('2025-10-18'),
        updatedAt: new Date('2025-10-19')
      },
      {
        name: 'Alice Brown',
        email: 'alice@example.com',
        subject: 'Collaboration Request',
        message: 'Would love to collaborate on an open source project',
        isRead: false,
        isReplied: false,
        createdAt: new Date('2025-10-24'),
        updatedAt: new Date('2025-10-24')
      }
    ]);
    console.log('  ✅ Contacts created');

    console.log('\n✅ All dummy data seeded successfully!');
    console.log('\n📊 Database Summary:');
    console.log('  - Hero: 1');
    console.log('  - About: 1');
    console.log('  - Education: 2');
    console.log('  - Projects: 3');
    console.log('  - Skills: 3 categories');
    console.log('  - Institutes: 2');
    console.log('  - Resumes: 2');
    console.log('  - Contacts: 3');

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error seeding data:', error.message);
    process.exit(1);
  }
}

seedDummyData();
