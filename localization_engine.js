const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const child_process = require('child_process');

// macOS 环境下自动补全 PATH，确保 npx、codesign 等工具能被顺利找到
if (process.platform === 'darwin') {
    let realHome = os.homedir();
    if (process.env.SUDO_USER && process.env.SUDO_USER !== 'root') {
        const sudoHome = path.join('/Users', process.env.SUDO_USER);
        if (fs.existsSync(sudoHome)) realHome = sudoHome;
    }
    const extraPaths = [
        '/usr/local/bin',
        '/opt/homebrew/bin',
        '/opt/homebrew/sbin',
        '/opt/local/bin',
        path.join(realHome, '.volta', 'bin'),
        path.join(realHome, '.asdf', 'shims'),
        path.join(realHome, '.local', 'share', 'mise', 'shims'),
        path.join(realHome, '.local', 'bin'),
        path.join(realHome, '.fnm', 'current', 'bin'),
        path.join(realHome, '.local', 'share', 'fnm', 'aliases', 'default', 'bin'),
        path.join(realHome, 'Library', 'Application Support', 'fnm', 'aliases', 'default', 'bin')
    ];
    const nvmVersionsDir = path.join(realHome, '.nvm', 'versions', 'node');
    if (fs.existsSync(nvmVersionsDir)) {
        try {
            const versions = fs.readdirSync(nvmVersionsDir).sort();
            for (const v of versions) {
                extraPaths.push(path.join(nvmVersionsDir, v, 'bin'));
            }
        } catch (e) {}
    }
    const currentPaths = (process.env.PATH || '').split(':');
    for (const p of extraPaths) {
        if (!currentPaths.includes(p) && fs.existsSync(p)) {
            currentPaths.unshift(p);
        }
    }
    const nodeBinDir = path.dirname(process.execPath);
    if (!currentPaths.includes(nodeBinDir)) {
        currentPaths.unshift(nodeBinDir);
    }
    process.env.PATH = currentPaths.join(':');
}

// --tw 參數：使用繁體中文字典 (dicts_tw/)，否則使用預設簡體字典 (dicts/)
const USE_TW = process.argv.includes('--tw');
const DICTS_FOLDER = USE_TW ? 'dicts_tw' : 'dicts';
const BRAND_TITLE_ALIASES = {
    english: 'english',
    en: 'english',
    default: 'english',
    hidden: 'hidden',
    hide: 'hidden',
    none: 'hidden',
    translated: 'translated',
    chinese: 'translated',
    cn: 'translated',
    zh: 'translated'
};

function getOptionValue(name, defaultValue) {
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
        if (args[i] === name) {
            return args[i + 1] || defaultValue;
        }
        if (args[i].startsWith(name + '=')) {
            return args[i].slice(name.length + 1);
        }
    }
    return defaultValue;
}

const BRAND_TITLE_MODE = BRAND_TITLE_ALIASES[String(getOptionValue('--brand-title', 'english')).toLowerCase()] || 'english';

if (USE_TW) {
    const logTranslations = {
        "====== 正在安装 Antigravity 中文汉化 ======": "====== 正在安裝 Antigravity 繁體中文漢化 ======",
        "====== 正在卸载中文汉化，恢复官方原版 ======": "====== 正在卸載中文漢化，恢復官方原版 ======",
        "[1] 检测到 Antigravity 客户端正在运行，正在关闭以解除文件锁...": "[1] 偵測到 Antigravity 用戶端正在執行，正在關閉以解除檔案鎖...",
        "[缓存] 已自动清理 ": "[快取] 已自動清理 ",
        " 个应用缓存目录，避免新旧版本字节码冲突。": " 個應用程式快取目錄，避免新舊版本位元組碼衝突。",
        "[签名] 已同步更新 macOS Info.plist 中的 ElectronAsarIntegrity 校验值。": "[簽名] 已同步更新 macOS Info.plist 中的 ElectronAsarIntegrity 校驗值。",
        "[解包] 正在使用 npx 提取 app.asar...": "[解包] 正在使用 npx 提取 app.asar...",
        "[修改] 正在向 preload.js 注入汉化代码...": "[修改] 正在向 preload.js 注入漢化程式碼...",
        "[修改] 注入成功！": "[修改] 注入成功！",
        "[修改] 正在向 menu.js 注入菜单汉化代码...": "[修改] 正在向 menu.js 注入選單漢化程式碼...",
        "[修改] 菜单汉化注入成功！": "[修改] 選單漢化注入成功！",
        "[修改] 正在向 tray.js 注入任务栏菜单汉化...": "[修改] 正在向 tray.js 注入系統匣選單漢化...",
        "[修改] 任务栏菜单汉化注入成功！": "[修改] 系統匣選單漢化注入成功！",
        "[修改] 正在向 loadingOverlay.js 注入加载页汉化...": "[修改] 正在向 loadingOverlay.js 注入載入頁漢化...",
        "[修改] 加载页汉化注入成功！": "[修改] 載入頁漢化注入成功！",
        "[修改] 正在向 updater.js 注入更新弹窗汉化...": "[修改] 正在向 updater.js 注入更新彈出視窗漢化...",
        "[修改] 更新弹窗汉化注入成功！": "[修改] 更新彈出視窗漢化注入成功！",
        "[打包] 正在生成并校验汉化候选包...": "[打包] 正在產生並校驗漢化候選包...",
        "[√] Antigravity 2.0 汉化部署完成！": "[√] Antigravity 2.0 繁體中文化套用完成！",
        "[!] 未找到备份文件 app.asar.bak，可能尚未安装过汉化或备份被删除。": "[!] 未找到備份檔案 app.asar.bak，可能尚未安裝過繁中化或備份已被刪除。",
        "[还原] 正在用官方备份文件恢复...": "[還原] 正在使用官方備份檔案還原...",
        "[权限] 检测到当前用户对 macOS 应用目录缺少写入权限，正在尝试请求管理员权限 (sudo) 重新运行...": "[權限] 偵測到目前使用者對 macOS 應用程式目錄缺少寫入權限，正在嘗試請求管理員權限 (sudo) 重新執行...",
        "[√] 官方 app.asar 已成功恢复！": "[√] 官方 app.asar 已成功還原！",
        "[错误] 手动指定的路径不存在:": "[錯誤] 手動指定的路徑不存在:",
        "[错误] 未在资源目录中找到 app.asar:": "[錯誤] 未在資源目錄中找到 app.asar:",
        "[错误] 解压后未能在指定路径找到 preload.js:": "[錯誤] 解壓後未能在指定路徑找到 preload.js:",
        "[错误] 无法定位有效的资源(resources)目录: ": "[錯誤] 無法定位有效的資源(resources)目錄: ",
        "[错误] 解包失败，可能是由于系统未安装 Node.js/npm 或者网络限制。": "[錯誤] 解包失敗，可能是由於系統未安裝 Node.js/npm 或者網路限制。",
        "[错误] 打包失败。": "[錯誤] 打包失敗。",
        "[警告] 未能在 menu.js 中找到设定的插入点。": "[警告] 未能在 menu.js 中找到設定的插入點。",
        "[签名] 检测到 macOS 平台，正在对应用包进行本地 ad-hoc 深度重签名: ": "[簽名] 偵測到 macOS 平台，正在對應用程式包進行本機 ad-hoc 深度重新簽名: ",
        "[签名] 重新签名成功！": "[簽名] 重新簽名成功！",
        "[警告] 重新签名失败。可能会导致应用无法打开。": "[警告] 重新簽名失敗。可能會導致應用程式無法開啟。",
        "[警告] 未能从路径 ": "[警告] 未能從路徑 ",
        " 识别到有效的 .app 路径，跳过重新签名。": " 識別到有效的 .app 路徑，跳過重新簽名。",
        "[探测] 成功自动识别到 Antigravity 安装目录: ": "[偵測] 成功自動識別到 Antigravity 安裝目錄: ",
        "[错误] 未找到默认安装目录，请使用 --install-dir 手动指定您的安装路径！": "[錯誤] 未找到預設安裝目錄，請使用 --install-dir 手動指定您的安裝路徑！",
        "详情: ": "詳情: ",
        "[跳过] 检测到 --no-kill 参数，跳过关闭 Antigravity 运行进程。": "[跳過] 偵測到 --no-kill 參數，跳過關閉 Antigravity 執行進程。",
        "[启动] 检测到安装前反重力客户端处于开启状态，正在重新启动客户端...": "[啟動] 偵測到安裝前反重力用戶端處於開啟狀態，正在重新啟動用戶端...",
        "[启动] 客户端启动成功！": "[啟動] 用戶端啟動成功！",
        "[警告] 未找到客户端主程序: ": "[警告] 未找到用戶端主程式: ",
        "[警告] 客户端启动失败: ": "[警告] 用戶端啟動失敗: ",
        "[代理] 检测到 proxy_config 配置目录，正在注入代理模块...": "[代理] 偵測到 proxy_config 設定目錄，正在注入代理模組...",
        "[代理] 代理模块注入成功: ": "[代理] 代理模組注入成功: ",
        "[代理] 已保留代理文件（无法确认其归属，请按需手动处理）: ": "[代理] 已保留代理檔案（無法確認其歸屬，請按需手動處理）: ",
        "[代理警告] 注入文件 ": "[代理警告] 注入檔案 "
    };
    const translateMsg = (args) => {
        return args.map(arg => {
            if (typeof arg === 'string') {
                let res = arg;
                for (const [k, v] of Object.entries(logTranslations)) {
                    if (res.includes(k)) {
                        res = res.split(k).join(v);
                    }
                }
                return res;
            }
            return arg;
        });
    };
    const origLog = console.log;
    const origError = console.error;
    const origWarn = console.warn;
    console.log = (...args) => origLog(...translateMsg(args));
    console.error = (...args) => origError(...translateMsg(args));
    console.warn = (...args) => origWarn(...translateMsg(args));
}

const SIGNATURE_START = "/* --- ANTIGRAVITY CHINESE LOCALIZATION START --- */";
const SIGNATURE_END = "/* --- ANTIGRAVITY CHINESE LOCALIZATION END --- */";

function normalizeText(text) {
    if (!text) return "";
    return text.replace(/\s+/g, ' ')
               .trim()
               .replace(/’/g, "'")
               .replace(/‘/g, "'")
               .replace(/“/g, '"')
               .replace(/”/g, '"')
               .replace(/…/g, '...');
}

function loadDictionary() {
    const totalMap = {};
    const dictsDir = path.join(__dirname, DICTS_FOLDER);
    if (fs.existsSync(dictsDir)) {
        const files = fs.readdirSync(dictsDir);
        for (const file of files) {
            if (file.endsWith('.json')) {
                try {
                    const filePath = path.join(dictsDir, file);
                    const fileContent = fs.readFileSync(filePath, 'utf-8');
                    const data = JSON.parse(fileContent);
                    for (const [k, v] of Object.entries(data)) {
                        const normK = normalizeText(k);
                        if (normK) totalMap[normK] = v;
                    }
                } catch (e) {
                    // ignore
                }
            }
        }
    }
    if (BRAND_TITLE_MODE === 'english') {
        delete totalMap[normalizeText('Antigravity')];
    } else if (BRAND_TITLE_MODE === 'hidden') {
        totalMap[normalizeText('Antigravity')] = '';
    }
    return totalMap;
}

function generateJs() {
    const fullDict = loadDictionary();
    const dictJson = JSON.stringify(fullDict);

    const jsSource = `${SIGNATURE_START}
(() => {
    // V12.0 终极隔离版：基于容器回溯的物理隔离引擎
    // 逻辑：不再仅仅检查当前标签，而是向上回溯父级，识别“代码/编辑器”禁区
    const USE_TW = ${USE_TW ? "true" : "false"};
    const map = new Map(Object.entries(DICT_PLACEHOLDER));
    const lowerMap = new Map();
    const LOWER_WORDS_EXCLUDE = new Set(['on', 'in', 'to', 'at', 'by', 'for', 'with', 'as', 'system', 'review', 'active', 'browser', 'global', 'including', 'and', 'or', 'file', 'files', 'help', 'app', 'plan', 'search']);
    for (const [k, v] of map.entries()) {
        const lowerK = k.toLowerCase();
        if (LOWER_WORDS_EXCLUDE.has(lowerK) && k !== lowerK) {
            continue;
        }
        lowerMap.set(lowerK, v);
    }
    
    const longEntries = Array.from(map.entries())
        .filter(([k]) => k.length > 15 && k.includes(' '))
        .sort((a, b) => b[0].length - a[0].length);
    const translatedValues = new WeakMap();

    // 轻量级安全隔离：跳过脚本、样式、代码块(pre/code)
    const SKIP_TAGS = ['SCRIPT', 'STYLE', 'PRE', 'CODE'];

    // 代码、富文本输入框及对话内容隔离选择器：排除 Lexical 输入框、用户消息、AI 响应正文、思考内容、代码块、终端及文件路径
    const CODE_ISOLATION_SELECTOR = 'pre, code, .monaco-editor, .cm-editor, .cm-line, [contenteditable="true"], [contenteditable="plaintext-only"], [contenteditable=""], [data-lexical-editor], .terminal, .xterm, .code-line, .code-block, .line-content, [aria-label="File Viewer"], [data-file-uri], [data-uri], [class*="diffEditor"], .token, .hljs, [class*="mtk"], .font-mono, [data-quotable-inline="true"], .context-scope-mention, [data-testid="file-title-name"], [data-testid="entity-pill"], [data-project-card="true"], [data-testid="conversation-row-sidebar"] span.truncate, [translate="no"], .notranslate, .md-divider-spacing, .cursor-edit, [data-testid="user-input-step"] [data-quotable="true"], [data-testid="user-input-step"] .whitespace-pre-wrap, [data-testid="planner-response-text"], [data-testid="thinking-collapsible-trigger"] + div, [data-testid="thinking-collapsible-trigger"] ~ div';

    function isCodeOrEditor(node) {
        try {
            if (!node) return false;
            let el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
            if (!el && typeof node.getRootNode === 'function') {
                el = node.getRootNode().host || null;
            }
            if (!el) return false;
            if (el.isContentEditable) return true;
            if (node.nodeType === Node.TEXT_NODE && el) {
                if (el.tagName === 'TEXTAREA') return true;
                if (el.tagName === 'OPTION' && !el.hasAttribute('value')) return true;
            }
            const active = document.activeElement;
            if (active && (active.isContentEditable || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active.getAttribute && active.getAttribute('data-lexical-editor') === 'true')) && (active === el || active.contains(el))) {
                return true;
            }
            while (el) {
                if (el.isContentEditable) return true;
                if (typeof el.closest === 'function' && el.closest(CODE_ISOLATION_SELECTOR)) {
                    return true;
                }
                const root = typeof el.getRootNode === 'function' ? el.getRootNode() : null;
                el = (root && root.host) ? root.host : null;
            }
            return false;
        } catch (e) {
            return false;
        }
    }

    function norm(s) {
        if (!s) return '';
        return s.replace(/\\s+/g, ' ').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...').trim();
    }

    function translateWithShortcut(val) {
        if (!val) return null;
        const match = val.match(/^(.+?)\\s*\\(((?:Ctrl|Cmd|Alt|Shift|⌘|⌥|⇧|⌃)\\+?[^)]*|Enter|Escape|Esc|Space|Tab|Backspace|Delete|⏎|Aa|ab|\\.\\*|-|0|[a-zA-Z0-9])\\)$/i);
        if (match) {
            const prefix = match[1].trim();
            const normPref = norm(prefix);
            const lowerPref = normPref.toLowerCase();
            let transPref = null;
            if (map.has(normPref)) {
                transPref = map.get(normPref);
            } else if (lowerMap.has(lowerPref)) {
                transPref = lowerMap.get(lowerPref);
            }
            if (transPref) {
                return transPref + " (" + match[2] + ")";
            }
        }
        return null;
    }

    // ==========================================
    // 原生系统右键菜单 (Native Context Menu) 汉化拦截
    // ==========================================
    function translateContextMenuLabel(label) {
        if (!label || typeof label !== 'string') return label;
        let trimmed = norm(label);
        if (!trimmed) return label;

        let isDefault = false;
        if (/\\s*\\((?:Default|預設|默认)\\)$/i.test(trimmed)) {
            trimmed = trimmed.replace(/\\s*\\((?:Default|預設|默认)\\)$/i, '').trim();
            isDefault = true;
        }

        let translated = null;
        const shortcutTrans = translateWithShortcut(trimmed);
        if (shortcutTrans) {
            translated = shortcutTrans;
        } else if (map.has(trimmed)) {
            translated = map.get(trimmed);
        } else if (lowerMap.has(trimmed.toLowerCase())) {
            translated = lowerMap.get(trimmed.toLowerCase());
        }

        if (translated) {
            return isDefault ? (translated + (USE_TW ? " (預設)" : " (默认)")) : translated;
        } else if (isDefault) {
            return trimmed + (USE_TW ? " (預設)" : " (默认)");
        }
        return label;
    }

    function translateContextMenuItems(items) {
        if (!Array.isArray(items)) return items;
        return items.map(item => {
            if (!item || typeof item !== 'object') return item;
            const newItem = Object.assign({}, item);
            if (newItem.label) {
                newItem.label = translateContextMenuLabel(newItem.label);
            }
            if (Array.isArray(newItem.submenu)) {
                newItem.submenu = translateContextMenuItems(newItem.submenu);
            }
            if (Array.isArray(newItem.items)) {
                newItem.items = translateContextMenuItems(newItem.items);
            }
            return newItem;
        });
    }

    function hookNativeContextMenu() {
        try {
            const electronModule = typeof electron_1 !== 'undefined' ? electron_1 : (typeof require === 'function' ? require('electron') : null);
            if (electronModule && electronModule.ipcRenderer && !electronModule.ipcRenderer._cnContextMenuHooked) {
                electronModule.ipcRenderer._cnContextMenuHooked = true;
                const origInvoke = electronModule.ipcRenderer.invoke.bind(electronModule.ipcRenderer);
                electronModule.ipcRenderer.invoke = function(channel, ...args) {
                    if (channel === 'window:show-context-menu' && Array.isArray(args[0])) {
                        try {
                            args[0] = translateContextMenuItems(args[0]);
                        } catch (e) {}
                    }
                    return origInvoke(channel, ...args);
                };
            }
        } catch (e) {}

        try {
            if (typeof window !== 'undefined' && window.electronNative && !window.electronNative._cnContextMenuHooked) {
                const origShow = window.electronNative.showContextMenu;
                if (typeof origShow === 'function') {
                    window.electronNative._cnContextMenuHooked = true;
                    window.electronNative.showContextMenu = function(items) {
                        try {
                            items = translateContextMenuItems(items);
                        } catch (e) {}
                        return origShow.call(this, items);
                    };
                }
            }
        } catch (e) {}
    }

    hookNativeContextMenu();

    function isFilePathOrUri(s) {
        if (!s) return false;
        return /^[a-zA-Z]:[\\\\/]/.test(s) || /^[\\\\/~].*[\\\\/]/.test(s) || /[\\\\/]SKILL\\.md/i.test(s) || /[\\\\/]\\.gemini[\\\\/]/i.test(s) || /^file:\\/\\//i.test(s);
    }

    function formatUsageDuration(value) {
        const text = value.trim();
        const tokens = /([0-9]+(?:\\.[0-9]+)?)\\s*(years?|yr|months?|mo|weeks?|w|days?|d|hours?|h|minutes?|min|m|seconds?|sec|s)(?![a-z])/gi;
        const parts = [];
        let end = 0;
        for (const match of text.matchAll(tokens)) {
            const gap = text.slice(end, match.index);
            if (!/^[\\s,]*$/.test(gap) && !(end === 0 && gap.trim() === '<')) return null;
            const unit = match[2].toLowerCase();
            const name = /^(year|yr)/.test(unit) ? '年'
                : /^(month|mo)/.test(unit) ? (USE_TW ? '個月' : '个月')
                : /^(week|w)/.test(unit) ? (USE_TW ? '週' : '周')
                : /^(day|d)/.test(unit) ? '天'
                : /^(hour|h)/.test(unit) ? (USE_TW ? '小時' : '小时')
                : /^(minute|min|m)$/.test(unit) || /^minutes$/.test(unit) ? (USE_TW ? '分鐘' : '分钟') : '秒';
            parts.push((end === 0 && gap.trim() === '<' ? '<' : '') + match[1] + ' ' + name);
            end = match.index + match[0].length;
        }
        return parts.length && !text.slice(end).trim() ? parts.join(' ') : null;
    }

    function translateUsageText(value) {
        const limit = value.match(/^([0-9]+)(?:h|[- ]hours?)\\s+limit$/i);
        if (limit) return limit[1] + (USE_TW ? ' 小時上限' : ' 小时限额');
        const remaining = value.match(/^([0-9]+(?:\\.[0-9]+)?\\s*%|%)\\s+left$/i);
        if (remaining) return remaining[1] + (USE_TW ? ' 剩餘' : ' 剩余');
        const reset = value.match(/^(?:Resets|Refreshes)\\s+in\\s+(.+)$/i);
        if (reset) {
            const duration = formatUsageDuration(reset[1]);
            if (duration) return duration + (USE_TW ? ' 後重設' : ' 后重置');
        }
        return null;
    }

    function isModelMenuText(node) {
        const menu = node.parentElement && node.parentElement.closest('[role="menu"]');
        if (!menu) return false;
        let label = menu.getAttribute('aria-label');
        if (!label) {
            const root = menu.getRootNode();
            label = (menu.getAttribute('aria-labelledby') || '').trim().split(/\\s+/).map(id => {
                const target = (root.getElementById && root.getElementById(id)) || document.getElementById(id);
                return target ? (target.getAttribute('aria-label') || target.textContent || '') : '';
            }).join(' ');
        }
        return /^(Select model|选择模型|選擇模型)/i.test(norm(label || ''));
    }

    function refreshMenusLabelledBy(target) {
        if (!target.id) return;
        const roots = new Set([document, target.getRootNode()]);
        for (const root of roots) {
            if (!root.querySelectorAll) continue;
            for (const menu of root.querySelectorAll('[role="menu"][aria-labelledby]')) {
                if ((menu.getAttribute('aria-labelledby') || '').split(/\\s+/).includes(target.id)) {
                    translateNode(menu);
                }
            }
        }
    }

    function translateExactOrDynamic(t) {
        const usageTrans = translateUsageText(t);
        if (usageTrans) return usageTrans;
        const shortcutTrans = translateWithShortcut(t);
        if (shortcutTrans) return shortcutTrans;
        if (map.has(t)) return map.get(t);
        const lower = t.toLowerCase();
        if (lowerMap.has(lower)) return lowerMap.get(lower);
        if (/^Show\\s+(\\d+)\\s+more(\s+(results?|items?|commands?|options?))?(\\.\\.\\.|…)?$/i.test(t)) {
            return t.replace(/^Show\\s+(\\d+)\\s+more(\\s+(results?|items?|commands?|options?))?(\\.\\.\\.|…)?$/i, (m, num, p2, type) => {
                if (type) {
                    if (/result/i.test(type)) return USE_TW ? ("顯示另外 " + num + " 個結果...") : ("显示另外 " + num + " 个结果...");
                    if (/command/i.test(type)) return USE_TW ? ("顯示另外 " + num + " 個指令...") : ("显示另外 " + num + " 个命令...");
                    if (/item/i.test(type)) return USE_TW ? ("顯示另外 " + num + " 個項目...") : ("显示另外 " + num + " 个项目...");
                    if (/option/i.test(type)) return USE_TW ? ("顯示另外 " + num + " 個選項...") : ("显示另外 " + num + " 个选项...");
                }
                return USE_TW ? ("顯示另外 " + num + " 個...") : ("显示另外 " + num + " 个...");
            });
        }
        if (/^Show\\s+(\\d+)\\s+breakdown(s)?$/i.test(t)) {
            return t.replace(/^Show\\s+(\\d+)\\s+breakdown(s)?$/i, (m, num) => USE_TW ? ("顯示 " + num + " 項明細") : ("显示 " + num + " 项细目"));
        }
        if (/^Hide\\s+breakdown(s)?$/i.test(t)) return USE_TW ? "收起明細" : "收起细目";
        if (/^Show\\s+breakdown(s)?$/i.test(t)) return USE_TW ? "顯示明細" : "显示细目";
        if (/^(?:\\+\\s*)?See\\s+(\\d+)\\s+more(?:\\s+(.+))?$/i.test(t)) {
            return t.replace(/^(?:\\+\\s*)?See\\s+(\\d+)\\s+more(?:\\s+(.+))?$/i, (m, num) => {
                const hasPlus = /^\\+/.test(t);
                return (hasPlus ? "+ " : "") + (USE_TW ? ("展開另外 " + num + " 項") : ("展开另外 " + num + " 项"));
            });
        }
        if (/^See\\s+more\\s+in\\s+(.+)$/i.test(t)) {
            return t.replace(/^See\\s+more\\s+in\\s+(.+)$/i, (m, name) => USE_TW ? ("在 " + name + " 中展開更多") : ("在 " + name + " 中展开更多"));
        }
        if (/^(?:(Permanently delete)\\s+)?(.+?)\\s+including\\s+(\\d+)\\s+active conversations?([.。])?$/i.test(t)) {
            return t.replace(/^(?:(Permanently delete)\\s+)?(.+?)\\s+including\\s+(\\d+)\\s+active conversations?([.。])?$/i, (match, del, name, count, dot) => {
                const delPrefix = del ? (USE_TW ? "永久刪除 " : "永久删除 ") : "";
                const suffix = dot ? "。" : "";
                return delPrefix + name + (USE_TW ? ("（包含 " + count + " 個活躍對話）") : ("（包含 " + count + " 个活跃会话）")) + suffix;
            });
        }
        if (/^Hi\\s+(.+?),\\s+what can we get done today\\??$/i.test(t)) {
            return t.replace(/^Hi\\s+(.+?),\\s+what can we get done today\\??$/i, (m, name) => USE_TW ? ("嗨 " + name + "，今天有什麼我們可以一起完成的？") : ("嗨 " + name + "，今天有什么我们可以一起完成的？"));
        }
        if (/^(.+?),\\s+voice\\s+(\\d+)\\s+of\\s+(\\d+)$/i.test(t)) {
            return t.replace(/^(.+?),\\s+voice\\s+(\\d+)\\s+of\\s+(\\d+)$/i, (m, name, curr, total) => USE_TW ? (name + "，聲音 " + curr + " / " + total) : (name + "，音色 " + curr + " / " + total));
        }
        if (/^Voice\\s+speed,\\s+([0-9.]+x)$/i.test(t)) {
            return t.replace(/^Voice\\s+speed,\\s+([0-9.]+x)$/i, (m, spd) => USE_TW ? ("語速，" + spd) : ("语速，" + spd));
        }
        return null;
    }

    function translateNode(node) {
        try {
            if (!node) return;

            if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
                if (node.host && isCodeOrEditor(node.host)) return;
                for (const child of node.childNodes) translateNode(child);
                return;
            }
            
            if (node.nodeType === Node.ELEMENT_NODE) {
                const tag = node.tagName.toUpperCase();
                if (SKIP_TAGS.includes(tag)) return;
                // 翻译属性：placeholder, title, aria-label (即使输入框获焦时也应正常汉化 placeholder 提示)
                for (const attr of ['placeholder', 'title', 'aria-label']) {
                    const v = node.getAttribute(attr);
                    if (v) {
                        const t = norm(v);
                        if (isFilePathOrUri(t)) continue;
                        const newAttr = translateExactOrDynamic(t);
                        if (newAttr && newAttr !== v) {
                            node.setAttribute(attr, newAttr);
                            if (attr === 'placeholder' && 'placeholder' in node) {
                                node.placeholder = newAttr;
                            }
                        }
                    }
                }

                if (tag === 'INPUT' || tag === 'TEXTAREA') return;
                if (tag === 'OPTION' && !node.hasAttribute('value')) return;

                if (isCodeOrEditor(node)) return;

                if (node.isContentEditable) return;
                if (node.classList && (node.classList.contains('monaco-editor') || node.classList.contains('terminal') || node.classList.contains('xterm'))) return;

                // 处理 FastPick / 列表底部的 "Show <N> more..." 复合节点
                const elText = node.textContent ? node.textContent.trim() : '';
                if (/^Show\\s+\\d+\\s+more(?:\\.\\.\\.|…)?$/i.test(elText)) {
                    const textChildren = Array.from(node.childNodes).filter(c => c.nodeType === Node.TEXT_NODE);
                    if (textChildren.length >= 2) {
                        for (const tc of textChildren) {
                            const v = tc.nodeValue;
                            if (v === 'Show ' || norm(v) === 'Show') {
                                tc.nodeValue = USE_TW ? '顯示另外 ' : '显示另外 ';
                                translatedValues.set(tc, tc.nodeValue);
                            } else if (v === ' more...' || v === ' more…' || norm(v) === 'more...') {
                                tc.nodeValue = USE_TW ? ' 個...' : ' 个...';
                                translatedValues.set(tc, tc.nodeValue);
                            }
                        }
                    } else if (textChildren.length === 1) {
                        const m = elText.match(/^Show\\s+(\\d+)\\s+more(?:\\.\\.\\.|…)?$/i);
                        if (m) {
                            textChildren[0].nodeValue = USE_TW ? ('顯示另外 ' + m[1] + ' 個...') : ('显示另外 ' + m[1] + ' 个...');
                            translatedValues.set(textChildren[0], textChildren[0].nodeValue);
                        }
                    }
                }

                // 处理语音助手选择器底部 "Use <VoiceName>" 复合按钮
                if (node.getAttribute && node.getAttribute('data-testid') === 'voice-picker-use') {
                    const textChildren = Array.from(node.childNodes).filter(c => c.nodeType === Node.TEXT_NODE);
                    for (const tc of textChildren) {
                        const v = tc.nodeValue;
                        if (v === 'Use ' || norm(v) === 'Use') {
                            tc.nodeValue = USE_TW ? '使用 ' : '使用 ';
                            translatedValues.set(tc, tc.nodeValue);
                        }
                    }
                }

                if (node.shadowRoot) {
                    observeRoot(node.shadowRoot);
                    translateNode(node.shadowRoot);
                }
                for (const child of node.childNodes) translateNode(child);

            } else if (node.nodeType === Node.TEXT_NODE) {
                if (isCodeOrEditor(node)) return;

                let originalVal = node.nodeValue;
                if (!originalVal || originalVal.trim().length < 1) return;

                // 处理 FastPick / 列表底部由于 React 节点拆分导致的 "Show ", num, " more..." 分段文本
                const parentText = node.parentElement && node.parentElement.textContent ? node.parentElement.textContent.trim() : '';
                if (isFilePathOrUri(originalVal.trim()) || isFilePathOrUri(parentText)) return;
                if (parentText && (
                    /^(?:Show|显示另外|顯示另外)\\s+\\d+\\s+(?:more|个|個)(?:\\.\\.\\.|…)?$/i.test(parentText) ||
                    (node.parentElement.getAttribute && node.parentElement.getAttribute('value')?.startsWith('fastpick-show-more:'))
                )) {
                    if (originalVal === 'Show ' || norm(originalVal) === 'Show') {
                        node.nodeValue = USE_TW ? '顯示另外 ' : '显示另外 ';
                        translatedValues.set(node, node.nodeValue);
                        return;
                    }
                    if (originalVal === ' more...' || originalVal === ' more…' || norm(originalVal) === 'more...') {
                        node.nodeValue = USE_TW ? ' 個...' : ' 个...';
                        translatedValues.set(node, node.nodeValue);
                        return;
                    }
                }

                // 核心：如果是 skeleton 骨架占位文本，强制打上不翻译标记，防止自动翻译（例如 Google Translate 网页翻译）将其翻译为“装。资料。包装。资料。”
                if (originalVal.toLowerCase().includes('pack.info')) {
                    const parent = node.parentElement;
                    if (parent) {
                        if (parent.getAttribute('translate') !== 'no') {
                            parent.setAttribute('translate', 'no');
                        }
                        try {
                            if (!parent.classList.contains('notranslate')) {
                                parent.classList.add('notranslate');
                            }
                        } catch (e) {}
                    }
                    return;
                }

                const valNorm = norm(originalVal);
                const cachedValue = translatedValues.get(node);
                // Base UI can attach its accessible name after the badge was translated.
                // Correct our own generic New translation before the value-cache shortcut.
                if ((valNorm === 'New' || (cachedValue === originalVal && valNorm === map.get('New'))) && isModelMenuText(node)) {
                    if (originalVal !== '新') {
                        translatedValues.set(node, '新');
                        node.nodeValue = '新';
                    }
                    return;
                }
                if (cachedValue === originalVal) return;

                let newVal = originalVal;
                const valLower = valNorm.toLowerCase();
                
                // 1. 精确匹配与通用动态模式（含大小写自动纠正与快捷键检测）
                const commonTrans = translateExactOrDynamic(valNorm);
                if (commonTrans !== null) {
                    newVal = commonTrans;
                } else if (/^Send message\\s+(Enter|⏎|\\u23ce)$/i.test(valNorm)) {
                    newVal = (USE_TW ? "發送消息 " : "发送消息 ") + valNorm.replace(/^Send message\\s+/i, '');
                } else if (/^Queue message\\s+(Enter|⏎|\\u23ce)$/i.test(valNorm)) {
                    newVal = (USE_TW ? "排隊發送消息 " : "排队发送消息 ") + valNorm.replace(/^Queue message\\s+/i, '');
                } else if (/^Good to see you(?:,\\s*(.+?))?[\\.!]*$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^Good to see you(?:,\\s*(.+?))?[\\.!]*$/i, (m, name) => {
                        if (name && name.trim()) return USE_TW ? ("很高興見到您，" + name.trim() + "。") : ("很高兴见到您，" + name.trim() + "。");
                        return USE_TW ? "很高興見到您。" : "很高兴见到您。";
                    });
                } else if (/^Welcome back(?:,\\s*(.+?))?[\\.!]*$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^Welcome back(?:,\\s*(.+?))?[\\.!]*$/i, (m, name) => {
                        if (name && name.trim()) return USE_TW ? ("歡迎回來，" + name.trim() + "。") : ("欢迎回来，" + name.trim() + "。");
                        return USE_TW ? "歡迎回來。" : "欢迎回来。";
                    });
                } else if (/^Hello,\\s*(.+?)[\\.!]*$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^Hello,\\s*(.+?)[\\.!]*$/i, (m, name) => {
                        return USE_TW ? ("你好，" + name.trim() + "。") : ("你好，" + name.trim() + "。");
                    });
                } else if (/^Hello[\\.!]$/i.test(valNorm)) {
                    newVal = USE_TW ? "你好。" : "你好。";
                } else if (/^Hi there[\\.!]*$/i.test(valNorm)) {
                    newVal = USE_TW ? "您好。" : "您好。";
                } else if (/^Hi\\s+([^\\s\\.!]+)[\\.!]*$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^Hi\\s+([^\\s\\.!]+)[\\.!]*$/i, (m, name) => {
                        if (name.toLowerCase() === 'there') return USE_TW ? "您好。" : "您好。";
                        return USE_TW ? ("嗨，" + name.trim() + "。") : ("嗨，" + name.trim() + "。");
                    });

                } else if (/^What can we get done today\\??$/i.test(valNorm)) {
                    newVal = USE_TW ? "今天有什麼我們可以一起完成的？" : "今天有什么我们可以一起完成的？";
                } else if (/^Select all in$/i.test(valNorm)) {
                    newVal = USE_TW ? "全選 " : "全选 ";
                } else if (/^Uses your local clone,$/i.test(valNorm)) {
                    newVal = USE_TW ? "使用本機複製版本，" : "使用本地克隆版本，";
                } else if ((valNorm === 'Card' || valNorm === 'of') && node.parentElement && (
                    (typeof node.parentElement.closest === 'function' && node.parentElement.closest('[data-testid="card-deck-counter"]')) ||
                    (node.parentElement.getAttribute && node.parentElement.getAttribute('data-testid') === 'card-deck-counter')
                )) {
                    if (valNorm === 'Card') newVal = USE_TW ? "卡片 " : "卡片 ";
                    else if (valNorm === 'of') newVal = " / ";
                } else if (node.parentElement && node.parentElement.textContent && node.parentElement.textContent.includes('For corp passwords (such as')) {
                    if (valNorm === 'For corp passwords (such as') {
                        newVal = USE_TW ? "如需使用公司密碼（例如 " : "如需使用公司密码（例如 ";
                    } else if (valNorm === 'or') {
                        newVal = USE_TW ? " 或 " : " 或 ";
                    } else if (valNorm.startsWith('), use an external SSH session')) {
                        newVal = valNorm.replace(/^\\), use an external SSH session/i, USE_TW ? "），請使用外部 SSH 工作階段" : "），请使用外部 SSH 会话");
                    } else if (valNorm.startsWith('. For non-corp passwords')) {
                        newVal = USE_TW ? "。對於非公司密碼或 SSH 密碼複雜密碼，請允許下一次提示並重新執行指令。" : "。对于非公司密码或 SSH 密码短语，请允许下一次提示并重新运行命令。";
                    }
                } else if (/^to have the agent generate a plan\\.?$/i.test(valNorm)) {
                    newVal = USE_TW ? "讓代理生成計劃。" : "让智能体生成计划。";
                } else if ((valNorm === 'Type' || valNorm === 'and select') && node.parentElement && (
                    (typeof node.parentElement.closest === 'function' && node.parentElement.closest('[data-testid="plan-command-fyi-alert"]')) ||
                    (node.parentElement.textContent && node.parentElement.textContent.includes('generate a plan'))
                )) {
                    if (valNorm === 'Type') newVal = USE_TW ? "輸入" : "输入";
                    else if (valNorm === 'and select') newVal = USE_TW ? "並選取" : "并选择";
                } else if (valNorm === 'and' && node.parentElement && (
                    node.parentElement.textContent && (
                        node.parentElement.textContent.includes('Privacy Policy') ||
                        node.parentElement.textContent.includes('Terms of Service') ||
                        node.parentElement.textContent.includes('隐私政策') ||
                        node.parentElement.textContent.includes('隱私權政策')
                    )
                )) {
                    newVal = USE_TW ? "以及" : "以及";
                } else if (valNorm === 'Variables' && node.parentElement && (
                    (typeof node.parentElement.closest === 'function' && (
                        node.parentElement.closest('[data-testid="trigger-cel-tokens"]') ||
                        node.parentElement.closest('[data-testid="trigger-cel-optional-section"]')
                    )) ||
                    (node.parentElement.textContent && (
                        node.parentElement.textContent.includes('Target') ||
                        node.parentElement.textContent.includes('Fields') ||
                        node.parentElement.textContent.includes('Helpers') ||
                        node.parentElement.textContent.includes('目标') ||
                        node.parentElement.textContent.includes('目標') ||
                        node.parentElement.textContent.includes('字段') ||
                        node.parentElement.textContent.includes('欄位')
                    ))
                )) {
                    newVal = USE_TW ? "變數" : "变量";
                } else if (valNorm === 'restore_page' && node.parentElement && (
                    (typeof node.parentElement.classList?.contains === 'function' && node.parentElement.classList.contains('google-symbols')) ||
                    (typeof node.parentElement.className === 'string' && node.parentElement.className.includes('google-symbols'))
                )) {
                    node.parentElement.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0" style="display:inline-block;vertical-align:middle"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>';
                    return;
                } else if ((valNorm === 'Search conversations with' || valNorm === 'in the top left.') && node.parentElement && (
                    node.parentElement.textContent && node.parentElement.textContent.includes('in the top left')
                )) {
                    newVal = (valNorm === 'Search conversations with')
                        ? (USE_TW ? "使用左上角的" : "可通过左上角的")
                        : (USE_TW ? "搜尋對話。" : "搜索对话。");
                } else if ((valNorm === 'View archived in the sidebar' || valNorm === 'menu)') && node.parentElement && (
                    node.parentElement.textContent && node.parentElement.textContent.includes('View archived in the sidebar')
                )) {
                    newVal = (valNorm === 'View archived in the sidebar')
                        ? (USE_TW ? "已歸檔對話可在側邊欄" : "已归档对话可在侧边栏")
                        : (USE_TW ? "選單中查看。" : "菜单中查看。");
                } else if ((valNorm === 'For help, visit' || valNorm === 'or join the' || valNorm === 'chat space') && node.parentElement && (
                    node.parentElement.textContent && node.parentElement.textContent.includes('chat space')
                )) {
                    if (valNorm === 'For help, visit') newVal = USE_TW ? "如需協助，請造訪" : "如需帮助，请访问";
                    else if (valNorm === 'or join the') newVal = USE_TW ? "或加入" : "或加入";
                    else if (valNorm === 'chat space') newVal = USE_TW ? "聊天空間" : "聊天空间";
                } else if ((valNorm === 'when working' || valNorm === 'in this project' || valNorm === 'in these conversations') && node.parentElement && (
                    node.parentElement.textContent && (
                        node.parentElement.textContent.includes('when working') ||
                        node.parentElement.textContent.includes('Global Permissions') ||
                        node.parentElement.textContent.includes('全局权限') ||
                        node.parentElement.textContent.includes('全域權限') ||
                        node.parentElement.textContent.includes('Global Settings') ||
                        node.parentElement.textContent.includes('全局设置') ||
                        node.parentElement.textContent.includes('全域設定')
                    )
                )) {
                    if (valNorm === 'when working') {
                        const isProj = node.parentElement.textContent.includes('in this project');
                        if (isProj) {
                            newVal = USE_TW ? "（在此專案中工作時）" : "（在此项目中工作时）";
                        } else {
                            newVal = USE_TW ? "（在這些對話中工作時）" : "（在这些会话中工作时）";
                        }
                    } else {
                        newVal = "";
                    }
                } else if ((valNorm === 'Use' || originalVal === 'Use ') && node.parentElement && (
                    (typeof node.parentElement.closest === 'function' && node.parentElement.closest('[data-testid="voice-picker-use"]')) ||
                    (node.parentElement.getAttribute && node.parentElement.getAttribute('data-testid') === 'voice-picker-use')
                )) {
                    newVal = USE_TW ? "使用 " : "使用 ";
                } else if ((valNorm === 'Change' || valNorm === 'Change…' || valNorm === 'Change...') && node.parentElement && (
                    (typeof node.parentElement.closest === 'function' && (
                        node.parentElement.closest('[data-testid="voice-settings-change"]') ||
                        node.parentElement.closest('[data-testid="builtin-browser-download-dir-change"]')
                    )) ||
                    (node.parentElement.getAttribute && (
                        node.parentElement.getAttribute('data-testid') === 'voice-settings-change' ||
                        node.parentElement.getAttribute('data-testid') === 'builtin-browser-download-dir-change')
                    ))
                ) {
                    const hasEllipsis = valNorm.includes('…') || valNorm.includes('...');
                    newVal = USE_TW ? (hasEllipsis ? "變更…" : "變更") : (hasEllipsis ? "更改…" : "更改");
                } else if (node.parentElement && (
                    (typeof node.parentElement.closest === 'function' && node.parentElement.closest('[data-testid="voice-picker"]')) ||
                    (node.parentElement.querySelector && node.parentElement.querySelector('[data-testid="voice-picker-settings-link"]'))
                )) {
                    if (valNorm.startsWith('Powered by Gemini Live')) {
                        newVal = USE_TW ? "由 Gemini Live 提供技術支援 · " : "由 Gemini Live 提供技术支持 · ";
                    } else if (valNorm === 'You can change this in') {
                        newVal = USE_TW ? "您稍後可在 " : "您稍后可在 ";
                    } else if (valNorm === 'later.') {
                        newVal = USE_TW ? " 中變更。" : " 中更改。";
                    }

                } else if (/^(?:Refreshes|You have (?:used (?:some|all) of|reached) your (?:weekly|5-hour) limit, it will fully refresh) in (\\d+) days?, (\\d+) hours?\\.?$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^(?:Refreshes|You have (?:used (?:some|all) of|reached) your (?:weekly|5-hour) limit, it will fully refresh) in (\\d+) days?, (\\d+) hours?\\.?$/i, (match, d, h) => {
                        return USE_TW ? (d + " 天 " + h + " 小時後更新") : (d + " 天 " + h + " 小时后刷新");
                    });
                } else if (/^(?:Refreshes|You have (?:used (?:some|all) of|reached) your (?:weekly|5-hour) limit, it will fully refresh) in (\\d+) hours?, (\\d+) minutes?\\.?$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^(?:Refreshes|You have (?:used (?:some|all) of|reached) your (?:weekly|5-hour) limit, it will fully refresh) in (\\d+) hours?, (\\d+) minutes?\\.?$/i, (match, h, m) => {
                        return USE_TW ? (h + " 小時 " + m + " 分鐘後更新") : (h + " 小时 " + m + " 分钟后刷新");
                    });
                } else if (/^(?:Refreshes|You have (?:used (?:some|all) of|reached) your (?:weekly|5-hour) limit, it will fully refresh) in (\\d+) days?\\.?$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^(?:Refreshes|You have (?:used (?:some|all) of|reached) your (?:weekly|5-hour) limit, it will fully refresh) in (\\d+) days?\\.?$/i, (match, d) => {
                        return USE_TW ? (d + " 天後更新") : (d + " 天后刷新");
                    });
                } else if (/^(?:Refreshes|You have (?:used (?:some|all) of|reached) your (?:weekly|5-hour) limit, it will fully refresh) in (\\d+) hours?\\.?$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^(?:Refreshes|You have (?:used (?:some|all) of|reached) your (?:weekly|5-hour) limit, it will fully refresh) in (\\d+) hours?\\.?$/i, (match, h) => {
                        return USE_TW ? (h + " 小時後更新") : (h + " 小时后刷新");
                    });
                } else if (/^(?:Refreshes|You have (?:used (?:some|all) of|reached) your (?:weekly|5-hour) limit, it will fully refresh) in (\\d+) minutes?\\.?$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^(?:Refreshes|You have (?:used (?:some|all) of|reached) your (?:weekly|5-hour) limit, it will fully refresh) in (\\d+) minutes?\\.?$/i, (match, m) => {
                        return USE_TW ? (m + " 分鐘後更新") : (m + " 分钟后刷新");
                    });
                } else if (/^(?:Refreshes|You have (?:used (?:some|all) of|reached) your (?:weekly|5-hour) limit, it will fully refresh) in less than a minute\\.?$/i.test(valNorm)) {
                    newVal = USE_TW ? "不到 1 分鐘後更新" : "不到 1 分钟后刷新";
                } else if (/^(?:Refreshes|You have (?:used (?:some|all) of|reached) your (?:weekly|5-hour) limit, it will fully refresh) in a few seconds\\.?$/i.test(valNorm)) {
                    newVal = USE_TW ? "幾秒後更新" : "几秒后刷新";
                } else if (/^Learn more about$/i.test(valNorm)) {
                    newVal = USE_TW ? "瞭解更多關於" : "了解更多关于";
                } else if (/^Learn more about (.+)$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^Learn more about (.+)$/i, (match, p) => {
                        let translatedPreset = p;
                        const pLow = p.toLowerCase();
                        if (pLow === 'default' || pLow.includes('默认') || pLow.includes('預設')) translatedPreset = USE_TW ? "預設 (Default)" : "默认 (Default)";
                        else if (pLow === 'inherit global' || pLow.includes('继承全局') || pLow.includes('繼承全域')) translatedPreset = USE_TW ? "繼承全域 (Inherit Global)" : "继承全局 (Inherit Global)";
                        else if (pLow === 'full machine' || pLow.includes('全机') || pLow.includes('全機')) translatedPreset = USE_TW ? "全機存取 (Full Machine)" : "全机访问 (Full Machine)";
                        else if (pLow === 'turbo mode' || pLow.includes('极速') || pLow.includes('極速')) translatedPreset = USE_TW ? "極速模式 (Turbo Mode)" : "极速模式 (Turbo Mode)";
                        else if (pLow === 'custom' || pLow.includes('自定义') || pLow.includes('自訂')) translatedPreset = USE_TW ? "自訂 (Custom)" : "自定义 (Custom)";
                        return USE_TW ? ("瞭解更多關於 " + translatedPreset + " 的詳細資訊") : ("了解更多关于 " + translatedPreset + " 的信息");
                    });
                } else if (/^Yes, and always allow '(.+)' in this project$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^Yes, and always allow '(.+)' in this project$/i, (match, cmd) => {
                        return USE_TW ? ("是，且在此專案中一律允許執行 '" + cmd + "'") : ("是，且在此项目中始终允许运行 '" + cmd + "'");
                    });
                } else if (/^Yes, and always allow '(.+)'$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^Yes, and always allow '(.+)'$/i, (match, cmd) => {
                        return USE_TW ? ("是，且一律允許執行 '" + cmd + "'") : ("是，且始终允许运行 '" + cmd + "'");
                    });
                } else if (/^(\\d+) tools? enabled$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^(\\d+) tools? enabled$/i, (match, num) => {
                        return USE_TW ? (num + " 個工具已啟用") : (num + " 个工具已启用");
                    });

                } else if (/^Hide\\s+tools$/i.test(valNorm)) {
                    newVal = USE_TW ? "收起工具" : "收起工具";
                } else if (/^(\\d+)\\s+tools$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^(\\d+)\\s+tools$/i, (match, num) => {
                        return num + (USE_TW ? " 個工具" : " 个工具");
                    });
                } else if (/^(\\d+)\\s+tools?\\s+excluded$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^(\\d+)\\s+tools?\\s+excluded$/i, (match, num) => {
                        return num + (USE_TW ? " 個工具已排除" : " 个工具已排除");
                    });
                } else if (/^Exceeded the rules token budget\\.\\s+Full rule content\\s+\\(([\\d,]+)\\s+tokens?\\)\\s+was replaced with a lightweight file-path pointer in context\\.$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^Exceeded the rules token budget\\.\\s+Full rule content\\s+\\(([\\d,]+)\\s+tokens?\\)\\s+was replaced with a lightweight file-path pointer in context\\.$/i, (match, num) => {
                        return USE_TW ? ("已超出規則 Token 預算。完整規則內容 (" + num + " 個 Token) 已在上下文中替換為輕量級檔案路徑指標。") : ("已超出规则 Token 预算。完整规则内容 (" + num + " 个 Token) 已在上下文中替换为轻量级文件路径指针。");
                    });
                } else if (/^All tools in this MCP server\\s+\\(([\\d,]+)\\s+tokens?\\)\\s+exceeded the customization budget and were excluded from context\\.$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^All tools in this MCP server\\s+\\(([\\d,]+)\\s+tokens?\\)\\s+exceeded the customization budget and were excluded from context\\.$/i, (match, num) => {
                        return USE_TW ? ("此 MCP 伺服器中的所有工具 (" + num + " 個 Token) 均已超出自訂項預算，並已從上下文中排除。") : ("此 MCP 服务器中的所有工具 (" + num + " 个 Token) 均已超出自定义项预算，并已从上下文中排除。");
                    });
                } else if (/^(\\d+)\\s+tools?\\s+in this MCP server\\s+\\(([\\d,]+)\\s+tokens?\\)\\s+exceeded the customization budget and were excluded from context\\.$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^(\\d+)\\s+tools?\\s+in this MCP server\\s+\\(([\\d,]+)\\s+tokens?\\)\\s+exceeded the customization budget and were excluded from context\\.$/i, (match, tCount, num) => {
                        return USE_TW ? ("此 MCP 伺服器中有 " + tCount + " 個工具 (" + num + " 個 Token) 超出自訂項預算，並已從上下文中排除。") : ("此 MCP 服务器中有 " + tCount + " 个工具 (" + num + " 个 Token) 超出自定义项预算，并已从上下文中排除。");
                    });
                } else if (/^Exceeded the customization token budget\\s+\\(([\\d,]+)\\s+tokens?\\)\\s+and was excluded from context\\.$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^Exceeded the customization token budget\\s+\\(([\\d,]+)\\s+tokens?\\)\\s+and was excluded from context\\.$/i, (match, num) => {
                        return USE_TW ? ("超出自訂項 Token 預算 (" + num + " 個 Token)，已從上下文中排除。") : ("超出自定义项 Token 预算 (" + num + " 个 Token)，已从上下文中排除。");
                    });
                } else if (/^See all\\s*\\((\\d+)\\)$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^See all\\s*\\((\\d+)\\)$/i, (match, num) => {
                        return USE_TW ? ("顯示全部 (" + num + ")") : ("显示全部 (" + num + ")");
                    });

                } else if (/^Available AI Credits: (\\d+)$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^Available AI Credits: (\\d+)$/i, (match, num) => {
                        return USE_TW ? ("可用 AI 額度: " + num) : ("可用 AI 额度: " + num);
                    });
                } else if (/^Version\\s+([\\d\\.]+)$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^Version\\s+([\\d\\.]+)$/i, (match, v) => {
                        return "版本 " + v;
                    });
                } else if (/^(\\d+)(s|m|h|d|w|mo|yr)$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^(\\d+)(s|m|h|d|w|mo|yr)$/i, (match, num, unit) => {
                        const unitLower = unit.toLowerCase();
                        let unitStr = "";
                        // Bare durations can be countdown fragments, not elapsed timestamps.
                        const elapsed = node.parentElement && node.parentElement.closest('[data-testid="conversation-row-sidebar"]');
                        if (unitLower === "s") unitStr = "秒";
                        else if (unitLower === "m") unitStr = USE_TW ? "分鐘" : "分钟";
                        else if (unitLower === "h") unitStr = USE_TW ? "小時" : "小时";
                        else if (unitLower === "d") unitStr = "天";
                        else if (unitLower === "w") unitStr = USE_TW ? "週" : "周";
                        else if (unitLower === "mo") unitStr = USE_TW ? "個月" : "个月";
                        else if (unitLower === "yr") unitStr = "年";
                        if (elapsed) unitStr += "前";
                        return num + unitStr;
                    });
                } else if (/^just now$/i.test(valNorm)) {
                    newVal = USE_TW ? "剛剛" : "刚刚";
                } else if (/^(\\d+)(s|m|h|d|w|mo|yr)\\s+ago$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^(\\d+)(s|m|h|d|w|mo|yr)\\s+ago$/i, (match, num, unit) => {
                        const unitLower = unit.toLowerCase();
                        let unitStr = "";
                        if (unitLower === "s") unitStr = USE_TW ? "秒前" : "秒前";
                        else if (unitLower === "m") unitStr = USE_TW ? "分鐘前" : "分钟前";
                        else if (unitLower === "h") unitStr = USE_TW ? "小時前" : "小时前";
                        else if (unitLower === "d") unitStr = USE_TW ? "天前" : "天前";
                        else if (unitLower === "w") unitStr = USE_TW ? "週前" : "周前";
                        else if (unitLower === "mo") unitStr = USE_TW ? "個月前" : "个月前";
                        else if (unitLower === "yr") unitStr = USE_TW ? "年前" : "年前";
                        return num + unitStr;
                    });
                } else if (/^(.+?): context deadline exceeded$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^(.+?): context deadline exceeded$/i, (match, prefix) => {
                        return prefix + (USE_TW ? ": 要求逾時 (context deadline exceeded)" : ": 请求超时 (context deadline exceeded)");
                    });
                } else if (/^(.+?): i\\/o timeout$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^(.+?): i\\/o timeout$/i, (match, prefix) => {
                        return prefix + (USE_TW ? ": I/O 逾時 (i/o timeout)" : ": I/O 超时 (i/o timeout)");
                    });
                } else if (/^Your plan's baseline quota will refresh on (.+?)\\.?\\s*To continue using this model now, enable AI Credit overages\\.?$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^Your plan's baseline quota will refresh on (.+?)\\.?\\s*To continue using this model now, enable AI Credit overages\\.?$/i, (match, when) => {
                        return USE_TW ? ("您方案的基準配額將於 " + when + " 刷新。如需立即繼續使用此模型，請啟用 AI 點數超額使用。") : ("您方案的基础配额将于 " + when + " 刷新。如需立即继续使用此模型，请启用 AI 额度超量使用。");
                    });
                } else if (/^You have hit your weekly limit, it refreshes in (.+?)\\. If on a supported paid plan, you can use AI credits in the interim or upgrade to a higher tier\\.$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^You have hit your weekly limit, it refreshes in (.+?)\\. If on a supported paid plan, you can use AI credits in the interim or upgrade to a higher tier\\.$/i, (match, when) => {
                        return USE_TW ? ("您已達到每週額度限制，將於 " + when + " 刷新。若您使用受支援的付費方案，可在此期間使用 AI 點數，或升級至更高層級。") : ("您已达到每周额度限制，将于 " + when + " 刷新。若您使用受支持的付费计划，可在此期间使用 AI 额度，或升级至更高层级。");
                    });
                } else if (/^You have hit your weekly limit, the (\\d+)-hour limit does not currently apply\\. Your weekly limit will fully refresh in (.+?)\\.$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^You have hit your weekly limit, the (\\d+)-hour limit does not currently apply\\. Your weekly limit will fully refresh in (.+?)\\.$/i, (match, h, when) => {
                        return USE_TW ? ("您已達到每週額度限制，" + h + " 小時限制目前不適用。您的每週額度限制將於 " + when + " 完全更新。") : ("您已达到每周额度限制，" + h + " 小时限制目前不适用。您的每周额度限制将于 " + when + " 完全刷新。");
                    });
                } else if (/^(Rules|Skills|Mcp Tools): ([\\d,]+) tokens$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^(Rules|Skills|Mcp Tools): ([\\d,]+) tokens$/i, (match, kind, num) => {
                        const kindMap = { "Rules": USE_TW ? "規則" : "规则", "Skills": "技能", "Mcp Tools": "MCP 工具" };
                        return (kindMap[kind] || kind) + "：" + num + " Token";
                    });
                } else if (/^Are you sure you want to delete (the |this )?project (.+?)\\??$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^Are you sure you want to delete (the |this )?project (.+?)\\??$/i, (match, article, name) => {
                        return USE_TW ? ("您確定要刪除專案 " + name + " 嗎？") : ("您确定要删除项目 " + name + " 吗？");
                    });

                } else if (/^including\\s+(\\d+)\\s+active conversations?([.。])?$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^including\\s+(\\d+)\\s+active conversations?([.。])?$/i, (match, count, dot) => {
                        const suffix = dot ? "。" : "";
                        return (USE_TW ? ("包含 " + count + " 個活躍對話") : ("包含 " + count + " 个活跃会话")) + suffix;
                    });
                } else if (/^(\\d+)\\s+active conversations?([.。])?$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^(\\d+)\\s+active conversations?([.。])?$/i, (match, count, dot) => {
                        const suffix = dot ? "。" : "";
                        return (USE_TW ? (count + " 個活躍對話") : (count + " 个活跃会话")) + suffix;
                    });
                } else if (/^The (.+?) remote MCP server lets you access and run (.+?) tools to (.+)$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^The (.+?) remote MCP server lets you access and run (.+?) tools to (.+)$/i, (match, name, tools, action) => {
                        return name + (USE_TW ? " 遠端 MCP 伺服器可讓您存取並執行 " : " 远程 MCP 服务器可让您访问并运行 ") + tools + (USE_TW ? " 工具以進行管理與操作。" : " 工具以进行管理与操作。");
                    });
                } else if (/^The (.+?) remote MCP server lets you manage (.+) resources\\.?$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^The (.+?) remote MCP server lets you manage (.+) resources\\.?$/i, (match, name, res) => {
                        return name + (USE_TW ? " 遠端 MCP 伺服器可讓您管理 " : " 远程 MCP 服务器可让您管理 ") + res + (USE_TW ? " 資源。" : " 资源。");
                    });
                } else if (/^The (.+?) remote MCP server (allows you to|lets you) (.+)$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^The (.+?) remote MCP server (allows you to|lets you) (.+)$/i, (match, name, verb, rest) => {
                        let text = rest;
                        text = text.replace(/enroll projects/gi, USE_TW ? "註冊專案" : "注册项目")
                                   .replace(/generate audit and scope reports/gi, USE_TW ? "產生稽核與範圍報告" : "生成审计与范围报告")
                                   .replace(/check resource enrollment statuses/gi, USE_TW ? "檢查資源註冊狀態" : "检查资源注册状态")
                                   .replace(/in the (.+?) region/gi, (m, r) => (USE_TW ? "在 " + r + " 區域" : "在 " + r + " 区域"));
                        return name + (USE_TW ? " 遠端 MCP 伺服器允許您 " : " 远程 MCP 服务器允许您 ") + text;
                    });
                } else if (/^Send feedback as(\\s+(.+))?$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^Send feedback as(\\s+(.+))?$/i, (match, p1, email) => {
                        if (email) {
                            return "以 " + email + (USE_TW ? " 身分傳送意見回饋" : " 身份发送反馈");
                        }
                        return USE_TW ? "以此身分傳送意見回饋：" : "以如下身份发送反馈：";
                    });
                } else if (/^(Thought|Thinking|Worked) for\\s+(.+)$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^(Thought|Thinking|Worked) for\\s+(.+)$/i, (match, verb, dur) => {
                        const vZh = /^Thought/i.test(verb) ? "已思考 " : (/^Thinking/i.test(verb) ? "正在思考 " : "已工作 ");
                        const dZh = dur.trim().replace(/(\\d+)\\s*h(?:ours?|r)?/gi, USE_TW ? "$1 小時" : "$1 小时").replace(/(\\d+)\\s*m(?:inutes?|in)?/gi, USE_TW ? "$1 分鐘" : "$1 分钟").replace(/(\\d+)\\s*s(?:econds?|ec)?/gi, "$1 秒");
                        return vZh + dZh;
                    });
                } else if (/^No more older messages,\\s*showing\\s+(\\d+)\\s+of\\s+(\\d+)$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^No more older messages,\\s*showing\\s+(\\d+)\\s+of\\s+(\\d+)$/i, (match, a, b) => {
                        return USE_TW ? ("沒有更多歷史訊息，目前顯示 " + a + " / " + b + " 則") : ("没有更多历史消息，当前显示 " + a + " / " + b + " 条");
                    });
                } else if (/^Low contrast ratio \\(([^)]+)\\)\\.\\s*Text may be hard to read\\.?$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^Low contrast ratio \\(([^)]+)\\)\\.\\s*Text may be hard to read\\.?$/i, (match, ratio) => {
                        return USE_TW ? ("對比度過低 (" + ratio + ")，文字可能難以閱讀。") : ("对比度过低 (" + ratio + ")，文字可能难以阅读。");
                    });
                } else if (/^Marked\\s+(\\d+)\\s+conversations?\\s+as\\s+read$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^Marked\\s+(\\d+)\\s+conversations?\\s+as\\s+read$/i, (match, count) => {
                        return USE_TW ? ("已將 " + count + " 個對話標記為已讀") : ("已将 " + count + " 个会话标记为已读");
                    });
                } else if (/^Preview unavailable\\s*[—–-]\\s*(.+)$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^Preview unavailable\\s*[—–-]\\s*(.+)$/i, (match, reason) => {
                        return (USE_TW ? "預覽不可用 — " : "预览不可用 — ") + reason;
                    });
                } else if (/^Proceed to\\s+(.+?)\\s+\\(unsafe\\)$/i.test(valNorm)) {
                    newVal = valNorm.replace(/^Proceed to\\s+(.+?)\\s+\\(unsafe\\)$/i, (m, host) => {
                        return USE_TW ? ("繼續前往 " + host + "（不安全）") : ("继续前往 " + host + "（不安全）");
                    });
                } else if (/^\\(?for example, passwords, messages, or credit cards\\)?\\.?$/i.test(valNorm)) {
                    newVal = USE_TW ? "（例如：密碼、訊息或信用卡）。" : "（例如：密码、通讯内容或信用卡）。";
                } else if (/^may sign you out of this site\\.?$/i.test(valNorm)) {
                    newVal = USE_TW ? "可能會導致您退出此網站。" : "可能会导致您退出此网站。";
                } else if (/^normally uses encryption to protect your information\\. When the browser tried to connect to$/i.test(valNorm)) {
                    newVal = USE_TW ? "通常使用加密技術來保護您的資訊。當瀏覽器本次嘗試連線至 " : "通常使用加密技术来保护您的信息。当浏览器本次尝试连接到 ";
                } else if (/^this time, the website sent back unusual and incorrect credentials\\.?$/i.test(valNorm)) {
                    newVal = USE_TW ? " 時，該網站傳回了異常且不正確的憑證。" : " 时，该网站发回了异常且不正确的凭据。";
                } else if (/^(?:(Exploring|Explored|Editing|Edited|Running|Ran)\\s+)?(\\d+)\\s+(files?|folders?|searches?|commands?|tasks?|pages?|browsers?|images?|actions?|artifacts?)(?:,\\s*(?:(Exploring|Explored|Editing|Edited|Running|Ran)\\s+)?(\\d+)\\s+(files?|folders?|searches?|commands?|tasks?|pages?|browsers?|images?|actions?|artifacts?))*$/i.test(valNorm)) {
                    const verbMap = USE_TW
                        ? { exploring: '正在探索', explored: '已探索', editing: '正在編輯', edited: '已編輯', running: '正在執行', ran: '已執行' }
                        : { exploring: '正在探索', explored: '已探索', editing: '正在编辑', edited: '已编辑', running: '正在运行', ran: '已运行' };
                    const nounMap = USE_TW
                        ? { file: '個檔案', files: '個檔案', folder: '個資料夾', folders: '個資料夾', search: '次搜尋', searches: '次搜尋', command: '個指令', commands: '個指令', task: '個任務', tasks: '個任務', page: '個網頁', pages: '個網頁', browser: '次瀏覽器操作', browsers: '次瀏覽器操作', image: '張圖片', images: '張圖片', action: '項操作', actions: '項操作', artifact: '個產物', artifacts: '個產物' }
                        : { file: '个文件', files: '个文件', folder: '个文件夹', folders: '个文件夹', search: '次搜索', searches: '次搜索', command: '个命令', commands: '个命令', task: '个任务', tasks: '个任务', page: '个网页', pages: '个网页', browser: '次浏览器操作', browsers: '次浏览器操作', image: '张图片', images: '张图片', action: '项操作', actions: '项操作', artifact: '个工件', artifacts: '个工件' };
                    newVal = valNorm.split(/\\s*,\\s*/).map(part => {
                        const pm = part.match(/^(?:(Exploring|Explored|Editing|Edited|Running|Ran)\\s+)?(\\d+)\\s+(files?|folders?|searches?|commands?|tasks?|pages?|browsers?|images?|actions?|artifacts?)$/i);
                        if (!pm) return part;
                        const v = pm[1] ? (verbMap[pm[1].toLowerCase()] || pm[1]) + ' ' : '';
                        const n = nounMap[pm[3].toLowerCase()] || pm[3];
                        return v + pm[2] + ' ' + n;
                    }).join('，');
                } else if (valNorm.length > 15 && valNorm.includes(' ')) {
                    // 2. 长句子串滑动替换与末尾截断智能匹配 (仅当原句带有省略号截断时，才允许基于长前缀匹配；不含空格的标识符不进行子串替换)
                    const isTruncated = (valNorm.endsWith('...') || valNorm.endsWith('…')) && valNorm.length >= 35;
                    const cleanVal = isTruncated ? valNorm.replace(/(\\.\\.\\.|…)$/, '').trim().toLowerCase() : '';
                    for (const [key, translated] of longEntries) {
                        if (key.length <= valNorm.length && valNorm.includes(key)) {
                            newVal = newVal.split(key).join(translated);
                            break;
                        } else if (isTruncated && cleanVal.length >= 30 && key.toLowerCase().startsWith(cleanVal)) {
                            newVal = translated;
                            break;
                        }
                    }
                }

                if (newVal !== originalVal) {
                    translatedValues.set(node, newVal);
                    node.nodeValue = newVal;
                }
            }
        } catch (e) {}
    }

    const observer = new MutationObserver(mutations => {
        for (const m of mutations) {
            if (m.type === 'childList') {
                for (const n of m.addedNodes) translateNode(n);
            } else if (m.type === 'characterData') {
                translateNode(m.target);
            } else if (m.type === 'attributes') {
                translateNode(m.target);
                if (m.attributeName === 'aria-label' || m.attributeName === 'aria-labelledby') {
                    refreshMenusLabelledBy(m.target);
                }
            }
        }
    });

    const obsOpts = { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title', 'aria-label', 'aria-labelledby', 'role'] };
    const observedRoots = new WeakSet();

    function observeRoot(root) {
        if (!root || observedRoots.has(root)) return;
        observer.observe(root, obsOpts);
        observedRoots.add(root);
    }

    const startEngine = () => {
        const target = document.body || document.documentElement;
        if (target) {
            try {
                observeRoot(target);
                translateNode(target);
            } catch (e) {}
        }
    };

    const origAttachShadow = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function() {
        const sr = origAttachShadow.apply(this, arguments);
        try { observeRoot(sr); } catch(e) {}
        return sr;
    };

    // 强力多阶段触发绑定
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startEngine);
    } else {
        startEngine();
    }
    window.addEventListener('load', startEngine);
    setTimeout(startEngine, 100);
    setTimeout(startEngine, 300);
    setTimeout(startEngine, 1000);
    setTimeout(startEngine, 3000);
    setTimeout(startEngine, 6000);
})();
${SIGNATURE_END}`;

    return jsSource.replace("DICT_PLACEHOLDER", () => dictJson);
}

function cleanJsContent(content) {
    const regex = new RegExp(escapeRegExp(SIGNATURE_START) + "[\\s\\S]*?" + escapeRegExp(SIGNATURE_END), "g");
    return content.replace(regex, "");
}

function cleanMenuJsContent(content) {
    content = content.replace(/\n?\s*\/\* --- MENU TRANSLATION START --- \*\/[\s\S]*?\/\* --- MENU TRANSLATION END --- \*\//g, '');
    const startMark = "// ==========================================\n    // Antigravity Native Menu Chinese Translation";
    const endMark = "translateMenu(menu.items);";
    const startIdx = content.indexOf(startMark);
    const endIdx = content.indexOf(endMark);
    if (startIdx !== -1 && endIdx !== -1 && startIdx < endIdx) {
        return content.substring(0, startIdx) + content.substring(endIdx + endMark.length);
    }
    return content;
}

function cleanTrayJsContent(content) {
    content = content.replace(/\n\s*\/\* --- TRAY TRANSLATION START --- \*\/[\s\S]*?\/\* --- TRAY TRANSLATION END --- \*\//g, '');
    content = content.replace(/\n\s*\/\* --- TRAY DOUBLE CLICK START --- \*\/[\s\S]*?\/\* --- TRAY DOUBLE CLICK END --- \*\//g, '');
    return content;
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

let wasAppRunning = false;

function checkIfAppIsRunning() {
    try {
        if (process.platform === 'win32') {
            const stdout = child_process.execSync('tasklist /fi "imagename eq Antigravity.exe" /nh', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
            return stdout.toLowerCase().includes('antigravity.exe');
        } else if (process.platform === 'darwin') {
            const stdout = child_process.execSync('pgrep -x Antigravity || pgrep -f "/Contents/MacOS/Antigravity"', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
            return stdout.trim().length > 0;
        }
    } catch (e) {
        // ignore
    }
    return false;
}

function closeAntigravityProcesses() {
    console.log("[1] 检测到 Antigravity 客户端正在运行，正在关闭以解除文件锁...");
    try {
        if (process.platform === 'win32') {
            child_process.execSync('taskkill /f /im Antigravity.exe /t >nul 2>nul');
        } else {
            child_process.execSync('killall Antigravity >/dev/null 2>&1; killall "Antigravity Helper" >/dev/null 2>&1; pkill -x Antigravity >/dev/null 2>&1; pkill -f "/Contents/MacOS/Antigravity" >/dev/null 2>&1');
        }
    } catch (e) {
        // ignore
    }
    const start = Date.now();
    while (Date.now() - start < 1500) {}
}

function detectInstallationDir(manualDir) {
    if (manualDir) {
        if (fs.existsSync(manualDir)) {
            let resolved = path.resolve(manualDir);
            if (fs.statSync(resolved).isFile() && resolved.endsWith('app.asar')) {
                resolved = path.dirname(resolved);
            }
            return resolved;
        } else {
            console.error(`[错误] 手动指定的路径不存在: ${manualDir}`);
            process.exit(1);
        }
    }

    const candidates = [];
    const seenCandidates = new Set();
    const addCandidate = (candidate) => {
        if (!candidate) return;
        const normalized = path.resolve(candidate);
        const key = normalized.toLowerCase();
        if (!seenCandidates.has(key)) {
            candidates.push(normalized);
            seenCandidates.add(key);
        }
    };
    const hasAntigravityResources = (candidate) => {
        return fs.existsSync(path.join(candidate, "resources", "app.asar")) ||
            fs.existsSync(path.join(candidate, "app.asar")) ||
            fs.existsSync(path.join(candidate, "Contents", "Resources", "app.asar"));
    };

    if (process.platform === 'win32') {
        addCandidate(process.env.ANTIGRAVITY_INSTALL_DIR);
        addCandidate(process.env.ANTIGRAVITY_HOME);

        const registryRoots = [
            'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
            'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
            'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
        ];
        for (const root of registryRoots) {
            try {
                const output = child_process.execSync(`reg query "${root}" /s /f Antigravity /d`, { encoding: 'utf-8', stdio: 'pipe' });
                for (const line of output.split(/\r?\n/)) {
                    const match = line.match(/^\s*(InstallLocation|DisplayIcon)\s+REG_\w+\s+(.+)$/i);
                    if (!match) continue;
                    let value = match[2].trim().replace(/^"|"$/g, '');
                    if (/Antigravity\.exe/i.test(value)) {
                        value = path.dirname(value);
                    }
                    addCandidate(value);
                }
            } catch (e) {
                // Registry probing is best-effort; fall back to common locations below.
            }
        }

        const driveLetters = ['C', 'D', 'E', 'F'];
        for (const drive of driveLetters) {
            addCandidate(`${drive}:\\Programs\\Antigravity`);
            addCandidate(`${drive}:\\Antigravity`);
        }
        addCandidate("C:\\Program Files\\Antigravity");

        const localAppdata = process.env.LOCALAPPDATA;
        if (localAppdata) {
            addCandidate(path.join(localAppdata, 'Programs', 'antigravity'));
        }
    } else if (process.platform === 'darwin') {
        addCandidate("/Applications/Antigravity.app");
        addCandidate(path.join(process.env.HOME || '', 'Applications', 'Antigravity.app'));
        if (process.env.SUDO_USER && process.env.SUDO_USER !== 'root') {
            addCandidate(path.join('/Users', process.env.SUDO_USER, 'Applications', 'Antigravity.app'));
        }
    }

    for (const p of candidates) {
        if (fs.existsSync(p) && hasAntigravityResources(p)) {
            console.log(`[探测] 成功自动识别到 Antigravity 安装目录: ${p}`);
            return path.resolve(p);
        }
    }

    console.error("[错误] 未找到默认安装目录，请使用 --install-dir 手动指定您的安装路径！");
    process.exit(1);
}

function runCommandSync(cmd) {
    try {
        const execEnv = { ...process.env };
        if (process.platform === 'darwin' && process.getuid && process.getuid() === 0) {
            execEnv.npm_config_cache = path.join(os.tmpdir(), 'antigravity_npm_cache');
            execEnv.npm_config_yes = 'true';
        }
        const out = child_process.execSync(cmd, { encoding: 'utf-8', stdio: 'pipe', env: execEnv });
        return { success: true, stdout: out, stderr: '' };
    } catch (e) {
        return { success: false, stdout: e.stdout || '', stderr: e.stderr || e.message };
    }
}

function cleanElectronCache() {
    let appSupportDir = "";
    if (process.platform === 'darwin') {
        let userHome = os.homedir();
        if (process.env.SUDO_USER && process.env.SUDO_USER !== 'root') {
            const sudoHome = path.join('/Users', process.env.SUDO_USER);
            if (fs.existsSync(sudoHome)) {
                userHome = sudoHome;
            }
        }
        appSupportDir = path.join(userHome, 'Library', 'Application Support', 'Antigravity');
    } else if (process.platform === 'win32') {
        const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
        appSupportDir = path.join(appData, 'Antigravity');
    } else {
        appSupportDir = path.join(os.homedir(), '.config', 'Antigravity');
    }

    if (!fs.existsSync(appSupportDir)) return;

    const cacheDirs = ['Cache', 'Code Cache', 'GPUCache', 'DawnWebGPUCache', 'DawnGraphiteCache'];
    let cleanedCount = 0;
    for (const c of cacheDirs) {
        const p = path.join(appSupportDir, c);
        if (fs.existsSync(p)) {
            try {
                fs.rmSync(p, { recursive: true, force: true });
                cleanedCount++;
            } catch (e) {}
        }
    }
    if (cleanedCount > 0) {
        console.log(`[缓存] 已自动清理 ${cleanedCount} 个应用缓存目录，避免新旧版本字节码冲突。`);
    }
}

function resignAppOnMac(anyPath) {
    if (process.platform !== 'darwin') return;
    
    let targetApp = "";
    let current = path.resolve(anyPath);
    for (let i = 0; i < 10; i++) {
        if (current.endsWith(".app")) {
            targetApp = current;
            break;
        }
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
    }
    
    if (targetApp && fs.existsSync(targetApp)) {
        try {
            const plistPath = path.join(targetApp, 'Contents', 'Info.plist');
            const macAsarPath = path.join(targetApp, 'Contents', 'Resources', 'app.asar');
            if (fs.existsSync(plistPath) && fs.existsSync(macAsarPath)) {
                const plistContent = fs.readFileSync(plistPath, 'utf-8');
                if (plistContent.includes('ElectronAsarIntegrity')) {
                    const asarBuf = fs.readFileSync(macAsarPath);
                    const headerStrSize = asarBuf.readUInt32LE(12);
                    const headerHash = crypto.createHash('sha256').update(asarBuf.subarray(16, 16 + headerStrSize)).digest('hex');
                    const integrityRegex = /(<key>ElectronAsarIntegrity<\/key>[\s\S]*?<key>Resources\/app\.asar<\/key>[\s\S]*?<key>hash<\/key>\s*<string>)[a-fA-F0-9]{64}(<\/string>)/;
                    if (integrityRegex.test(plistContent)) {
                        const updatedPlist = plistContent.replace(integrityRegex, `$1${headerHash}$2`);
                        if (updatedPlist !== plistContent) {
                            fs.writeFileSync(plistPath, updatedPlist, 'utf-8');
                            console.log('[签名] 已同步更新 macOS Info.plist 中的 ElectronAsarIntegrity 校验值。');
                        }
                    }
                }
            }
        } catch (e) {}
        try {
            runCommandSync(`xattr -cr "${targetApp}"`);
        } catch (e) {}
        console.log(`[签名] 检测到 macOS 平台，正在对应用包进行本地 ad-hoc 深度重签名: ${targetApp} ...`);
        const signRes = runCommandSync(`codesign --force --deep --sign - "${targetApp}"`);
        if (signRes.success) {
            console.log(`[签名] 重新签名成功！`);
        } else {
            console.warn(`[警告] 重新签名失败。可能会导致应用无法打开。详情:\n${signRes.stderr}\n${signRes.stdout}`);
        }
    } else {
        console.warn(`[警告] 未能从路径 ${anyPath} 识别到有效的 .app 路径，跳过重新签名。`);
    }
}

function ensureWritePermission(targetDir) {
    if (process.platform !== 'darwin') return true;
    try {
        fs.accessSync(targetDir, fs.constants.W_OK);
        return true;
    } catch (err) {
        if (process.getuid && process.getuid() !== 0) {
            console.log("[权限] 检测到当前用户对 macOS 应用目录缺少写入权限，正在尝试请求管理员权限 (sudo) 重新运行...");
            const args = process.argv.slice(1);
            const res = child_process.spawnSync('sudo', [process.execPath, ...args], {
                stdio: 'inherit'
            });
            if (res.status === 0) {
                process.exit(0);
            } else {
                console.error("\n[错误] 管理员提权执行失败或用户取消了密码输入。");
                process.exit(res.status || 1);
            }
        }
        return false;
    }
}

// ==========================================
// Antigravity 2.0 汉化引擎 (ASAR打包注入模式)
// ==========================================
function readAsarLayout(archivePath) {
    const data = fs.readFileSync(archivePath);
    if (data.length < 16 || data.readUInt32LE(0) !== 4) throw new Error('Invalid ASAR header');
    const headerSize = data.readUInt32LE(4);
    const jsonSize = data.readUInt32LE(12);
    if (headerSize < 8 || jsonSize > headerSize - 8 || 8 + headerSize > data.length) {
        throw new Error('Truncated ASAR header');
    }
    const header = JSON.parse(data.subarray(16, 16 + jsonSize).toString('utf8'));
    const files = new Map();
    function visit(node, prefix, inheritedUnpacked) {
        if (!node.files || typeof node.files !== 'object') throw new Error('Invalid ASAR directory');
        let leafCount = 0;
        let unpackedCount = 0;
        const unpackDirs = [];
        const unpackFiles = [];
        for (const [name, entry] of Object.entries(node.files)) {
            if (!name || name === '.' || name === '..' || /[\\/]/.test(name)) throw new Error('Unsafe ASAR path');
            const relative = prefix ? `${prefix}/${name}` : name;
            const unpacked = Boolean(inheritedUnpacked || entry.unpacked);
            if (entry.files) {
                const child = visit(entry, relative, unpacked);
                leafCount += child.leafCount;
                unpackedCount += child.unpackedCount;
                unpackDirs.push(...child.unpackDirs);
                unpackFiles.push(...child.unpackFiles);
            } else {
                if (entry.link !== undefined) {
                    files.set(relative, { link: entry.link, unpacked });
                } else {
                    if (!Number.isSafeInteger(entry.size) || entry.size < 0) throw new Error('Invalid ASAR file size');
                    let body;
                    if (!unpacked) {
                        const offset = Number(entry.offset);
                        if (!/^\d+$/.test(String(entry.offset)) || !Number.isSafeInteger(offset) || offset + entry.size > data.length - 8 - headerSize) {
                            throw new Error(`Invalid ASAR file offset: ${relative}`);
                        }
                        body = data.subarray(8 + headerSize + offset, 8 + headerSize + offset + entry.size);
                    }
                    files.set(relative, { size: entry.size, unpacked, body });
                }
                leafCount++;
                if (unpacked) {
                    unpackedCount++;
                    unpackFiles.push(relative);
                }
            }
        }
        // Some official archives mark hundreds of individual files, but no
        // directories. Collapse an entirely unpacked subtree before constructing
        // CLI arguments; otherwise absolute file paths exceed Windows limits.
        if (prefix && leafCount > 0 && unpackedCount === leafCount) {
            return { leafCount, unpackedCount, unpackDirs: [prefix], unpackFiles: [] };
        }
        return { leafCount, unpackedCount, unpackDirs, unpackFiles };
    }
    const { unpackDirs, unpackFiles } = visit(header, '', false);
    return { files, unpackDirs, unpackFiles };
}

function asarUnpackArguments(layout, extractedDir) {
    // Refuse ambiguous glob names rather than silently changing the archive layout.
    const pattern = values => {
        if (values.some(value => /[\r\n"'`$*?\[\]{}!,]/.test(value))) throw new Error('Unsupported ASAR unpack path');
        return values.length === 1 ? values[0] : `{${values.join(',')}}`;
    };
    let args = '';
    if (layout.unpackDirs.length) args += ` --unpack-dir "${pattern(layout.unpackDirs)}"`;
    if (layout.unpackFiles.length) {
        const files = layout.unpackFiles.map(file => path.resolve(extractedDir, ...file.split('/')).replace(/\\/g, '/'));
        args += ` --unpack "${pattern(files)}"`;
    }
    return args;
}

function validateAsarCandidate(sourcePath, candidatePath) {
    const before = readAsarLayout(sourcePath);
    const after = readAsarLayout(candidatePath);
    const allowed = new Set(['dist/preload.js', 'dist/menu.js', 'dist/tray.js', 'dist/loadingOverlay.js', 'dist/updater.js']);
    if (before.files.size !== after.files.size) throw new Error('ASAR file list changed');
    for (const [name, original] of before.files) {
        const candidate = after.files.get(name);
        if (!candidate || original.unpacked !== candidate.unpacked || original.link !== candidate.link) {
            throw new Error(`ASAR layout changed: ${name}`);
        }
        if (original.link !== undefined) continue;
        const originalBody = original.unpacked ? fs.readFileSync(path.join(sourcePath + '.unpacked', ...name.split('/'))) : original.body;
        const candidateBody = candidate.unpacked ? fs.readFileSync(path.join(candidatePath + '.unpacked', ...name.split('/'))) : candidate.body;
        if (candidateBody.length !== candidate.size || originalBody.length !== original.size) throw new Error(`ASAR file truncated: ${name}`);
        // Unpacked files remain in their existing location and must never be changed by this patch.
        if ((original.unpacked || !allowed.has(name)) && !originalBody.equals(candidateBody)) throw new Error(`Unexpected file change: ${name}`);
    }
    const preload = after.files.get('dist/preload.js');
    if (!preload || !preload.body || !preload.body.includes(Buffer.from(SIGNATURE_START))) throw new Error('Missing localization payload');
}

function install20(resourcesDir) {
    const asarPath = path.join(resourcesDir, "app.asar");
    const bakPath = path.join(resourcesDir, "app.asar.bak");

    if (!fs.existsSync(asarPath)) {
        console.error(`[错误] 未在资源目录中找到 app.asar: ${resourcesDir}`);
        return false;
    }

    // Build against a private snapshot. Never restore a backup over the live app before packing.
    let buildDir;
    let retainRecoveryFiles = false;
    try {
    const originalLive = fs.readFileSync(asarPath);
    let isAlreadyLocalized = false;
    try {
        const asarBuffer = fs.readFileSync(asarPath);
        isAlreadyLocalized = asarBuffer.indexOf(Buffer.from(SIGNATURE_START, "utf8")) !== -1;
    } catch (e) {}

    const refreshBackup = !isAlreadyLocalized || !fs.existsSync(bakPath);
    const sourcePath = isAlreadyLocalized && fs.existsSync(bakPath) ? bakPath : asarPath;
    buildDir = fs.mkdtempSync(path.join(resourcesDir, '.antigravity-localize-'));
    const sourceArchive = path.join(buildDir, 'source', 'app.asar');
    fs.mkdirSync(path.dirname(sourceArchive));
    fs.copyFileSync(sourcePath, sourceArchive);
    if (fs.existsSync(asarPath + '.unpacked')) {
        fs.cpSync(asarPath + '.unpacked', sourceArchive + '.unpacked', { recursive: true });
    }
    const layout = readAsarLayout(sourceArchive);
    const rollbackArchive = path.join(buildDir, 'previous.asar');
    fs.writeFileSync(rollbackArchive, originalLive);
    const tempDir = path.join(buildDir, 'extracted');
    const candidatePath = path.join(buildDir, 'candidate.asar');

    console.log(`[解包] 正在使用 npx 提取 app.asar...`);
    const extractRes = runCommandSync(`npx -y @electron/asar extract "${sourceArchive}" "${tempDir}"`);
    if (!extractRes.success || !fs.existsSync(tempDir)) {
        console.error(`[错误] 解包失败，可能是由于系统未安装 Node.js/npm 或者网络限制。`);
        console.error(`详情: ${extractRes.stderr}\n${extractRes.stdout}`);
        return false;
    }

    // 3. 注入 preload.js
    const preloadPath = path.join(tempDir, "dist", "preload.js");
    if (!fs.existsSync(preloadPath)) {
        console.error(`[错误] 解压后未能在指定路径找到 preload.js: ${preloadPath}`);
        return false;
    }

    console.log(`[修改] 正在向 preload.js 注入汉化代码...`);
    let content = fs.readFileSync(preloadPath, 'utf-8');

    // 清理已有的汉化，重新注入
    const cleanedContent = cleanJsContent(content);
    const translationJs = generateJs();
    const newContent = cleanedContent + "\n" + translationJs;

    fs.writeFileSync(preloadPath, newContent, 'utf-8');
    console.log(`[修改] 注入成功！`);

    // 3.1 注入 menu.js (系统菜单汉化)
    const menuPath = path.join(tempDir, "dist", "menu.js");
    if (fs.existsSync(menuPath)) {
        console.log(`[修改] 正在向 menu.js 注入菜单汉化代码...`);
        let menuContent = fs.readFileSync(menuPath, 'utf-8');
        
        const menuCleaned = cleanMenuJsContent(menuContent);
        
        const menuTranslationJs = `
    /* --- MENU TRANSLATION START --- */
    // ==========================================
    // Antigravity Native Menu Chinese Translation
    // ==========================================
    const translations = ${USE_TW ? `{
        'File': '檔案',
        'Edit': '編輯',
        'View': '檢視',
        'Window': '視窗',
        'Help': '說明',
        'New Window': '開新視窗',
        'Create Project': '建立專案',
        'Command Palette': '命令選擇區',
        'Docs': '說明文件',
        'Check for Updates': '檢查更新',
        'Toggle Developer Tools': '切換開發人員工具',
        'Undo': '復原',
        'Redo': '重做',
        'Cut': '剪下',
        'Copy': '複製',
        'Paste': '貼上',
        'Select All': '全選',
        'Minimize': '最小化',
        'Maximize': '最大化',
        'Close': '關閉',
        'Zoom': '縮放',
        'Reset Zoom': '重設縮放',
        'Zoom In': '放大',
        'Zoom Out': '縮小',
        'Toggle Full Screen': '切換全螢幕',
        'Toggle Between Light/Dark Themes': '切換淺色/深色佈景主題',
        'Split Terminal': '分割終端機',
        'Split Conversation Horizontally': '水平分割對話',
        'Split Conversation Vertically': '垂直分割對話',
        'Split': '分割',
        'Split Right': '向右分割',
        'Split Down': '向下分割',
        'Replace With New': '替換為新對話',
        'Show in File Explorer': '在檔案總管中顯示',
        'Reveal in Finder': '在 Finder 中顯示',
        'Find in conversation': '在對話中尋找',
        'Connect to WSL': '連線至 WSL',
        'Reopen Locally': '在本機重新開啟',
        'About Antigravity': '關於 Antigravity',
        'Settings...': '設定...',
        'Preferences...': '偏好設定...',
        'Services': '服務',
        'Hide Antigravity': '隱藏 Antigravity',
        'Hide Others': '隱藏其他',
        'Show All': '顯示全部',
        'Quit Antigravity': '結束 Antigravity',
        'Quit': '結束',
        'Paste and Match Style': '貼上並符合樣式',
        'Delete': '刪除',
        'Bring All to Front': '將此程式所有視窗移至最前',
        'Close Window': '關閉視窗',
        'Version': '版本'
    }` : `{
        'File': '文件',
        'Edit': '编辑',
        'View': '视图',
        'Window': '窗口',
        'Help': '帮助',
        'New Window': '新建窗口',
        'Create Project': '创建项目',
        'Command Palette': '命令面板',
        'Docs': '文档',
        'Check for Updates': '检查更新',
        'Toggle Developer Tools': '切换开发者工具',
        'Undo': '撤销',
        'Redo': '重做',
        'Cut': '剪切',
        'Copy': '复制',
        'Paste': '粘贴',
        'Select All': '全选',
        'Minimize': '最小化',
        'Maximize': '最大化',
        'Close': '关闭',
        'Zoom': '缩放',
        'Reset Zoom': '重置缩放',
        'Zoom In': '放大',
        'Zoom Out': '缩小',
        'Toggle Full Screen': '切换全屏',
        'Toggle Between Light/Dark Themes': '切换浅色/深色主题',
        'Split Terminal': '拆分终端',
        'Split Conversation Horizontally': '水平拆分会话',
        'Split Conversation Vertically': '垂直拆分会话',
        'Split': '拆分',
        'Split Right': '向右拆分',
        'Split Down': '向下拆分',
        'Replace With New': '替换为新会话',
        'Show in File Explorer': '在文件资源管理器中显示',
        'Reveal in Finder': '在访达中显示',
        'Find in conversation': '在会话中查找',
        'Connect to WSL': '连接到 WSL',
        'Reopen Locally': '在本地重新打开',
        'About Antigravity': '关于 Antigravity',
        'Settings...': '设置...',
        'Preferences...': '首选项...',
        'Services': '服务',
        'Hide Antigravity': '隐藏 Antigravity',
        'Hide Others': '隐藏其他',
        'Show All': '全部显示',
        'Quit Antigravity': '退出 Antigravity',
        'Quit': '退出',
        'Paste and Match Style': '粘贴并匹配样式',
        'Delete': '删除',
        'Bring All to Front': '前置全部窗口',
        'Close Window': '关闭窗口',
        'Version': '版本'
    }`};
    function translateMenu(items) {
        for (const item of items) {
            let label = item.label || '';
            let mnemonic = '';
            let cleanLabel = label;
            const m = label.match(/&([a-zA-Z])/);
            if (m) {
                mnemonic = "(&" + m[1] + ")";
                cleanLabel = label.replace('&', '');
            }
            if (!item._origCleanLabel) item._origCleanLabel = cleanLabel;
            if (translations[cleanLabel]) {
                item.label = translations[cleanLabel] + mnemonic;
            } else if (translations[label]) {
                item.label = translations[label];
            } else if (/^Version\\s*([\\d\\.]*)$/i.test(cleanLabel)) {
                item.label = cleanLabel.replace(/^Version\\s*([\\d\\.]*)$/i, (match, v) => v ? "版本 " + v : "版本");
            }
            if (item.submenu && item.submenu.items) {
                translateMenu(item.submenu.items);
            }
        }
    }
    if (menu && Array.isArray(menu.items) && !menu.items._cnFindHooked) {
        menu.items._cnFindHooked = true;
        const origFind = menu.items.find.bind(menu.items);
        menu.items.find = function(pred, thisArg) {
            return origFind((it, idx, arr) => {
                if (pred.call(thisArg, it, idx, arr)) return true;
                if (it && it._origCleanLabel && pred.call(thisArg, { ...it, label: it._origCleanLabel }, idx, arr)) return true;
                return false;
            });
        };
    }
    if (!electron_1.Menu._cnHooked) {
        electron_1.Menu._cnHooked = true;
        const origSetAppMenu = electron_1.Menu.setApplicationMenu.bind(electron_1.Menu);
        electron_1.Menu.setApplicationMenu = function(m) {
            if (m && m.items) translateMenu(m.items);
            return origSetAppMenu(m);
        };
    }
    translateMenu(menu.items);
    /* --- MENU TRANSLATION END --- */`;

        const targetStr = "electron_1.Menu.setApplicationMenu(menu);";
        const idx = menuCleaned.indexOf(targetStr);
        if (idx !== -1) {
            const patchedMenuContent = menuCleaned.substring(0, idx) + menuTranslationJs + "\n    " + menuCleaned.substring(idx);
            fs.writeFileSync(menuPath, patchedMenuContent, 'utf-8');
            console.log(`[修改] 菜单汉化注入成功！`);
        } else {
            console.warn(`[警告] 未能在 menu.js 中找到设定的插入点。`);
        }
    }

    // 3.2 注入 tray.js (任务栏右键菜单汉化)
    const trayPath = path.join(tempDir, "dist", "tray.js");
    if (fs.existsSync(trayPath)) {
        console.log(`[修改] 正在向 tray.js 注入任务栏菜单汉化...`);
        let trayContent = fs.readFileSync(trayPath, 'utf-8');
        
        // 先清理已有的汉化块
        let trayCleaned = cleanTrayJsContent(trayContent);
        
        // 1. 注入 createTray 里的翻译块 (带标记，使用正则兼容不同参数签名如 createTray(actions, onClick))
        const targetCreate = /function\s+createTray\s*\(([^)]*)\)\s*\{/;
        const replacementCreate = (match, args) => `function createTray(${args}) {
    /* --- TRAY TRANSLATION START --- */
    const translations = ${USE_TW ? `{
        'No agents running': '無執行中的代理',
        'Open Antigravity': '開啟 Antigravity',
        'Quit': '結束'
    }` : `{
        'No agents running': '无运行中的智能体',
        'Open Antigravity': '打开 Antigravity',
        'Quit': '退出'
    }`};
    for (const item of actions) {
        if (!item || !item.label) continue;
        if (translations[item.label]) {
            item.label = translations[item.label];
        } else if (item.label.startsWith('Open ')) {
            item.label = (USE_TW ? '開啟 ' : '打开 ') + item.label.slice(5);
        } else if (item.label === 'Quit') {
            item.label = USE_TW ? '結束' : '退出';
        }
    }
    /* --- TRAY TRANSLATION END --- */`;
        
        let trayPatched = trayCleaned.replace(targetCreate, replacementCreate);
        if (trayPatched === trayCleaned) {
            console.warn(`[警告] 未能在 tray.js 中找到 createTray 函数插入点。`);
        }
        
        // 2. 注入系統匣圖示點兩下彈出/聚焦 Antigravity 介面事件
        const dblClickTarget = /tray\.setContextMenu\(contextMenu\);/;
        const dblClickReplacement = `tray.setContextMenu(contextMenu);
    /* --- TRAY DOUBLE CLICK START --- */
    const openAction = actions.find(item => item && typeof item.click === 'function' && !['Quit', '退出', '結束'].includes(item.label));
    if (openAction) {
        tray.on('double-click', () => {
            const wins = electron_1.BrowserWindow.getAllWindows();
            if (wins.length > 0 && wins[0].isMinimized()) {
                wins[0].restore();
            }
            openAction.click();
        });
    }
    /* --- TRAY DOUBLE CLICK END --- */`;
        trayPatched = trayPatched.replace(dblClickTarget, dblClickReplacement);

        // 3. 使用正则替换 updateTrayAgentCount 里的动态显示文本
        const countRegex = /countItem\.label\s*=\s*\([\s\S]*?' running';/g;
        const replacementCount = USE_TW 
            ? "countItem.label = count > 0 ? `${count} 個代理執行中` : '無執行中的代理';"
            : "countItem.label = count > 0 ? `${count} 个智能体运行中` : '无运行中的智能体';";
        trayPatched = trayPatched.replace(countRegex, replacementCount);
        
        fs.writeFileSync(trayPath, trayPatched, 'utf-8');
        console.log(`[修改] 任务栏菜单汉化注入成功！`);
    }

    // 3.3 注入 loadingOverlay.js (加载页汉化)
    const loadingPath = path.join(tempDir, "dist", "loadingOverlay.js");
    if (fs.existsSync(loadingPath)) {
        console.log(`[修改] 正在向 loadingOverlay.js 注入加载页汉化...`);
        let loadingContent = fs.readFileSync(loadingPath, 'utf-8');
        
        const replacementText = USE_TW
            ? '<div class="text">正在載入 Antigravity…</div>'
            : '<div class="text">正在加载 Antigravity…</div>';
        
        loadingContent = loadingContent
            .replace('<div class="text">Loading Antigravity</div>', replacementText)
            .replace('<div class="text">反重力引擎已啟動，正在努力擺脫地心引力...</div>', replacementText)
            .replace('<div class="text">反重力引擎已启动，正在努力摆脱地心引力...</div>', replacementText);
        
        fs.writeFileSync(loadingPath, loadingContent, 'utf-8');
        console.log(`[修改] 加载页汉化注入成功！`);
    }

    // 3.4 注入 updater.js (更新弹窗汉化)
    const updaterPath = path.join(tempDir, "dist", "updater.js");
    if (fs.existsSync(updaterPath)) {
        console.log(`[修改] 正在向 updater.js 注入更新弹窗汉化...`);
        let updaterContent = fs.readFileSync(updaterPath, 'utf-8');
        
        // 替换 Check for Updates 弹窗的属性
        const targetOptions = `                title: 'Check for Updates',
                message: 'No updates available',
                buttons: ['OK'],`;
        const replacementOptions = USE_TW
            ? `                title: '檢查更新',
                message: '目前沒有可用的更新',
                buttons: ['好'],`
            : `                title: '检查更新',
                message: '暂无可用更新',
                buttons: ['确定'],`;
        
        updaterContent = updaterContent.replace(targetOptions, replacementOptions);
        fs.writeFileSync(updaterPath, updaterContent, 'utf-8');
        console.log(`[修改] 更新弹窗汉化注入成功！`);
    }

    // 4. 重新打包
    console.log(`[打包] 正在生成并校验汉化候选包...`);
    const packRes = runCommandSync(`npx -y @electron/asar pack "${tempDir}" "${candidatePath}"${asarUnpackArguments(layout, tempDir)}`);

    if (!packRes.success) {
        console.error(`[错误] 打包失败。`);
        console.error(`详情: ${packRes.stderr}\n${packRes.stdout}`);
        return false;
    }

    validateAsarCandidate(sourceArchive, candidatePath);
    for (const name of ['preload.js', 'menu.js', 'tray.js', 'loadingOverlay.js', 'updater.js']) {
        const file = path.join(tempDir, 'dist', name);
        if (fs.existsSync(file)) child_process.execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    }
    if (!fs.readFileSync(asarPath).equals(originalLive)) throw new Error('App changed during localization; please retry after the update completes');

    // Both rename operations stay on the same volume. If backup promotion fails,
    // put the original app back; the prior backup has not been changed.
    fs.renameSync(candidatePath, asarPath);
    try {
        if (refreshBackup) fs.renameSync(sourceArchive, bakPath);
    } catch (error) {
        try {
            fs.renameSync(rollbackArchive, asarPath);
        } catch (rollbackError) {
            retainRecoveryFiles = true;
            throw new Error(`Backup promotion and rollback failed; original app retained at ${rollbackArchive}: ${rollbackError.message}`);
        }
        throw error;
    }

    cleanElectronCache();
    resignAppOnMac(resourcesDir);
    console.log(`[√] Antigravity 2.0 汉化部署完成！`);
    return true;
    } catch (error) {
        console.error(`[错误] 汉化未完成，未提交的候选包不会替换客户端: ${error.message}`);
        return false;
    } finally {
        // Only remove the unique directory created by this invocation.
        if (buildDir && !retainRecoveryFiles) {
            try { fs.rmSync(buildDir, { recursive: true, force: true }); } catch (error) {
                console.warn(`[提示] 临时目录已保留: ${buildDir}`);
            }
        }
    }
}

function restore20(resourcesDir) {
    const asarPath = path.join(resourcesDir, "app.asar");
    const bakPath = path.join(resourcesDir, "app.asar.bak");

    if (!fs.existsSync(bakPath)) {
        console.log("[!] 未找到备份文件 app.asar.bak，可能尚未安装过汉化或备份被删除。");
        return false;
    }

    console.log("[还原] 正在用官方备份文件恢复...");
    try {
        const restoreDir = fs.mkdtempSync(path.join(resourcesDir, '.antigravity-restore-'));
        try {
            const candidate = path.join(restoreDir, 'app.asar');
            fs.copyFileSync(bakPath, candidate);
            readAsarLayout(candidate);
            fs.renameSync(candidate, asarPath);
        } finally {
            fs.rmSync(restoreDir, { recursive: true, force: true });
        }
    } catch (e) {
        console.error(`[错误] 恢复备份失败: ${e.message}`);
        if (process.platform === 'darwin' && e.code === 'EPERM') {
            console.error(`[提示] macOS 写入受限，请使用管理员权限运行脚本。`);
        }
        return false;
    }
    resignAppOnMac(resourcesDir);
    console.log("[√] 官方 app.asar 已成功恢复！");
    return true;
}

// ==========================================
// 代理模块管理 (Windows 平台可选注入)
// ==========================================
function injectProxyIfNeeded(installDir) {
    if (process.platform !== 'win32') return;
    const proxyConfigDir = path.join(__dirname, 'proxy_config');
    if (!fs.existsSync(proxyConfigDir)) return;

    let files = [];
    try {
        files = fs.readdirSync(proxyConfigDir).filter(f => {
            const fullPath = path.join(proxyConfigDir, f);
            return fs.statSync(fullPath).isFile();
        });
    } catch (e) {
        return;
    }

    if (files.length === 0) return;

    console.log(`\n[代理] 检测到 proxy_config 配置目录，正在注入代理模块...`);
    const injectedFiles = [];
    for (const file of files) {
        const src = path.join(proxyConfigDir, file);
        const dest = path.join(installDir, file);
        try {
            fs.copyFileSync(src, dest);
            injectedFiles.push(file);
        } catch (e) {
            console.warn(`[代理警告] 注入文件 ${file} 失败: ${e.message}`);
        }
    }

    if (injectedFiles.length > 0) {
        console.log(`[代理] 代理模块注入成功: ${injectedFiles.join(', ')}`);
    }
}

function restoreProxyIfNeeded(installDir) {
    if (process.platform !== 'win32') return;
    const proxyFiles = ['version.dll', 'dbghelp.dll', 'config.json'];
    const proxyConfigDir = path.join(__dirname, 'proxy_config');
    if (fs.existsSync(proxyConfigDir)) {
        try {
            const files = fs.readdirSync(proxyConfigDir);
            for (const f of files) {
                if (!proxyFiles.includes(f)) proxyFiles.push(f);
            }
        } catch (e) {
            // ignore
        }
    }

    const retainedFiles = [];
    for (const file of proxyFiles) {
        const dest = path.join(installDir, file);
        if (fs.existsSync(dest)) {
            retainedFiles.push(file);
        }
    }

    if (retainedFiles.length > 0) {
        console.log(`[代理] 已保留代理文件（无法确认其归属，请按需手动处理）: ${retainedFiles.join(', ')}`);
    }
}

// ==========================================
// 入口
// ==========================================
function main() {
    let huifu = false;
    let manualDir = "";
    let noKill = false;

    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--huifu') {
            huifu = true;
        } else if (args[i] === '--install-dir') {
            manualDir = args[i + 1] || "";
            i++;
        } else if (args[i] === '--no-kill') {
            noKill = true;
        } else if (args[i] === '--brand-title') {
            i++;
        }
    }

    // 1. 探测路径
    const installDir = detectInstallationDir(manualDir);
    
    // 2. 检测客户端是否正在运行，并根据参数决定是否关闭以解除文件锁定
    wasAppRunning = checkIfAppIsRunning();
    if (noKill) {
        console.log("[跳过] 检测到 --no-kill 参数，跳过关闭 Antigravity 运行进程。");
    } else {
        closeAntigravityProcesses();
    }

    // 3. 找到 resources 资源目录
    let resourcesDir = "";
    if (fs.existsSync(path.join(installDir, "resources"))) {
        resourcesDir = path.join(installDir, "resources");
    } else if (fs.existsSync(path.join(installDir, "Contents", "Resources"))) {
        resourcesDir = path.join(installDir, "Contents", "Resources");
    } else if (installDir.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase().endsWith("/resources")) {
        resourcesDir = installDir;
    } else {
        if (fs.existsSync(path.join(installDir, "app.asar"))) {
            resourcesDir = installDir;
        } else {
            resourcesDir = path.join(installDir, "resources");
        }
    }

    if (!fs.existsSync(resourcesDir)) {
        console.error(`[错误] 无法定位有效的资源(resources)目录: ${resourcesDir}`);
        process.exit(1);
    }

    ensureWritePermission(resourcesDir);

    // 4. 执行安装或卸载恢复
    let success = false;

    if (huifu) {
        console.log("====== 正在卸载中文汉化，恢复官方原版 ======");
        success = restore20(resourcesDir);
        if (success) {
            restoreProxyIfNeeded(installDir);
        }
    } else {
        console.log("====== 正在安装 Antigravity 中文汉化 ======");
        success = install20(resourcesDir);
        if (success) {
            injectProxyIfNeeded(installDir);
        }
    }

    // 5. 校验通过且原来客户端在运行，则自动重新启动客户端
    if (success && wasAppRunning) {
        console.log("\n[启动] 检测到安装前反重力客户端处于开启状态，正在重新启动客户端...");
        try {
            if (process.platform === 'win32') {
                const exePath = path.join(installDir, 'Antigravity.exe');
                if (fs.existsSync(exePath)) {
                    const child = child_process.spawn(exePath, [], {
                        detached: true,
                        stdio: 'ignore'
                    });
                    child.unref();
                    console.log("[启动] 客户端启动成功！");
                } else {
                    console.warn(`[警告] 未找到客户端主程序: ${exePath}`);
                }
            } else if (process.platform === 'darwin') {
                if (process.env.SUDO_USER && process.env.SUDO_USER !== 'root') {
                    child_process.exec(`sudo -u "${process.env.SUDO_USER}" open "${installDir}"`);
                } else {
                    child_process.exec(`open "${installDir}"`);
                }
                console.log("[启动] 客户端启动成功！");
            }
        } catch (e) {
            console.warn(`[警告] 客户端启动失败: ${e.message}`);
        }
    }

    if (!success) {
        process.exit(1);
    }
}

main();
