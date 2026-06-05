# Antigravity 繁體中文化補丁

本資料夾由社群貢獻，將原版簡體中文漢化包改寫為**繁體中文**版本。

## 檔案說明

| 檔案 | 說明 |
|------|------|
| `install-tw.bat` | 雙擊安裝 Windows 繁體中文化 |
| `双击安装繁体中文.command` | 雙擊安裝 macOS 繁體中文化 |
| `restore-en.bat` | 雙擊還原 Windows 官方英文版 |
| `双击卸载还原官方英文.command` | 雙擊還原 macOS 官方英文版 |
| `localization_engine.js` | 核心注入引擎（與原版相同） |
| `dicts_tw/` | 繁體中文翻譯字典（全部重新翻譯） |

## 使用方式

### Windows 使用者
1. **完全退出** Antigravity 軟體。
2. 雙擊 `install-tw.bat` 安裝繁體中文化。
3. 重新啟動 Antigravity 即可。
4. 如需還原英文版，雙擊 `restore-en.bat`。

### macOS 使用者
1. **完全退出** Antigravity 軟體。
2. 首次執行前如果提示權限不足，可在終端機執行 `chmod +x *.command`。
3. 雙擊 `双击安装繁体中文.command` 安裝繁體中文化。
4. 重新啟動 Antigravity 即可。
5. 如需還原英文版，雙擊 `双击卸载还原官方英文.command`。

## 翻譯字典說明

| 檔案 | 內容 |
|------|------|
| `common.json` | 通用按鈕、狀態訊息 |
| `menu_nav.json` | 選單、導覽列、視窗標題 |
| `page_agents.json` | 代理管理頁面 |
| `page_mcp_knowledge.json` | MCP 伺服器、知識庫 |
| `page_workspaces.json` | 工作區、對話 |
| `page_settings.json` | 完整設定頁面 |

## 主要用語對照

| 簡體 | 繁體 |
|------|------|
| 智能体 | 代理 |
| 设置 | 設定 |
| 文件 | 檔案 |
| 浏览器 | 瀏覽器 |
| 账户 | 帳戶 |
| 窗口 | 視窗 |
| 插件 | 外掛程式 |
| 快捷键 | 快速鍵 |
| 主题 | 佈景主題 |
| 终端 | 終端機 |

## 致謝

感謝原作者 [qqxpee](https://github.com/qqxpee/antigravity2-cn) 開發此漢化引擎。
