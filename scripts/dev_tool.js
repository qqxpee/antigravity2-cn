/**
 * Antigravity Reverse-Engineering & Diagnostics Dev Tool
 * 统一多功能诊断开发套件
 * 
 * 用法:
 *   node scripts/dev_tool.js port                          # 查看当前 language_server 进程 PID、端口与 CSRF 令牌
 *   node scripts/dev_tool.js search <keyword>              # 在当前运行的 live main.js 中搜索关键字
 *   node scripts/dev_tool.js slice <pos> [len]             # 查看 live main.js 指定位置的代码片段
 *   node scripts/dev_tool.js dump-mcp [--update-baseline]  # 导出全量官方 MCP 目录，并与 Git 基准进行增量差分对比
 *   node scripts/dev_tool.js scan-ui [--update-baseline]   # 扫描全量界面与悬浮提示词条，并与版本基准及汉化词典进行 Diff 对比
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const child_process = require('child_process');

function getLanguageServerInfo() {
    try {
        if (process.platform === 'win32') {
            const out = child_process.execSync(
                'powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name=\'language_server.exe\'\\" | Select-Object ProcessId, CommandLine | ConvertTo-Json"',
                { encoding: 'utf-8', stdio: 'pipe' }
            );
            if (!out || !out.trim()) return null;
            let proc = JSON.parse(out.trim());
            if (Array.isArray(proc)) proc = proc[0];
            if (!proc || !proc.ProcessId) return null;

            const pid = proc.ProcessId;
            const cmd = proc.CommandLine || '';
            const csrfMatch = cmd.match(/--csrf_token\s+([a-f0-9-]+)/i);
            const csrfToken = csrfMatch ? csrfMatch[1] : '';

            const netOut = child_process.execSync(
                `powershell -NoProfile -Command "Get-NetTCPConnection -OwningProcess ${pid} -State Listen | Select-Object -ExpandProperty LocalPort"`,
                { encoding: 'utf-8', stdio: 'pipe' }
            );
            const ports = netOut.trim().split(/\r?\n/).map(p => parseInt(p.trim(), 10)).filter(p => !isNaN(p));

            return { pid, csrfToken, ports, cmd };
        } else {
            const psOut = child_process.execSync('ps -ax -o pid=,command=', { encoding: 'utf-8', stdio: 'pipe' });
            const line = psOut.split(/\r?\n/).find(l => l.includes('language_server') && l.includes('--csrf_token'));
            if (!line) return null;
            const m = line.trim().match(/^(\d+)\s+(.+)$/);
            if (!m) return null;
            const pid = parseInt(m[1], 10);
            const cmd = m[2];
            const csrfMatch = cmd.match(/--csrf_token\s+([a-f0-9-]+)/i);
            const csrfToken = csrfMatch ? csrfMatch[1] : '';

            const lsofOut = child_process.execSync(`lsof -nP -iTCP -sTCP:LISTEN -a -p ${pid}`, { encoding: 'utf-8', stdio: 'pipe' });
            const ports = [];
            for (const pm of lsofOut.matchAll(/:(\d+)\s+\(LISTEN\)/g)) {
                const portNum = parseInt(pm[1], 10);
                if (!isNaN(portNum) && !ports.includes(portNum)) ports.push(portNum);
            }
            return { pid, csrfToken, ports, cmd };
        }
    } catch (e) {
        return null;
    }
}

async function findHttpsPort(ports) {
    for (const port of ports) {
        const ok = await new Promise(resolve => {
            const req = https.get(`https://127.0.0.1:${port}/main.js`, { rejectUnauthorized: false, timeout: 1500 }, res => {
                resolve(res.statusCode === 200);
            });
            req.on('error', () => resolve(false));
            req.on('timeout', () => { req.destroy(); resolve(false); });
        });
        if (ok) return port;
    }
    return null;
}

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { rejectUnauthorized: false }, res => {
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        }).on('error', reject);
    });
}

async function cmdPort() {
    const info = getLanguageServerInfo();
    if (!info) {
        console.error('[!] 未检测到正在运行的 language_server.exe 进程。');
        return;
    }
    console.log(`[+] 检测到 language_server.exe (PID: ${info.pid})`);
    console.log(`[+] 监听端口列表: ${info.ports.join(', ')}`);
    console.log(`[+] CSRF 令牌: ${info.csrfToken || '未找到'}`);

    const httpsPort = await findHttpsPort(info.ports);
    if (httpsPort) {
        console.log(`[+] Live Web/SPA 端口: https://127.0.0.1:${httpsPort}`);
    } else {
        console.log(`[-] 未能连接至任何 HTTPS Web 端口`);
    }
}

async function cmdSearch(keyword, contextLen = 300) {
    if (!keyword) {
        console.error('用法: node scripts/dev_tool.js search <keyword> [contextLen]');
        return;
    }
    const info = getLanguageServerInfo();
    if (!info) {
        console.error('[!] 未检测到正在运行的 language_server.exe。');
        return;
    }
    const httpsPort = await findHttpsPort(info.ports);
    if (!httpsPort) {
        console.error('[!] 无法探测到 language_server 的 HTTPS 端口。');
        return;
    }

    console.log(`[*] 正在从 https://127.0.0.1:${httpsPort}/main.js 下载并搜索: "${keyword}"...`);
    const js = await fetchUrl(`https://127.0.0.1:${httpsPort}/main.js`);
    console.log(`[*] main.js 大小: ${(js.length / 1024 / 1024).toFixed(2)} MB`);

    let matchCount = 0;
    let idx = 0;
    const clen = parseInt(contextLen, 10) || 300;
    while ((idx = js.indexOf(keyword, idx)) !== -1) {
        matchCount++;
        console.log(`\n=================== 匹配项 #${matchCount} (位置: ${idx}) ===================`);
        const start = Math.max(0, idx - clen);
        const end = Math.min(js.length, idx + keyword.length + clen);
        console.log(js.slice(start, end));
        idx += keyword.length;
    }

    console.log(`\n[*] 搜索完毕，共找到 ${matchCount} 处匹配。`);
}

async function cmdSlice(startPos, length = 500) {
    const start = parseInt(startPos, 10);
    const len = parseInt(length, 10) || 500;
    if (isNaN(start)) {
        console.error('用法: node scripts/dev_tool.js slice <startPos> [length]');
        return;
    }
    const info = getLanguageServerInfo();
    if (!info) return console.error('[!] language_server 未运行');
    const httpsPort = await findHttpsPort(info.ports);
    if (!httpsPort) return console.error('[!] 无法连接 HTTPS 端口');

    const js = await fetchUrl(`https://127.0.0.1:${httpsPort}/main.js`);
    console.log(js.slice(start, start + len));
}

async function cmdDumpMcp(args = []) {
    const info = getLanguageServerInfo();
    if (!info) return console.error('[!] language_server 未运行');
    const httpsPort = await findHttpsPort(info.ports);
    if (!httpsPort) return console.error('[!] 无法连接 HTTPS 端口');
    if (!info.csrfToken) return console.error('[!] 未能解析 CSRF Token');

    console.log(`[*] 正在通过 Connect-Web RPC 向 https://127.0.0.1:${httpsPort} 请求 MCP 目录...`);
    const reqBody = JSON.stringify({ os: process.platform === 'win32' ? 'windows' : (process.platform === 'darwin' ? 'darwin' : 'linux'), searchQuery: '' });

    const plugins = await new Promise((resolve, reject) => {
        const req = https.request(`https://127.0.0.1:${httpsPort}/exa.language_server_pb.LanguageServerService/GetAvailableCascadePlugins`, {
            method: 'POST',
            rejectUnauthorized: false,
            headers: {
                'content-type': 'application/json',
                'x-codeium-csrf-token': info.csrfToken
            }
        }, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    return reject(new Error(`RPC 返回 HTTP ${res.statusCode}: ${Buffer.concat(chunks).toString('utf-8')}`));
                }
                try {
                    const data = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
                    resolve(data.plugins || []);
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        req.write(reqBody);
        req.end();
    });

    console.log(`[√] 成功从客户端拉取到 ${plugins.length} 个官方 MCP 服务器！`);

    // 1. 写入本地 scratch 缓存
    const scratchDir = path.join(__dirname, '..', 'scratch');
    if (fs.existsSync(scratchDir)) {
        const outPath = path.join(scratchDir, 'mcp_catalog_official_raw.json');
        fs.writeFileSync(outPath, JSON.stringify(plugins, null, 2), 'utf-8');
        console.log(`[√] 本地抓包缓存已更新: ${outPath}`);
    }

    // 2. 与 Git 追踪的基准文件 (scripts/mcp_catalog_baseline.json) 进行增量差分对比
    const baselinePath = path.join(__dirname, 'mcp_catalog_baseline.json');
    if (fs.existsSync(baselinePath)) {
        try {
            const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
            const baselineIds = new Set(baseline.map(b => b.id));
            const pluginIds = new Set(plugins.map(p => p.id));

            const added = plugins.filter(p => !baselineIds.has(p.id));
            const removed = baseline.filter(b => !pluginIds.has(b.id));

            console.log('\n------------------ 基准对比 (Diff 分析) ------------------');
            console.log(`当前拉取数: ${plugins.length} | Git 基准数: ${baseline.length}`);

            if (added.length === 0 && removed.length === 0) {
                console.log('[√] 与 Git 追踪的基准文件完全一致，未发现任何增删变动！');
            } else {
                if (added.length > 0) {
                    console.log(`\n[+] 发现 ${added.length} 个新增 MCP 服务器:`);
                    for (const item of added) {
                        console.log(`    + [${item.id}] ${item.title}`);
                    }
                }
                if (removed.length > 0) {
                    console.log(`\n[-] 发现 ${removed.length} 个已下线/移除 MCP 服务器:`);
                    for (const item of removed) {
                        console.log(`    - [${item.id}] ${item.title}`);
                    }
                }
            }
        } catch (e) {
            console.warn('[!] 读取基准文件对比失败:', e.message);
        }
    } else {
        console.log('[i] 未找到基准文件 scripts/mcp_catalog_baseline.json');
    }

    // 3. 词典覆盖率检查
    const dictPath = path.join(__dirname, '..', 'dicts', 'page_mcp_knowledge.json');
    if (fs.existsSync(dictPath)) {
        try {
            const dict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
            const missing = plugins.filter(p => !dict[p.description]);
            console.log('\n------------------ 词典汉化覆盖率检查 ------------------');
            if (missing.length === 0) {
                console.log(`[√] 完美！当前全量 ${plugins.length} 个 MCP 描述均已全部收录在中文词典中！`);
            } else {
                console.log(`[!] 注意: 发现 ${missing.length} 项 MCP 描述尚未在词典中找到翻译:`);
                for (const m of missing) {
                    console.log(`    * [${m.id}] ${m.title}`);
                }
            }
        } catch (e) {}
    }

    // 4. 更新基准文件
    if (args.includes('--update-baseline')) {
        fs.writeFileSync(baselinePath, JSON.stringify(plugins, null, 2), 'utf-8');
        console.log(`\n[√] 已将最新清册写入并更新 Git 基准文件: ${baselinePath}`);
    } else {
        console.log('\n提示: 如需将本次抓取的数据更新为新的 Git 基准，可加上参数: --update-baseline');
    }
}

function normalizeUiText(text) {
    if (!text) return '';
    return text.replace(/\s+/g, ' ')
               .trim()
               .replace(/’/g, "'")
               .replace(/‘/g, "'")
               .replace(/“/g, '"')
               .replace(/”/g, '"')
               .replace(/…/g, '...');
}

function isNaturalUiString(s) {
    if (!s || typeof s !== 'string') return false;
    const t = s.trim();
    if (t.length < 2 || t.length > 600) return false;
    if (!/^[A-Z0-9\[]/.test(t)) return false;
    if (!/[a-zA-Z]{2,}/.test(t)) return false;
    if (/^M[\s\d.-]/.test(t)) return false;
    if (/^(https?:|file:|mailto:|data:|chrome:|antigravity:|vscode:|ws:|wss:|go\/|b\/)/i.test(t)) return false;
    if (/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(t)) return false;
    if (!t.includes(' ')) {
        if (!/^[A-Z][a-z]{2,20}[.…!?:]?$/.test(t)) return false;
    } else {
        if (/[{}[\]<>$\\|=+;`~^]/.test(t) && !/^\[(Dev Mode|Beta|Experimental)\]/i.test(t)) return false;
        if (/\b(function|return|const|var|let|import|export|typeof|undefined|null|true|false|Promise|Error|Object|Array|String|Number)\b/.test(t)) return false;
        if (/\b(flex|items-center|justify-|bg-|text-|border-|px-|py-|mt-|mb-|w-|h-|rounded|hidden|block|inline|relative|absolute|shrink-0|truncate|select-none|cursor-pointer|outline-none)\b/.test(t)) return false;
        const words = t.split(/\s+/);
        if (words.some(w => w.length > 40)) return false;
    }
    return true;
}

function extractUiStringsFromBundle(js) {
    const extracted = new Map();
    const addCandidate = (raw, category) => {
        if (!raw) return;
        let s = raw
            .replace(/\\n/g, ' ')
            .replace(/\\"/g, '"')
            .replace(/\\'/g, "'")
            .replace(/\\u2026/g, '...')
            .replace(/\\u2014/g, '—')
            .replace(/\\u2013/g, '–')
            .trim();
        s = normalizeUiText(s);
        if (!isNaturalUiString(s)) return;
        if (!extracted.has(s)) extracted.set(s, new Set());
        extracted.get(s).add(category);
    };

    const propRegex = /(?:(?:"(aria-label|data-tooltip-content)")|\b(label|sublabel|title|placeholder|description|shortDescription|tooltip|tooltipText|tooltipContent|ariaLabel|emptyMessage|emptyText|errorMessage|helperText|confirmText|cancelText|buttonText|heading|subheading|subtitle|header|content|message|detail))\s*:\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;
    let m;
    while ((m = propRegex.exec(js)) !== null) {
        const prop = m[1] || m[2];
        const val = m[3] !== undefined ? m[3] : m[4];
        addCandidate(val, `prop:${prop}`);
    }

    const condPropRegex = /(?:(?:"(aria-label|data-tooltip-content)")|\b(label|sublabel|title|placeholder|description|tooltip|tooltipText|tooltipContent|content|message))\s*:\s*[^,?{}]+?\?\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')\s*:\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;
    while ((m = condPropRegex.exec(js)) !== null) {
        const prop = m[1] || m[2];
        addCandidate(m[3] ?? m[4], `condProp:${prop}`);
        addCandidate(m[5] ?? m[6], `condProp:${prop}`);
    }

    const ceRegex = /createElement\(\s*(?:[A-Za-z0-9_$.]+|"[a-z0-9-]+")\s*,\s*(?:null|void 0|\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}|[A-Za-z0-9_$.]+)\s*,([\s\S]{1,400}?)\)/g;
    while ((m = ceRegex.exec(js)) !== null) {
        const childrenChunk = m[1];
        const strMatches = childrenChunk.matchAll(/(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g);
        for (const sm of strMatches) {
            const idxInChunk = sm.index;
            const before = childrenChunk.slice(Math.max(0, idxInChunk - 25), idxInChunk);
            if (/(?:className|name|variant|size|id|key|type|role|href|target|rel|place|to|mode|style|stroke|fill|d|viewBox|data-[a-z-]+)\s*:\s*$/.test(before)) {
                continue;
            }
            addCandidate(sm[1] ?? sm[2], 'jsx:child');
        }
    }

    return extracted;
}

async function cmdScanUi(args = []) {
    const info = getLanguageServerInfo();
    if (!info) return console.error('[!] 未检测到正在运行的 language_server.exe。请先打开 Antigravity 客户端！');
    const httpsPort = await findHttpsPort(info.ports);
    if (!httpsPort) return console.error('[!] 无法连接 language_server HTTPS 端口');

    let appVersion = 'unknown';
    try {
        const indexHtml = await fetchUrl(`https://127.0.0.1:${httpsPort}/`);
        const verMatch = indexHtml.match(/"appVersion"\s*:\s*"([^"]+)"/);
        if (verMatch) appVersion = verMatch[1];
    } catch (e) {}

    console.log(`[*] 正在从客户端 (v${appVersion}) https://127.0.0.1:${httpsPort}/main.js 提取全量界面与悬浮提示词条...`);
    const js = await fetchUrl(`https://127.0.0.1:${httpsPort}/main.js`);
    const extracted = extractUiStringsFromBundle(js);
    const allStrings = [...extracted.keys()].sort();
    console.log(`[√] 提取完成！共扫描到 ${allStrings.length} 条界面与悬浮提示词条。`);

    // 加载现有全量中文字典
    const dictsDir = path.join(__dirname, '..', 'dicts');
    const dictSet = new Set();
    const dictLowerSet = new Set();
    if (fs.existsSync(dictsDir)) {
        for (const f of fs.readdirSync(dictsDir).filter(x => x.endsWith('.json'))) {
            try {
                const data = JSON.parse(fs.readFileSync(path.join(dictsDir, f), 'utf8'));
                for (const k of Object.keys(data)) {
                    const nk = normalizeUiText(k);
                    dictSet.add(nk);
                    dictLowerSet.add(nk.toLowerCase());
                }
            } catch (e) {}
        }
    }

    // 与 Git 基准文件 (scripts/ui_strings_baseline.json) 对比
    const baselinePath = path.join(__dirname, 'ui_strings_baseline.json');
    let addedStrings = allStrings;
    if (fs.existsSync(baselinePath)) {
        try {
            const baselineData = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
            const baseList = Array.isArray(baselineData) ? baselineData : (baselineData.strings || []);
            const baseSet = new Set(baseList);
            const curSet = new Set(allStrings);

            addedStrings = allStrings.filter(s => !baseSet.has(s));
            const removedStrings = baseList.filter(s => !curSet.has(s));

            console.log('\n------------------ 版本升级增量对比 (UI Diff) ------------------');
            console.log(`基准版本: v${baselineData.version || '未知'} (${baseList.length} 条) | 当前版本: v${appVersion} (${allStrings.length} 条)`);
            if (addedStrings.length === 0 && removedStrings.length === 0) {
                console.log('[√] 与基准版本词条完全一致，本次未检测到任何界面词条变动！');
            } else {
                console.log(`[+] 新增界面/悬浮提示词条: ${addedStrings.length} 条 | [-] 移除旧词条: ${removedStrings.length} 条`);
            }
        } catch (e) {
            console.warn('[!] 读取 UI 基准文件失败:', e.message);
        }
    } else {
        console.log('\n[i] 尚未建立 UI 词条基准文件 (scripts/ui_strings_baseline.json)。');
    }

    // 检查新增词条中有多少尚未翻译
    const untranslatedNew = addedStrings
        .filter(s => !dictSet.has(s) && !dictLowerSet.has(s.toLowerCase()))
        .map(s => ({ str: s, cats: [...(extracted.get(s) || [])].join(',') }));

    console.log('\n------------------ 新增词条汉化覆盖检查 ------------------');
    if (untranslatedNew.length === 0) {
        console.log('[√] 完美！所有新增界面与悬浮提示词条均已在中文词典中完成覆盖！');
    } else {
        console.log(`[!] 发现 ${untranslatedNew.length} 条新增未翻译词条:`);
        for (const item of untranslatedNew.slice(0, 40)) {
            console.log(`    * [${item.cats}] ${item.str}`);
        }
        if (untranslatedNew.length > 40) {
            console.log(`    ... 以及另外 ${untranslatedNew.length - 40} 条（完整列表已保存至 scratch/untranslated_ui_diff.json）`);
        }
        const scratchDir = path.join(__dirname, '..', 'scratch');
        fs.mkdirSync(scratchDir, { recursive: true });
        const diffOutPath = path.join(scratchDir, 'untranslated_ui_diff.json');
        fs.writeFileSync(diffOutPath, JSON.stringify(untranslatedNew, null, 2), 'utf8');
        console.log(`[√] 增量待翻译清单已输出至: ${diffOutPath}`);
    }

    if (args.includes('--update-baseline')) {
        const payload = {
            version: appVersion,
            updatedAt: new Date().toISOString().slice(0, 10),
            count: allStrings.length,
            strings: allStrings
        };
        fs.writeFileSync(baselinePath, JSON.stringify(payload, null, 2), 'utf8');
        console.log(`\n[√] 已将当前 v${appVersion} 全量 ${allStrings.length} 条 UI 词条写入基准文件: ${baselinePath}`);
    } else {
        console.log('\n提示: 翻译完成后，可加上参数 --update-baseline 将当前版本保存为新的对比基准。');
    }
}

async function main() {
    const [,, command, ...args] = process.argv;
    switch (command) {
        case 'port':
            await cmdPort();
            break;
        case 'search':
            await cmdSearch(args[0], args[1]);
            break;
        case 'slice':
            await cmdSlice(args[0], args[1]);
            break;
        case 'dump-mcp':
            await cmdDumpMcp(args);
            break;
        case 'scan-ui':
            await cmdScanUi(args);
            break;
        default:
            console.log('Antigravity 逆向与排查综合工具集 (dev_tool.js)');
            console.log('可用命令:');
            console.log('  node scripts/dev_tool.js port                          - 检测语言服务器 PID、端口与 CSRF Token');
            console.log('  node scripts/dev_tool.js search <keyword>              - 在运行中的 live main.js 中搜索关键字');
            console.log('  node scripts/dev_tool.js slice <pos> [len]             - 查看 live main.js 指定位置切片');
            console.log('  node scripts/dev_tool.js dump-mcp [--update-baseline]  - 导出官方 MCP 目录并与 Git 基准进行增量对比');
            console.log('  node scripts/dev_tool.js scan-ui [--update-baseline]   - 扫描全量界面与悬浮提示词条，并与基准及词典进行增量对比');
            break;
    }
}

main().catch(err => {
    console.error('[错误]', err.message);
});
