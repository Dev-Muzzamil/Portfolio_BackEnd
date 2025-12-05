const { createWorker } = require('tesseract.js');
const sharp = require('sharp');

class OCRProcessor {
  constructor() {
    this.worker = null;
  }

  // Initialize OCR worker
  async initialize() {
    if (!this.worker) {
      // create a worker and initialize English language for recognition
      this.worker = createWorker();
      await this.worker.load();
      await this.worker.loadLanguage('eng');
      await this.worker.initialize('eng');
      console.log('OCR worker initialized');
    }
    return this.worker;
  }

  // Process image for OCR
  async processImage(imageBuffer, options = {}) {
    try {
      await this.initialize();

      // Preprocess image for better OCR results
      const processedBuffer = await this.preprocessImage(imageBuffer, options);

      const { data: { text, confidence } } = await this.worker.recognize(processedBuffer);

      return {
        text: text.trim(),
        confidence,
        processed: true
      };
    } catch (error) {
      console.error('OCR processing error:', error);
      throw new Error('Failed to process image with OCR');
    }
  }

  // Preprocess image for better OCR results
  async preprocessImage(imageBuffer, options = {}) {
    const { resize = true, grayscale = true, contrast = 1.2, brightness = 1.0 } = options;

    let sharpInstance = sharp(imageBuffer);

    if (resize) {
      sharpInstance = sharpInstance.resize(null, 1000, {
        withoutEnlargement: true,
        fit: 'inside'
      });
    }

    if (grayscale) {
      sharpInstance = sharpInstance.greyscale();
    }

    if (contrast !== 1.0 || brightness !== 1.0) {
      sharpInstance = sharpInstance.linear(contrast, brightness - contrast);
    }

    return await sharpInstance.png().toBuffer();
  }

  // Extract specific information from OCR text
  extractInfo(text) {
    const info = {
      email: this.extractEmail(text),
      phone: this.extractPhone(text),
      name: this.extractName(text),
      skills: this.extractSkills(text)
    };

    return info;
  }

  // Extract email from OCR text
  extractEmail(text) {
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi;
    const emails = text.match(emailRegex);
    return emails ? emails[0] : null;
  }

  // Extract phone from OCR text
  extractPhone(text) {
    const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})/g;
    const phones = text.match(phoneRegex);
    return phones ? phones[0] : null;
  }

  // Extract name from OCR text (basic implementation)
  extractName(text) {
    // Look for capitalized words at the beginning
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length > 0) {
      const firstLine = lines[0].trim();
      // Check if it looks like a name (capitalized words)
      if (/^[A-Z][a-z]+(\s+[A-Z][a-z]+)+$/.test(firstLine)) {
        return firstLine;
      }
    }
    return null;
  }

  // Extract skills from OCR text
  extractSkills(text) {
    const commonSkills = [
      'JavaScript', 'Python', 'Java', 'React', 'Node.js', 'MongoDB',
      'SQL', 'HTML', 'CSS', 'Git', 'AWS', 'Docker', 'Kubernetes',
      'Machine Learning', 'AI', 'Data Science', 'DevOps'
    ];

    const foundSkills = commonSkills.filter(skill =>
      text.toLowerCase().includes(skill.toLowerCase())
    );

    // normalize / dedupe to avoid duplicates
    const unique = Array.from(new Set(foundSkills.map(s => s.trim())));
    return unique;
  }

  // Cleanup
  async terminate() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      console.log('OCR worker terminated');
    }
  }
}

module.exports = new OCRProcessor();