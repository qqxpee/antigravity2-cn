# Antigravity 2.0 智能編程中文語言包 & 繁體中文引擎

👉 **[簡體中文版說明文件 (Simplified Chinese README)](README.md)**

> **支援系統**：Windows & macOS (均已內建一鍵指令碼)  
> **匹配版本**：Antigravity v2.33.0+  

> **核心引擎**：Node.js (無需安裝 Python，零依賴，極速極穩)  
> **中文化範圍**：包括軟體介面、滑鼠懸浮提示 (Tooltip)、Sidecar 伴生面板（含 Swarm 面板與 `plugin://` 子框架）、頂部系統功能表、工作列與原生系統右鍵選單 (Context Menu)、主處理程序原生彈出視窗（結束確認、WSL/SSH 提示、裝置與 Passkey 選取等）、更新彈出視窗、載入動畫、設定面板、外掛程式與自訂項目、新手導覽及登入頁。  
> **注入原理**：透過純 Node.js 原生解析並校驗重新封裝 `app.asar`，安全注入前端 `preload.js` 動態隔離引擎與主處理程序補丁，絕不修改核心二進位檔案，一鍵安裝與無損還原。

## 📸 中文化效果展示

以下是部分功能區塊的實際在地化效果展示，涵蓋登入導覽頁、主編輯器介面與詳細設定面板：

### 1. 歡迎頁與登入新手引導
![歡迎頁與登入新手引導](./showimg/showlogin_tw.png)

### 2. 主編輯器介面與選單
![主編輯器介面與選單](./showimg/showmain_tw.png)

### 3. 詳細參數設定面板
![詳細參數設定面板](./showimg/showmenu_tw.png)

---

## 📂 專案檔案結構
- **`双击安装繁体中文.bat`** / **`.command`**：Windows / macOS 一鍵繁體中文化執行入口（另有對應簡體中文版指令碼）。
- **`双击卸载还原官方英文.bat`** / **`.command`**：Windows / macOS 一鍵完美恢復原版入口。
- **`localization_engine.js`**：核心中文化排程引擎，負責環境偵測、進程鎖釋放、詞典編譯、快取清除及 macOS `Info.plist` 校驗與自動重新簽名。
- **`src/`**：模組化核心原始碼：
  - `preload_runtime.js`：前端 DOM 動態隔離與表驅動正規表達式引擎（含內容隔離、Shadow DOM 穿透與原生右鍵選單掛鉤）。
  - `main_patches.js`：主處理程序補丁集（`preload.js`、`utils.js` Sidecar 注入、`menu.js`、`tray.js`、`loadingOverlay.js`、`updater.js` 及 `main.js` 等原生彈出視窗模組）。
  - `asar_patcher.js`：零依賴純 Node.js 二進位 ASAR 讀取、補丁寫入與候選封裝完整性校驗器。
- **`dicts/`** / **`dicts_tw/`**：簡繁雙語對照詞典資料夾（各 6 個分模組 JSON 檔案）。
- **`scripts/`**：工程與自動化工具集，包含簡繁詞典對齊與禁用詞校驗器 (`compare_dicts.js`)、版本升級全量介面/懸浮/範本文字自動 Diff 掃描器 (`dev_tool.js scan-ui`) 及 MCP 基準清冊 (`dev_tool.js dump-mcp`)。
- **`tests/`**：基於 Node 原生 test runner 與 `jsdom` 的自動化回歸測試套件。

---

## 🇹🇼 繁體中文（台灣 `zh-TW`）在地化與術語校訂方案

本專案的繁體中文支援並非將簡體詞庫做字元直轉（如純字形轉換），而是採取**獨立維護 + 台灣開發者標準術語校訂 + 自動化門禁校驗**的方案：

1. **術語對齊基準**：
   - 對齊 Microsoft / Visual Studio Code 繁體中文（台灣）語言套件、Google 台灣產品在地化規範及 macOS 系統介面慣用語，並結合開源台灣術語庫（如 `rajatim/zhtw` 與 `OpenCC` 台灣慣用詞表）及英文原鍵進行逐條語意審校。
   - **主要術語對照標準**：
     | 英文概念 | 台灣繁體 (`dicts_tw/`) | 嚴禁誤用之非台灣詞彙 |
     | :--- | :--- | :--- |
     | Agent / Subagent | **代理** / **子代理** | ❌ 智能體 / 子智能體 |
     | Settings / Config / Preferences | **設定** / **設定檔** / **偏好設定** | ❌ 設置 / 配置 / 配置文件 |
     | Access / Permissions / Policy / Identity | **存取** / **權限** / **原則** / **身分** | ❌ 訪問 / 許可權 / 身份 |
     | Save / Archive / Pin / Uninstall | **儲存** / **封存** / **釘選** / **解除安裝** | ❌ 保存 / 歸檔 / 置頂 / 卸載 |
     | Send / Get / Sign in / Quit | **傳送** / **取得** / **登入** / **結束** | ❌ 發送 / 獲取 / 登錄 |
     | View / Layout / Scroll / Drag / Click | **檢視** / **版面配置** / **捲動** / **拖曳** / **按一下** | ❌ 視圖 / 佈局 / 滾動 / 拖拽 |
     | Undo / Reset / Disable / Replace | **復原** / **重設** / **停用** / **取代** | ❌ 撤銷 / 重置 / 禁用 / 替換 |
     | Artifact / Repository / Workflow / Sandbox | **成品** / **程式碼存放庫** / **工作流程** / **沙箱** | ❌ 產物 / 交付件 / 倉庫 / 工作流 / 沙盒 |
     | Audio / Video / Function / Token / Tab | **音訊** / **影片** / **函式** / **權杖** / **分頁** | ❌ 音頻 / 視頻 / 函數 / 令牌 / 標籤頁 / 選項卡 |
     | Quotes / Menu / Instance / Popup | **「」** / **選單** / **執行個體** / **彈出視窗** | ❌ “” / 菜單 / 實例 / 彈窗 |

2. **語意與脈絡區分（避免盲目字面替換）**：
   - 依英文原文區分多義詞：例如 `file` 譯為「**檔案**」、`document` 譯為「**文件**」；介面操作 `Undo` 譯為「**復原**」、憑證 `revoked` 則維持「**撤銷**」；`Unload/Unmount` 譯為「**卸載**」、`Uninstall` 則譯為「**解除安裝**」。
   - 前端動態規則（[`src/preload_runtime.js`](src/preload_runtime.js)）與主處理程序原生選單／彈出視窗（[`src/main_patches.js`](src/main_patches.js)）均透過 `--tw` 切換旗標同步套用相同的台灣術語規範。

3. **自動化品質門禁（防止非台灣用語迴流）**：
   - [`scripts/compare_dicts.js`](scripts/compare_dicts.js) 在每次驗證與 CI 流程中強制執行：
     - 簡繁詞典（`dicts/` 與 `dicts_tw/`）檔案數與鍵值 **100% 對齊**（含跨檔重複鍵與正規化碰撞檢查）。
     - 掃描 `dicts_tw/` 所有譯文，**零容忍**簡體字殘留、港式異體字（`啓`/`爲` 等）以及上述數十項非台灣慣用詞／正規規則。
   - **識別尾碼說明**：本專案內繁體中文相關資源與參數統一以 **`tw` / `TW`** 作為尾碼識別（如詞典目錄 `dicts_tw/`、說明文件 `README_TW.md`、示範截圖 `showimg/*_tw.png` 與命令列旗標 `--tw`）。

---

## 🚀 極速使用指南

### 1. 取得中文化包程式碼（二選一）

* **方法 A：直接下載 ZIP 壓縮檔（最便捷 📦）**
  1. 點選頁面右上角綠色的 **`Code`** 按鈕。
  2. 在下拉式選單中選擇 **`Download ZIP`** 並下載。
  3. 將下載好的壓縮檔**解壓縮至您電腦本機的任意目錄**（例如您的 `Downloads` 資料夾）。

* **方法 B：透過 Git 命令列複製（開發者推薦 💻）**
  如果您本機安裝了 Git，可以直接在終端機執行複製命令：
  ```bash
  # 如果您在受限網路環境且鏡像可用，可透過代理加速複製（如鏡像失效請更換其他可用代理）：
  git clone https://mirror.ghproxy.com/https://github.com/qqxpee/antigravity2-cn.git
  
  # 如果您已設定全域代理，可直接使用官方位址：
  git clone https://github.com/qqxpee/antigravity2-cn.git
  ```

---

### 2. 一鍵安裝中文化
1. **完全結束** Antigravity 編程軟體。
2. 進入您解壓縮或複製出來的 `antigravity2-cn` 資料夾：
   - **Windows**：按兩下執行 **`双击安装繁体中文.bat`**。
   - **macOS**：按兩下執行 **`双击安装繁体中文.command`**。
3. 依提示選擇左上角品牌顯示方式：顯示英文 Antigravity（預設推薦）、不顯示品牌名稱、或顯示繁體中文品牌名。
4. 執行完成後，重新啟動 Antigravity 軟體，即可暢享全繁體中文介面！

### 品牌顯示命令列參數

如果您透過命令列執行 `localization_engine.js`，可使用 `--brand-title` 控制左上角品牌名：

```bash
# 預設推薦：左上角顯示 Antigravity
node localization_engine.js --tw --brand-title english

# 隱藏左上角品牌名
node localization_engine.js --tw --brand-title hidden

# 顯示繁體中文品牌名
node localization_engine.js --tw --brand-title translated
```

---

### 3. 一鍵解除安裝還原
1. **完全結束** Antigravity 編程軟體。
2. 在目前資料夾下：
   - **Windows**：按兩下執行 **`双击卸载还原官方英文.bat`**。
   - **macOS**：按兩下執行 **`双击卸载还原官方英文.command`**。
3. 執行完成後，軟體將自動清除所有中文化注入，無痕恢復至官方原版英文狀態。

---

## 🔌 可選進階功能：網路透明代理自動注入 (Windows 免 TUN 方案)

如果您處於網路受限環境（例如連線 Google AI / Gemini API 遇到限制），且不想開啟虛擬網卡/全域 TUN 模式，本專案現已支援在安裝中文化時**自動聯動注入 Windows 免 TUN 強制代理工具**。

該代理方案基於開源專案 **[yuaotian/antigravity-proxy](https://github.com/yuaotian/antigravity-proxy)**（基於 MinHook 的 DLL 劫持透明代理）。

### 使用方法：
1. 前往 **[yuaotian/antigravity-proxy](https://github.com/yuaotian/antigravity-proxy)** 下載編譯好的檔案：
   - `version.dll`
   - `dbghelp.dll`
   - `config.json`
2. 在目前中文化專案根目錄新增 `proxy_config` 資料夾（該目錄已設定 `.gitignore` 本機排除，絕不會被 Git 提交污染）。
3. 將下載的 `version.dll`、`dbghelp.dll` 及依您本機代理連接埠（如 `127.0.0.1:7890` / `18080`）編輯好的 `config.json` 放入 `proxy_config/` 目錄。
4. 正常按兩下執行 **`双击安装繁体中文.bat`**：
   - 中文化引擎將**自動偵測** `proxy_config/` 目錄。
   - 一步自動完成 **“介面繁體中文化 + 代理模組注入與同步更新”**，若有代理設定變動會自動覆寫更新，無需再在軟體更新後每次手動複製 DLL 檔案！
5. **完全可選 & 零破壞**：
   - 如果您沒有建立 `proxy_config/` 目錄或不需要代理，安裝過程與原先 100% 一致，僅進行純淨中文化。
   - 執行 **`双击卸载还原官方英文.bat`** 時還原官方中文化，並保留已注入的代理檔案（避免誤刪外部代理或影響英文環境下的網路連線；如需移除代理可手動刪除對應檔案）。

---

## 🛠️ 中文化原理說明

本引擎採用 **零依賴原生 ASAR 校驗重包模式**，專為 **Antigravity 2.0+** 的 Electron 架構量身打造：
1. **自動釋放鎖與多級快取清除**：指令碼執行前會自動偵測並安全關閉 Antigravity 執行進程；注入完成後自動遞迴清除 `Antigravity` / `Antigravity IDE` 頂層及 `Partitions/hub-browser-*` 等分區下的 `Cache`、`Code Cache`、`GPUCache` 位元組碼快取。
2. **安全備份與交易保護**：首次執行時在軟體目錄建立原始 `app.asar.bak` 備份；建置候選封裝並逐檔通過 `node --check` 與完整性校驗後才原子替換，支援隨時無損還原。
3. **精準注入**：
   - `preload.js`：採用 `WeakMap` / `WeakSet` 與 Shadow DOM 穿透，啟動微任務合批的 `MutationObserver` 引擎，在嚴格隔離程式碼編輯器、終端機與訊息正文的前提下動態中文化介面，並攔截原生右鍵選單 IPC。
   - `utils.js`：在主視窗載入並校驗目標來源後，向 Sidecar 伴生面板子框架（`http(s)://` 與 `plugin://`）注入動態中文化執行時。
   - `menu.js` / `tray.js` / `updater.js` / `loadingOverlay.js`：中文化系統級標題列選單、系統匣選單、更新檢查彈出視窗以及啟動載入頁（`正在載入 Antigravity…`）。
   - 主處理程序原生彈出視窗與內建頁面（`main.js`、`ipcHandlers.js`、`remoteManager.js`、`sshPrompts.js`、`deviceChooser.js`、`webauthn.js`、`webviewPopupSecurity.js`、`provisionSplash.js`）：涵蓋結束確認視窗、macOS Dock 選單、WSL 初始化與錯誤提示、SSH 安全金鑰提示、裝置/Passkey 選取與彈出視窗連線安全資訊。

---

## 💡 如何透過 AI 助手自動補充或修改中文化？

如果在使用過程中，您發現了漏譯的英文，或者覺得某些繁體中文翻譯不夠道地，**您可以直接在對話輸入框中命令您的 AI 編程助手（即 Antigravity）來幫您更新詞庫**！無論是直接傳送螢幕截圖還是描述文字，AI 都會自動幫您把對照詞條寫入詞典。

> [!IMPORTANT]
> **⚠️ AI 助手如何定位您的中文化詞庫檔案？**
> 
> 1. **推薦做法（最省心）**：
>    在 Antigravity 軟體中，按一下 **「開啟資料夾 (Open Folder)」**，直接將本中文化包目錄（即包含目前 `README_TW.md` 的資料夾）作為**專案/工作區**開啟，然後在此工作區下與 AI 對話。此時 AI 能夠直接感知並讀寫目前專案，您不需要提供任何路徑，直接傳送翻譯要求，AI 就能在背景自動幫您改好詞典！
> 
> 2. **免開專案做法（提示詞中需指定中文化目錄）**：
>    如果您目前正在開發別的專案，沒有把中文化目錄作為專案開啟，那麼您在對 AI 發起中文化指令時，**必須在提示詞裡明確告訴 AI 您的中文化包所在路徑**，否則 AI 無法得知要修改您電腦上的哪個資料夾。
>    * **提示詞範例**：
>      > **「我的中文化包目錄在 `C:\Users\您的電腦使用者名稱\Downloads\antigravity2-cn`（請替換為您本機的實際路徑），請幫我把下面這張截圖裡漏譯的內容補全到詞典裡。」**

### 📋 常用提示詞（Prompt）範本

#### 1. 方式一：直接在對話中傳送截圖（推薦 📸）
如果您不方便打字，可以直接將未中文化乾淨的介面截圖貼上傳送給 AI，並附帶以下指令：
> **「幫我把這張截圖裡所有未中文化的英文選項和面板內容補全到繁體中文詞典中。」**
*(AI 會自動透過視覺辨識截圖中的全部英文，並精準寫入字典。)*

#### 2. 方式二：直接在對話中傳送文字描述（極速 ✍️）
如果您只想修改或增加某一個特定詞彙，可以直接傳送文字描述給 AI：
> **「幫我把漏譯的英文 'Allow agent to view and edit files outside of the current workspace automatically' 翻譯為 '允許代理自動檢視並編輯目前工作區之外的檔案'。」**
*(AI 會立即找到對應的詞典並精準修改或追加該詞條。)*

---

### 🔄 更新生效流程
1. **命令 AI 更新**：在對話中透過截圖或文字告訴 AI 您的中文化需求，AI 會自動更新 `dicts_tw/` 下的字典檔案。
2. **結束軟體**：**完全結束**您的 Antigravity 軟體。
3. **重新注入**：在目前資料夾中**再次按兩下執行 `双击安装繁体中文.bat` / `.command`** 重新部署中文化。
4. **重啟軟體**：重新開啟 Antigravity，您的改動即可完美生效！

---

## 🧩 版本升級差異掃描與 MCP 清單自動對齊 (歡迎社群共建)

Antigravity 2.x 的前端 SPA 與「**新增 MCP 伺服器 (Add MCP Server)**」市場目錄均由用戶端內建 `language_server` 與雲端 RPC 動態提供。版本升級時無需手動逐頁截圖，專案已內建直連用戶端的自動化掃描工具 [`scripts/dev_tool.js`](scripts/dev_tool.js)：

### 📌 極簡同步流程（AI 助手 / 開發者適用 💻）
1. 先啟動並開啟最新版 Antigravity 用戶端（確保背景 `language_server` 進程正在執行）。
2. 在專案根目錄執行以下指令掃描版本升級差異：
   ```bash
   # 1. 掃描全量介面、懸浮提示與範本文字差異（結果輸出至 scratch/untranslated_ui_diff.json）
   node scripts/dev_tool.js scan-ui

   # 2. 拉取最新官方 MCP 目錄並與基準清冊對比（發現變更時輸出至 scratch/mcp_catalog_diff.json）
   node scripts/dev_tool.js dump-mcp
   ```
3. 將產生的 `scratch/` 增量檔案交給 AI 助手，依規範補充翻譯至 `dicts/` 與 `dicts_tw/`（或調整 `src/preload_runtime.js` 動態規則）。
4. 執行校驗並更新基準：
   ```bash
   node scripts/compare_dicts.js
   node scripts/dev_tool.js scan-ui --update-baseline
   node scripts/dev_tool.js dump-mcp --update-baseline
   ```
5. 清除 `scratch/` 後重新執行安裝指令碼即可立即生效；歡迎提交 Pull Request 共同維護！

> 💡 **提示**：更多診斷指令（如 `port`、`search`、`slice`）可直接查閱 [`scripts/dev_tool.js`](scripts/dev_tool.js) 頂部的註解說明。

---

## 📝 詞典自訂指南 (供極客手動使用)

如果您想手動修改翻譯，可以直接開啟 `dicts/`（簡體）或 `dicts_tw/`（繁體）目錄下的 6 個 JSON 檔案：
- **`common.json`**：公共基礎詞彙、側邊欄概覽、登入頁、常用按鈕等。
- **`menu_nav.json`**：系統及選單列翻譯。
- **`page_main.json`**：主對話區、編輯器、工作區及核心互動文字。
- **`page_agents.json`**：代理 / 子代理 / Swarm 協作相關文字。
- **`page_settings.json`**：詳細設定面板與權限二級選單對照。
- **`page_mcp_knowledge.json`**：官方 MCP 伺服器及知識庫說明翻譯。

在 JSON 中新增一行，格式如下即可（注意英文逗號）：
```json
"Original English Text": "您的繁體中文翻譯"
```
儲存後，按兩下執行 **`双击安装繁体中文.bat` / `.command`** 重新部署中文化即可。

---

## 常見問題解答 (FAQ)

### 1）提示「解包失敗」或缺少 npm 環境
* **原因**：中文化引擎依賴 Node.js 進行 ASAR 封裝的解析。
* **解決**：由於 Antigravity 本身就是一個基於 Node.js/Electron 的程式，您的電腦一般都已內建環境。如果極少數情況下報錯，只需在電腦安裝 [Node.js](https://nodejs.org/)（LTS 版本即可）並重新啟動指令碼。

### 2）提示「權限不足」或 macOS 提示「無法開啟」
* **解決**：
  - **Windows**：請對 `双击安装繁体中文.bat` 按右鍵，選擇 **「以系統管理員身分執行」**。
  - **macOS**：若按兩下執行 `.command` 提示無法開啟或沒有執行權限，可在終端機中執行 `chmod +x *.command` 來授權。如果是系統安全攔截，請在「系統設定 -> 隱私權與安全性」中按一下「仍要開啟」。本中文化包已內建自動重新簽名機制，修改後會重新進行 Ad-hoc 簽名以防止 macOS 提示應用程式損壞。

### 3）軟體官方更新後，中文化失效了怎麼辦？（含 Windows 自檢啟動器）
* **原因**：Antigravity 內建 `electron-updater`（`autoDownload = true`、`autoInstallOnAppQuit = true`），背景下載的更新封裝會在您結束軟體時靜默安裝並覆蓋 `resources/app.asar`，因此下次開啟會變回英文。
* **手動恢復**：完全結束軟體，重新按兩下執行 **`双击安装繁体中文.bat`**（macOS 使用者執行 **`双击安装繁体中文.command`**）即可恢復繁體中文。
* **Windows 自動自檢啟動**：可在終端機或捷徑中執行 `node scripts/ensure_localized.js --fix --launch --tw`（或於 **`启动Antigravity(自动检查汉化).bat`** 內加上 `--tw`）。啟動前會自動檢查 `app.asar` 是否含漢化標記，若已被官方自動更新覆蓋且目標用戶端未在執行，會沿用上次的 `--tw` / `--brand-title` 偏好以 `--no-kill` 重新注入後再啟動（若修復失敗會中止啟動並回報錯誤，不會直接啟動英文版；如需切換簡體可傳入 `--sc`）。

### 4）在簡體中文 Windows 上執行繁體版指令碼提示亂碼怎麼辦？
* 為相容繁體中文 Windows（字碼頁 `CP950`），`双击安装繁体中文.bat` 依 Big5 編碼儲存；在簡體中文 Windows（預設 `CP936`）直接按兩下時終端機提示會顯示亂碼。可在 CMD 中先切換字碼頁再執行：`chcp 950 && 双击安装繁体中文.bat`，或直接執行 `node localization_engine.js --tw --brand-title english`。

---

## 回歸測試

測試依賴固定為 jsdom `30.1.3`，需 Node.js `^22.22.2 || ^24.15.0 || >=26.0.0`；建議使用 Node.js 24.15.0 或更新的 24.x 版本。在專案目錄執行：

```sh
npm ci
npm test
node --check localization_engine.js
node --check src/preload_runtime.js
node --check src/main_patches.js
node --check src/asar_patcher.js
node --check scripts/ensure_localized.js
node --check scripts/compare_dicts.js
node --check scripts/dev_tool.js
node scripts/compare_dicts.js
```

測試從目前原始碼產生翻譯指令碼，在 jsdom 與暫存資料夾中驗證內容隔離、表單值、Shadow DOM、Swarm/Sidecar 閘道、主處理程序彈出視窗 ASAR 校驗、多級快取清除及範本動態規則行為，不啟動或修改本機 Antigravity。GitHub Actions 會在 Windows 和 Linux 上執行這些檢查。

---

## 📈 Star 增長趨勢與社群生態 (Star History)

[![Star History Chart](https://api.star-history.com/svg?repos=qqxpee/antigravity2-cn&type=Date)](https://star-history.com/#qqxpee/antigravity2-cn&Date)

---

## 🤝 致謝
- 感謝所有參與測試與回饋的貢獻者！
- 特別鳴謝 **[yuaotian/antigravity-proxy](https://github.com/yuaotian/antigravity-proxy)** 提供優秀的 Windows 免 TUN 強制代理注入方案。
- 特別鳴謝 **[yiheng8023/antigravity-chinese](https://github.com/yiheng8023/antigravity-chinese)** 開放的詞典成果（MIT 授權條款），為本次 v2.26.0+ 新增特性詞條整合提供了重要基礎。
