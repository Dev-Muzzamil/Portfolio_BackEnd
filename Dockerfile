## Multi-stage Dockerfile for production-ready Node backend
#
# This Dockerfile builds native modules in a builder stage and creates
# a slim runtime image with required system dependencies for modules
# such as puppeteer, sharp, pdf-poppler and tesseract.

### Builder stage
FROM node:18-bullseye AS builder

WORKDIR /usr/src/app

# Install build essentials and libraries required to compile native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
		build-essential python3 make g++ curl ca-certificates gnupg \
		libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
		libpoppler-cpp-dev poppler-utils libvips-dev tesseract-ocr \
		&& rm -rf /var/lib/apt/lists/*

# Copy package files and install production dependencies
COPY package.json package-lock.json ./
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
RUN npm ci --only=production

# Copy app source
COPY . .

# Ensure native modules are built for the target platform
RUN npm rebuild --build-from-source || true

### Runtime stage
FROM node:18-bullseye-slim

WORKDIR /usr/src/app

# Install runtime packages for puppeteer, tesseract, poppler and libs used by sharp/canvas
RUN apt-get update && apt-get install -y --no-install-recommends \
		chromium fonts-liberation libnss3 libx11-xcb1 libx11-6 libxss1 libasound2 libatk1.0-0 libatk-bridge2.0-0 \
		libgtk-3-0 libdrm2 libgbm1 libxrandr2 libxcomposite1 libxcursor1 libxdamage1 ca-certificates poppler-utils tesseract-ocr libvips-dev \
		&& rm -rf /var/lib/apt/lists/*

# Set environment variables for Puppeteer to use system Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production

# Copy installed node modules from builder
COPY --from=builder /usr/src/app/node_modules ./node_modules

# Copy application code
COPY --from=builder /usr/src/app .

# Heroku dynamically assigns PORT at runtime, expose it (though Heroku ignores EXPOSE)
EXPOSE 5000

# Heroku doesn't support HEALTHCHECK - removed for compatibility
# Use Heroku's built-in health checks or endpoint monitoring instead

# Start the server - Heroku will set PORT env var dynamically
CMD ["node", "server-optimized.js"]

