const express = require('express');
const puppeteer = require('puppeteer');

const router = express.Router();

// GET /api/v1/public/screenshot?url=...&w=1280&h=720
router.get('/', async (req, res) => {
  try {
    const targetUrl = req.query.url;
    const width = parseInt(req.query.w || '1280', 10);
    const height = parseInt(req.query.h || '720', 10);

    if (!targetUrl || !/^https?:\/\//i.test(String(targetUrl))) {
      return res.status(400).json({ message: 'Invalid or missing url parameter' });
    }

    const launchArgs = (process.env.PUPPETEER_ARGS || '--no-sandbox --disable-setuid-sandbox')
      .split(' ') 
      .filter(Boolean);
    const headlessMode = process.env.PUPPETEER_HEADLESS || 'new';
    const execPath = process.env.PUPPETEER_EXECUTABLE_PATH;
    const launchOptions = {
      headless: headlessMode,
      args: launchArgs,
      ...(execPath ? { executablePath: execPath } : {})
    };

    const browser = await puppeteer.launch(launchOptions);

    const page = await browser.newPage();
    await page.setViewport({ width, height });

    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    const imageBuffer = await page.screenshot({ type: 'png', fullPage: false });
    await browser.close();

    res.setHeader('Content-Type', 'image/png');
    // Short cache to reduce load but keep it fresh-ish
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.send(imageBuffer);
  } catch (err) {
    console.error('Public screenshot error:', err && err.message);
    // Return a 1x1 transparent PNG so the <img> doesn't break visually
    const transparentPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=',
      'base64'
    );
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-cache');
    return res.send(transparentPng);
  }
});

module.exports = router;
