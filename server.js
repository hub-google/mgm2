require('dotenv').config();
const express = require('express');
const path = require('path');
const UAParser = require('ua-parser-js');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const TARGET_URL = process.env.TARGET_URL || 'https://r.botbonnie.com/H52rK';

// Trust proxy to get correct client IP address
app.set('trust proxy', true);

app.use(express.json());

// Security middleware to block access to backend files in root directory
app.use((req, res, next) => {
  const blockedFiles = ['.env', 'server.js', 'db.js', 'package.json', 'package-lock.json', 'mgm.db', 'db.json'];
  const url = req.path.toLowerCase();
  if (blockedFiles.some(file => url.endsWith(file) || url.includes('/' + file))) {
    return res.status(403).send('Forbidden');
  }
  next();
});

// Serve frontend static files from the root directory
app.use(express.static(__dirname));

/**
 * API Endpoint: Proxy URL Shortening to is.gd to bypass browser CORS
 */
app.get('/api/shorten', async (req, res) => {
  const urlToShorten = req.query.url;
  const customSlug = req.query.shorturl;

  if (!urlToShorten) {
    return res.status(400).json({ success: false, error: 'Missing url parameter' });
  }

  try {
    let targetApi = `https://is.gd/create.php?format=json&url=${encodeURIComponent(urlToShorten)}`;
    if (customSlug) {
      targetApi += `&shorturl=${encodeURIComponent(customSlug)}`;
    }

    const response = await fetch(targetApi);
    const data = await response.json();

    if (data && data.shorturl) {
      return res.json({ success: true, shorturl: data.shorturl });
    } else if (data && data.errorcode === 2) {
      // Custom URL taken, fallback to random short URL
      console.warn(`[Shortener] Custom slug [${customSlug}] taken, requesting random short url...`);
      const retryApi = `https://is.gd/create.php?format=json&url=${encodeURIComponent(urlToShorten)}`;
      const retryResponse = await fetch(retryApi);
      const retryData = await retryResponse.json();

      if (retryData && retryData.shorturl) {
        return res.json({ success: true, shorturl: retryData.shorturl, fallback: true });
      }
    }

    return res.status(500).json({ success: false, error: data.errormessage || 'is.gd API error' });
  } catch (err) {
    console.error('[Shortener] Error proxying to is.gd:', err);
    res.status(500).json({ success: false, error: err.toString() });
  }
});

/**
 * API Endpoint: Get real-time stats
 */
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await db.getStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    console.error('[Server] Error fetching stats:', err);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

/**
 * API Endpoint: Export all click data as CSV
 */
app.get('/api/stats/export', async (req, res) => {
  try {
    const clicks = await db.getAllClicks();
    
    // Header for CSV
    let csvContent = '\ufeff'; // UTF-8 BOM to prevent Excel display corruption
    csvContent += '點擊時間 (UTC/ISO),業務員代碼,IP地址,瀏覽器,作業系統,裝置類型,來源網頁\r\n';
    
    clicks.forEach(click => {
      // Escape commas and quotes for safety
      const time = click.clicked_at || '';
      const code = click.salesperson_code || '';
      const ip = click.ip_address || '';
      const browser = click.browser || '';
      const os = click.os || '';
      const device = click.device || 'desktop';
      const referer = (click.referer || '').replace(/"/g, '""');
      
      csvContent += `"${time}","${code}","${ip}","${browser}","${os}","${device}","${referer}"\r\n`;
    });
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=mgm_clicks_report.csv');
    res.status(200).send(csvContent);
  } catch (err) {
    console.error('[Server] Error exporting CSV:', err);
    res.status(500).send('Export failed.');
  }
/**
 * API Endpoint: Get click logs for a specific salesperson
 */
app.get('/api/stats/salesperson/:code', async (req, res) => {
  try {
    const code = req.params.code.trim().toUpperCase();
    const clicks = await db.getSalespersonClicks(code);
    res.json({ success: true, data: clicks });
  } catch (err) {
    console.error(`[Server] Error fetching salesperson detail for [${req.params.code}]:`, err);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

/**
 * Dynamic redirection route: /[salesperson_code]
 * Matches any path that doesn't contain a dot (static files) and isn't /api
 */
app.get('/:code', (req, res, next) => {
  const code = req.params.code;
  
  // If it's a static file request (contains a dot) or is empty/api, skip and pass to next handlers
  if (code.includes('.') || code.toLowerCase() === 'api') {
    return next();
  }

  // Extract client information
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'] || '';
  const referer = req.headers['referer'] || req.headers['referrer'] || '';
  
  // Parse User-Agent
  const parser = new UAParser(userAgent);
  const uaResult = parser.getResult();
  
  const browser = uaResult.browser.name ? `${uaResult.browser.name} ${uaResult.browser.version || ''}`.trim() : 'Unknown';
  const os = uaResult.os.name ? `${uaResult.os.name} ${uaResult.os.version || ''}`.trim() : 'Unknown';
  const device = uaResult.device.type || 'desktop';

  // Format code
  const salespersonCode = code.trim().toUpperCase();

  // Insert click log asynchronously (so redirect happens instantly without waiting for db write)
  db.insertClick({
    salesperson_code: salespersonCode,
    ip_address: ipAddress,
    browser,
    os,
    device,
    referer
  }).catch(err => {
    console.error('[Server] Database logging error:', err);
  });

  // Perform redirect to BotBonnie
  console.log(`[Redirect] Redirecting code [${salespersonCode}] -> ${TARGET_URL}`);
  res.redirect(302, TARGET_URL);
});

// Fallback for page routing - serve index.html for unknown routes (optional SPA routing)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Initialize database then start server
db.initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(` MGM Referral System is running!`);
    console.log(` - Server Port:  ${PORT}`);
    console.log(` - Target URL:  ${TARGET_URL}`);
    console.log(` - Local Portal: http://localhost:${PORT}`);
    console.log(`====================================================`);
  });
}).catch(err => {
  console.error('[Server] Failed to initialize database:', err);
  process.exit(1);
});
