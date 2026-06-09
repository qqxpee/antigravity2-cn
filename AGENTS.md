# AI Agent Guidelines (AGENTS.md)

Welcome, AI Coding Agent! This file provides persistent context and guidelines for working on the Antigravity localizations project.

---

## 1. Network & Proxy Settings (Git Operations)
For any remote Git operations (e.g., `git push`, `git fetch`, `git pull` from GitHub), you **MUST** use the local network proxy configured for this workspace:
- **Proxy Server Address:** `127.0.0.1:18080`
- **Command to configure proxy:**
  ```powershell
  git config http.proxy http://127.0.0.1:18080
  git config https.proxy http://127.0.0.1:18080
  ```

---

## 2. Core Rules & Workflow

### Rule A: Dictionary Alignment (Mandatory)
Whenever you modify, add, or delete any translation keys in `dicts/` (Simplified Chinese) or `dicts_tw/` (Traditional Chinese):
1. You **MUST** run the verification script in the terminal:
   ```bash
   node scratch/compare_dicts.js
   ```
2. If the script outputs any errors (missing keys in either Simplified or Traditional Chinese dictionaries), you **MUST** fix them to ensure both directories are perfectly aligned. Do not complete your task until the command runs successfully and prints:
   `All dictionaries are perfectly aligned!`

### Rule B: Do NOT Run Installer Scripts
- You **MUST NOT** run `node localization_engine.js` or any other command that applies, injects, or installs the translation into the client application.
- After finishing dictionary changes and validating them with `compare_dicts.js`, inform the user. The user will manually run `双击安装中文汉化.bat` or `双击安装繁体中文.bat` to install them.

### Rule C: Installer Batch File Encodings & Line Endings
If you ever recreate or modify the `.bat` installer files:
1. **Line Endings:** They **MUST** use Windows line endings (**CRLF**, `\r\n`). Unix line endings (`LF`, `\n`) cause syntax errors and character shifting in `cmd.exe` on Windows.
2. **Encodings:**
   - Simplified Chinese scripts (e.g., `双击安装中文汉化.bat`, `双击卸载还原官方英文.bat`): **GBK (Code Page 936)**.
   - Traditional Chinese scripts (e.g., `双击安装繁体中文.bat`): **Big5 (Code Page 950)**.
3. **No `chcp` Commands:** Do not include `chcp` commands in the batch files; rely on native Windows system ANSI decoding.

---

## 3. Scoped Terminology (SC vs. TC)
Always respect proper terminology mappings between Simplified and Traditional Chinese as documented below:

| English / Concept | Simplified Chinese (SC) | Traditional Chinese (TC) |
| :--- | :--- | :--- |
| Agent | 智能体 | 代理 |
| Settings | 设置 | 設定 |
| File | 文件 | 檔案 |
| Browser | 浏览器 | 瀏覽器 |
| Account | 账户 | 帳戶 |
| Window | 窗口 | 視窗 |
| Plugins / Extensions | 插件 | 外掛程式 |
| Shortcut Keys | 快捷键 | 快速鍵 |
| Theme | 主题 | 佈景主題 |
| Terminal | 终端 | 終端機 |
