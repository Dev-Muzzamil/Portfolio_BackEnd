const mammoth = require('mammoth');
const pdfProcessor = require('./pdfProcessor');
const ocrProcessor = require('./ocrProcessor');

class DocumentProcessor {
  // Process Word document
  async processWordDocument(docxBuffer) {
    try {
      const result = await mammoth.extractRawText({ buffer: docxBuffer });

      return {
        text: result.value,
        messages: result.messages
      };
    } catch (error) {
      console.error('Word document processing error:', error);
      throw new Error('Failed to process Word document');
    }
  }

  // Process document and extract information
  async processDocument(buffer, mimeType) {
    try {
      let extractedText = '';
      // collected extracted info from different processors (OCR/Word/PDF)
      let extractedInfo = {};

      if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        // Word document
        const result = await this.processWordDocument(buffer);
        extractedText = result.text;
      } else if (mimeType && mimeType.startsWith('image/')) {
        // Image — OCR
        const ocrResult = await ocrProcessor.processImage(buffer);
        extractedText = ocrResult.text || '';
        // Extract info from OCR
        const ocrInfo = ocrProcessor.extractInfo(extractedText) || {};
        // merge and dedupe skills from OCR
        const merged = { ...extractedInfo, ...ocrInfo };
        if (merged.skills && Array.isArray(merged.skills)) {
          merged.skills = Array.from(new Set((merged.skills || []).map(s => String(s || '').trim()).filter(Boolean)));
        }
        extractedInfo = merged;
      } else if (mimeType === 'application/pdf') {
        // PDF document
        const result = await pdfProcessor.extractText(buffer);
        extractedText = result.text;
      } else {
        throw new Error('Unsupported document type');
      }

      // Extract information from text
      const extractedInfoFromText = this.extractDocumentInfo(extractedText);
      // Merge OCR extracted info when present (images use ocrProcessor)
      const merged = { ...(extractedInfo || {}), ...extractedInfoFromText };
      // Deduplicate skills if present
      if (merged.skills && Array.isArray(merged.skills)) {
        merged.skills = Array.from(new Set((merged.skills || []).map(s => String(s || '').trim()).filter(Boolean)));
      }

      return {
        text: extractedText,
        extractedInfo: merged,
        documentType: mimeType
      };
    } catch (error) {
      console.error('Document processing error:', error);
      throw new Error('Failed to process document');
    }
  }

  // Extract information from document text
  extractDocumentInfo(text) {
    return {
      email: this.extractEmail(text),
      phone: this.extractPhone(text),
      name: this.extractName(text),
      skills: this.extractSkills(text),
      experience: this.extractExperience(text),
      education: this.extractEducation(text)
    };
  }

  // Extract email
  extractEmail(text) {
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const emails = text.match(emailRegex);
    return emails ? emails[0] : null;
  }

  // Extract phone
  extractPhone(text) {
    const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})/g;
    const phones = text.match(phoneRegex);
    return phones ? phones[0] : null;
  }

  // Extract name
  extractName(text) {
    const lines = text.split('\n').filter(line => line.trim());
    for (const line of lines.slice(0, 5)) { // Check first 5 lines
      const trimmed = line.trim();
      // Look for name-like patterns
      if (/^[A-Z][a-z]+(\s+[A-Z][a-z]+)+$/.test(trimmed) && trimmed.length < 50) {
        return trimmed;
      }
    }
    return null;
  }

  // Extract skills
  extractSkills(text) {
    const skillCategories = {
      technical: [
        'JavaScript', 'Python', 'Java', 'C++', 'React', 'Node.js', 'MongoDB',
        'SQL', 'HTML', 'CSS', 'Git', 'AWS', 'Docker', 'Kubernetes', 'Linux'
      ],
      soft: [
        'Communication', 'Leadership', 'Teamwork', 'Problem Solving', 'Project Management'
      ]
    };

    const foundSkills = [];

    for (const [category, skills] of Object.entries(skillCategories)) {
      const categorySkills = skills.filter(skill =>
        text.toLowerCase().includes(skill.toLowerCase())
      );
      foundSkills.push(...categorySkills);
    }

    return foundSkills;
  }

  // Extract experience
  extractExperience(text) {
    const experiencePatterns = [
      /(\d+)\+?\s*years?\s+(?:of\s+)?experience/i,
      /experience:?\s*(\d+)\+?\s*years?/i,
      /work(?:ed|ing)\s+(?:for\s+)?(\d+)\+?\s*years?/i
    ];

    for (const pattern of experiencePatterns) {
      const match = text.match(pattern);
      if (match) {
        return `${match[1]} years`;
      }
    }

    return null;
  }

  // Extract education
  extractEducation(text) {
    const educationKeywords = [
      'Bachelor', 'Master', 'PhD', 'B.Tech', 'M.Tech', 'BSc', 'MSc',
      'Computer Science', 'Engineering', 'University', 'College'
    ];

    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (educationKeywords.some(keyword =>
        trimmed.toLowerCase().includes(keyword.toLowerCase())
      )) {
        return trimmed;
      }
    }

    return null;
  }

  // Convert document to PDF (placeholder - would need additional libraries)
  async convertToPDF(buffer, mimeType) {
    // This would require additional libraries like libreoffice or similar
    console.log('Document to PDF conversion not implemented yet');
    return buffer;
  }
}

module.exports = new DocumentProcessor();