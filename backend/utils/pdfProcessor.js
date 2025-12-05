const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const sharp = require('sharp');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

class PDFProcessor {
  // Extract text from PDF
  async extractText(pdfBuffer) {
    try {
      const data = await pdfParse(pdfBuffer);
      return {
        text: data.text,
        pages: data.numpages,
        info: data.info
      };
    } catch (error) {
      console.error('PDF text extraction error:', error);
      throw new Error('Failed to extract text from PDF');
    }
  }

  // Convert PDF pages to images
  async convertToImages(pdfBuffer, options = {}) {
    const { dpi = 150, format = 'png', quality = 90 } = options;

    try {
      // For now, we'll use a placeholder implementation
      // In a real implementation, you'd use pdf-poppler or similar
      console.log('PDF to image conversion would be implemented here');
      return [];
    } catch (error) {
      console.error('PDF to image conversion error:', error);
      throw new Error('Failed to convert PDF to images');
    }
  }

  // Process resume PDF and extract information
  async processResume(pdfBuffer) {
    try {
      const extractedData = await this.extractText(pdfBuffer);

      // Basic information extraction (this would be enhanced with NLP)
      const text = extractedData.text;

      const resumeData = {
        rawText: text,
        pages: extractedData.pages,
        extractedInfo: {
          email: this.extractEmail(text),
          phone: this.extractPhone(text),
          skills: this.extractSkills(text),
          experience: this.extractExperience(text)
        }
      };

      return resumeData;
    } catch (error) {
      console.error('Resume processing error:', error);
      throw new Error('Failed to process resume PDF');
    }
  }

  // Extract email from text
  extractEmail(text) {
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const emails = text.match(emailRegex);
    return emails ? emails[0] : null;
  }

  // Extract phone number from text
  extractPhone(text) {
    const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})/g;
    const phones = text.match(phoneRegex);
    return phones ? phones[0] : null;
  }

  // Extract skills from text (basic implementation)
  extractSkills(text) {
    const commonSkills = [
      'JavaScript', 'Python', 'Java', 'C++', 'React', 'Node.js', 'MongoDB',
      'SQL', 'HTML', 'CSS', 'Git', 'AWS', 'Docker', 'Kubernetes'
    ];

    const foundSkills = commonSkills.filter(skill =>
      text.toLowerCase().includes(skill.toLowerCase())
    );

    return foundSkills;
  }

  // Extract experience information
  extractExperience(text) {
    // Basic experience extraction - would need NLP for better results
    const experiencePatterns = [
      /(\d+)\+?\s*years?\s+(?:of\s+)?experience/i,
      /experience:?\s*(\d+)\+?\s*years?/i
    ];

    for (const pattern of experiencePatterns) {
      const match = text.match(pattern);
      if (match) {
        return `${match[1]} years`;
      }
    }

    return null;
  }

  // Upload PDF to Cloudinary
  async uploadPDF(pdfBuffer, filename) {
    try {
      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            resource_type: 'raw',
            folder: 'resumes',
            public_id: filename,
            format: 'pdf'
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        ).end(pdfBuffer);
      });

      return result.secure_url;
    } catch (error) {
      console.error('PDF upload error:', error);
      throw new Error('Failed to upload PDF');
    }
  }
}

module.exports = new PDFProcessor();