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

function getLanguageServerCandidates() {
    const candidates = [];
    try {
        if (process.platform === 'win32') {
            const out = child_process.execSync(
                'powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name=\'language_server.exe\'\\" | Select-Object ProcessId, CommandLine | ConvertTo-Json"',
                { encoding: 'utf-8', stdio: 'pipe', timeout: 5000 }
            );
            if (!out || !out.trim()) return candidates;
            let procs = JSON.parse(out.trim());
            if (!Array.isArray(procs)) procs = [procs];

            for (const proc of procs) {
                const pid = Number(proc && proc.ProcessId);
                if (!Number.isInteger(pid) || pid <= 0) continue;
                const cmd = typeof proc.CommandLine === 'string' ? proc.CommandLine : '';
                const csrfMatch = cmd.match(/--csrf_token\s+([a-f0-9-]+)/i);
                const csrfToken = csrfMatch ? csrfMatch[1] : '';
                let ports = [];
                try {
                    const netOut = child_process.execSync(
                        `powershell -NoProfile -Command "Get-NetTCPConnection -OwningProcess ${pid} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort"`,
                        { encoding: 'utf-8', stdio: 'pipe', timeout: 5000 }
                    );
                    ports = netOut.trim().split(/\r?\n/).map(p => parseInt(p.trim(), 10)).filter(p => Number.isInteger(p) && p > 0);
                } catch (portErr) {
                    console.warn(`[!] 查询进程 ${pid} 监听端口失败: ${portErr.message}`);
                }
                candidates.push({ pid, csrfToken, ports, cmd });
            }
        } else {
            const psOut = child_process.execSync('ps -ww -ax -o pid=,command=', { encoding: 'utf-8', stdio: 'pipe', timeout: 5000 });
            const lines = psOut.split(/\r?\n/).filter(l => l.includes('language_server') && l.includes('--csrf_token'));
            for (const line of lines) {
                const m = line.trim().match(/^(\d+)\s+(.+)$/);
                if (!m) continue;
                const pid = parseInt(m[1], 10);
                if (!Number.isInteger(pid) || pid <= 0) continue;
                const cmd = m[2];
                const csrfMatch = cmd.match(/--csrf_token\s+([a-f0-9-]+)/i);
                const csrfToken = csrfMatch ? csrfMatch[1] : '';
                const ports = [];
                try {
                    const lsofOut = child_process.execSync(`lsof -nP -iTCP -sTCP:LISTEN -a -p ${pid}`, { encoding: 'utf-8', stdio: 'pipe', timeout: 5000 });
                    for (const pm of lsofOut.matchAll(/:(\d+)\s+\(LISTEN\)/g)) {
                        const portNum = parseInt(pm[1], 10);
                        if (Number.isInteger(portNum) && portNum > 0 && !ports.includes(portNum)) ports.push(portNum);
                    }
                } catch (portErr) {
                    console.warn(`[!] 查询进程 ${pid} 监听端口失败: ${portErr.message}`);
                }
                candidates.push({ pid, csrfToken, ports, cmd });
            }
        }
    } catch (e) {
        console.warn(`[!] 枚举 language_server 进程失败: ${e.message}`);
    }
    return candidates;
}

async function findHttpsPort(ports) {
    for (const port of ports) {
        const ok = await new Promise(resolve => {
            const req = https.get(`https://127.0.0.1:${port}/main.js`, { rejectUnauthorized: false, timeout: 1500 }, res => {
                res.on('error', () => resolve(false));
                res.resume();
                resolve(res.statusCode === 200);
            });
            req.on('error', () => resolve(false));
            req.on('timeout', () => { req.destroy(); resolve(false); });
        });
        if (ok) return port;
    }
    return null;
}

async function findActiveLanguageServer() {
    const candidates = getLanguageServerCandidates();
    if (candidates.length === 0) return null;
    for (const info of candidates) {
        const httpsPort = await findHttpsPort(info.ports);
        if (httpsPort) return { info, httpsPort };
    }
    return { info: candidates[0], httpsPort: null };
}

function fetchUrl(url, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { rejectUnauthorized: false, timeout: timeoutMs }, res => {
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode} (${url})`));
            }
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('error', reject);
            res.on('aborted', () => reject(new Error(`响应中断 (${url})`)));
            res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        });
        req.on('timeout', () => req.destroy(new Error(`请求超时 (${timeoutMs}ms): ${url}`)));
        req.on('error', reject);
    });
}

function postJsonRpc(url, csrfToken, payload, timeoutMs = 8000) {
    const reqBody = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return new Promise((resolve, reject) => {
        const req = https.request(url, {
            method: 'POST',
            rejectUnauthorized: false,
            timeout: timeoutMs,
            headers: {
                'content-type': 'application/json',
                'x-codeium-csrf-token': csrfToken
            }
        }, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('error', reject);
            res.on('aborted', () => reject(new Error(`RPC 响应中断 (${url})`)));
            res.on('end', () => {
                const raw = Buffer.concat(chunks).toString('utf-8');
                if (res.statusCode !== 200) {
                    return reject(new Error(`RPC 返回 HTTP ${res.statusCode}: ${raw}`));
                }
                try {
                    resolve(JSON.parse(raw));
                } catch (e) {
                    reject(new Error(`RPC 响应 JSON 解析失败: ${e.message}`));
                }
            });
        });
        req.on('timeout', () => req.destroy(new Error(`RPC 请求超时 (${timeoutMs}ms): ${url}`)));
        req.on('error', reject);
        req.write(reqBody);
        req.end();
    });
}

async function requireActiveServer({ requireCsrf = false } = {}) {
    const active = await findActiveLanguageServer();
    if (!active) {
        console.error('[!] 未检测到正在运行的 language_server.exe。请先启动 Antigravity 客户端！');
        process.exitCode = 1;
        return null;
    }
    if (!active.httpsPort) {
        console.error('[!] 无法探测到 language_server 的 HTTPS 端口。');
        process.exitCode = 1;
        return null;
    }
    if (requireCsrf && !active.info.csrfToken) {
        console.error('[!] 未能解析 CSRF Token');
        process.exitCode = 1;
        return null;
    }
    return active;
}

function loadDictNormalizedKeys(dictsDir, { lowercase = false, strict = false } = {}) {
    const keySet = new Set();
    const lowerSet = new Set();
    let hasError = false;
    if (!fs.existsSync(dictsDir)) return { exists: false, keySet, lowerSet, hasError };

    for (const f of fs.readdirSync(dictsDir).filter(x => x.endsWith('.json'))) {
        try {
            const data = JSON.parse(fs.readFileSync(path.join(dictsDir, f), 'utf8'));
            if (!data || typeof data !== 'object' || Array.isArray(data)) {
                throw new Error('词典根节点必须为 JSON 对象');
            }
            for (const k of Object.keys(data)) {
                const nk = normalizeUiText(k);
                keySet.add(nk);
                if (lowercase) lowerSet.add(nk.toLowerCase());
            }
        } catch (e) {
            console.warn(`[!] 读取词典 ${f} 失败: ${e.message}`);
            hasError = true;
            if (strict) throw e;
        }
    }
    return { exists: true, keySet, lowerSet, hasError };
}

async function cmdPort() {
    const active = await findActiveLanguageServer();
    if (!active) {
        console.error('[!] 未检测到正在运行的 language_server.exe 进程。');
        process.exitCode = 1;
        return;
    }
    const { info, httpsPort } = active;
    console.log(`[+] 检测到 language_server.exe (PID: ${info.pid})`);
    console.log(`[+] 监听端口列表: ${info.ports.join(', ')}`);
    console.log(`[+] CSRF 令牌: ${info.csrfToken || '未找到'}`);

    if (httpsPort) {
        console.log(`[+] Live Web/SPA 端口: https://127.0.0.1:${httpsPort}`);
    } else {
        console.log(`[-] 未能连接至任何 HTTPS Web 端口`);
        process.exitCode = 1;
    }
}

async function cmdSearch(keyword, contextLen = 300) {
    if (!keyword) {
        console.error('用法: node scripts/dev_tool.js search <keyword> [contextLen]');
        process.exitCode = 1;
        return;
    }
    const clen = Number(contextLen);
    if (!Number.isInteger(clen) || clen < 0) {
        console.error(`用法: contextLen 必须为非负整数 (收到: ${contextLen})`);
        process.exitCode = 1;
        return;
    }
    const active = await requireActiveServer();
    if (!active) return;
    const { httpsPort } = active;

    console.log(`[*] 正在从 https://127.0.0.1:${httpsPort}/main.js 下载并搜索: "${keyword}"...`);
    const js = await fetchUrl(`https://127.0.0.1:${httpsPort}/main.js`);
    console.log(`[*] main.js 大小: ${(js.length / 1024 / 1024).toFixed(2)} MB`);

    let matchCount = 0;
    let idx = 0;
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
    const start = Number(startPos);
    const len = Number(length);
    if (!Number.isInteger(start) || start < 0 || !Number.isInteger(len) || len <= 0) {
        console.error('用法: node scripts/dev_tool.js slice <startPos>=0 [length>0]');
        process.exitCode = 1;
        return;
    }
    const active = await requireActiveServer();
    if (!active) return;

    const js = await fetchUrl(`https://127.0.0.1:${active.httpsPort}/main.js`);
    console.log(js.slice(start, start + len));
}

async function cmdDumpMcp(args = []) {
    const active = await requireActiveServer({ requireCsrf: true });
    if (!active) return;
    const { info, httpsPort } = active;
    const updateBaseline = args.includes('--update-baseline');

    console.log(`[*] 正在通过 Connect-Web RPC 向 https://127.0.0.1:${httpsPort} 请求 MCP 目录...`);
    const data = await postJsonRpc(
        `https://127.0.0.1:${httpsPort}/exa.language_server_pb.LanguageServerService/GetAvailableCascadePlugins`,
        info.csrfToken,
        { os: process.platform === 'win32' ? 'windows' : (process.platform === 'darwin' ? 'darwin' : 'linux'), searchQuery: '' }
    );
    if (!data || typeof data !== 'object' || !Array.isArray(data.plugins)) {
        throw new Error('GetAvailableCascadePlugins 返回了非预期的响应结构');
    }
    const plugins = data.plugins;

    console.log(`[√] 成功从客户端拉取到 ${plugins.length} 个官方 MCP 服务器！`);

    // 1. 写入本地 scratch 缓存
    const scratchDir = path.join(__dirname, '..', 'scratch');
    fs.mkdirSync(scratchDir, { recursive: true });
    const outPath = path.join(scratchDir, 'mcp_catalog_official_raw.json');
    fs.writeFileSync(outPath, JSON.stringify(plugins, null, 2), 'utf-8');
    console.log(`[√] 本地抓包缓存已更新: ${outPath}`);

    // 2. 与 Git 追踪的基准文件 (scripts/mcp_catalog_baseline.json) 进行增量差分对比
    const baselinePath = path.join(__dirname, 'mcp_catalog_baseline.json');
    let baselineReadFailed = false;
    if (fs.existsSync(baselinePath)) {
        try {
            const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
            if (!Array.isArray(baseline)) {
                throw new Error('mcp_catalog_baseline.json 必须为 JSON 数组');
            }
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
                const diffOutPath = path.join(scratchDir, 'mcp_catalog_diff.json');
                fs.writeFileSync(diffOutPath, JSON.stringify({
                    updatedAt: new Date().toISOString().slice(0, 10),
                    baselineCount: baseline.length,
                    currentCount: plugins.length,
                    added,
                    removed
                }, null, 2), 'utf-8');
                console.log(`[√] 增量差异清单已输出至: ${diffOutPath}`);
            }
        } catch (e) {
            baselineReadFailed = true;
            console.warn('[!] 读取基准文件对比失败:', e.message);
            process.exitCode = 1;
        }
    } else {
        console.log('[i] 未找到基准文件 scripts/mcp_catalog_baseline.json');
    }

    // 3. 词典覆盖率检查（加载全部 dicts/*.json 并做归一化匹配）
    const dictsDir = path.join(__dirname, '..', 'dicts');
    const dictResult = loadDictNormalizedKeys(dictsDir);
    if (dictResult.hasError) {
        process.exitCode = 1;
    }
    if (dictResult.exists) {
        const missing = plugins.filter(p => p.description && !dictResult.keySet.has(normalizeUiText(p.description)));
        console.log('\n------------------ 词典汉化覆盖率检查 ------------------');
        if (missing.length === 0) {
            console.log(`[√] 完美！当前全量 ${plugins.length} 个 MCP 描述均已全部收录在中文词典中！`);
        } else {
            console.log(`[!] 注意: 发现 ${missing.length} 项 MCP 描述尚未在词典中找到翻译:`);
            for (const m of missing) {
                console.log(`    * [${m.id}] ${m.title}`);
            }
        }
    }

    // 4. 更新基准文件
    if (updateBaseline) {
        if (baselineReadFailed || dictResult.hasError) {
            throw new Error('检测到基准或词典读取异常，已中止 --update-baseline 以防损坏基准文件');
        }
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
               .replace(/[‘’]/g, "'")
               .replace(/[“”]/g, '"')
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
        const withoutPlaceholders = t.replace(/\{\d+\}/g, 'X');
        if (/[{}[\]<>$\\|=+;`~^]/.test(withoutPlaceholders) && !/^\[(Dev Mode|Beta|Experimental)\]/i.test(t)) return false;
        if (/\b(function|return|const|var|let|import|export|typeof|undefined|null|true|false|Promise|Error|Object|Array|String|Number)\b/.test(withoutPlaceholders)) return false;
        if (/\b(flex|items-center|justify-|bg-|text-|border-|px-|py-|mt-|mb-|w-|h-|rounded|hidden|block|inline|relative|absolute|shrink-0|truncate|select-none|cursor-pointer|outline-none)\b/.test(withoutPlaceholders)) return false;
        const words = withoutPlaceholders.split(/\s+/);
        if (words.some(w => w.length > 40)) return false;
    }
    return true;
}

function normalizeTemplateLiteral(raw) {
    let out = '';
    let idx = 0;
    let slot = 0;
    while (idx < raw.length) {
        if (raw[idx] === '\\' && idx + 1 < raw.length) {
            out += raw.slice(idx, idx + 2);
            idx += 2;
            continue;
        }
        if (raw[idx] === '$' && raw[idx + 1] === '{') {
            let depth = 1;
            let j = idx + 2;
            while (j < raw.length && depth > 0) {
                if (raw[j] === '\\') { j += 2; continue; }
                if (raw[j] === '"' || raw[j] === "'" || raw[j] === '`') {
                    const q = raw[j++];
                    while (j < raw.length && raw[j] !== q) {
                        if (raw[j] === '\\') j += 2;
                        else j++;
                    }
                } else if (raw[j] === '{') {
                    depth++;
                } else if (raw[j] === '}') {
                    depth--;
                }
                j++;
            }
            if (depth !== 0) return null;
            out += `{${slot++}}`;
            idx = j;
            continue;
        }
        out += raw[idx++];
    }
    return out;
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

    const condPropRegex = /(?:(?:"(aria-label|data-tooltip-content)")|\b(label|sublabel|title|placeholder|description|shortDescription|tooltip|tooltipText|tooltipContent|ariaLabel|heading|subheading|subtitle|header|content|message|detail))\s*:\s*[^,?{}]+?\?\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')\s*:\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;
    while ((m = condPropRegex.exec(js)) !== null) {
        const prop = m[1] || m[2];
        addCandidate(m[3] ?? m[4], `condProp:${prop}`);
        addCandidate(m[5] ?? m[6], `condProp:${prop}`);
    }

    const ternaryRegex = /(?:return|\b[a-zA-Z0-9_$]+\s*=)\s*[^;{}()]+?\?\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')\s*:\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;
    while ((m = ternaryRegex.exec(js)) !== null) {
        addCandidate(m[1] ?? m[2], 'ternary');
        addCandidate(m[3] ?? m[4], 'ternary');
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

    // 4. createElement 直接传递字符串子节点 (避免子节点包含括号如 "(invoked with /browser)" 时被 ceRegex 误截断)
    const directCeRegex = /createElement\(\s*(?:[A-Za-z0-9_$.]+|"[a-z0-9-]+")\s*,\s*(?:null|void 0|\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}|[A-Za-z0-9_$.]+)\s*,\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;
    while ((m = directCeRegex.exec(js)) !== null) {
        addCandidate(m[1] ?? m[2], 'jsx:child');
    }

    // 5. 条件属性单侧字符串匹配 (覆盖形如 description: cond ? "str" : createElement(...) 的非对称三元表达式)
    const condPropSingleRegex = /(?:(?:"(aria-label|data-tooltip-content)")|\b(label|sublabel|title|placeholder|description|shortDescription|tooltip|tooltipText|tooltipContent|ariaLabel|heading|subheading|subtitle|header|content|message|detail))\s*:\s*[^,?{}]+?\?\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;
    while ((m = condPropSingleRegex.exec(js)) !== null) {
        const prop = m[1] || m[2];
        addCandidate(m[3] ?? m[4], `condProp:${prop}`);
    }

    // 6. 反引号模板字面量（属性与 createElement 直接子节点）
    const templatePropRegex = /(?:(?:"(aria-label|data-tooltip-content)")|\b(label|sublabel|title|placeholder|description|shortDescription|tooltip|tooltipText|tooltipContent|ariaLabel|emptyMessage|emptyText|errorMessage|helperText|confirmText|cancelText|buttonText|heading|subheading|subtitle|header|content|message|detail))\s*:\s*`((?:[^`\\]|\\.)*)`/g;
    while ((m = templatePropRegex.exec(js)) !== null) {
        const tpl = normalizeTemplateLiteral(m[3]);
        if (tpl && tpl.length <= 600 && !tpl.trimStart().startsWith('<')) {
            addCandidate(tpl, `tplProp:${m[1] || m[2]}`);
        }
    }

    const templateCeRegex = /createElement\(\s*(?:[A-Za-z0-9_$.]+|"[a-z0-9-]+")\s*,\s*(?:null|void 0|\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}|[A-Za-z0-9_$.]+)\s*,\s*`((?:[^`\\]|\\.)*)`/g;
    while ((m = templateCeRegex.exec(js)) !== null) {
        const tpl = normalizeTemplateLiteral(m[1]);
        if (tpl && tpl.length <= 600 && !tpl.trimStart().startsWith('<')) {
            addCandidate(tpl, 'tpl:jsx');
        }
    }

    return extracted;
}

async function cmdScanUi(args = []) {
    const active = await requireActiveServer();
    if (!active) return;
    const { info, httpsPort } = active;
    const updateBaseline = args.includes('--update-baseline');

    let appVersion = 'unknown';
    try {
        const indexHtml = await fetchUrl(`https://127.0.0.1:${httpsPort}/`);
        const verMatch = indexHtml.match(/"appVersion"\s*:\s*"([^"]+)"/);
        if (verMatch) appVersion = verMatch[1];
    } catch (e) {
        console.warn(`[!] 获取客户端版本号失败: ${e.message}`);
    }

    console.log(`[*] 正在从客户端 (v${appVersion}) https://127.0.0.1:${httpsPort}/main.js 提取全量界面与悬浮提示词条...`);
    const js = await fetchUrl(`https://127.0.0.1:${httpsPort}/main.js`);
    const extracted = extractUiStringsFromBundle(js);

    // 同步通过 Connect-Web RPC 提取 Mendel 动态实验下发的 UI 文案 (如新手引导 Persona 卡片与免责声明)
    if (info.csrfToken) {
        try {
            const mendelData = await postJsonRpc(
                `https://127.0.0.1:${httpsPort}/exa.language_server_pb.LanguageServerService/GetMendelFlags`,
                info.csrfToken,
                {}
            );
            const exps = (mendelData && mendelData.experimentConfig && mendelData.experimentConfig.experiments) || (mendelData && mendelData.flags) || [];
            const walkJson = (obj, keyName) => {
                if (!obj || typeof obj !== 'object') return;
                if (Array.isArray(obj)) {
                    for (const item of obj) walkJson(item, keyName);
                    return;
                }
                for (const [k, v] of Object.entries(obj)) {
                    if (typeof v === 'string' && /^(title|description|label|sublabel|tooltip|placeholder|message|heading|subtitle)$/i.test(k)) {
                        const s = normalizeUiText(v);
                        if (isNaturalUiString(s)) {
                            if (!extracted.has(s)) extracted.set(s, new Set());
                            extracted.get(s).add(`mendel:${keyName}`);
                        }
                    } else if (v && typeof v === 'object') {
                        walkJson(v, keyName);
                    }
                }
            };
            for (const exp of exps) {
                const keyName = exp.keyString || exp.name || 'flag';
                if (/cli-announcement/i.test(keyName)) continue;
                const valStr = typeof exp.string === 'string' ? exp.string : (typeof exp.value === 'string' ? exp.value : '');
                if (!valStr) continue;
                const trimmed = valStr.trim();
                if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                    try {
                        walkJson(JSON.parse(trimmed), keyName);
                    } catch (jsonErr) {
                        console.warn(`[!] 解析 Mendel 实验 ${keyName} JSON 失败: ${jsonErr.message}`);
                    }
                } else if (trimmed.includes(' ')) {
                    const s = normalizeUiText(trimmed);
                    if (isNaturalUiString(s)) {
                        if (!extracted.has(s)) extracted.set(s, new Set());
                        extracted.get(s).add(`mendel:${keyName}`);
                    }
                }
            }
        } catch (e) {
            console.warn(`[!] 拉取 Mendel 实验配置失败: ${e.message}`);
        }

        // 同步通过 GetSlashCommands RPC 提取内置 `/` 斜杠命令与内置技能描述（位于 language_server 二进制内）
        try {
            const us = await postJsonRpc(`https://127.0.0.1:${httpsPort}/exa.language_server_pb.LanguageServerService/GetUserStatus`, info.csrfToken, {});
            const defaultModel = us?.userStatus?.cascadeModelConfigData?.defaultOverrideModelConfig?.modelOrAlias;
            const scData = await postJsonRpc(`https://127.0.0.1:${httpsPort}/exa.language_server_pb.LanguageServerService/GetSlashCommands`, info.csrfToken, {
                cascadeConfig: {
                    plannerConfig: {
                        planModel: defaultModel?.model || 'MODEL_PLACEHOLDER_M26',
                        requestedModel: defaultModel || { model: 'MODEL_PLACEHOLDER_M26' }
                    }
                }
            });
            for (const cmd of (scData?.commands || [])) {
                const defPath = cmd.info?.definitionPath || '';
                if (defPath && !/[\\/]\.gemini[\\/]antigravity[\\/]builtin[\\/]/i.test(defPath)) continue;
                const s = normalizeUiText(cmd.description || '');
                if (isNaturalUiString(s)) {
                    if (!extracted.has(s)) extracted.set(s, new Set());
                    extracted.get(s).add('rpc:slashCommand');
                }
            }
        } catch (e) {
            console.warn(`[!] 拉取内置斜杠命令描述失败: ${e.message}`);
        }
    }

    const allStrings = [...extracted.keys()].sort();
    console.log(`[√] 提取完成！共扫描到 ${allStrings.length} 条界面与悬浮提示词条。`);

    // 加载现有全量中文字典
    const dictsDir = path.join(__dirname, '..', 'dicts');
    const dictResult = loadDictNormalizedKeys(dictsDir, { lowercase: true });
    if (dictResult.hasError) {
        process.exitCode = 1;
    }
    const dictSet = dictResult.keySet;
    const dictLowerSet = dictResult.lowerSet;

    // 与 Git 基准文件 (scripts/ui_strings_baseline.json) 对比
    const baselinePath = path.join(__dirname, 'ui_strings_baseline.json');
    let addedStrings = allStrings;
    let baselineReadFailed = false;
    if (fs.existsSync(baselinePath)) {
        try {
            const baselineData = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
            if (!baselineData || typeof baselineData !== 'object') {
                throw new Error('ui_strings_baseline.json 解析结果为空或非对象');
            }
            const baseList = Array.isArray(baselineData) ? baselineData : (Array.isArray(baselineData.strings) ? baselineData.strings : null);
            if (!baseList) {
                throw new Error('ui_strings_baseline.json 缺少 strings 数组');
            }
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
            baselineReadFailed = true;
            console.warn('[!] 读取 UI 基准文件失败:', e.message);
            process.exitCode = 1;
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

    if (updateBaseline) {
        if (baselineReadFailed || dictResult.hasError) {
            throw new Error('检测到基准或词典读取异常，已中止 --update-baseline 以防损坏基准文件');
        }
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

if (require.main === module) {
    main().catch(err => {
        console.error('[错误]', err.message);
        process.exitCode = 1;
    });
}

module.exports = {
    normalizeUiText,
    isNaturalUiString,
    extractUiStringsFromBundle
};
