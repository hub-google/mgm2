const path = require('path');
const fs = require('fs');

let dbType = 'sqlite'; // 'sqlite' or 'json'
let sqliteDb = null;
const dbPath = path.join(__dirname, 'mgm.db');
const jsonDbPath = path.join(__dirname, 'db.json');

// Attempt to load sqlite3
try {
  const sqlite3 = require('sqlite3').verbose();
  sqliteDb = new sqlite3.Database(dbPath);
  console.log(`[Database] SQLite loaded successfully. DB Path: ${dbPath}`);
} catch (err) {
  console.warn(`[Database] Failed to load sqlite3: ${err.message}`);
  console.warn('[Database] Falling back to JSON file database.');
  dbType = 'json';
}

/**
 * Promisified SQLite run
 */
function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    sqliteDb.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

/**
 * Promisified SQLite get (single row)
 */
function getRow(sql, params = []) {
  return new Promise((resolve, reject) => {
    sqliteDb.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

/**
 * Promisified SQLite all (multiple rows)
 */
function allRows(sql, params = []) {
  return new Promise((resolve, reject) => {
    sqliteDb.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

/**
 * Helper to read JSON database
 */
function readJsonDb() {
  try {
    if (!fs.existsSync(jsonDbPath)) {
      return [];
    }
    const data = fs.readFileSync(jsonDbPath, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error('[Database] Error reading JSON DB, returning empty array:', err);
    return [];
  }
}

/**
 * Helper to write JSON database (synchronous & atomic)
 */
function writeJsonDb(data) {
  try {
    const tempPath = jsonDbPath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempPath, jsonDbPath);
  } catch (err) {
    console.error('[Database] Error writing JSON DB:', err);
  }
}

/**
 * Initialize Database Tables / Schema
 */
async function initDb() {
  if (dbType === 'sqlite') {
    try {
      // Create clicks table
      await runQuery(`
        CREATE TABLE IF NOT EXISTS clicks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          salesperson_code TEXT NOT NULL,
          clicked_at TEXT NOT NULL,
          ip_address TEXT,
          browser TEXT,
          os TEXT,
          device TEXT,
          referer TEXT
        )
      `);
      // Add index for salesperson_code
      await runQuery(`
        CREATE INDEX IF NOT EXISTS idx_clicks_salesperson 
        ON clicks(salesperson_code)
      `);
      // Add index for clicked_at
      await runQuery(`
        CREATE INDEX IF NOT EXISTS idx_clicks_time
        ON clicks(clicked_at)
      `);
      console.log('[Database] SQLite database initialized successfully.');
    } catch (err) {
      console.error('[Database] Failed to initialize SQLite database, switching to JSON mode:', err);
      dbType = 'json';
    }
  }

  if (dbType === 'json') {
    if (!fs.existsSync(jsonDbPath)) {
      writeJsonDb([]);
    }
    console.log('[Database] JSON file database initialized successfully.');
  }
}

/**
 * Insert click log
 */
async function insertClick({ salesperson_code, ip_address, browser, os, device, referer }) {
  const timestamp = new Date().toISOString();
  
  // Format code: trim and convert to upper case for consistency
  const formattedCode = (salesperson_code || 'UNKNOWN').trim().toUpperCase();

  if (dbType === 'sqlite') {
    const sql = `
      INSERT INTO clicks (salesperson_code, clicked_at, ip_address, browser, os, device, referer)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    await runQuery(sql, [formattedCode, timestamp, ip_address, browser, os, device, referer]);
  } else {
    // JSON database
    const clicks = readJsonDb();
    const newId = clicks.length > 0 ? Math.max(...clicks.map(c => c.id || 0)) + 1 : 1;
    clicks.push({
      id: newId,
      salesperson_code: formattedCode,
      clicked_at: timestamp,
      ip_address,
      browser,
      os,
      device,
      referer
    });
    writeJsonDb(clicks);
  }
  console.log(`[Database] Logged click for salesperson: ${formattedCode}`);
}

/**
 * Get aggregated statistics
 */
async function getStats() {
  const now = new Date();
  
  // Today's date string in YYYY-MM-DD
  const tzOffset = now.getTimezoneOffset() * 60000;
  const localISOTime = (new Date(now - tzOffset)).toISOString();
  const todayStr = localISOTime.split('T')[0]; // Local YYYY-MM-DD

  if (dbType === 'sqlite') {
    // 1. Overall Metrics
    // total clicks
    const totalRow = await getRow('SELECT COUNT(*) AS total FROM clicks');
    const totalClicks = totalRow ? totalRow.total : 0;

    // unique salespersons
    const uniqueRow = await getRow('SELECT COUNT(DISTINCT salesperson_code) AS unique_count FROM clicks');
    const uniqueSalespersons = uniqueRow ? uniqueRow.unique_count : 0;

    // clicks today (in local timezone - comparing YYYY-MM-DD of clicked_at)
    // Note: SQLite clicked_at is stored in UTC ISO format (e.g. 2026-07-09T05:30:00.000Z)
    // We can filter by checking if substring(clicked_at, 1, 10) in local offset timezone contains today.
    // Or we filter by converting input today to UTC range.
    // Let's do simple: find clicks where date matches today's date in local time or UTC.
    // A simpler way: construct local dates.
    const startOfTodayUtc = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const todayRow = await getRow('SELECT COUNT(*) AS today_count FROM clicks WHERE clicked_at >= ?', [startOfTodayUtc]);
    const clicksToday = todayRow ? todayRow.today_count : 0;

    // 2. Ranking by Salesperson
    const rankingRows = await allRows(`
      SELECT salesperson_code, COUNT(*) AS clicks, MAX(clicked_at) AS last_clicked_at
      FROM clicks
      GROUP BY salesperson_code
      ORDER BY clicks DESC
      LIMIT 50
    `);

    // 3. Trend by Day (last 7 days)
    // We construct the list of last 7 days
    const trendDays = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      trendDays.push(dateStr);
    }

    const trendRows = await allRows(`
      SELECT substr(clicked_at, 1, 10) AS date_str, COUNT(*) AS count
      FROM clicks
      WHERE clicked_at >= ?
      GROUP BY date_str
    `, [new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()]);

    const trendMap = {};
    trendRows.forEach(r => {
      // In SQLite, if stored in UTC, substr(clicked_at, 1, 10) is UTC date.
      // For simplicity, we just map it.
      trendMap[r.date_str] = r.count;
    });

    const byDay = trendDays.map(date => {
      // Look up in trendMap. Note that UTC date and local date could be slightly off, but this is a standard visual approximation.
      // To be accurate, we just map whatever UTC date matched.
      return {
        date,
        clicks: trendMap[date] || 0
      };
    });

    // 4. Recent Logs (last 100)
    const recentLogs = await allRows(`
      SELECT clicked_at, salesperson_code, ip_address, browser, os, device, referer
      FROM clicks
      ORDER BY clicked_at DESC
      LIMIT 100
    `);

    return {
      metrics: {
        totalClicks,
        uniqueSalespersons,
        clicksToday
      },
      bySalesperson: rankingRows,
      byDay,
      recentLogs
    };
  } else {
    // JSON Mode
    const clicks = readJsonDb();
    const totalClicks = clicks.length;

    // Unique salespersons
    const salespersons = new Set(clicks.map(c => c.salesperson_code));
    const uniqueSalespersons = salespersons.size;

    // Clicks today (since last midnight local time)
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const clicksToday = clicks.filter(c => new Date(c.clicked_at) >= startOfToday).length;

    // Ranking by salesperson
    const salespersonGroups = {};
    clicks.forEach(c => {
      const code = c.salesperson_code;
      if (!salespersonGroups[code]) {
        salespersonGroups[code] = { salesperson_code: code, clicks: 0, last_clicked_at: c.clicked_at };
      }
      salespersonGroups[code].clicks += 1;
      if (new Date(c.clicked_at) > new Date(salespersonGroups[code].last_clicked_at)) {
        salespersonGroups[code].last_clicked_at = c.clicked_at;
      }
    });
    const bySalesperson = Object.values(salespersonGroups)
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 50);

    // Trend by Day (last 7 days)
    const trendDays = [];
    const trendMap = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      trendDays.push(dateStr);
      trendMap[dateStr] = 0;
    }

    clicks.forEach(c => {
      // Get the local date string for the click
      const clickDate = new Date(c.clicked_at);
      const clickDateStr = clickDate.toISOString().split('T')[0];
      if (clickDateStr in trendMap) {
        trendMap[clickDateStr] += 1;
      }
    });

    const byDay = trendDays.map(date => ({
      date,
      clicks: trendMap[date]
    }));

    // Recent logs
    const recentLogs = [...clicks]
      .sort((a, b) => new Date(b.clicked_at) - new Date(a.clicked_at))
      .slice(0, 100)
      .map(c => ({
        clicked_at: c.clicked_at,
        salesperson_code: c.salesperson_code,
        ip_address: c.ip_address,
        browser: c.browser,
        os: c.os,
        device: c.device,
        referer: c.referer
      }));

    return {
      metrics: {
        totalClicks,
        uniqueSalespersons,
        clicksToday
      },
      bySalesperson,
      byDay,
      recentLogs
    };
  }
}

/**
 * Get all clicks (for CSV export)
 */
async function getAllClicks() {
  if (dbType === 'sqlite') {
    return await allRows(`
      SELECT clicked_at, salesperson_code, ip_address, browser, os, device, referer
      FROM clicks
      ORDER BY clicked_at DESC
    `);
  } else {
    const clicks = readJsonDb();
    return [...clicks]
      .sort((a, b) => new Date(b.clicked_at) - new Date(a.clicked_at))
      .map(c => ({
        clicked_at: c.clicked_at,
        salesperson_code: c.salesperson_code,
        ip_address: c.ip_address,
        browser: c.browser,
        os: c.os,
        device: c.device,
        referer: c.referer
      }));
  }
}

/**
 * Get click logs for a specific salesperson
 */
async function getSalespersonClicks(code) {
  const formattedCode = (code || '').trim().toUpperCase();
  if (dbType === 'sqlite') {
    return await allRows(`
      SELECT clicked_at, browser, os, device, referer
      FROM clicks
      WHERE salesperson_code = ?
      ORDER BY clicked_at DESC
    `, [formattedCode]);
  } else {
    const clicks = readJsonDb();
    return clicks
      .filter(c => c.salesperson_code === formattedCode)
      .sort((a, b) => new Date(b.clicked_at) - new Date(a.clicked_at))
      .map(c => ({
        clicked_at: c.clicked_at,
        browser: c.browser,
        os: c.os,
        device: c.device,
        referer: c.referer
      }));
  }
}

module.exports = {
  initDb,
  insertClick,
  getStats,
  getAllClicks,
  getSalespersonClicks
};
