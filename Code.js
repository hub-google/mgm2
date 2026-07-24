/**
 * MGM 業務推廣連結系統 - Google Apps Script (GAS) 雲端資料庫腳本
 * 
 * 此程式碼由 Antigravity AI 自動生成並部署。
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
      sheet.setFrozenRows(1);
    }

    const action = e.parameter.action;
    const code = (e.parameter.code || '').trim().toUpperCase();

    // 1. 客戶跳轉核心防護機制：如果傳入代碼且沒有管理指令，則返回跳轉頁面並在背景統計
    if (code && action !== 'stats' && action !== 'detail' && action !== 'log') {
      const scriptUrl = ScriptApp.getService().getUrl(); // 動態取得目前的 Web App 網址
      const targetUrl = "https://r.botbonnie.com/H52rK";
      
      const html = `<!DOCTYPE html>
      <html lang="zh-TW">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <base target="_top">
        <title>正在跳轉至 LINE OA 推廣頁面...</title>
        <style>
          body {
            background-color: #0b0f19;
            color: #f3f4f6;
            font-family: system-ui, -apple-system, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            text-align: center;
          }
          .loader {
            border: 4px solid rgba(255, 255, 255, 0.1);
            width: 48px;
            height: 48px;
            border-radius: 50%;
            border-left-color: #6366f1;
            animation: spin 1s linear infinite;
            margin-bottom: 24px;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        </style>
      </head>
      <body>
        <div class="loader"></div>
        <h2>正在為您跳轉至 LINE OA...</h2>
        <p>系統正在為您建立推薦關係，請稍候。</p>
        
        <!-- 隱密重定向連結，iframe 穿透跳轉的最安全做法 -->
        <a id="redirect-link" href="${targetUrl}" target="_top" style="display:none;">跳轉中...</a>
        
        <script>
          (function() {
            const targetUrl = "${targetUrl}";
            // 背景向同一個 GAS 上報點擊明細
            const logUrl = "${scriptUrl}?action=log" +
              "&code=${encodeURIComponent(code)}" +
              "&referer=" + encodeURIComponent(document.referrer || "") +
              "&userAgent=" + encodeURIComponent(navigator.userAgent || "");
            
            let redirected = false;
            function doRedirect() {
              if (redirected) return;
              redirected = true;
              try {
                // 優先使用 target="_top" 模擬點擊跳轉以突破 iframe 限制，且不觸發 Same-Origin 安全阻擋
                const link = document.getElementById('redirect-link');
                if (link) {
                  link.click();
                } else {
                  window.top.location = targetUrl;
                }
              } catch (e) {
                try {
                  // 備用：直接為 window.top.location 賦值 (跨域寫入是允許的，但不能讀取 .href)
                  window.top.location = targetUrl;
                } catch (e2) {
                  // 最後手段：直接在當前頁面/iframe 內跳轉
                  window.location.href = targetUrl;
                }
              }
            }

            // 使用 Image Beacon 發送日誌，跨網域相容性最高，不受 CORS 限制且不會因頁面卸載被瀏覽器取消
            const beacon = new Image();
            beacon.onload = doRedirect;
            beacon.onerror = doRedirect;
            beacon.src = logUrl;
            
            // 防呆時間設為 400ms，保證即使網路延遲也能秒級重定向
            setTimeout(doRedirect, 400);
          })();
        </script>
      </body>
      </html>`;
      return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }

    // 2. 處理記錄點擊 (Log Click)
    if (action === 'log') {
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

    // 3. 處理獲取統計數據 (Get Stats)
    if (action === 'stats') {
      const dataRange = sheet.getDataRange();
      const rows = dataRange.getValues();
      
      const headers = rows[0];
      const records = rows.slice(1);

      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // 計算基本指標
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

      // 業務員排行榜
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

      // 點擊走勢圖 (最近 7 天)
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
        const dateStr = clickedTime.toISOString().split('T')[0];
        if (dateStr in trendMap) {
          trendMap[dateStr] += 1;
        }
      });

      const byDay = trendDays.map(date => ({
        date: date,
        clicks: trendMap[date]
      }));

      // 明細日誌 (最新 100 筆)
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

    // 4. 處理獲取特定業務員點擊明細
    if (action === 'detail') {
      const dataRange = sheet.getDataRange();
      const rows = dataRange.getValues();
      const records = rows.slice(1);

      const details = records
        .filter(row => row[1] === code)
        .reverse()
        .map(row => ({
          clicked_at: row[0],
          ip_address: row[2],
          browser: row[3],
          os: row[4],
          device: row[5],
          referer: row[6]
        }));

      return JSON_OUTPUT({
        success: true,
        data: details
      });
    }

    // 5. 處理代為縮短網址 (Proxy Shorten URL to bypass CORS)
    if (action === 'shorten') {
      const urlToShorten = e.parameter.url || '';
      const customSlug = e.parameter.shorturl || '';
      
      if (!urlToShorten) {
        return JSON_OUTPUT({ success: false, error: "Missing url parameter" });
      }
      
      try {
        let targetApi = "https://is.gd/create.php?format=json&url=" + encodeURIComponent(urlToShorten);
        if (customSlug) {
          targetApi += "&shorturl=" + encodeURIComponent(customSlug);
        }
        
        const response = UrlFetchApp.fetch(targetApi, { muteHttpExceptions: true });
        const resText = response.getContentText();
        
        let data;
        try {
          data = JSON.parse(resText);
        } catch (e) {
          // 若 is.gd 返回非 JSON 格式錯誤 (例如 Error, database insert failed 等純文字)
          data = { errorcode: 1, errormessage: resText };
        }
        
        if (data && data.shorturl) {
          return JSON_OUTPUT({ success: true, shorturl: data.shorturl });
        } else {
          // 自訂別名重複或 is.gd API 錯誤，自動降級重新請求隨機短網址
          const retryApi = "https://is.gd/create.php?format=json&url=" + encodeURIComponent(urlToShorten);
          const retryResponse = UrlFetchApp.fetch(retryApi, { muteHttpExceptions: true });
          const retryText = retryResponse.getContentText();
          
          let retryData;
          try {
            retryData = JSON.parse(retryText);
          } catch(e) {
            retryData = { errorcode: 1, errormessage: retryText };
          }
          
          if (retryData && retryData.shorturl) {
            return JSON_OUTPUT({ success: true, shorturl: retryData.shorturl, fallback: true });
          }
        }
        
        return JSON_OUTPUT({ success: false, error: data.errormessage || "is.gd API error" });
      } catch (err) {
        return JSON_OUTPUT({ success: false, error: err.toString() });
      }
    }

    // 預設重定向 (無參數訪問直接跳轉至 LINE OA)
    const fallbackUrl = "https://r.botbonnie.com/H52rK";
    return HtmlService.createHtmlOutput(`<script>try { window.top.location = "${fallbackUrl}"; } catch(e) { window.location.href = "${fallbackUrl}"; }</script>`);

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

/**
 * 處理 POST 請求，對應至 doGet 處理邏輯
 */
function doPost(e) {
  return doGet(e);
}
