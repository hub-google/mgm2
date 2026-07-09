/**
 * MGM 業務推廣連結系統 - Google Apps Script (GAS) 雲端資料庫腳本
 * 
 * 部署教學：
 * 1. 在 Google 雲端硬碟建立一個全新的 Google 試算表（Google Sheet）。
 * 2. 點選選單的「延伸功能 (Extensions)」->「Apps Script」。
 * 3. 清空原本的程式碼，將本檔案內容全部貼上。
 * 4. 點選右上角的「部署 (Deploy)」->「新增部署 (New deployment)」。
 * 5. 在左側選單的「齒輪」圖示旁，選擇「網頁應用程式 (Web App)」。
 * 6. 設定：
 *    - 專案執行身分 (Execute as)：我 (Me)
 *    - 誰有權限存取 (Who has access)：所有人 (Anyone)
 * 7. 點選「部署」，並授權 Google 帳號存取權限。
 * 8. 複製產生的「網頁應用程式 URL」，貼回專案的 `js/config.js` 檔案中。
 */

function doGet(e) {
  // 解決 CORS 跨網域問題
  const JSON_OUTPUT = function(data) {
    return ContentService.createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);
  };
  
  const TEXT_OUTPUT = function(text) {
    return ContentService.createTextOutput(text)
      .setMimeType(ContentService.MimeType.TEXT);
  };

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName("clicks");
    
    // 如果工作表不存在，自動建立並初始化首列欄位
    if (!sheet) {
      sheet = ss.insertSheet("clicks");
      sheet.appendRow(["Time", "Code", "IP", "Browser", "OS", "Device", "Referer"]);
      // 凍結第一列
      sheet.setFrozenRows(1);
    }

    const action = e.parameter.action;

    // 處理記錄點擊 (Log Click)
    if (action === 'log') {
      const code = (e.parameter.code || 'UNKNOWN').trim().toUpperCase();
      const ip = e.parameter.ip || '';
      const referer = e.parameter.referer || '';
      const userAgent = e.parameter.userAgent || '';
      const timestamp = new Date().toISOString();

      // 解析 User-Agent
      const uaParsed = parseUserAgent(userAgent);

      // 寫入試算表
      sheet.appendRow([
        timestamp,
        code,
        ip,
        uaParsed.browser,
        uaParsed.os,
        uaParsed.device,
        referer
      ]);

      return TEXT_OUTPUT("SUCCESS");
    }

    // 處理獲取統計數據 (Get Stats)
    if (action === 'stats') {
      const dataRange = sheet.getDataRange();
      const rows = dataRange.getValues();
      
      // 去除首列標題
      const headers = rows[0];
      const records = rows.slice(1);

      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // 1. 計算基本指標
      const totalClicks = records.length;
      const uniqueSales = new Set();
      let clicksToday = 0;

      records.forEach(row => {
        const clickedTime = new Date(row[0]);
        const code = row[1];
        if (code) {
          uniqueSales.add(code);
        }
        if (clickedTime >= startOfToday) {
          clicksToday++;
        }
      });

      const uniqueSalespersons = uniqueSales.size;

      // 2. 業務員排行榜 (Ranking)
      const salespersonMap = {};
      records.forEach(row => {
        const code = row[1];
        const clickedTime = row[0];
        if (!code) return;
        
        if (!salespersonMap[code]) {
          salespersonMap[code] = { salesperson_code: code, clicks: 0, last_clicked_at: clickedTime };
        }
        salespersonMap[code].clicks += 1;
        if (new Date(clickedTime) > new Date(salespersonMap[code].last_clicked_at)) {
          salespersonMap[code].last_clicked_at = clickedTime;
        }
      });

      const bySalesperson = Object.values(salespersonMap)
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, 50);

      // 3. 點擊走勢圖 (Trend by Day - 最近 7 天)
      const trendDays = [];
      const trendMap = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        trendDays.push(dateStr);
        trendMap[dateStr] = 0;
      }

      records.forEach(row => {
        const clickedTime = new Date(row[0]);
        // 轉為 local date string
        const dateStr = clickedTime.toISOString().split('T')[0];
        if (dateStr in trendMap) {
          trendMap[dateStr] += 1;
        }
      });

      const byDay = trendDays.map(date => ({
        date: date,
        clicks: trendMap[date]
      }));

      // 4. 明細日誌 (Recent Logs - 最新 100 筆)
      // 將資料倒序排列 (最新的在前面)
      const recentLogs = records
        .slice(-100)
        .reverse()
        .map(row => ({
          clicked_at: row[0],
          salesperson_code: row[1],
          ip_address: row[2],
          browser: row[3],
          os: row[4],
          device: row[5],
          referer: row[6]
        }));

      return JSON_OUTPUT({
        success: true,
        data: {
          metrics: {
            totalClicks: totalClicks,
            uniqueSalespersons: uniqueSalespersons,
            clicksToday: clicksToday
          },
          bySalesperson: bySalesperson,
          byDay: byDay,
          recentLogs: recentLogs
        }
      });
    }

    return JSON_OUTPUT({ success: false, error: "Invalid action" });

  } catch (err) {
    return JSON_OUTPUT({ success: false, error: err.toString() });
  }
}

/**
 * 簡易 User-Agent 解析器
 */
function parseUserAgent(ua) {
  ua = ua || "";
  let browser = "Unknown";
  let os = "Unknown";
  let device = "desktop";

  // 作業系統檢測
  if (ua.indexOf("Windows") !== -1) {
    os = "Windows";
  } else if (ua.indexOf("iPhone") !== -1) {
    os = "iOS";
    device = "mobile";
  } else if (ua.indexOf("iPad") !== -1) {
    os = "iOS";
    device = "tablet";
  } else if (ua.indexOf("Macintosh") !== -1 || ua.indexOf("Mac OS") !== -1) {
    os = "macOS";
  } else if (ua.indexOf("Android") !== -1) {
    os = "Android";
    device = "mobile";
  } else if (ua.indexOf("Linux") !== -1) {
    os = "Linux";
  }

  // 瀏覽器檢測
  if (ua.indexOf("Firefox") !== -1) {
    browser = "Firefox";
  } else if (ua.indexOf("Edge") !== -1 || ua.indexOf("Edg/") !== -1) {
    browser = "Edge";
  } else if (ua.indexOf("Chrome") !== -1) {
    browser = "Chrome";
  } else if (ua.indexOf("Safari") !== -1) {
    browser = "Safari";
  } else if (ua.indexOf("MSIE") !== -1 || ua.indexOf("Trident/") !== -1) {
    browser = "Internet Explorer";
  }

  return { browser: browser, os: os, device: device };
}
