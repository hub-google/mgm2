// MGM Link Hub - Frontend Application Logic

document.addEventListener('DOMContentLoaded', () => {
  
  // ==========================================
  // 1. 環境判斷與 API 端點設定
  // ==========================================
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const hasGasUrl = typeof CONFIG !== 'undefined' && CONFIG.GAS_WEB_APP_URL && CONFIG.GAS_WEB_APP_URL.startsWith('http');
  const useGas = !isLocal && hasGasUrl;
  
  let statsApiUrl = '/api/stats';
  
  // 更新狀態欄資訊
  const statusIndicator = document.getElementById('db-status-indicator');
  const statusText = document.getElementById('db-status-text');
  const setupBanner = document.getElementById('setup-banner');

  if (useGas) {
    statsApiUrl = `${CONFIG.GAS_WEB_APP_URL}?action=stats`;
    statusIndicator.className = 'status-indicator online';
    statusText.textContent = '雲端試算表已連線 (Google Sheets)';
    if (setupBanner) setupBanner.classList.add('hidden');
  } else if (isLocal) {
    statsApiUrl = '/api/stats';
    statusIndicator.className = 'status-indicator online';
    statusText.textContent = '本地資料庫已連線 (SQLite/JSON)';
    if (setupBanner) setupBanner.classList.add('hidden');
  } else {
    // 處於 GitHub Pages 但尚未設定 GAS
    statsApiUrl = '';
    statusIndicator.className = 'status-indicator offline';
    statusText.textContent = '請設定 config.js 中的 GAS 應用程式網址';
    if (setupBanner) setupBanner.classList.remove('hidden');
  }

  // ==========================================
  // 2. 佈景主題切換 (Dark / Light Mode)
  // ==========================================
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);

  themeToggleBtn.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
    
    // 如果圖表已初始化，重新繪製以套用新主題顏色
    if (window.trendChartInstance) {
      renderTrendChart(window.lastChartData);
    }
  });

  function updateThemeIcon(theme) {
    const icon = themeToggleBtn.querySelector('i');
    if (theme === 'dark') {
      icon.className = 'fa-solid fa-sun';
    } else {
      icon.className = 'fa-solid fa-moon';
    }
  }

  // ==========================================
  // 3. 業務員連結與 QR Code 生成
  // ==========================================
  const salespersonInput = document.getElementById('salesperson-input');
  const generateBtn = document.getElementById('generate-btn');
  const generatorResult = document.getElementById('generator-result');
  const generatedUrlInput = document.getElementById('generated-url-input');
  const inputFeedback = document.getElementById('input-feedback');
  const qrcodeDiv = document.getElementById('qrcode');
  const downloadQrBtn = document.getElementById('download-qr-btn');
  const copyBtn = document.getElementById('copy-btn');
  
  let generatedUrl = '';

  // 輸入時即時移除空格與特殊字元，並自動轉大寫
  salespersonInput.addEventListener('input', (e) => {
    let value = e.target.value.replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase();
    e.target.value = value;
    
    if (value.length > 0) {
      inputFeedback.className = 'feedback-text success';
      inputFeedback.innerHTML = `<i class="fa-solid fa-circle-check"></i> 代碼可用: ${value}`;
    } else {
      inputFeedback.innerHTML = '';
    }
  });

  // 按下 Enter 觸發生成
  salespersonInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      generateLink();
    }
  });

  generateBtn.addEventListener('click', generateLink);

  async function generateLink() {
    const code = salespersonInput.value.trim();
    if (!code || code.length < 2) {
      inputFeedback.className = 'feedback-text error';
      inputFeedback.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> 請輸入至少 2 個字元的有效業務員代碼';
      salespersonInput.focus();
      return;
    }

    // 1. 計算專屬原始網址
    // 如果有設定 GAS，我們將邀請連結直接指向 GAS Web App，格式為 [GAS_WEB_APP_URL]?code=[code]
    // 這樣做可以讓客戶點擊時完全看不到並繞過您的 GitHub Pages 網址 (hub-google.github.io)，達到完美防窺！
    let longUrl = '';
    if (useGas) {
      longUrl = `${CONFIG.GAS_WEB_APP_URL}?code=${code}`;
    } else {
      // 本地開發模式備用
      let base = window.location.origin + window.location.pathname;
      base = base.replace(/admin\/(index\.html)?$/, '');
      if (!base.endsWith('/')) {
        base += '/';
      }
      longUrl = base + code;
    }
    
    // 設定備用原始網址欄位
    const generatedBackupUrlInput = document.getElementById('generated-backup-url-input');
    if (generatedBackupUrlInput) {
      generatedBackupUrlInput.value = longUrl;
    }

    // 設定預設顯示（生成中）
    generatedUrlInput.value = '正在生成短網址...';
    generatedUrlInput.style.color = 'var(--text-muted)';
    
    // 預設將 QR Code 解析指向原始網址，若短網址成功再替換
    drawQrCode(longUrl);

    // 展開結果區塊
    generatorResult.classList.remove('hidden');
    generatorResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // 2. 調用短網址 API (透過後端 Proxy 繞過 CORS)
    try {
      const customSlug = `mgm2_${code}`;
      let proxyUrl = '';
      
      if (useGas) {
        proxyUrl = `${CONFIG.GAS_WEB_APP_URL}?action=shorten&url=${encodeURIComponent(longUrl)}&shorturl=${encodeURIComponent(customSlug)}`;
      } else if (isLocal) {
        proxyUrl = `/api/shorten?url=${encodeURIComponent(longUrl)}&shorturl=${encodeURIComponent(customSlug)}`;
      } else {
        throw new Error('無可用的後端服務進行短網址代理');
      }
      
      const response = await fetch(proxyUrl);
      const data = await response.json();
      
      if (data && data.success && data.shorturl) {
        generatedUrl = data.shorturl;
        generatedUrlInput.value = generatedUrl;
        generatedUrlInput.style.color = '';
        // 替換二維碼為短網址，使掃描結果同樣被遮蔽且更簡潔
        drawQrCode(generatedUrl);
      } else {
        throw new Error(data.error || 'Proxy API returned success:false');
      }
    } catch (err) {
      console.warn('短網址代理生成失敗，改用原始網址作為預設:', err);
      generatedUrl = longUrl;
      generatedUrlInput.value = longUrl;
      generatedUrlInput.style.color = '';
      drawQrCode(longUrl);
    }
  }

  function drawQrCode(text) {
    qrcodeDiv.innerHTML = '';
    new QRCode(qrcodeDiv, {
      text: text,
      width: 120,
      height: 120,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H
    });
  }

  // 複製短網址按鈕
  copyBtn.addEventListener('click', () => {
    if (!generatedUrl) return;
    
    navigator.clipboard.writeText(generatedUrl).then(() => {
      // 成功動畫
      const originalHtml = copyBtn.innerHTML;
      copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> 已複製！';
      copyBtn.style.background = 'var(--grad-green)';
      copyBtn.style.color = '#fff';
      
      setTimeout(() => {
        copyBtn.innerHTML = originalHtml;
        copyBtn.style.background = '';
        copyBtn.style.color = '';
      }, 2000);
    }).catch(err => {
      console.error('複製失敗:', err);
    });
  });

  // 複製備用連結按鈕
  const copyBackupBtn = document.getElementById('copy-backup-btn');
  if (copyBackupBtn) {
    copyBackupBtn.addEventListener('click', () => {
      const generatedBackupUrlInput = document.getElementById('generated-backup-url-input');
      if (!generatedBackupUrlInput || !generatedBackupUrlInput.value) return;
      
      navigator.clipboard.writeText(generatedBackupUrlInput.value).then(() => {
        const originalHtml = copyBackupBtn.innerHTML;
        copyBackupBtn.innerHTML = '<i class="fa-solid fa-check"></i> 已複製！';
        copyBackupBtn.style.background = 'var(--grad-green)';
        copyBackupBtn.style.color = '#fff';
        
        setTimeout(() => {
          copyBackupBtn.innerHTML = originalHtml;
          copyBackupBtn.style.background = '';
          copyBackupBtn.style.color = '';
        }, 2000);
      }).catch(err => {
        console.error('備用網址複製失敗:', err);
      });
    });
  }

  // 下載 QR Code PNG
  downloadQrBtn.addEventListener('click', () => {
    // 獲取 QRCode.js 生成的 canvas 或 img
    const qrImg = qrcodeDiv.querySelector('img');
    const qrCanvas = qrcodeDiv.querySelector('canvas');
    let qrSrc = '';

    if (qrImg && qrImg.src) {
      qrSrc = qrImg.src;
      triggerDownload(qrSrc);
    } else if (qrCanvas) {
      qrSrc = qrCanvas.toDataURL('image/png');
      triggerDownload(qrSrc);
    } else {
      alert('QR Code 尚未生成完畢，請稍後再試。');
    }
  });

  function triggerDownload(dataUrl) {
    const code = salespersonInput.value.trim().toUpperCase();
    const link = document.createElement('a');
    link.download = `MGM_QR_${code}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // ==========================================
  // 4. 統計數據加載與更新
  // ==========================================
  let allLogs = [];
  let allLeaderboard = [];
  
  const refreshBtn = document.getElementById('refresh-data-btn');
  refreshBtn.addEventListener('click', fetchStats);

  async function fetchStats() {
    if (!statsApiUrl) {
      console.warn('API 網址未設定');
      return;
    }

    // 旋轉重新整理圖示
    const refreshIcon = refreshBtn.querySelector('i');
    refreshIcon.classList.add('fa-spin');

    try {
      const response = await fetch(statsApiUrl);
      const resData = await response.json();

      if (resData && resData.success) {
        const stats = resData.data;
        
        // 1. 更新指標
        animateValue('stat-total-clicks', stats.metrics.totalClicks);
        animateValue('stat-active-sales', stats.metrics.uniqueSalespersons);
        animateValue('stat-today-clicks', stats.metrics.clicksToday);

        // 2. 更新走勢圖
        window.lastChartData = stats.byDay;
        renderTrendChart(stats.byDay);

        // 3. 更新排行榜
        allLeaderboard = stats.bySalesperson || [];
        updateLeaderboardTable(allLeaderboard);

        // 4. 更新詳細日誌
        allLogs = stats.recentLogs || [];
        updateLogsTable(allLogs);
      } else {
        console.error('API 讀取成效失敗:', resData.error);
      }
    } catch (err) {
      console.error('統計 API 連線失敗:', err);
    } finally {
      // 停止旋轉圖示
      setTimeout(() => {
        refreshIcon.classList.remove('fa-spin');
      }, 500);
    }
  }

  // 數字變動動畫
  function animateValue(id, startOrEndValue) {
    const obj = document.getElementById(id);
    if (!obj) return;
    const end = parseInt(startOrEndValue, 10) || 0;
    const start = parseInt(obj.textContent, 10) || 0;
    if (start === end) {
      obj.textContent = end;
      return;
    }
    const duration = 800;
    let startTimestamp = null;
    
    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      obj.textContent = Math.floor(progress * (end - start) + start);
      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        obj.textContent = end;
      }
    };
    window.requestAnimationFrame(step);
  }

  // ==========================================
  // 5. 繪製走勢圖 (Chart.js)
  // ==========================================
  function renderTrendChart(trendData) {
    const ctx = document.getElementById('trendChart').getContext('2d');
    
    if (!trendData || trendData.length === 0) return;

    const labels = trendData.map(item => {
      // 格式化日期為月/日 (e.g. 07/09)
      const dateParts = item.date.split('-');
      return dateParts.length === 3 ? `${dateParts[1]}/${dateParts[2]}` : item.date;
    });
    const values = trendData.map(item => item.clicks);

    // 判斷當前佈景主題以設定文字顏色
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#9ca3af' : '#4b5563';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
    
    // 如果已有圖表實例，先銷毀它以防重疊 bugs
    if (window.trendChartInstance) {
      window.trendChartInstance.destroy();
    }

    // 建立漸層
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    if (isDark) {
      gradient.addColorStop(0, 'rgba(99, 102, 241, 0.4)');
      gradient.addColorStop(0.5, 'rgba(139, 92, 246, 0.15)');
      gradient.addColorStop(1, 'rgba(236, 72, 153, 0.0)');
    } else {
      gradient.addColorStop(0, 'rgba(99, 102, 241, 0.25)');
      gradient.addColorStop(0.5, 'rgba(139, 92, 246, 0.08)');
      gradient.addColorStop(1, 'rgba(236, 72, 153, 0.0)');
    }

    window.trendChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: '點擊次數',
          data: values,
          borderColor: '#6366f1',
          borderWidth: 3,
          pointBackgroundColor: '#8b5cf6',
          pointBorderColor: isDark ? '#0b0f19' : '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 7,
          tension: 0.4, // 平滑曲線
          fill: true,
          backgroundColor: gradient
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: isDark ? 'rgba(20, 26, 46, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            titleColor: isDark ? '#fff' : '#1e293b',
            bodyColor: isDark ? '#e2e8f0' : '#4b5563',
            borderColor: '#6366f1',
            borderWidth: 1,
            padding: 12,
            cornerRadius: 8,
            titleFont: { family: 'Outfit, Noto Sans TC', size: 13, weight: '600' },
            bodyFont: { family: 'Outfit, Noto Sans TC', size: 14, weight: '700' },
            displayColors: false
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: textColor, font: { family: 'Outfit', size: 12 } }
          },
          y: {
            grid: { color: gridColor },
            ticks: { 
              color: textColor, 
              font: { family: 'Outfit', size: 12 },
              precision: 0 // 只顯示整數
            },
            min: 0
          }
        }
      }
    });
  }

  // ==========================================
  // 6. 排行榜表格渲染與搜尋
  // ==========================================
  const leaderboardTableBody = document.querySelector('#leaderboard-table tbody');
  const leaderboardSearch = document.getElementById('leaderboard-search');

  function updateLeaderboardTable(data) {
    leaderboardTableBody.innerHTML = '';
    
    if (data.length === 0) {
      leaderboardTableBody.innerHTML = '<tr class="empty-row"><td colspan="4" class="text-center">暫無排名數據</td></tr>';
      return;
    }

    data.forEach((row, index) => {
      const rank = index + 1;
      let rankBadge = '';
      
      if (rank === 1) rankBadge = '<span class="badge-rank gold">1</span>';
      else if (rank === 2) rankBadge = '<span class="badge-rank silver">2</span>';
      else if (rank === 3) rankBadge = '<span class="badge-rank bronze">3</span>';
      else rankBadge = `<span class="badge-rank other">${rank}</span>`;

      // 格式化最後點擊時間
      const lastTimeStr = formatDateTime(row.last_clicked_at);

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="text-center">${rankBadge}</td>
        <td style="font-weight: 600; letter-spacing: 0.5px;">
          <a class="salesperson-link" data-code="${row.salesperson_code}" title="點擊查看詳細點擊時間">${row.salesperson_code}</a>
        </td>
        <td class="text-right"><span class="badge-clicks">${row.clicks}</span> 次</td>
        <td style="color: var(--text-secondary); font-size: 12px;">${lastTimeStr}</td>
      `;
      leaderboardTableBody.appendChild(tr);
    });
  }

  // 即時搜尋排行榜
  leaderboardSearch.addEventListener('input', (e) => {
    const keyword = e.target.value.trim().toUpperCase();
    const filtered = allLeaderboard.filter(row => row.salesperson_code.includes(keyword));
    updateLeaderboardTable(filtered);
  });

  // ==========================================
  // 7. 日誌表格渲染與搜尋
  // ==========================================
  const logsTableBody = document.querySelector('#logs-table tbody');
  const logsSearch = document.getElementById('logs-search');

  function updateLogsTable(data) {
    logsTableBody.innerHTML = '';
    
    if (data.length === 0) {
      logsTableBody.innerHTML = '<tr class="empty-row"><td colspan="5" class="text-center">暫無點擊日誌</td></tr>';
      return;
    }

    data.forEach(row => {
      const timeStr = formatDateTime(row.clicked_at);
      
      // 縮短來源連結顯示
      let refererText = row.referer || '直接存取 / 無來源';
      if (refererText.startsWith('http')) {
        try {
          const urlObj = new URL(refererText);
          refererText = `<a href="${row.referer}" target="_blank" style="color: #6366f1; text-decoration: none;" title="${row.referer}">${urlObj.hostname}${urlObj.pathname.substring(0, 15)}...</a>`;
        } catch (e) {
          // fallback
        }
      }

      // 取得作業系統圖示
      let osIcon = '<i class="fa-solid fa-laptop"></i>';
      if (row.os.toLowerCase().includes('ios')) osIcon = '<i class="fa-brands fa-apple" style="color: #a3a3a3;"></i>';
      else if (row.os.toLowerCase().includes('mac')) osIcon = '<i class="fa-brands fa-apple" style="color: #a3a3a3;"></i>';
      else if (row.os.toLowerCase().includes('android')) osIcon = '<i class="fa-brands fa-android" style="color: #22c55e;"></i>';
      else if (row.os.toLowerCase().includes('windows')) osIcon = '<i class="fa-brands fa-windows" style="color: #0ea5e9;"></i>';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="color: var(--text-secondary); font-family: 'Outfit'; font-size: 12.5px;">${timeStr}</td>
        <td style="font-weight: 600;">${row.salesperson_code}</td>
        <td style="font-size: 12px; display: flex; align-items: center; gap: 6px; border-bottom: none; height: 100%; min-height: 48px;">${osIcon} <span>${row.os}</span></td>
        <td style="font-size: 12px;">${row.browser}</td>
        <td style="font-size: 12px;">${refererText}</td>
      `;
      logsTableBody.appendChild(tr);
    });
  }

  // 即時搜尋日誌
  logsSearch.addEventListener('input', (e) => {
    const keyword = e.target.value.trim().toUpperCase();
    const filtered = allLogs.filter(row => {
      return row.salesperson_code.includes(keyword) || 
             row.os.toUpperCase().includes(keyword) || 
             row.browser.toUpperCase().includes(keyword);
    });
    updateLogsTable(filtered);
  });

  // 時間格式化小工具 (ISO -> Local Chinese Formatted)
  function formatDateTime(isoString) {
    if (!isoString) return '-';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const date = String(d.getDate()).padStart(2, '0');
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const seconds = String(d.getSeconds()).padStart(2, '0');
      
      return `${year}/${month}/${date} ${hours}:${minutes}:${seconds}`;
    } catch (e) {
      return isoString;
    }
  }

  // ==========================================
  // 8. 匯出 CSV 功能 (相容 Express / GAS 雲端)
  // ==========================================
  const exportCsvBtn = document.getElementById('export-csv-btn');
  exportCsvBtn.addEventListener('click', async () => {
    if (useGas) {
      // 雲端無伺服器模式：從目前已載入的所有排行榜與日誌資料，轉出成 CSV 檔案供使用者下載。
      // 注意：GAS 端的 `stats` 僅回傳最新 100 筆。若需要完整歷史數據，可以直接連結至 Google Sheet。
      // 我們在此建立一版以現有資料為底的快速匯出
      if (allLogs.length === 0) {
        alert('無可用數據進行匯出');
        return;
      }
      
      let csvContent = '\ufeff'; // UTF-8 BOM 避免亂碼
      csvContent += '點擊時間,業務員代碼,IP地址,瀏覽器,作業系統,裝置類型,來源網頁\r\n';
      
      allLogs.forEach(click => {
        const time = click.clicked_at || '';
        const code = click.salesperson_code || '';
        const ip = click.ip_address || '';
        const browser = click.browser || '';
        const os = click.os || '';
        const device = click.device || 'desktop';
        const referer = (click.referer || '').replace(/"/g, '""');
        
        csvContent += `"${time}","${code}","${ip}","${browser}","${os}","${device}","${referer}"\r\n`;
      });

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.setAttribute('download', 'mgm_recent_clicks_report.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (isLocal) {
      // 本地模式：直接引導至 Express CSV 下載 API，能下載資料庫內的完整紀錄
      window.location.href = '/api/stats/export';
    } else {
      alert('請先設定 Google Apps Script API 方能啟用報表功能！');
    }
  });

  // ==========================================
  // 9. 業務員點擊明細 Modal 邏輯
  // ==========================================
  const detailModal = document.getElementById('detail-modal');
  const modalSalesCode = document.getElementById('modal-sales-code');
  const modalTotalClicks = document.getElementById('modal-total-clicks');
  const modalLogsTableBody = document.querySelector('#modal-logs-table tbody');
  const modalCloseBtn = document.getElementById('modal-close-btn');

  // 排行榜點擊事件代理
  leaderboardTableBody.addEventListener('click', (e) => {
    const targetLink = e.target.closest('.salesperson-link');
    if (targetLink) {
      e.preventDefault();
      const code = targetLink.dataset.code;
      openSalespersonModal(code);
    }
  });

  async function openSalespersonModal(code) {
    if (!code) return;
    
    // 設定 Modal 標題與重設欄位
    modalSalesCode.textContent = `業務員 [${code}] 點擊明細`;
    modalTotalClicks.textContent = '...';
    modalLogsTableBody.innerHTML = '<tr><td colspan="4" class="text-center">資料載入中...</td></tr>';
    
    // 顯示 Modal
    detailModal.classList.remove('hidden');

    // 計算明細 API 網址
    let detailApiUrl = '';
    if (useGas) {
      detailApiUrl = `${CONFIG.GAS_WEB_APP_URL}?action=detail&code=${encodeURIComponent(code)}`;
    } else if (isLocal) {
      detailApiUrl = `/api/stats/salesperson/${encodeURIComponent(code)}`;
    }

    if (!detailApiUrl) {
      modalLogsTableBody.innerHTML = '<tr><td colspan="4" class="text-center">API 尚未設定</td></tr>';
      return;
    }

    try {
      const response = await fetch(detailApiUrl);
      const res = await response.json();
      
      if (res && res.success) {
        const details = res.data || [];
        modalTotalClicks.textContent = details.length;
        
        modalLogsTableBody.innerHTML = '';
        if (details.length === 0) {
          modalLogsTableBody.innerHTML = '<tr><td colspan="4" class="text-center">暫無詳細記錄</td></tr>';
          return;
        }

        details.forEach(click => {
          const timeStr = formatDateTime(click.clicked_at);
          let refererText = click.referer || '直接存取 / 無來源';
          if (refererText.startsWith('http')) {
            try {
              const urlObj = new URL(refererText);
              refererText = `<a href="${click.referer}" target="_blank" style="color: #6366f1; text-decoration: none;" title="${click.referer}">${urlObj.hostname}${urlObj.pathname.substring(0, 15)}...</a>`;
            } catch (e) {
              // fallback
            }
          }

          // 取得系統圖示
          let osIcon = '<i class="fa-solid fa-laptop"></i>';
          const osLower = (click.os || '').toLowerCase();
          if (osLower.includes('ios') || osLower.includes('mac')) osIcon = '<i class="fa-brands fa-apple" style="color: #a3a3a3;"></i>';
          else if (osLower.includes('android')) osIcon = '<i class="fa-brands fa-android" style="color: #22c55e;"></i>';
          else if (osLower.includes('windows')) osIcon = '<i class="fa-brands fa-windows" style="color: #0ea5e9;"></i>';

          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td style="color: var(--text-secondary); font-family: 'Outfit'; font-size: 12px;">${timeStr}</td>
            <td style="font-size: 11.5px; display: flex; align-items: center; gap: 6px; border-bottom: none; height: 100%; min-height: 48px;">${osIcon} <span>${click.os || 'Unknown'}</span></td>
            <td style="font-size: 11.5px;">${click.browser || 'Unknown'}</td>
            <td style="font-size: 11.5px;">${refererText}</td>
          `;
          modalLogsTableBody.appendChild(tr);
        });
      } else {
        modalLogsTableBody.innerHTML = '<tr><td colspan="4" class="text-center error">讀取明細失敗</td></tr>';
      }
    } catch (err) {
      console.error('明細載入失敗:', err);
      modalLogsTableBody.innerHTML = '<tr><td colspan="4" class="text-center error">連線失敗，請重試</td></tr>';
    }
  }

  // 關閉 Modal 事件
  modalCloseBtn.addEventListener('click', closeModal);
  detailModal.addEventListener('click', (e) => {
    if (e.target === detailModal) {
      closeModal();
    }
  });

  function closeModal() {
    detailModal.classList.add('hidden');
  }

  // ==========================================
  // 10. 頁面初始化加載數據
  // ==========================================
  if (statsApiUrl) {
    fetchStats();
  } else {
    // 沒設定時，繪製一個空的圖表樣本
    renderTrendChart([
      { date: '2026-07-03', clicks: 0 },
      { date: '2026-07-04', clicks: 0 },
      { date: '2026-07-05', clicks: 0 },
      { date: '2026-07-06', clicks: 0 },
      { date: '2026-07-07', clicks: 0 },
      { date: '2026-07-08', clicks: 0 },
      { date: '2026-07-09', clicks: 0 }
    ]);
  }
});
