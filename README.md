# MGM 業務推廣連結系統 (MGM Link Hub)

一個為業務員開發的 MGM (Member Get Member) 活動推廣連結生成器與實時數據統計儀表板。支援 **免伺服器雲端運行 (GitHub Pages + Google Sheets)** 與 **本地開發/私有伺服器部署 (Express + SQLite/JSON)**。

*   **GitHub Pages 儀表板入口**：[https://hub-google.github.io/mgm2/admin/](https://hub-google.github.io/mgm2/admin/) (已隱蔽安全分流)
*   **Google 試算表點擊資料庫**：[https://drive.google.com/open?id=163CDklL-moTtpu0ZiKb7faU75xz3Ib-r52fjSgGqq2A](https://drive.google.com/open?id=163CDklL-moTtpu0ZiKb7faU75xz3Ib-r52fjSgGqq2A)
*   **Google Apps Script 後台管理**：[https://script.google.com/d/1unVP4Q-vjCT-_5oD61hEBSZxIsGQcdovdBexqSguafM-ORDjA4TEaCZ7/edit](https://script.google.com/d/1unVP4Q-vjCT-_5oD61hEBSZxIsGQcdovdBexqSguafM-ORDjA4TEaCZ7/edit)

---

## 1. 系統運作原理 (System Architecture)

為了達到「零託管成本、數據高隱蔽、防窺探」的目標，系統將管理後台放置在 GitHub Pages 的私密子目錄下（`/admin/`），並以 Google Apps Script Web App 代替 GitHub Pages 作為跳轉中繼站。

```
                              ┌────────────────────────┐
                              │  Google Apps Script    │
                              │ (HTML跳轉器與寫入處理)  │
                              └───────────┬────────────┘
                                          │
                        (點擊上報 / 寫入) │(重新導向)
                                          ▼
  ┌────────────────────────┐  (HTTPS API) ┌────────────────────────┐
  │     Google 試算表      │◄─────────────┤    LINE OA 邀請連結    │
  │     (clicks 工作表)    │              │ (https://r.botbonnie...)│
  └────────────────────────┘              └────────────────────────┘
              ▲
              │(查詢統計 JSON)
  ┌───────────┴────────────┐
  │     GitHub Pages       │
  │  (/admin/ 隱密後台面板)  │
  └────────────────────────┘
```

### 專屬邀請連結生成原理
- **直連 GAS 跳轉網址**：邀請網址不再使用 GitHub Pages 域名，而是直接指向您的 GAS Web App：`https://script.google.com/macros/s/[GAS-ID]/exec?code=A001`。
- **is.gd 短網址隱形**：前端自動調用 `is.gd` API，將上方的長網址縮短為例如 `https://is.gd/xxxxxx` 的簡潔網址。客戶收到的連結與掃描 QR Code 的結果都是該短網址，彻底遮蔽了您的後台系統域名。

### 客戶點擊記錄與跳轉原理
1. **點擊短網址**：客戶點擊短網址後跳轉到 Google 的 GAS 伺服器，GAS 判斷帶有 `code`，動態回傳一段隱形載入 HTML 網頁。
2. **收集與寫入**：載入頁面在客戶瀏覽器中背景讀取作業系統、瀏覽器與來源網址，並向 GAS 上報寫入 Google 試算表，自動記錄伺服器精準時間戳記。
3. **秒級重定向**：背景上報的同時，網頁 JavaScript 執行 `window.top.location.href`，在半秒內將客戶導向 LINE OA，完成加好友。
4. **防窺防護**：客戶在跳轉鏈中**完全不會接觸到 `hub-google.github.io`**（您的 GitHub Pages 網址）。即使客戶手動刪除參數訪問 GAS 根網址，也會被直接重新導向到 LINE OA，無法窺探後台。

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
3. 本地後台網址：[http://localhost:3000/admin/](http://localhost:3000/admin/)
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
8. **重要**：點選右上角 **部署 (Deploy)** -> **管理部署 (Manage deployments)** -> 點選最上方第 4 版（最新的 `MGM2_Web_App_v3_redirect`）旁邊的 **「編輯 (鉛筆)」** -> 將 **「誰有權限存取」 (Who has access)** 改成 **「所有人」 (Anyone)**，點選 **部署** 儲存。
