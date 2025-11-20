# Portfolio Backend API

Production-ready backend API for personal portfolio website built with Node.js, Express, and MongoDB.

## Features

- 🔐 JWT Authentication with role-based access control
- 📝 Complete CRUD operations for portfolio content
- 📄 PDF generation for certificates with auto-fill
- 🖼️ Image upload and management with Cloudinary
- 📧 Contact form with email notifications and reply functionality
- 🔒 Security: Helmet, rate limiting, XSS protection, mongo sanitization
- 💾 MongoDB with Mongoose ODM
- 🚀 Production-ready with error handling and validation

## Quick Start

### Prerequisites
- Node.js (v16+)
- MongoDB (local or Atlas)
- Cloudinary account (for image uploads)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables (see Environment Variables section)

3. Seed admin user:
```bash
npm run seed:admin
```

4. Start the server:
```bash
# Production
npm start

# Development with auto-reload
npm run dev
```

## Environment Variables

Create a `.env` file in the root directory:

```env
# Database
MONGODB_ATLAS_URI=your_mongodb_connection_string
MONGODB_URI=mongodb://localhost:27017/portfolio

# JWT
JWT_SECRET=your_jwt_secret_key

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Email (Optional - for contact form)
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password
CONTACT_DISABLE_EMAIL=false

# Server
PORT=3001
FRONTEND_URL=http://localhost:3000
NODE_ENV=production

# Security (Optional)
RATE_LIMIT_DISABLED=false
```

## API Endpoints

### Public Endpoints
- `GET /api/v1/hero` - Get hero section
- `GET /api/v1/about` - Get about section with social links
- `GET /api/v1/projects` - Get all projects
- `GET /api/v1/skills` - Get all active skills
- `GET /api/v1/certifications` - Get certifications
- `GET /api/v1/resumes` - Get resumes/CVs
- `GET /api/v1/settings` - Get public site settings
- `POST /api/v1/contact` - Submit contact form

### Admin Endpoints (Requires Authentication)
- `POST /api/v1/admin/auth/login` - Admin login
- `POST /api/v1/admin/hero` - Create/update hero section
- `PUT /api/v1/admin/about` - Update about section (includes social/contact)
- `POST /api/v1/admin/projects` - Create project
- `PUT /api/v1/admin/projects/:id` - Update project
- `DELETE /api/v1/admin/projects/:id` - Delete project
- `POST /api/v1/admin/skills` - Create skill
- `PUT /api/v1/admin/skills/:id` - Update skill
- `POST /api/v1/admin/certifications` - Create certification
- `POST /api/v1/admin/upload/:section/image` - Upload images
- `POST /api/v1/admin/settings` - Update site settings
- `GET /api/v1/admin/contact` - Get all contact messages
- `PUT /api/v1/admin/contact/:id/reply` - Reply to message via email
- And more...

## Project Structure

```
backend/
├── middleware/          # Authentication & validation
├── models/              # Mongoose models
├── routes/              # API route handlers
│   ├── about.js         # About & social/contact
│   ├── auth.js          # Authentication
│   ├── certifications.js # Certificates with PDF
│   ├── contact.js       # Contact form & messages
│   ├── projects.js      # Projects CRUD
│   ├── settings.js      # Site settings
│   ├── skills.js        # Skills management
│   └── ...
├── scripts/             # Database seeding
├── utils/               # Helper functions
├── server.js            # Entry point
└── server-optimized.js  # Express app config
```

## Models

- **User** - Admin users with authentication
- **Hero** - Landing page hero section
- **About** - About section with social links, email, phone, address, custom links
- **Project** - Portfolio projects with images and tech stack
- **Skill** - Technical skills with categories
- **Certification** - Certificates with PDF generation and auto-fill
- **Education** - Educational background
- **Experience** - Work experience
- **Resume** - Resume/CV files with download tracking
- **Institute** - Educational institutions
- **Category** - Project categories
- **Contact** - Contact form submissions with reply capability
- **Setting** - Site-wide settings (logo, favicon, SEO, theme)

## Security Features

- Helmet for HTTP headers security
- Rate limiting (100 requests per 15 minutes)
- XSS protection with xss-clean
- MongoDB injection prevention
- HTTP parameter pollution protection
- CORS configuration
- JWT-based authentication
- Password hashing with bcrypt
- Input validation with express-validator

## Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon
- `npm run seed:admin` - Create admin user
- `npm run seed` - Seed dummy data for testing

## Production Deployment

### Prerequisites
1. Set `NODE_ENV=production`
2. Use strong `JWT_SECRET` (min 32 characters)
3. Configure MongoDB Atlas
4. Set up Cloudinary account
5. Configure email service (Gmail with App Password recommended)

### Deployment Platforms

**Recommended:**
- **Railway** - Easy deployment with automatic HTTPS
- **Heroku** - Free tier available, easy Git deployment
- **DigitalOcean** - App Platform or Droplets
- **AWS** - EC2 or Elastic Beanstalk
- **Render** - Modern alternative to Heroku

**Database:**
- **MongoDB Atlas** - Free tier with 512MB storage

**Media Storage:**
- **Cloudinary** - Free tier with 25GB storage

### Deployment Steps (Railway Example)

1. Push code to GitHub
2. Connect Railway to your repo
3. Add environment variables in Railway dashboard
4. Deploy automatically on push

### Docker

Build a production image and run a container locally (use `.env` or pass envs directly):

```bash
# Build (from backend/)
docker build -t portfolio-backend:latest .

# Run with .env file (exposes the port and mounts env vars)
docker run --env-file ./.env -p 5000:5000 --name portfolio-backend portfolio-backend:latest
```

Notes:
- The server uses port `5000` by default (you can override with `PORT` env var).
- Ensure `MONGODB_ATLAS_URI` or `MONGODB_URI` is configured and available to the container (via network or env).
- Puppeteer, Tesseract and Poppler are installed in the image; if you rely on a specific language for Tesseract add it via the Dockerfile.


## Development

1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and fill in values
4. Seed admin user: `npm run seed:admin`
5. Start dev server: `npm run dev`
6. Access API at `http://localhost:3001`

## License

MIT
