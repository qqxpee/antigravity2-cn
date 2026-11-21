const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const child_process = require('child_process');

const { readAsarLayout, patchAsarArchive, validateAsarCandidate } = require('./src/asar_patcher');
const {
    patchPreloadJs,
    patchUtilsJs,
    patchMenuJs,
    patchTrayJs,
    patchLoadingOverlayJs,
    patchUpdaterJs,
    patchMainProcessModule,
    MAIN_PROCESS_PATCH_TARGETS
} = require('./src/main_patches');

// macOS 环境下自动补全 PATH，确保 codesign 等工具能被顺利找到
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
    let result = defaultValue;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === name) {
            if (i + 1 < args.length && args[i + 1] && !args[i + 1].startsWith('--')) {
                result = args[i + 1];
                i++;
            }
        } else if (args[i].startsWith(name + '=')) {
            result = args[i].slice(name.length + 1);
        }
    }
    return result;
}

const rawBrandTitle = String(getOptionValue('--brand-title', 'english')).toLowerCase();
let BRAND_TITLE_MODE = BRAND_TITLE_ALIASES[rawBrandTitle] || 'english';
if (!BRAND_TITLE_ALIASES[rawBrandTitle]) {
    console.warn(`[警告] 未识别的 --brand-title 参数 "${rawBrandTitle}"，已回退为 english。`);
}

if (USE_TW) {
    const logTranslations = {
        "====== 正在安装 Antigravity 中文汉化 ======": "====== 正在安裝 Antigravity 繁體中文漢化 ======",
        "====== 正在卸载中文汉化，恢复官方原版 ======": "====== 正在卸載中文漢化，恢復官方原版 ======",
        "[1] 检测到 Antigravity 客户端正在运行，正在关闭以解除文件锁...": "[1] 偵測到 Antigravity 用戶端正在執行，正在關閉以解除檔案鎖...",
        "[缓存] 已自动清理 ": "[快取] 已自動清理 ",
        " 个应用缓存目录，避免新旧版本字节码冲突。": " 個應用程式快取目錄，避免新舊版本位元組碼衝突。",
        "[签名] 已同步更新 macOS Info.plist 中的 ElectronAsarIntegrity 校验值。": "[簽名] 已同步更新 macOS Info.plist 中的 ElectronAsarIntegrity 校驗值。",
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
        "[修改] 正在向 utils.js 注入伴生面板 (Sidecar) 汉化钩子...": "[修改] 正在向 utils.js 注入伴生面板 (Sidecar) 漢化掛鉤...",
        "[修改] 伴生面板 (Sidecar) 汉化钩子注入成功！": "[修改] 伴生面板 (Sidecar) 漢化掛鉤注入成功！",
        "[警告] 未能在 utils.js 中找到 Sidecar 钩子插入点。": "[警告] 未能在 utils.js 中找到 Sidecar 掛鉤插入點。",
        "[打包] 正在使用原生引擎生成并校验汉化候选包...": "[打包] 正在使用原生引擎產生並校驗漢化候選包...",
        "[√] Antigravity 2.0 汉化部署完成！": "[√] Antigravity 2.0 繁體中文化套用完成！",
        "[!] 未找到备份文件 app.asar.bak，可能尚未安装过汉化或备份被删除。": "[!] 未找到備份檔案 app.asar.bak，可能尚未安裝過繁中化或備份已被刪除。",
        "[还原] 正在用官方备份文件恢复...": "[還原] 正在使用官方備份檔案還原...",
        "[权限] 检测到当前用户对 macOS 应用目录缺少写入权限，正在尝试请求管理员权限 (sudo) 重新运行...": "[權限] 偵測到目前使用者對 macOS 應用程式目錄缺少寫入權限，正在嘗試請求管理員權限 (sudo) 重新執行...",
        "[√] 官方 app.asar 已成功恢复！": "[√] 官方 app.asar 已成功還原！",
        "[错误] --install-dir 缺少有效的路径参数！": "[錯誤] --install-dir 缺少有效的路徑參數！",
        "[错误] --install-dir= 路径不能为空！": "[錯誤] --install-dir= 路徑不能為空！",
        "[错误] --brand-title 缺少有效的参数值（支持 english / hidden / translated）！": "[錯誤] --brand-title 缺少有效的參數值（支援 english / hidden / translated）！",
        "[错误] --brand-title= 参数值不能为空！": "[錯誤] --brand-title= 參數值不能為空！",
        "[错误] 检测到当前 app.asar 已安装过汉化，但官方备份文件 app.asar.bak 丢失！为防止将已汉化文件误存为官方备份，已中止操作。请先恢复官方原版客户端后再安装。": "[錯誤] 偵測到目前 app.asar 已安裝過漢化，但官方備份檔案 app.asar.bak 遺失！為防止將已漢化檔案誤存為官方備份，已中止操作。請先還原官方原版用戶端後再安裝。",
        "[错误] 管理员提权执行失败或用户取消了密码输入。": "[錯誤] 管理員提權執行失敗或使用者取消了密碼輸入。",
        "[错误] 汉化未完成，未提交的候选包不会替换客户端: ": "[錯誤] 漢化未完成，未提交的候選封裝不會替換用戶端: ",
        "[错误] 恢复备份失败: ": "[錯誤] 還原備份失敗: ",
        "[提示] macOS 写入受限，请使用管理员权限运行脚本。": "[提示] macOS 寫入受限，請使用管理員權限執行指令碼。",
        "[提示] 临时目录已保留: ": "[提示] 暫存目錄已保留: ",
        "[错误] 更新 macOS Info.plist 校验值失败，已中止签名: ": "[錯誤] 更新 macOS Info.plist 校驗值失敗，已中止簽名: ",
        "[错误] 未能识别有效的 ElectronAsarIntegrity 格式，已中止签名。": "[錯誤] 未能識別有效的 ElectronAsarIntegrity 格式，已中止簽名。",
        "[警告] 清理扩展属性 (xattr) 失败: ": "[警告] 清除延伸屬性 (xattr) 失敗: ",
        "[错误] 手动指定的路径不存在:": "[錯誤] 手動指定的路徑不存在:",
        "[错误] 未在资源目录中找到 app.asar:": "[錯誤] 未在資源目錄中找到 app.asar:",
        "[错误] 未能在 app.asar 中找到 dist/preload.js": "[錯誤] 未能在 app.asar 中找到 dist/preload.js",
        "[错误] 无法定位有效的资源(resources)目录: ": "[錯誤] 無法定位有效的資源(resources)目錄: ",
        "[警告] 未能在 menu.js 中找到设定的插入点。": "[警告] 未能在 menu.js 中找到設定的插入點。",
        "[警告] 未能在 tray.js 中找到 createTray 函数插入点。": "[警告] 未能在 tray.js 中找到 createTray 函式插入點。",
        "[签名] 检测到 macOS 平台，正在对应用包进行本地 ad-hoc 深度重签名: ": "[簽名] 偵測到 macOS 平台，正在對應用程式包進行本機 ad-hoc 深度重新簽名: ",
        "[签名] 重新签名成功！": "[簽名] 重新簽名成功！",
        "[签名] 目标路径并非完整 macOS .app 应用包，已跳过重签名: ": "[簽名] 目標路徑並非完整 macOS .app 應用程式包，已跳過重新簽名: ",
        "[警告] 保存汉化偏好配置失败: ": "[警告] 儲存漢化偏好設定失敗: ",
        "[错误] 重新签名失败，已中止操作。详情:": "[錯誤] 重新簽名失敗，已中止操作。詳情:",
        "[错误] 未能从路径 ": "[錯誤] 未能從路徑 ",
        " 识别到有效的 .app 路径，无法完成 macOS 重签名。": " 識別到有效的 .app 路徑，無法完成 macOS 重新簽名。",
        "[探测] 成功自动识别到 Antigravity 安装目录: ": "[偵測] 成功自動識別到 Antigravity 安裝目錄: ",
        "[错误] 未找到默认安装目录，请使用 --install-dir 手动指定您的安装路径！": "[錯誤] 未找到預設安裝目錄，請使用 --install-dir 手動指定您的安裝路徑！",
        "详情: ": "詳情: ",
        "[跳过] 检测到 --no-kill 参数，跳过关闭 Antigravity 运行进程。": "[跳過] 偵測到 --no-kill 參數，跳過關閉 Antigravity 執行進程。",
        "[启动] 检测到安装前反重力客户端处于开启状态，正在重新启动客户端...": "[啟動] 偵測到安裝前反重力用戶端處於開啟狀態，正在重新啟動用戶端...",
        "[启动] 客户端启动成功！": "[啟動] 用戶端啟動成功！",
        "[警告] 客户端启动失败: ": "[警告] 用戶端啟動失敗: ",
        "[代理] 检测到 proxy_config 配置目录，正在注入代理模块...": "[代理] 偵測到 proxy_config 設定目錄，正在注入代理模組...",
        "[代理] 代理模块注入成功: ": "[代理] 代理模組注入成功: ",
        "[代理] 已保留代理文件（无法确认其归属，请按需手动处理）: ": "[代理] 已保留代理檔案（無法確認其歸屬，請按需手動處理）: ",
        "[代理警告] 注入文件 ": "[代理警告] 注入檔案 ",
        " 失败: ": " 失敗: ",
        "[警告] 未能在 tray.js 中命中任何任务栏注入点。": "[警告] 未能在 tray.js 中命中任何系統匣注入點。",
        "[警告] 未能在 loadingOverlay.js 中找到加载页文本插入点。": "[警告] 未能在 loadingOverlay.js 中找到載入頁文字插入點。",
        "[警告] 未能在 updater.js 中找到更新弹窗插入点。": "[警告] 未能在 updater.js 中找到更新彈出視窗插入點。",
        "[错误] 当前用户对目标目录缺少写入权限，请使用管理员权限运行脚本。": "[錯誤] 目前使用者對目標目錄缺少寫入權限，請使用管理員權限執行指令碼。",
        "[1/2] 正在注入汉化...": "[1/2] 正在注入繁體中文化...",
        "[2/2] 注入完成！": "[2/2] 注入完成！",
        "提示：汉化已成功安装。": "提示：繁體中文漢化已成功套用。",
        "窗口将在 5 秒后自动关闭...": "視窗將在 5 秒後自動關閉...",
        "[×] 注入失败，请检查上方错误信息。": "[×] 注入失敗，請檢查上方錯誤訊息。"
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
    if (!fs.existsSync(dictsDir)) {
        throw new Error(`词典目录不存在: ${dictsDir}`);
    }
    const files = fs.readdirSync(dictsDir).filter(file => file.endsWith('.json')).sort();
    for (const file of files) {
        const filePath = path.join(dictsDir, file);
        try {
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(fileContent);
            for (const [k, v] of Object.entries(data)) {
                const normK = normalizeText(k);
                if (normK) totalMap[normK] = v;
            }
        } catch (e) {
            throw new Error(`词典文件解析失败 (${filePath}): ${e.message}`);
        }
    }
    if (Object.keys(totalMap).length === 0) {
        throw new Error(`词典目录未加载到有效词条: ${dictsDir}`);
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
    const runtimePath = path.join(__dirname, 'src', 'preload_runtime.js');
    const runtimeTemplate = fs.readFileSync(runtimePath, 'utf-8');

    const body = runtimeTemplate
        .replace('__USE_TW_PLACEHOLDER__', () => (USE_TW ? 'true' : 'false'))
        .replace('DICT_PLACEHOLDER', () => dictJson);

    return `${SIGNATURE_START}\n${body}\n${SIGNATURE_END}`;
}

let wasAppRunning = false;

function checkIfAppIsRunning() {
    try {
        if (process.platform === 'win32') {
            const stdout = child_process.execSync('tasklist /fi "imagename eq Antigravity.exe" /nh', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
            return stdout.toLowerCase().includes('antigravity.exe');
        } else if (process.platform === 'darwin') {
            const stdout = child_process.execSync('pgrep -x Antigravity || pgrep -f "/Antigravity\\.app/Contents/MacOS/Antigravity"', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
            return stdout.trim().length > 0;
        }
    } catch (e) {
        // ignore
    }
    return false;
}

function sleepSync(ms) {
    try {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
    } catch (e) {
        const start = Date.now();
        while (Date.now() - start < ms) {}
    }
}

function closeAntigravityProcesses() {
    console.log("[1] 检测到 Antigravity 客户端正在运行，正在关闭以解除文件锁...");
    try {
        // 第一阶段：尝试发送温和退出信号 (WM_CLOSE / SIGTERM)，让客户端有机会触发 before-quit 优雅落盘
        if (process.platform === 'win32') {
            child_process.execSync('taskkill /im Antigravity.exe >nul 2>nul');
        } else {
            child_process.execSync('killall -TERM Antigravity >/dev/null 2>&1; pkill -TERM -x Antigravity >/dev/null 2>&1');
        }
    } catch (e) {}

    // 等待最多 2.5 秒让主进程响应退出
    const waitStart = Date.now();
    while (Date.now() - waitStart < 2500) {
        sleepSync(250);
        if (!checkIfAppIsRunning()) break;
    }

    // 第二阶段：无论主窗口是否已关闭，都必须执行 /f /t 彻底清理所有残余的 Electron GPU/渲染子进程，彻底释放 app.asar 文件锁
    try {
        if (process.platform === 'win32') {
            child_process.execSync('taskkill /f /im Antigravity.exe /t >nul 2>nul');
        } else {
            child_process.execSync('killall Antigravity >/dev/null 2>&1; killall "Antigravity Helper" >/dev/null 2>&1; pkill -x Antigravity >/dev/null 2>&1; pkill -f "/Antigravity\\.app/Contents/MacOS/Antigravity" >/dev/null 2>&1');
        }
    } catch (e) {}
    sleepSync(1200);
}

function detectInstallationDir(manualDir) {
    if (manualDir) {
        if (fs.existsSync(manualDir)) {
            let resolved = path.resolve(manualDir);
            if (fs.statSync(resolved).isFile() && /app\.asar$/i.test(resolved)) {
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
                const output = child_process.execFileSync('cmd', ['/d', '/u', '/c', `reg query "${root}" /s /f Antigravity /d`], { encoding: 'utf16le', stdio: 'pipe' });
                for (const line of output.split(/\r?\n/)) {
                    const match = line.match(/^\s*(InstallLocation|DisplayIcon)\s+REG_\w+\s+(.+)$/i);
                    if (!match) continue;
                    let value = match[2].trim().replace(/,-?\d+$/, '').trim().replace(/^"|"$/g, '');
                    if (/Antigravity\.exe$/i.test(value)) {
                        value = path.dirname(value);
                    }
                    addCandidate(value);
                }
            } catch (e) {}
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
        if (process.env.HOME) {
            addCandidate(path.join(process.env.HOME, 'Applications', 'Antigravity.app'));
        }
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

function spawnCommandSync(cmd, args) {
    const res = child_process.spawnSync(cmd, args, { encoding: 'utf-8', stdio: 'pipe', env: { ...process.env } });
    if (res.error) {
        return { success: false, stdout: res.stdout || '', stderr: res.error.message };
    }
    return { success: res.status === 0, stdout: res.stdout || '', stderr: res.stderr || '' };
}

function cleanElectronCache() {
    let baseAppSupportDir = "";
    if (process.platform === 'darwin') {
        let userHome = os.homedir();
        if (process.env.SUDO_USER && process.env.SUDO_USER !== 'root') {
            const sudoHome = path.join('/Users', process.env.SUDO_USER);
            if (fs.existsSync(sudoHome)) {
                userHome = sudoHome;
            }
        }
        baseAppSupportDir = path.join(userHome, 'Library', 'Application Support');
    } else if (process.platform === 'win32') {
        baseAppSupportDir = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    } else {
        baseAppSupportDir = path.join(os.homedir(), '.config');
    }

    const cacheDirNames = new Set(['Cache', 'Code Cache', 'GPUCache', 'DawnWebGPUCache', 'DawnGraphiteCache']);
    const maxWalkDepth = 4;
    let cleanedCount = 0;

    function walkCacheDirs(dir, depth) {
        if (depth > maxWalkDepth || !fs.existsSync(dir)) return;
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch (e) {
            return;
        }
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const fullPath = path.join(dir, entry.name);
            if (cacheDirNames.has(entry.name)) {
                try {
                    fs.rmSync(fullPath, { recursive: true, force: true });
                    cleanedCount++;
                } catch (e) {}
            } else if (
                depth < maxWalkDepth &&
                (entry.name === 'Partitions' || entry.name.startsWith('hub-browser-') || entry.name === 'Service Worker' || entry.name === 'CacheStorage')
            ) {
                walkCacheDirs(fullPath, depth + 1);
            }
        }
    }

    for (const appDirName of ['Antigravity', 'Antigravity IDE']) {
        walkCacheDirs(path.join(baseAppSupportDir, appDirName), 0);
    }

    if (cleanedCount > 0) {
        console.log(`[缓存] 已自动清理 ${cleanedCount} 个应用缓存目录，避免新旧版本字节码冲突。`);
    }
}

function resolveMacAppBundle(dir) {
    const clean = String(dir || '').replace(/[\\/]+$/, '');
    if (!clean) return null;
    let current = path.resolve(clean);
    for (let i = 0; i < 10; i++) {
        if (current.endsWith('.app') || fs.existsSync(path.join(current, 'Contents', 'MacOS'))) {
            return current;
        }
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
    }
    return null;
}

function isValidMacAppBundle(bundlePath) {
    if (!bundlePath || !fs.existsSync(bundlePath)) return false;
    return fs.existsSync(path.join(bundlePath, 'Contents', 'MacOS')) ||
        fs.existsSync(path.join(bundlePath, 'Contents', 'Info.plist'));
}

function resignAppOnMac(anyPath) {
    if (process.platform !== 'darwin') return true;

    const targetApp = resolveMacAppBundle(anyPath);
    if (!isValidMacAppBundle(targetApp)) {
        console.log(`[签名] 目标路径并非完整 macOS .app 应用包，已跳过重签名: ${anyPath}`);
        return true;
    }

    const plistPath = path.join(targetApp, 'Contents', 'Info.plist');
    const macAsarPath = path.join(targetApp, 'Contents', 'Resources', 'app.asar');
    if (fs.existsSync(plistPath) && fs.existsSync(macAsarPath)) {
        try {
            const plistContent = fs.readFileSync(plistPath, 'utf-8');
            if (plistContent.includes('ElectronAsarIntegrity')) {
                const asarBuf = fs.readFileSync(macAsarPath);
                if (asarBuf.length < 16) {
                    throw new Error('app.asar 长度不足 16 字节');
                }
                const headerStrSize = asarBuf.readUInt32LE(12);
                if (16 + headerStrSize > asarBuf.length) {
                    throw new Error('app.asar 头长度越界');
                }
                const headerHash = crypto.createHash('sha256').update(asarBuf.subarray(16, 16 + headerStrSize)).digest('hex');
                const integrityRegex = /(<key>ElectronAsarIntegrity<\/key>[\s\S]*?<key>Resources\/app\.asar<\/key>\s*<dict>(?:(?!<\/dict>)[\s\S])*?<key>hash<\/key>\s*<string>)[a-fA-F0-9]{64}(<\/string>)/;
                if (!integrityRegex.test(plistContent)) {
                    console.error(`[错误] 未能识别有效的 ElectronAsarIntegrity 格式，已中止签名。`);
                    return false;
                }
                const updatedPlist = plistContent.replace(integrityRegex, `$1${headerHash}$2`);
                if (updatedPlist !== plistContent) {
                    fs.writeFileSync(plistPath, updatedPlist, 'utf-8');
                    console.log('[签名] 已同步更新 macOS Info.plist 中的 ElectronAsarIntegrity 校验值。');
                }
            }
        } catch (e) {
            console.error(`[错误] 更新 macOS Info.plist 校验值失败，已中止签名: ${e.message}`);
            return false;
        }
    }

    const xattrRes = spawnCommandSync('xattr', ['-cr', targetApp]);
    if (!xattrRes.success) {
        console.warn(`[警告] 清理扩展属性 (xattr) 失败: ${xattrRes.stderr || xattrRes.stdout}`);
    }
    console.log(`[签名] 检测到 macOS 平台，正在对应用包进行本地 ad-hoc 深度重签名: ${targetApp} ...`);
    const signRes = spawnCommandSync('codesign', ['--force', '--deep', '--sign', '-', targetApp]);
    if (signRes.success) {
        console.log(`[签名] 重新签名成功！`);
        return true;
    }
    console.error(`[错误] 重新签名失败，已中止操作。详情:\n${signRes.stderr}\n${signRes.stdout}`);
    return false;
}

function ensureWritePermission(targetDir) {
    if (process.platform === 'win32') {
        const probeFile = path.join(targetDir, `.ag-write-check-${process.pid}.tmp`);
        try {
            fs.writeFileSync(probeFile, '');
            fs.unlinkSync(probeFile);
            return true;
        } catch (err) {
            if (err && (err.code === 'EPERM' || err.code === 'EACCES')) {
                return false;
            }
            return true;
        }
    }
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
// Antigravity 2.0 汉化部署引擎 (零依赖纯 Node.js 原生 ASAR 打包模式)
// ==========================================
function replaceFileWithRetry(srcPath, destPath, allowKill = false) {
    let lastErr;
    for (let attempt = 0; attempt < 10; attempt++) {
        try {
            fs.renameSync(srcPath, destPath);
            return;
        } catch (err) {
            lastErr = err;
            if (err.code === 'EPERM' || err.code === 'EBUSY' || err.code === 'EACCES') {
                if (allowKill && attempt === 2 && process.platform === 'win32') {
                    try { child_process.execSync('taskkill /f /im Antigravity.exe /t >nul 2>nul'); } catch (e) {}
                }
                sleepSync(400);
                continue;
            }
            throw err;
        }
    }
    throw new Error(`文件替换失败 (${srcPath} -> ${destPath}): ${lastErr ? lastErr.message : 'unknown'}`);
}

function install20(resourcesDir, noKill = false) {
    const asarPath = path.join(resourcesDir, "app.asar");
    const bakPath = path.join(resourcesDir, "app.asar.bak");

    if (!fs.existsSync(asarPath)) {
        console.error(`[错误] 未在资源目录中找到 app.asar: ${resourcesDir}`);
        return false;
    }

    let buildDir;
    let retainRecoveryFiles = false;
    try {
        const originalLive = fs.readFileSync(asarPath);
        const isAlreadyLocalized = originalLive.indexOf(Buffer.from(SIGNATURE_START, "utf8")) !== -1;

        if (isAlreadyLocalized && !fs.existsSync(bakPath)) {
            console.error("[错误] 检测到当前 app.asar 已安装过汉化，但官方备份文件 app.asar.bak 丢失！为防止将已汉化文件误存为官方备份，已中止操作。请先恢复官方原版客户端后再安装。");
            return false;
        }

        const refreshBackup = !isAlreadyLocalized;
        const sourcePath = isAlreadyLocalized ? bakPath : asarPath;

        buildDir = fs.mkdtempSync(path.join(resourcesDir, '.antigravity-localize-'));
        const sourceArchive = path.join(buildDir, 'source.asar');
        fs.copyFileSync(sourcePath, sourceArchive);
        const rollbackArchive = path.join(buildDir, 'previous.asar');
        fs.writeFileSync(rollbackArchive, originalLive);
        const candidatePath = path.join(buildDir, 'candidate.asar');

        const translationJs = generateJs();
        const modifierMap = new Map([
            ['dist/preload.js', content => patchPreloadJs(content, translationJs, SIGNATURE_START, SIGNATURE_END)],
            ['dist/utils.js', content => patchUtilsJs(content, SIGNATURE_START, SIGNATURE_END)],
            ['dist/menu.js', content => patchMenuJs(content, USE_TW)],
            ['dist/tray.js', content => patchTrayJs(content, USE_TW)],
            ['dist/loadingOverlay.js', content => patchLoadingOverlayJs(content, USE_TW)],
            ['dist/updater.js', content => patchUpdaterJs(content, USE_TW)],
            ...MAIN_PROCESS_PATCH_TARGETS.map(relPath => [relPath, content => patchMainProcessModule(relPath, content, USE_TW)])
        ]);

        console.log(`[打包] 正在使用原生引擎生成并校验汉化候选包...`);
        const modifiedFiles = patchAsarArchive(sourceArchive, candidatePath, modifierMap);

        if (!modifiedFiles.has('dist/preload.js')) {
            console.error(`[错误] 未能在 app.asar 中找到 dist/preload.js`);
            return false;
        }

        validateAsarCandidate(sourceArchive, candidatePath, SIGNATURE_START);
        for (const [relPath, buf] of modifiedFiles.entries()) {
            const checkFile = path.join(buildDir, path.basename(relPath));
            fs.writeFileSync(checkFile, buf);
            try {
                child_process.execFileSync(process.execPath, ['--check', checkFile], { stdio: 'pipe' });
            } catch (syntaxErr) {
                const detail = syntaxErr.stderr ? String(syntaxErr.stderr).trim() : syntaxErr.message;
                throw new Error(`语法校验失败 (${relPath}): ${detail}`);
            }
        }

        if (!fs.readFileSync(asarPath).equals(originalLive)) {
            throw new Error('App changed during localization; please retry after the update completes');
        }

        const macBundleForPlist = process.platform === 'darwin' ? resolveMacAppBundle(resourcesDir) : null;
        const plistPath = macBundleForPlist ? path.join(macBundleForPlist, 'Contents', 'Info.plist') : null;
        const plistBackup = plistPath && fs.existsSync(plistPath) ? fs.readFileSync(plistPath) : null;

        replaceFileWithRetry(candidatePath, asarPath, !noKill);
        try {
            if (refreshBackup) replaceFileWithRetry(sourceArchive, bakPath, !noKill);
        } catch (error) {
            try {
                replaceFileWithRetry(rollbackArchive, asarPath, !noKill);
            } catch (rollbackError) {
                retainRecoveryFiles = true;
                throw new Error(`Backup promotion and rollback failed; original app retained at ${rollbackArchive}: ${rollbackError.message}`);
            }
            throw error;
        }

        if (!(noKill && wasAppRunning)) {
            cleanElectronCache();
        }
        if (buildDir) {
            try { fs.rmSync(buildDir, { recursive: true, force: true }); } catch (e) {}
            buildDir = null;
        }
        if (!resignAppOnMac(resourcesDir)) {
            try {
                fs.writeFileSync(asarPath, originalLive);
                if (plistBackup && plistPath) fs.writeFileSync(plistPath, plistBackup);
                if (refreshBackup && fs.existsSync(bakPath)) fs.unlinkSync(bakPath);
            } catch (rollbackError) {
                throw new Error(`macOS 签名失败且回滚失败: ${rollbackError.message}`);
            }
            return false;
        }
        console.log(`[√] Antigravity 2.0 汉化部署完成！`);
        return true;
    } catch (error) {
        console.error(`[错误] 汉化未完成，未提交的候选包不会替换客户端: ${error.message}`);
        return false;
    } finally {
        if (buildDir && !retainRecoveryFiles) {
            try { fs.rmSync(buildDir, { recursive: true, force: true }); } catch (error) {
                console.warn(`[提示] 临时目录已保留: ${buildDir}`);
            }
        }
    }
}

function restore20(resourcesDir, noKill = false) {
    const asarPath = path.join(resourcesDir, "app.asar");
    const bakPath = path.join(resourcesDir, "app.asar.bak");

    if (!fs.existsSync(bakPath)) {
        console.log("[!] 未找到备份文件 app.asar.bak，可能尚未安装过汉化或备份被删除。");
        return false;
    }

    console.log("[还原] 正在用官方备份文件恢复...");
    let restoreDir;
    let retainRestoreFiles = false;
    try {
        restoreDir = fs.mkdtempSync(path.join(resourcesDir, '.antigravity-restore-'));
        const candidate = path.join(restoreDir, 'app.asar');
        const previousBackup = path.join(restoreDir, 'previous.asar');
        if (fs.existsSync(asarPath)) {
            fs.copyFileSync(asarPath, previousBackup);
        }
        const macBundleForPlist = process.platform === 'darwin' ? resolveMacAppBundle(resourcesDir) : null;
        const plistPath = macBundleForPlist ? path.join(macBundleForPlist, 'Contents', 'Info.plist') : null;
        const plistBackup = plistPath && fs.existsSync(plistPath) ? fs.readFileSync(plistPath) : null;

        fs.copyFileSync(bakPath, candidate);
        readAsarLayout(candidate);
        replaceFileWithRetry(candidate, asarPath, !noKill);
        if (!resignAppOnMac(resourcesDir)) {
            try {
                if (fs.existsSync(previousBackup)) replaceFileWithRetry(previousBackup, asarPath, !noKill);
                if (plistBackup && plistPath) fs.writeFileSync(plistPath, plistBackup);
            } catch (rollbackError) {
                retainRestoreFiles = true;
                throw new Error(`macOS 恢复签名失败且回滚失败，原文件保留于 ${previousBackup}: ${rollbackError.message}`);
            }
            return false;
        }
    } catch (e) {
        console.error(`[错误] 恢复备份失败: ${e.message}`);
        if (process.platform === 'darwin' && e.code === 'EPERM') {
            console.error(`[提示] macOS 写入受限，请使用管理员权限运行脚本。`);
        }
        return false;
    } finally {
        if (restoreDir && !retainRestoreFiles) {
            try { fs.rmSync(restoreDir, { recursive: true, force: true }); } catch (_e) {}
        }
    }
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
        } catch (e) {}
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

function getPrefsFilePath() {
    const baseDir = process.platform === 'win32'
        ? (process.env.APPDATA || process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Roaming'))
        : (process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'));
    return path.join(baseDir, 'Antigravity', 'localization-prefs.json');
}

function saveLocalizationPref(installDir, pref) {
    try {
        const prefsPath = getPrefsFilePath();
        let data = {};
        if (fs.existsSync(prefsPath)) {
            const raw = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
            if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
                data = raw;
            }
        }
        const key = path.resolve(installDir).toLowerCase();
        data[key] = {
            useTw: Boolean(pref.useTw),
            brandTitle: String(pref.brandTitle || 'english'),
            updatedAt: new Date().toISOString()
        };
        fs.mkdirSync(path.dirname(prefsPath), { recursive: true });
        fs.writeFileSync(prefsPath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.warn(`[警告] 保存汉化偏好配置失败: ${e.message}`);
    }
}

function canRestartApp(installDir) {
    if (process.platform === 'win32') {
        return fs.existsSync(path.join(installDir, 'Antigravity.exe'));
    }
    if (process.platform === 'darwin') {
        return isValidMacAppBundle(resolveMacAppBundle(installDir));
    }
    return false;
}

function resolveBrandTitleChoice(choice) {
    const trimmed = String(choice || '').trim();
    if (trimmed === '2') return 'hidden';
    if (trimmed === '3') return 'translated';
    return 'english';
}

function promptBrandTitleMode(useTw = USE_TW, { input = process.stdin, output = process.stdout, log = console.log } = {}) {
    const promptLines = useTw
        ? [
            '',
            '請選擇左上角品牌顯示方式：',
            '[1] 保持英文 Antigravity（推薦）',
            '[2] 隱藏品牌名稱',
            '[3] 顯示繁體中文品牌名稱（反重力）'
        ]
        : [
            '',
            '请选择左上角品牌显示方式：',
            '[1] 保持英文 Antigravity（推荐）',
            '[2] 隐藏品牌名',
            '[3] 汉化为品牌名（反重力）'
        ];
    const questionText = useTw
        ? '請輸入選項 [1/2/3]（直接按 Enter 預設為 1）：'
        : '请选择 [1/2/3] (直接按 Enter 默认为 1): ';

    for (const line of promptLines) {
        log(line);
    }

    return new Promise((resolve) => {
        const readline = require('readline');
        const rl = readline.createInterface({ input, output });
        let settled = false;
        let aborted = false;
        const finish = (answer) => {
            if (settled) return;
            settled = true;
            rl.close();
            resolve(resolveBrandTitleChoice(answer));
        };
        rl.on('SIGINT', () => {
            aborted = true;
            settled = true;
            rl.close();
            process.exit(130);
        });
        rl.on('close', () => {
            if (!aborted) finish('1');
        });
        rl.question(questionText, finish);
    });
}

// ==========================================
// 入口
// ==========================================
async function main() {
    if (typeof require === 'function' && typeof module !== 'undefined' && require.main !== module) {
        return;
    }
    let huifu = false;
    let manualDir = "";
    let noKill = false;
    let interactive = false;

    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--huifu') {
            huifu = true;
        } else if (args[i] === '--interactive') {
            interactive = true;
        } else if (args[i] === '--install-dir') {
            if (i + 1 >= args.length || !args[i + 1] || args[i + 1].startsWith('--')) {
                console.error('[错误] --install-dir 缺少有效的路径参数！');
                process.exit(1);
            }
            manualDir = args[i + 1];
            i++;
        } else if (args[i].startsWith('--install-dir=')) {
            manualDir = args[i].slice('--install-dir='.length);
            if (!manualDir) {
                console.error('[错误] --install-dir= 路径不能为空！');
                process.exit(1);
            }
        } else if (args[i] === '--no-kill') {
            noKill = true;
        } else if (args[i] === '--brand-title') {
            if (i + 1 >= args.length || !args[i + 1] || args[i + 1].startsWith('--')) {
                console.error('[错误] --brand-title 缺少有效的参数值（支持 english / hidden / translated）！');
                process.exit(1);
            }
            i++;
        } else if (args[i].startsWith('--brand-title=')) {
            if (!args[i].slice('--brand-title='.length)) {
                console.error('[错误] --brand-title= 参数值不能为空！');
                process.exit(1);
            }
        }
    }

    const hasExplicitBrandTitle = args.some(a => a === '--brand-title' || a.startsWith('--brand-title='));
    if (interactive && !huifu && !hasExplicitBrandTitle) {
        BRAND_TITLE_MODE = await promptBrandTitleMode(USE_TW);
    }
    if (interactive && !huifu) {
        console.log('\n[1/2] 正在注入汉化...');
    }

    // 1. 探测路径
    const installDir = detectInstallationDir(manualDir);

    // 2. 检测客户端是否正在运行，并根据参数决定是否关闭以解除文件锁定
    wasAppRunning = checkIfAppIsRunning();
    if (noKill) {
        console.log("[跳过] 检测到 --no-kill 参数，跳过关闭 Antigravity 运行进程。");
    } else if (wasAppRunning) {
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

    if (!ensureWritePermission(resourcesDir)) {
        console.error("[错误] 当前用户对目标目录缺少写入权限，请使用管理员权限运行脚本。");
        process.exit(1);
    }

    // 4. 执行安装或卸载恢复
    let success = false;

    if (huifu) {
        console.log("====== 正在卸载中文汉化，恢复官方原版 ======");
        success = restore20(resourcesDir, noKill);
        if (success) {
            restoreProxyIfNeeded(installDir);
        }
    } else {
        console.log("====== 正在安装 Antigravity 中文汉化 ======");
        success = install20(resourcesDir, noKill);
        if (success) {
            saveLocalizationPref(installDir, { useTw: USE_TW, brandTitle: BRAND_TITLE_MODE });
            injectProxyIfNeeded(installDir);
        }
    }

    // 5. 校验通过且原来客户端在运行，则自动重新启动客户端（仅当目标为有效客户端包/可执行程序时触发，避免自定义目录误弹 Finder）
    const macAppBundle = process.platform === 'darwin' ? resolveMacAppBundle(installDir) : null;
    if (success && wasAppRunning && !noKill && canRestartApp(installDir)) {
        console.log("\n[启动] 检测到安装前反重力客户端处于开启状态，正在重新启动客户端...");
        try {
            if (process.platform === 'win32') {
                const exePath = path.join(installDir, 'Antigravity.exe');
                const child = child_process.spawn(exePath, [], {
                    detached: true,
                    stdio: 'ignore'
                });
                child.unref();
                console.log("[启动] 客户端启动成功！");
            } else if (process.platform === 'darwin') {
                const openRes = (process.env.SUDO_USER && process.env.SUDO_USER !== 'root')
                    ? spawnCommandSync('sudo', ['-u', process.env.SUDO_USER, 'open', macAppBundle])
                    : spawnCommandSync('open', [macAppBundle]);
                if (openRes.success) {
                    console.log("[启动] 客户端启动成功！");
                } else {
                    console.warn(`[警告] 客户端启动失败: ${openRes.stderr || openRes.stdout}`);
                }
            }
        } catch (e) {
            console.warn(`[警告] 客户端启动失败: ${e.message}`);
        }
    }

    if (!success) {
        if (interactive && !huifu) {
            console.log('\n[×] 注入失败，请检查上方错误信息。');
        }
        process.exit(1);
    }
    if (interactive && !huifu) {
        console.log('\n[2/2] 注入完成！\n\n提示：汉化已成功安装。\n\n窗口将在 5 秒后自动关闭...');
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        generateJs,
        ensureWritePermission,
        resignAppOnMac,
        resolveMacAppBundle,
        isValidMacAppBundle,
        canRestartApp,
        resolveBrandTitleChoice,
        promptBrandTitleMode
    };
}

main();
