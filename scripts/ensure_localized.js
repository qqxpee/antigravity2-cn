/**
 * ensure_localized.js — 启动前自检汉化（Windows）
 *
 * 背景：Antigravity 自带 electron-updater，autoDownload=true 且 autoInstallOnAppQuit=true，
 * 退出软件时会静默安装已下载的更新包并整包替换 resources\app.asar，汉化随之丢失。
 *
 * 用法：
 *   node scripts/ensure_localized.js                 # 仅检查并报告状态
 *   node scripts/ensure_localized.js --fix           # 未汉化且软件未运行时自动重新注入
 *   node scripts/ensure_localized.js --fix --launch  # 自动修复后启动 Antigravity
 * 其它参数（--tw、--brand-title <mode>、--install-dir <dir>）原样透传给 localization_engine.js。
 * 退出码：0 = 已汉化（或已修复）；2 = 未汉化且未修复；1 = 出错。
 */
const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SIGNATURE_START = '/* --- ANTIGRAVITY CHINESE LOCALIZATION START --- */';
const args = process.argv.slice(2);
const FIX = args.includes('--fix');
const LAUNCH = args.includes('--launch');
const passthrough = args.filter(a => a !== '--fix' && a !== '--launch');

function optionValue(name) {
    const i = args.indexOf(name);
    return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
}

function hasResources(dir) {
    return !!dir && fs.existsSync(path.join(dir, 'resources', 'app.asar'));
}

function detectInstallDir() {
    const candidates = [optionValue('--install-dir'), process.env.ANTIGRAVITY_INSTALL_DIR, process.env.ANTIGRAVITY_HOME];
    for (const root of [
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
        'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
        'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    ]) {
        try {
            const out = child_process.execSync(`reg query "${root}" /s /f Antigravity /d`, { encoding: 'utf-8', stdio: 'pipe' });
            for (const line of out.split(/\r?\n/)) {
                const m = line.match(/^\s*(InstallLocation|DisplayIcon)\s+REG_\w+\s+(.+)$/i);
                if (!m) continue;
                let v = m[2].trim().replace(/,\d+$/, '').replace(/^"|"$/g, '');
                if (/\.exe$/i.test(v)) v = path.dirname(v);
                candidates.push(v);
            }
        } catch (e) { /* best effort */ }
    }
    if (process.env.LOCALAPPDATA) candidates.push(path.join(process.env.LOCALAPPDATA, 'Programs', 'antigravity'));
    return candidates.find(hasResources) || null;
}

function isRunning(installDir) {
    // Only count processes launched from this installation, so a custom --install-dir copy is not
    // blocked by (and never interferes with) another running Antigravity.
    try {
        const out = child_process.execSync(
            'powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name=\'Antigravity.exe\'\\" | ForEach-Object { $_.ExecutablePath }"',
            { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
        );
        const target = path.resolve(installDir).toLowerCase();
        return out.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
            .some(p => path.dirname(path.resolve(p)).toLowerCase() === target);
    } catch (e) {
        return false;
    }
}

function isLocalized(asarPath) {
    return fs.readFileSync(asarPath).indexOf(Buffer.from(SIGNATURE_START, 'utf8')) !== -1;
}

function pendingUpdate() {
    const dir = process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'antigravity-updater', 'pending');
    return dir && fs.existsSync(dir) && fs.readdirSync(dir).some(f => /\.exe$/i.test(f)) ? dir : null;
}

function launch(installDir) {
    const exe = path.join(installDir, 'Antigravity.exe');
    if (!fs.existsSync(exe)) {
        console.error(`[错误] 未找到 ${exe}`);
        return false;
    }
    child_process.spawn(exe, [], { detached: true, stdio: 'ignore', cwd: installDir }).unref();
    console.log('[启动] 已启动 Antigravity。');
    return true;
}

function main() {
    if (process.platform !== 'win32') {
        console.log('[提示] 自检启动器目前仅支持 Windows；macOS 请在更新后重新运行 双击安装中文汉化.command。');
        return 0;
    }
    const installDir = detectInstallDir();
    if (!installDir) {
        console.error('[错误] 未找到 Antigravity 安装目录，可用 --install-dir 指定。');
        return 1;
    }
    const asarPath = path.join(installDir, 'resources', 'app.asar');
    const running = isRunning(installDir);
    const pending = pendingUpdate();
    let localized = isLocalized(asarPath);
    console.log(`[检测] 安装目录: ${installDir}`);
    console.log(`[检测] 汉化状态: ${localized ? '已汉化' : '未汉化（可能已被官方自动更新覆盖）'}`);
    console.log(`[检测] 运行状态: ${running ? '正在运行' : '未运行'}`);
    if (pending) {
        console.log(`[提示] 检测到已下载的官方更新包: ${pending}`);
        console.log('       退出 Antigravity 时它会被静默安装并覆盖汉化；下次通过本启动器打开会自动修复。');
    }

    if (!localized && FIX) {
        if (running) {
            console.log('[跳过] Antigravity 正在运行，为避免强制关闭您的会话，本次不自动修复。请完全退出后再运行。');
        } else {
            const engineArgs = passthrough.includes('--brand-title') ? [...passthrough] : ['--brand-title', 'english', ...passthrough];
            // The target install is not running, so there is no file lock to release; never let the
            // engine's global "taskkill /im Antigravity.exe" close other windows or sessions.
            if (!engineArgs.includes('--no-kill')) engineArgs.push('--no-kill');
            if (!engineArgs.includes('--install-dir')) engineArgs.push('--install-dir', installDir);
            console.log(`[修复] 正在重新注入汉化: node localization_engine.js ${engineArgs.join(' ')}`);
            const res = child_process.spawnSync(process.execPath, [path.join(ROOT, 'localization_engine.js'), ...engineArgs], { stdio: 'inherit', cwd: ROOT });
            localized = res.status === 0 && isLocalized(asarPath);
            console.log(localized ? '[√] 汉化已恢复。' : `[×] 重新注入失败（退出码 ${res.status}），请查看上方信息。`);
        }
    }

    if (LAUNCH && !running) launch(installDir);
    else if (LAUNCH && running) console.log('[提示] Antigravity 已在运行，未重复启动。');
    return localized ? 0 : 2;
}

try {
    process.exitCode = main();
} catch (e) {
    console.error('[错误]', e.message);
    process.exitCode = 1;
}
