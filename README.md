# MGM 業務推廣連結系統 (MGM Link Hub)

一個為業務員開發的 MGM (Member Get Member) 活動推廣連結生成器與實時數據統計儀表板。支援 **免伺服器雲端運行 (GitHub Pages + Google Sheets)** 與 **本地開發/私有伺服器部署 (Express + SQLite/JSON)**。

*   **GitHub Pages 儀表板入口**：[https://hub-google.github.io/mgm2/](https://hub-google.github.io/mgm2/)
*   **Google 試算表點擊資料庫**：[https://drive.google.com/open?id=163CDklL-moTtpu0ZiKb7faU75xz3Ib-r52fjSgGqq2A](https://drive.google.com/open?id=163CDklL-moTtpu0ZiKb7faU75xz3Ib-r52fjSgGqq2A)
*   **Google Apps Script 後台管理**：[https://script.google.com/d/1unVP4Q-vjCT-_5oD61hEBSZxIsGQcdovdBexqSguafM-ORDjA4TEaCZ7/edit](https://script.google.com/d/1unVP4Q-vjCT-_5oD61hEBSZxIsGQcdovdBexqSguafM-ORDjA4TEaCZ7/edit)

---

## 1. 系統運作原理 (System Architecture)

為了達到「零託管成本、數據高透明度、易於管理」的目標，系統將前端頁面託管於免費的 **GitHub Pages**，並使用 **Google 試算表 (Google Sheets)** 作為雲端資料庫，透過 **Google Apps Script (GAS) Web App** 提供 API 服務。

```
                               ┌────────────────────────┐
                               │     GitHub Pages       │
                               │  (靜態網頁與404跳轉攔截)  │
                               └───────────┬────────────┘
                                           │
                        (點擊上報 / 查詢統計)│(重新導向)
                                           ▼
  ┌────────────────────────┐   (HTTPS API) ┌────────────────────────┐
  │   Google Apps Script   ├──────────────►│    LINE OA 邀請連結    │
  │   (雲端處理與資料寫入)   │               │ (https://r.botbonnie...)│
  └───────────┬────────────┘               └────────────────────────┘
              │
      (寫入)  ▼
  ┌────────────────────────┐
  │    Google 試算表       │
  │    (clicks 工作表)     │
  └────────────────────────┘
```

### 專屬邀請連結生成原理
1. **動態網址建構**：
   在網頁前端，JavaScript 透過 `window.location.origin` 與 `window.location.pathname` 自動取得當前網站部署的根目錄。
2. **參數拼接**：
   當業務員輸入代碼（例如 `A001`）後，前端將代碼清理並拼接到根網域後方，生成：`https://hub-google.github.io/mgm2/A001`。
3. **二維碼生成**：
   利用 `qrcode.min.js` 庫在瀏覽器端直接繪製出對應連結的二維碼，業務員可直接複製網址或將二維碼下載為 PNG 圖片發送給客戶。

### 客戶點擊記錄與跳轉原理 (404 路由攔截)
1. **網址攔截**：
   當客戶點擊 `https://hub-google.github.io/mgm2/A001` 時，由於 GitHub Pages 是靜態空間且不存在 `/A001` 資料夾，伺服器會返回 `404.html`。
2. **代碼解析**：
   我們在 `404.html` 寫入攔截程式碼，利用 JavaScript 解析網址路徑，取得最後一個節點 `"A001"`，從而得知是哪位業務員推薦。
3. **數據上報**：
   `404.html` 從客戶瀏覽器收集 User-Agent（解析作業系統與瀏覽器）與來源網址（Referer），非同步向 Google Apps Script Web App 發送請求：
   `https://script.google.com/macros/s/[GAS-ID]/exec?action=log&code=A001&...`
4. **試算表寫入**：
   Google 伺服器接收請求後，於試算表的 `clicks` 表中寫入一列數據，並自動標記寫入的時間戳記。
5. **秒級跳轉**：
   在發送請求的同時，`404.html` 在背景執行 `window.location.href = "https://r.botbonnie.com/H52rK"`，將客戶在 0.5 秒內跳轉到最終 LINE OA 連結，完成加好友。

### 排行榜與點擊明細查詢原理
- 當打開儀表板首頁時，前端會調用 GAS 的 `action=stats` API 讀取試算表中的所有點擊歷史，並計算出總點擊數、今日點擊數與業務員排行。
- 排行榜中每個業務代碼皆綁定了點擊監聽器。點擊某個業務代號（如 `A001`）時，前端會透過 GAS 的 `action=detail&code=A001` 取得該業務代碼的**每一筆詳細點擊時間、裝置系統與瀏覽器**，並在網頁上以精緻的 Modal 視窗呈現。

---

## 2. 本地開發與私有伺服器部署 (Express Mode)

如果您希望在本地電腦運行或將其部署至專屬的伺服器（如 Node.js 主機），系統同樣內建了 Express 後端與 SQLite / JSON 本地資料庫雙模支援。

### 啟動指令
1. 安裝本地端依賴：
   ```bash
   npm install
   ```
2. 啟動伺服器：
   ```bash
   node server.js
   ```
3. 本地後台網址：[http://localhost:3000](http://localhost:3000)
4. 本地專屬跳轉連結測試：[http://localhost:3000/TEST_CODE](http://localhost:3000/TEST_CODE)

---

## 3. Google Apps Script (GAS) 首次啟用一鍵授權

1. 開啟您的 **[Apps Script 後台](https://script.google.com/d/1unVP4Q-vjCT-_5oD61hEBSZxIsGQcdovdBexqSguafM-ORDjA4TEaCZ7/edit)**。
2. 確認上方下拉選單選擇了 `doGet` 函式。
3. 點選工具列上的 **執行 (Run)** 按鈕。
4. 此時會彈出「需要授權」視窗，請點選 **核對權限 (Review Permissions)**。
5. 選擇您目前的 Google 帳戶（即建立此試算表的帳號）。
6. 當出現安全性警告時，點選 **「進階」 (Advanced)** -> 再點選 **「前往 MGM2_Database (不安全)」**。
7. 點選 **允許 (Allow)** 即可完成啟用！
