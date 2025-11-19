const pdfParse = require('pdf-parse');
const Tesseract = require('tesseract.js');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');
const os = require('os');
const { promisify } = require('util');
const { exec } = require('child_process');
const execPromise = promisify(exec);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * PDFService - Handles PDF processing, OCR, and text extraction
 * Comprehensive service for certificate processing including extraction, conversion, and analysis
 */
class PDFService {
  static _worker = null;

  /**
   * Get or initialize Tesseract worker
   */
  static async getWorker() {
    try {
      if (!this._worker) {
        console.log('🚀 Initializing Tesseract worker...');
        this._worker = await Tesseract.createWorker();
        await this._worker.load();
        await this._worker.loadLanguage('eng');
        await this._worker.initialize('eng');
        console.log('✅ Tesseract worker ready');
      }
      return this._worker;
    } catch (error) {
      console.error('❌ Failed to initialize Tesseract worker:', error.message);
      this._worker = null;
      throw error;
    }
  }

  /**
   * Extract text from PDF buffer
   */
  static async extractTextFromPDF(pdfBuffer) {
    try {
      console.log('🔍 Extracting text from PDF...');
      
      const pdfData = await pdfParse(pdfBuffer);
      
      console.log('📄 PDF metadata:', {
        pages: pdfData.numpages,
        info: pdfData.info
      });
      
      let cleanedText = (pdfData.text || '')
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n/g, '\n')
        .trim();
      
      console.log('✅ PDF text extracted, length:', cleanedText.length);
      return {
        success: true,
        text: cleanedText || 'Certificate',
        metadata: {
          pages: pdfData.numpages,
          info: pdfData.info
        }
      };
    } catch (error) {
      console.error('❌ PDF text extraction failed:', error.message);
      // For invalid PDFs, return placeholder text instead of error
      // This allows the fallback parsing to still work
      return {
        success: true,
        text: 'Certificate',
        metadata: {
          pages: 0,
          error: error.message
        }
      };
    }
  }

  /**
   * Perform OCR on image buffer
   */
  static async performOCR(imageBuffer, mimeType) {
    try {
      console.log('🔍 Performing OCR on image...', 'MIME type:', mimeType);
      
      // Handle null/undefined mimeType
      const type = mimeType || 'application/pdf';
      
      if (type === 'application/pdf' || type.includes('pdf')) {
        return await this.extractTextFromPDF(imageBuffer);
      } else if (type && type.startsWith('image/')) {
        try {
          const worker = await this.getWorker();
          const { data: { text } } = await worker.recognize(imageBuffer);
          
          console.log('✅ OCR completed, text length:', text.length);
          return {
            success: true,
            text: text.trim()
          };
        } catch (ocrError) {
          console.warn('⚠️ OCR with worker failed, returning empty text:', ocrError.message);
          // If OCR fails, return empty text but mark as success for graceful degradation
          return {
            success: true,
            text: ''
          };
        }
      } else {
        throw new Error(`Unsupported file type: ${mimeType}`);
      }
    } catch (error) {
      console.error('❌ OCR failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Parse certificate text from OCR results
   */
  static parseCertificateText(text) {
    console.log('🔍 Parsing certificate text...');
    
    const extractedData = {
      title: '',
      issuer: '',
      issueDate: '',
      credentialId: '',
      credentialUrl: '',
      verificationUrl: '',
      skills: [],
      description: ''
    };

    let cleanText = text
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .replace(/[^\x20-\x7E\n]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    console.log('📝 Cleaned text length:', cleanText.length);

    // Extract title - multiple patterns
    const titlePatterns = [
      /Specialization\s+([A-Z][^.!?\n]{10,50})(?:\s+This)/i,
      /(?:has successfully completed|has been awarded|successfully completed).*?(?:the online, non-credit Specialization|Specialization)\s+([A-Z][^.!?\n]{10,50})(?:\s+This|$)/i,
      /(?:Certificate|Completion|Award).*?([A-Z][^.!?\n]{10,50})(?:\s+This|$)/i,
      /([A-Z][^.!?\n]{10,50})(?:\s+Specialization|\s+Course|\s+Program)/i,
      /(?:This is to certify that|Certificate of Completion|Certificate of Achievement).*?([A-Z][^.!?\n]{10,50})(?:\s+This|$)/i
    ];

    for (const pattern of titlePatterns) {
      const match = cleanText.match(pattern);
      if (match && match[1] && match[1].trim().length > 5) {
        extractedData.title = match[1].trim();
        console.log('✅ Title extracted:', extractedData.title);
        break;
      }
    }

    // Extract issuer
    const issuerPatterns = [
      /(IBM Skills Network)/i,
      /(IBM Corporation)/i,
      /(Coursera|Coursera Inc\.?)/i,
      /(Google|Microsoft|Amazon|AWS|Oracle|Adobe|Salesforce)/i,
      /(?:University|College|Institute|School).*?([A-Z][^.!?\n]{2,50})/i,
      /(?:from|by|issued by|awarded by)\s*([A-Z][^.!?\n]{2,50})/i
    ];
    
    for (const pattern of issuerPatterns) {
      const match = cleanText.match(pattern);
      if (match) {
        extractedData.issuer = (match[1] || match[0]).trim();
        console.log('✅ Issuer extracted:', extractedData.issuer);
        break;
      }
    }

    // Extract date
    const datePatterns = [
      /(\d{1,2}-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*-\d{4})/i,
      /(?:date|issued|completed|awarded).*?(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i,
      /(?:date|issued|completed|awarded).*?(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/i,
      /(?:date|issued|completed|awarded).*?(\w+ \d{1,2},? \d{4})/i
    ];

    for (const pattern of datePatterns) {
      const match = cleanText.match(pattern);
      if (match) {
        extractedData.issueDate = this.formatDate(match[1]);
        console.log('✅ Date extracted:', match[1], '-> formatted:', extractedData.issueDate);
        break;
      }
    }

    // Extract credential ID
    const credentialPatterns = [
      /coursera\.org\/verify\/(?:specialization|course|certificate)\/([A-Z0-9]{10,20})/i,
      /specializat\s*ion\/([A-Z0-9]{10,20})/i,
      /([A-Z0-9]{10,20})(?:\s*$)/i,
      /verify.*?([A-Z0-9]{10,20})/i
    ];

    for (const pattern of credentialPatterns) {
      const match = cleanText.match(pattern);
      if (match) {
        extractedData.credentialId = match[1];
        console.log('✅ Credential ID extracted:', extractedData.credentialId);
        break;
      }
    }

    // Extract skills/technologies
    const skillKeywords = [
      'python', 'javascript', 'react', 'node', 'machine learning', 'ai', 'data science', 
      'cloud', 'aws', 'azure', 'docker', 'kubernetes', 'sql', 'database', 'web development',
      'mobile development', 'cybersecurity', 'devops', 'blockchain', 'tensorflow', 'pytorch',
      'java', 'c++', 'golang', 'rust', 'typescript', 'php', 'ruby', 'swift', 'kotlin',
      'api', 'rest', 'graphql', 'mongodb', 'postgresql', 'redis', 'elasticsearch'
    ];
    
    extractedData.skills = skillKeywords.filter(skill => 
      cleanText.toLowerCase().includes(skill)
    );

    // Extract verification URL
    const urlPatterns = [
      /(https?:\/\/coursera\.org\/verify\/specializat\s*ion\/[A-Z0-9]+)/i,
      /(coursera\.org\/verify\/specializat\s*ion\/[A-Z0-9]+)/i,
      /(https?:\/\/[^\s]+verify[^\s]*)/i,
      /(https?:\/\/[^\s]+)/i
    ];
    
    for (const pattern of urlPatterns) {
      const match = cleanText.match(pattern);
      if (match) {
        let url = match[1] || match[0];
        url = url.replace(/specializat\s+ion/g, 'specialization');
        url = url.replace(/\s+/g, '');
        extractedData.credentialUrl = url;
        extractedData.verificationUrl = url;
        console.log('✅ Verification URL extracted:', extractedData.credentialUrl);
        break;
      }
    }

    // Store first 500 chars as description
    extractedData.description = cleanText.substring(0, 500);

    console.log('✅ Certificate parsing completed');
    return extractedData;
  }

  /**
   * Format date string to YYYY-MM-DD format
   */
  static formatDate(dateString) {
    try {
      if (dateString.match(/^\d{1,2}-[A-Za-z]{3,}-\d{4}$/)) {
        const parts = dateString.split('-');
        const day = parts[0].padStart(2, '0');
        const month = parts[1];
        const year = parts[2];
        
        const monthNames = {
          'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06',
          'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
        };
        
        const monthNum = monthNames[month.charAt(0).toUpperCase() + month.slice(1, 3).toLowerCase()];
        if (monthNum) {
          return `${year}-${monthNum}-${day}`;
        }
      }
      
      // Try other formats
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
      
      return '';
    } catch (error) {
      console.error('Date format error:', error);
      return '';
    }
  }

  /**
   * Process certificate file end-to-end
   */
  static async processCertificateFile(file, filename) {
    try {
      // Handle both file objects and buffers
      const originalname = file.originalname || filename || 'certificate.pdf';
      const buffer = file.buffer || file;
      const mimetype = file.mimetype || 'application/pdf';
      
      console.log('📋 Processing certificate file:', originalname);
      
      // First try to extract from filename as fallback data
      const filenameData = this.parseFilename(originalname);
      console.log('📝 Filename parsing result:', filenameData);
      
      // Extract text from file
      const extractionResult = await this.performOCR(buffer, mimetype);
      
      if (!extractionResult.success) {
        return {
          success: false,
          error: extractionResult.error
        };
      }

      // Parse certificate data
      const extractedData = this.parseCertificateText(extractionResult.text);
      
      // Enhance with filename parsing if text extraction didn't work well
      if (!extractedData.title && filenameData.title) {
        extractedData.title = filenameData.title;
      }
      if (!extractedData.issuer && filenameData.issuer) {
        extractedData.issuer = filenameData.issuer;
      }
      if (!extractedData.issueDate && filenameData.issueDate) {
        extractedData.issueDate = filenameData.issueDate;
      }
      
      return {
        success: true,
        extractedData,
        text: extractionResult.text
      };
    } catch (error) {
      console.error('❌ File processing failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Parse filename for certificate data (fallback)
   */
  static parseFilename(filename) {
    console.log('📝 Parsing filename:', filename);
    
    const extractedData = {
      title: '',
      issuer: '',
      issueDate: ''
    };

    try {
      // Remove extension
      const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
      
      // Common patterns in filenames
      // Format: Certificate_OfCompletion_MachineLearning_Google_2024.pdf
      // Or: Google_Certificate_Python_2023-12-15.pdf
      // Or: Coursera_ML_Certificate_John_Doe_Dec2023.pdf
      
      const parts = nameWithoutExt.split(/[_\-\s]+/).filter(p => p.length > 0);
      
      // Look for known certificate issuers
      const issuers = ['Coursera', 'Google', 'Microsoft', 'Amazon', 'AWS', 'IBM', 'Oracle', 'Adobe', 'Udemy', 'Pluralsight', 'Linkedin'];
      let issuerFound = false;
      for (const issuer of issuers) {
        if (nameWithoutExt.toLowerCase().includes(issuer.toLowerCase())) {
          extractedData.issuer = issuer;
          issuerFound = true;
          break;
        }
      }
      
      // Look for year (4-digit number)
      const yearMatch = nameWithoutExt.match(/(\d{4})/);
      if (yearMatch) {
        extractedData.issueDate = yearMatch[1];
      }
      
      // Try to extract title from longest word or phrase
      const words = parts.filter(p => !issuers.some(i => i.toLowerCase() === p.toLowerCase()) && !/\d{4}/.test(p));
      if (words.length > 0) {
        // Join the longest/first meaningful words as title
        extractedData.title = words.slice(0, Math.min(3, words.length)).join(' ');
      }
      
      console.log('✅ Filename parsed:', extractedData);
      return extractedData;
    } catch (error) {
      console.error('Error parsing filename:', error);
      return extractedData;
    }
  }

  /**
   * Extract first page of PDF as preview image OR process uploaded image directly
   * Handles both PDF files and direct image uploads
   */
  static async extractPDFPreviewImage(pdfBuffer, filename = 'certificate', certificateData = {}, mimeType = 'application/pdf') {
    try {
      console.log('🖼️ Processing preview image...', 'MIME type:', mimeType);
      
      const sharp = require('sharp');
      
      // If it's already an image file, use it directly
      if (mimeType && mimeType.startsWith('image/')) {
        console.log('📸 Direct image upload detected, using as-is');
        return await this._uploadPreviewImage(pdfBuffer, filename, mimeType);
      }
      
      // Otherwise, try to extract from PDF using Puppeteer
      if (mimeType === 'application/pdf' || mimeType.includes('pdf')) {
        return await this._extractPDFPreviewWithPuppeteer(pdfBuffer, filename, certificateData);
      }
      
      // Fallback: treat as image
      return await this._uploadPreviewImage(pdfBuffer, filename, 'image/png');
    } catch (error) {
      console.error('❌ Preview processing failed:', error.message);
      return {
        success: false,
        error: error.message,
        previewUrl: null
      };
    }
  }

  /**
   * Upload preview image to Cloudinary
   */
  static async _uploadPreviewImage(imageBuffer, filename, mimeType) {
    try {
      const sharp = require('sharp');
      
      // Resize to reasonable preview size
      const resizedBuffer = await sharp(imageBuffer)
        .resize(800, 1200, {
          fit: 'inside',
          withoutEnlargement: true,
          quality: 90
        })
        .png()
        .toBuffer();
      
      // Upload to Cloudinary (if configured). If upload fails or credentials missing,
      // fall back to returning a data URL so the frontend can immediately display a preview.
      let uploadResult = null;
      const hasCloudinaryConfig = process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET && process.env.CLOUDINARY_CLOUD_NAME;
      if (hasCloudinaryConfig) {
        try {
          uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({
          resource_type: 'image',
          folder: 'portfolio/certificates/previews',
          public_id: `${filename}_preview_${Date.now()}`,
          format: 'png',
          quality: 90
        }, (error, result) => {
          if (error) reject(error);
          else resolve(result);
        });
        stream.end(resizedBuffer);
          });
        } catch (uploadErr) {
          console.warn('❌ Image upload failed:', uploadErr && uploadErr.message);
          uploadResult = null;
        }
      }

      if (!uploadResult) {
        // Fallback: return data URL for immediate preview without Cloudinary
        const dataUrl = `data:image/png;base64,${resizedBuffer.toString('base64')}`;
        return {
          success: true,
          previewUrl: dataUrl,
          previewPublicId: null,
          previewBytes: resizedBuffer.length
        };
      }
      
      console.log('✅ Preview image uploaded to Cloudinary');
      return {
        success: true,
        previewUrl: uploadResult.secure_url,
        previewPublicId: uploadResult.public_id,
        previewBytes: uploadResult.bytes || null
      };
    } catch (error) {
      console.error('❌ Image upload failed:', error.message);
      return {
        success: false,
        error: error.message,
        previewUrl: null
      };
    }
  }

  /**
   * Extract PDF preview using Puppeteer (render PDF to image)
   */
  static async _extractPDFPreviewWithPuppeteer(pdfBuffer, filename, certificateData = {}) {
    try {
      const puppeteer = require('puppeteer');
      const sharp = require('sharp');
      
      console.log('🎬 Launching Puppeteer to render PDF...');
      
      const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
      });
      
      try {
        const page = await browser.newPage();
        
        // Set viewport for full-page rendering with higher DPI
        await page.setViewport({
          width: 1000,
          height: 1400,
          deviceScaleFactor: 1.5
        });
        
        // Set PDF buffer as data URL
        const base64Pdf = pdfBuffer.toString('base64');
        const pdfDataUrl = `data:application/pdf;base64,${base64Pdf}`;
        
        // Create HTML with PDF embedded and rendered
        const htmlContent = `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                * { margin: 0; padding: 0; }
                body { background: white; font-family: Arial, sans-serif; overflow: hidden; }
                #pdf-container { width: 100%; height: 100%; display: flex; justify-content: center; }
                canvas { max-width: 100%; max-height: 100%; }
              </style>
            </head>
            <body>
              <div id="pdf-container"></div>
              <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
              <script>
                pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                
                async function renderPdf() {
                  const pdfUrl = '${pdfDataUrl}';
                  const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
                  const page = await pdf.getPage(1);
                  
                  const scale = 2.0;
                  const viewport = page.getViewport({ scale });
                  
                  const canvas = document.createElement('canvas');
                  canvas.width = viewport.width;
                  canvas.height = viewport.height;
                  
                  const context = canvas.getContext('2d');
                  await page.render({ canvasContext: context, viewport }).promise;
                  
                  document.getElementById('pdf-container').appendChild(canvas);
                }
                
                renderPdf().catch(e => console.error('Render error:', e));
              </script>
            </body>
          </html>
        `;
        
        // Load HTML with longer timeout
        await page.setContent(htmlContent, { waitUntil: 'networkidle0', timeout: 60000 });
        
        // Wait for canvas to render
        try {
          await page.waitForFunction(() => {
            const canvas = document.querySelector('#pdf-container canvas');
            return canvas && canvas.width > 0;
          }, { timeout: 20000 });
        } catch (e) {
          console.warn('⚠️ Canvas timeout, taking screenshot anyway...');
        }
        
        // Small delay to ensure rendering is complete
        await page.waitForTimeout(500);
        
        // Capture the canvas content directly to preserve full resolution and avoid any clipping
        const dataUrl = await page.evaluate(() => {
          const canvas = document.querySelector('#pdf-container canvas');
          return canvas ? canvas.toDataURL('image/png') : null;
        });
        let screenshot;
        if (dataUrl) {
          const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
          screenshot = Buffer.from(base64, 'base64');
        } else {
          // Fallback: use a full page screenshot (less reliable for high resolution PDFs)
          screenshot = await page.screenshot({ type: 'png', fullPage: true });
        }
        
        console.log('✅ PDF rendered to image via Puppeteer (canvas export)');
        
        // Upload the rendered image
        return await this._uploadPreviewImage(screenshot, filename, 'image/png');
      } finally {
        await browser.close();
      }
    } catch (error) {
      console.error('❌ Puppeteer PDF extraction failed:', error.message);
      console.warn('Falling back to placeholder image generation...');
      
      // Fallback to generated placeholder if Puppeteer fails
      return await this._generatePlaceholderImage(filename, certificateData);
    }
  }

  /**
   * Generate a nice certificate placeholder image when PDF extraction fails
   */
  static async _generatePlaceholderImage(filename = 'certificate', certificateData = {}) {
    try {
      const { createCanvas } = require('canvas');
      const sharp = require('sharp');
      
      console.log('🎨 Generating certificate placeholder image...');
      
      // Create a nice-looking certificate preview placeholder
      const width = 600;
      const height = 800;
      
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');
      
      // Gradient background
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#f0f4f8');
      gradient.addColorStop(1, '#d9e4ef');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      
      // Border
      ctx.strokeStyle = '#4f46e5';
      ctx.lineWidth = 8;
      ctx.strokeRect(20, 20, width - 40, height - 40);
      
      // Inner decorative border
      ctx.strokeStyle = '#c7d2fe';
      ctx.lineWidth = 2;
      ctx.strokeRect(35, 35, width - 70, height - 70);
      
      // Title
      ctx.fillStyle = '#1e40af';
      ctx.font = 'bold 32px Arial';
      ctx.textAlign = 'center';
      const title = certificateData.title || 'Certificate';
      const titleLines = this._wrapText(ctx, title, width - 80, 28);
      titleLines.forEach((line, i) => {
        ctx.fillText(line, width / 2, 120 + i * 40);
      });
      
      // Issuer
      ctx.fillStyle = '#374151';
      ctx.font = '18px Arial';
      const issuer = certificateData.issuer || 'Issued By';
      ctx.fillText(`${issuer}`, width / 2, 250);
      
      // Date
      if (certificateData.issueDate) {
        ctx.fillStyle = '#6b7280';
        ctx.font = '14px Arial';
        const date = new Date(certificateData.issueDate).toLocaleDateString();
        ctx.fillText(`Issued: ${date}`, width / 2, 300);
      }
      
      // Credential ID
      if (certificateData.credentialId) {
        ctx.fillStyle = '#6b7280';
        ctx.font = '12px Arial';
        ctx.fillText(`ID: ${certificateData.credentialId}`, width / 2, 330);
      }
      
      // Skills section
      if (certificateData.skills && certificateData.skills.length > 0) {
        ctx.fillStyle = '#374151';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('Skills:', 60, 400);
        
        ctx.font = '12px Arial';
        ctx.fillStyle = '#4b5563';
        const skillsText = certificateData.skills
          .map(s => typeof s === 'string' ? s : s.name)
          .join(' • ');
        const skillLines = this._wrapText(ctx, skillsText, width - 120, 12);
        skillLines.forEach((line, i) => {
          ctx.fillText(line, 60, 425 + i * 20);
        });
      }
      
      // Footer decoration
      ctx.fillStyle = '#4f46e5';
      ctx.fillRect(60, height - 60, width - 120, 3);
      
      // Convert to buffer
      const imageBuffer = canvas.toBuffer('image/png');
      
      // Upload the generated image
      return await this._uploadPreviewImage(imageBuffer, filename, 'image/png');
    } catch (error) {
      console.error('❌ Placeholder generation failed:', error.message);
      return {
        success: false,
        error: error.message,
        previewUrl: null
      };
    }
  }

  /**
   * Wrap text to fit within a specified width
   */
  static _wrapText(ctx, text, maxWidth, lineHeight) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    for (let i = 0; i < words.length; i++) {
      const testLine = currentLine + (currentLine ? ' ' : '') + words[i];
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;

      if (testWidth > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = words[i];
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
    return lines;
  }

  /**
   * Convert PDF to image (1080p)
   */
  static async convertPDFToImage(pdfBuffer, filename = 'certificate') {
    try {
      console.log('🖼️ Converting PDF to 1080p image...');
      
      const pdf = require('pdf-lib');
      const sharp = require('sharp');
      const PDFDocument = pdf.PDFDocument;

      // Convert PDF to image using pdf-to-image or similar
      // For now, we'll use a simple approach: convert first page to image
      const { createCanvas } = require('canvas');
      
      // Parse PDF and extract first page
      const pdfData = await pdfParse(pdfBuffer);
      
      // Create 1080p image (1080x1440 for portrait certificate)
      const width = 1080;
      const height = 1440;
      
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');
      
      // Fill with white background
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, width, height);
      
      // Add text content from PDF
      ctx.fillStyle = 'black';
      ctx.font = 'bold 32px Arial';
      ctx.fillText('Certificate', 50, 100);
      
      ctx.font = '20px Arial';
      ctx.fillText(pdfData.text.substring(0, 500), 50, 200);
      
      const imageBuffer = canvas.toBuffer('image/png');
      
      // Upload to Cloudinary
      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({
          resource_type: 'image',
          folder: 'portfolio/certificates/generated',
          public_id: `${filename}_${Date.now()}`,
          format: 'png',
          width: width,
          height: height,
          quality: 100
        }, (error, result) => {
          if (error) reject(error);
          else resolve(result);
        });
        stream.end(imageBuffer);
      });

      console.log('✅ PDF converted to 1080p image');
      return {
        success: true,
        url: uploadResult.secure_url,
        publicId: uploadResult.public_id
      };
    } catch (error) {
      console.error('❌ PDF conversion failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate PDF thumbnail for preview
   */
  static async generatePDFThumbnail(pdfBuffer, filename) {
    try {
      console.log('🖼️ Generating PDF thumbnail...');
      
      // Use first page as thumbnail
      const { createCanvas } = require('canvas');
      
      const canvas = createCanvas(300, 400);
      const ctx = canvas.getContext('2d');
      
      // White background
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, 300, 400);
      
      // Border
      ctx.strokeStyle = '#ccc';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, 298, 398);
      
      // Placeholder text
      ctx.fillStyle = '#666';
      ctx.font = '14px Arial';
      ctx.fillText('Certificate', 20, 50);
      
      const imageBuffer = canvas.toBuffer('image/png');
      
      // Upload thumbnail
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({
          resource_type: 'image',
          folder: 'portfolio/certificates/thumbnails',
          public_id: `${filename}_thumb_${Date.now()}`,
          format: 'png'
        }, (error, result) => {
          if (error) reject(error);
          else resolve(result);
        });
        stream.end(imageBuffer);
      });

      console.log('✅ PDF thumbnail generated');
      return {
        success: true,
        thumbnailUrl: result.secure_url,
        thumbnailPublicId: result.public_id
      };
    } catch (error) {
      console.error('❌ Thumbnail generation failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = PDFService;
