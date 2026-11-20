function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanJsContent(content, signatureStart, signatureEnd) {
    const regex = new RegExp("(?:\\r?\\n;)?\\r?\\n?" + escapeRegExp(signatureStart) + "[\\s\\S]*?" + escapeRegExp(signatureEnd), "g");
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
    content = content.replace(/\n\s*\/\* --- TRAY INSERT TRANSLATION START --- \*\/[\s\S]*?\/\* --- TRAY INSERT TRANSLATION END --- \*\//g, '');
    content = content.replace(/\/\* --- TRAY COUNT START:([A-Za-z0-9+/=]+) --- \*\/[\s\S]*?\/\* --- TRAY COUNT END --- \*\//g, (_m, b64) => Buffer.from(b64, 'base64').toString('utf8'));
    return content;
}

function cleanUtilsJsContent(content) {
    return content.replace(/\n?\s*\/\* --- SIDECAR TRANSLATION START --- \*\/[\s\S]*?\/\* --- SIDECAR TRANSLATION END --- \*\//g, '');
}

function patchUtilsJs(utilsContent, signatureStart, signatureEnd) {
    console.log(`[修改] 正在向 utils.js 注入伴生面板 (Sidecar) 汉化钩子...`);
    const cleaned = cleanUtilsJsContent(utilsContent);
    const targetStr = "hubContents.on('will-navigate', guardExternalNavigation);";
    const idx = cleaned.indexOf(targetStr);
    if (idx === -1) {
        console.warn(`[警告] 未能在 utils.js 中找到 Sidecar 钩子插入点。`);
        return cleaned;
    }

    const sidecarHookJs = `/* --- SIDECAR TRANSLATION START --- */
    const getSidecarLocalizationScript = () => {
        const preloadFile = typeof path_1 !== 'undefined' && path_1 && path_1.default
            ? path_1.default.join(__dirname, 'preload.js')
            : require('path').join(__dirname, 'preload.js');
        const cacheKey = '__agSidecarLocalizationScript:' + preloadFile;
        if (typeof globalThis[cacheKey] === 'string') {
            return globalThis[cacheKey];
        }
        try {
            const fsMod = typeof fs !== 'undefined' && fs && typeof fs.readFileSync === 'function' ? fs : require('fs');
            const preloadSrc = fsMod.readFileSync(preloadFile, 'utf8');
            const sIdx = preloadSrc.indexOf(${JSON.stringify(signatureStart)});
            const eIdx = sIdx !== -1 ? preloadSrc.indexOf(${JSON.stringify(signatureEnd)}, sIdx + ${signatureStart.length}) : -1;
            if (sIdx !== -1 && eIdx !== -1 && sIdx < eIdx) {
                const extracted = preloadSrc.slice(sIdx, eIdx + ${signatureEnd.length});
                globalThis[cacheKey] = extracted;
                return extracted;
            }
        } catch (_err) {}
        return '';
    };
    const resolveSidecarSubframe = (event, frameProcessId, frameRoutingId) => {
        if (event && event.frame) return event.frame;
        if (typeof frameProcessId === 'number' && typeof frameRoutingId === 'number') {
            return electron_1.webFrameMain?.fromId?.(frameProcessId, frameRoutingId) ?? null;
        }
        return null;
    };
    const checkSidecarIframeInHub = (targetUrl) => {
        try {
            const target = new URL(targetUrl);
            const iframes = document.querySelectorAll('iframe[data-testid="sidecar-iframe"]');
            for (const el of iframes) {
                const raw = el.getAttribute('src') || el.src || '';
                if (!raw) continue;
                const u = new URL(raw, location.href);
                if (u.origin !== target.origin) continue;
                const baseDir = u.pathname.slice(0, u.pathname.lastIndexOf('/') + 1);
                if (u.origin !== location.origin || target.pathname === u.pathname || target.pathname.startsWith(baseDir)) {
                    return true;
                }
            }
        } catch (_e) {}
        return false;
    };
    const injectSidecarSubframe = (frame) => {
        try {
            const winDestroyed = typeof win !== 'undefined' && win && win.isDestroyed?.();
            if (!frame || frame.isDestroyed?.() || winDestroyed || hubContents.isDestroyed?.()) return;
            const mainFrame = hubContents.mainFrame;
            if (!mainFrame || frame === mainFrame || frame.parent !== mainFrame) return;
            const frameUrl = String(frame.url || '');
            if (!/^(?:https?|plugin):\\/\\//i.test(frameUrl)) return;
            const frameOrigin = String(frame.origin || '');
            if (!frameOrigin || frameOrigin === 'null') return;
            const script = getSidecarLocalizationScript();
            if (!script) return;
            const checkExpr = '(' + checkSidecarIframeInHub.toString() + ')(' + JSON.stringify(frameUrl) + ')';
            Promise.resolve(mainFrame.executeJavaScript(checkExpr))
                .then((isSidecar) => {
                    if (!isSidecar) return;
                    const winDestroyedLater = typeof win !== 'undefined' && win && win.isDestroyed?.();
                    if (frame.isDestroyed?.() || winDestroyedLater || hubContents.isDestroyed?.()) return;
                    return frame.executeJavaScript(script);
                })
                .catch((err) => {
                    console.warn('[汉化] Sidecar 注入失败:', err && err.message ? err.message : err);
                });
        } catch (_err) {}
    };
    const onSidecarFrameNavigate = (event, _url, _httpResponseCode, _httpStatusText, isMainFrame, frameProcessId, frameRoutingId) => {
        if (isMainFrame) return;
        injectSidecarSubframe(resolveSidecarSubframe(event, frameProcessId, frameRoutingId));
    };
    const onSidecarFrameFinishLoad = (event, isMainFrame, frameProcessId, frameRoutingId) => {
        if (isMainFrame) return;
        injectSidecarSubframe(resolveSidecarSubframe(event, frameProcessId, frameRoutingId));
    };
    hubContents.on('did-frame-navigate', onSidecarFrameNavigate);
    hubContents.on('did-frame-finish-load', onSidecarFrameFinishLoad);
    if (typeof win !== 'undefined' && win && typeof win.on === 'function') {
        win.on('closed', () => {
            hubContents.off?.('did-frame-navigate', onSidecarFrameNavigate);
            hubContents.off?.('did-frame-finish-load', onSidecarFrameFinishLoad);
        });
    }
    /* --- SIDECAR TRANSLATION END --- */`;

    console.log(`[修改] 伴生面板 (Sidecar) 汉化钩子注入成功！`);
    return cleaned.substring(0, idx) + sidecarHookJs + "\n    " + cleaned.substring(idx);
}

function patchPreloadJs(content, translationJs, signatureStart, signatureEnd) {
    console.log(`[修改] 正在向 preload.js 注入汉化代码...`);
    const cleanedContent = cleanJsContent(content, signatureStart, signatureEnd);
    const newContent = cleanedContent + "\n;\n" + translationJs;
    console.log(`[修改] 注入成功！`);
    return newContent;
}

function patchMenuJs(menuContent, useTw) {
    console.log(`[修改] 正在向 menu.js 注入菜单汉化代码...`);
    const menuCleaned = cleanMenuJsContent(menuContent);

    const menuTranslationJs = `
    /* --- MENU TRANSLATION START --- */
    // ==========================================
    // Antigravity Native Menu Chinese Translation
    // ==========================================
    const translations = ${useTw ? `{
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
        'Checking for Updates...': '正在檢查更新...',
        'Downloading Update...': '正在下載更新...',
        'Restart to Update': '重新啟動以更新',
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
        'Actual Size': '實際大小',
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
        'Replace With New': '取代為新對話',
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
        'Checking for Updates...': '正在检查更新...',
        'Downloading Update...': '正在下载更新...',
        'Restart to Update': '重启以更新',
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
        'Actual Size': '实际大小',
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
            if (!item._origLabel) item._origLabel = label;
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
                if (it && it._origLabel && pred.call(thisArg, { ...it, label: it._origLabel }, idx, arr)) return true;
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
        console.log(`[修改] 菜单汉化注入成功！`);
        return menuCleaned.substring(0, idx) + menuTranslationJs + "\n    " + menuCleaned.substring(idx);
    } else {
        console.warn(`[警告] 未能在 menu.js 中找到设定的插入点。`);
        return menuCleaned;
    }
}

function patchTrayJs(trayContent, useTw) {
    console.log(`[修改] 正在向 tray.js 注入任务栏菜单汉化...`);
    let trayCleaned = cleanTrayJsContent(trayContent);
    const trayTranslationsJson = JSON.stringify(useTw ? {
        'No agents running': '無執行中的代理',
        'Open Antigravity': '開啟 Antigravity',
        'Connect to WSL': '連線至 WSL',
        'Reopen Locally': '在本機重新開啟',
        'Quit': '結束'
    } : {
        'No agents running': '无运行中的智能体',
        'Open Antigravity': '打开 Antigravity',
        'Connect to WSL': '连接到 WSL',
        'Reopen Locally': '在本地重新打开',
        'Quit': '退出'
    });
    const openPrefix = useTw ? '開啟 ' : '打开 ';

    const targetCreate = /function\s+createTray\s*\(([^)]*)\)\s*\{/;
    const replacementCreate = (match, args) => `function createTray(${args}) {
    /* --- TRAY TRANSLATION START --- */
    const translations = ${trayTranslationsJson};
    if (typeof actions !== 'undefined' && Array.isArray(actions)) {
        for (const item of actions) {
            if (!item || !item.label) continue;
            if (translations[item.label]) {
                item.label = translations[item.label];
            } else if (item.label.startsWith('Open ')) {
                item.label = ${JSON.stringify(openPrefix)} + item.label.slice(5);
            }
        }
    }
    /* --- TRAY TRANSLATION END --- */`;

    let hitCount = 0;
    let trayPatched = trayCleaned.replace(targetCreate, (...m) => {
        hitCount++;
        return replacementCreate(...m);
    });
    if (hitCount === 0) {
        console.warn(`[警告] 未能在 tray.js 中找到 createTray 函数插入点。`);
    }

    const dblClickTarget = /tray\.setContextMenu\(contextMenu\);/;
    const dblClickReplacement = `tray.setContextMenu(contextMenu);
    /* --- TRAY DOUBLE CLICK START --- */
    if (typeof actions !== 'undefined' && Array.isArray(actions) && typeof tray !== 'undefined' && tray && typeof tray.on === 'function') {
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
    }
    /* --- TRAY DOUBLE CLICK END --- */`;
    trayPatched = trayPatched.replace(dblClickTarget, () => {
        hitCount++;
        return dblClickReplacement;
    });

    const countRegex = /countItem\.label\s*=\s*\([^;]{0,300}' running';/g;
    const replacementCount = useTw
        ? "countItem.label = count > 0 ? `${count} 個代理執行中` : '無執行中的代理';"
        : "countItem.label = count > 0 ? `${count} 个智能体运行中` : '无运行中的智能体';";
    trayPatched = trayPatched.replace(countRegex, (match) => {
        hitCount++;
        return `/* --- TRAY COUNT START:${Buffer.from(match, 'utf8').toString('base64')} --- */ ${replacementCount} /* --- TRAY COUNT END --- */`;
    });

    const targetInsert = /function\s+insertTrayMenuItem\s*\(\s*position\s*,\s*options\s*\)\s*\{/;
    const replacementInsert = `function insertTrayMenuItem(position, options) {
    /* --- TRAY INSERT TRANSLATION START --- */
    const insertTranslations = ${trayTranslationsJson};
    if (options && options.label) {
        if (insertTranslations[options.label]) {
            options = { ...options, label: insertTranslations[options.label] };
        } else if (options.label.startsWith('Open ')) {
            options = { ...options, label: ${JSON.stringify(openPrefix)} + options.label.slice(5) };
        }
    }
    /* --- TRAY INSERT TRANSLATION END --- */`;
    trayPatched = trayPatched.replace(targetInsert, () => {
        hitCount++;
        return replacementInsert;
    });

    if (hitCount > 0) {
        console.log(`[修改] 任务栏菜单汉化注入成功（${hitCount} 处）！`);
    } else {
        console.warn(`[警告] 未能在 tray.js 中命中任何任务栏注入点。`);
    }
    return trayPatched;
}

function patchLoadingOverlayJs(loadingContent, useTw) {
    if (!loadingContent.includes('<div class="text">')) {
        return loadingContent;
    }
    console.log(`[修改] 正在向 loadingOverlay.js 注入加载页汉化...`);
    const replacementText = useTw
        ? '<div class="text">正在載入 Antigravity…</div>'
        : '<div class="text">正在加载 Antigravity…</div>';

    const out = loadingContent
        .replace('<div class="text">Loading Antigravity</div>', replacementText)
        .replace('<div class="text">反重力引擎已啟動，正在努力擺脫地心引力...</div>', replacementText)
        .replace('<div class="text">反重力引擎已启动，正在努力摆脱地心引力...</div>', replacementText);

    if (out !== loadingContent) {
        console.log(`[修改] 加载页汉化注入成功！`);
    } else {
        console.warn(`[警告] 未能在 loadingOverlay.js 中找到加载页文本插入点。`);
    }
    return out;
}

function patchUpdaterJs(updaterContent, useTw) {
    console.log(`[修改] 正在向 updater.js 注入更新弹窗汉化...`);
    const targetOptions = `                title: 'Check for Updates',
                message: 'No updates available',
                buttons: ['OK'],`;
    const replacementOptions = useTw
        ? `                title: '檢查更新',
                message: '目前沒有可用的更新',
                buttons: ['好'],`
        : `                title: '检查更新',
                message: '暂无可用更新',
                buttons: ['确定'],`;

    const out = updaterContent
        .replace(targetOptions, replacementOptions)
        .replace('MenuUpdateStep["CheckForUpdates"] = "Check for Updates";', `MenuUpdateStep["CheckForUpdates"] = ${useTw ? '"檢查更新"' : '"检查更新"'};`)
        .replace('MenuUpdateStep["CheckingForUpdates"] = "Checking for Updates...";', `MenuUpdateStep["CheckingForUpdates"] = ${useTw ? '"正在檢查更新..."' : '"正在检查更新..."'};`)
        .replace('MenuUpdateStep["DownloadingUpdate"] = "Downloading Update...";', `MenuUpdateStep["DownloadingUpdate"] = ${useTw ? '"正在下載更新..."' : '"正在下载更新..."'};`)
        .replace('MenuUpdateStep["RestartToUpdate"] = "Restart to Update";', `MenuUpdateStep["RestartToUpdate"] = ${useTw ? '"重新啟動以更新"' : '"重启以更新"'};`);
    if (out !== updaterContent) {
        console.log(`[修改] 更新弹窗汉化注入成功！`);
    } else {
        console.warn(`[警告] 未能在 updater.js 中找到更新弹窗插入点。`);
    }
    return out;
}

const MAIN_PROCESS_TEXT_TABLES = {
    'dist/main.js': [
        ["buttons: ['Cancel', 'Quit'],", "buttons: ['取消', '退出'],", "buttons: ['取消', '結束'],"],
        ["title: 'Confirm Quit',", "title: '确认退出',", "title: '確認結束',"],
        ["message: 'Are you sure you want to quit?',", "message: '确定要退出吗？',", "message: '確定要結束嗎？',"],
        ["detail: 'There may be agents or background tasks running.',", "detail: '当前可能有智能体或后台任务正在运行。',", "detail: '目前可能有代理或背景任務正在執行。',"],
        ["label: 'New Window',", "label: '新建窗口',", "label: '開新視窗',"],
        ["showErrorBox('Binary not found', msg)", "showErrorBox('未找到可执行文件', msg)", "showErrorBox('找不到可執行檔', msg)"],
        ["showErrorBox('WSL setup failed', msg)", "showErrorBox('WSL 初始化失败', msg)", "showErrorBox('WSL 設定失敗', msg)"],
        ["showErrorBox('Startup failed', msg)", "showErrorBox('启动失败', msg)", "showErrorBox('啟動失敗', msg)"],
        ["title: 'WSL distro not found',", "title: '未找到 WSL 发行版',", "title: '找不到 WSL 發行版',"],
        ['message: `The WSL distro "${WSL_DISTRO}" is no longer installed.`,', 'message: `WSL 发行版 "${WSL_DISTRO}" 已不再安装。`,', 'message: `WSL 發行版 "${WSL_DISTRO}" 已未安裝。`,'],
        ["detail: 'Antigravity opened on Windows instead.',", "detail: 'Antigravity 已改为在 Windows 上打开。',", "detail: 'Antigravity 已改為在 Windows 上開啟。',"]
    ],
    'dist/ipcHandlers.js': [
        ["showErrorBox('Cannot open folder', t.error)", "showErrorBox('无法打开文件夹', t.error)", "showErrorBox('無法開啟資料夾', t.error)"],
        ["message: 'Folder is on the Windows filesystem',", "message: '文件夹位于 Windows 文件系统中',", "message: '資料夾位於 Windows 檔案系統中',"],
        ["title: 'Open workspace',", "title: '打开工作区',", "title: '開啟工作區',"],
        ["title: 'Open workspaces',", "title: '打开工作区',", "title: '開啟工作區',"],
        ["title: 'Select Download Folder',", "title: '选择下载文件夹',", "title: '選取下載資料夾',"]
    ],
    'dist/remote/remoteManager.js': [
        ["title: 'Choose an SSH config file',", "title: '选择 SSH 配置文件',", "title: '選取 SSH 設定檔',"],
        ["buttons: ['Stop Server', 'Cancel'],", "buttons: ['停止服务', '取消'],", "buttons: ['停止伺服器', '取消'],"],
        ["title: 'Stop SSH server',", "title: '停止 SSH 服务器',", "title: '停止 SSH 伺服器',"],
        ["message: `Stop the Antigravity server on ${entry.label}?`,", "message: `停止 ${entry.label} 上的 Antigravity 服务？`,", "message: `要停止 ${entry.label} 上的 Antigravity 伺服器嗎？`,"],
        ["'Agents running on this host will stop and its window will close. '", "'此主机上运行的智能体将停止，其窗口也将关闭。'", "'此主機上執行的代理將會停止，視窗也會關閉。'"],
        ["'The server starts again the next time you connect.'", "'下次连接时将重新启动服务。'", "'下次連線時會重新啟動伺服器。'"],
        ["message: `Not connected to ${label}`,", "message: `尚未连接到 ${label}`,", "message: `尚未連線至 ${label}`,"],
        ["detail: 'Reconnect first, then stop its server.',", "detail: '请先重新连接，然后再停止其服务。',", "detail: '請先重新連線，再停止其伺服器。',"],
        ["title: 'SSH connection failed',", "title: 'SSH 连接失败',", "title: 'SSH 連線失敗',"],
        ["buttons: ['Sign In', 'Cancel'],", "buttons: ['登录', '取消'],", "buttons: ['登入', '取消'],"],
        ["title: 'Sign in',", "title: '登录',", "title: '登入',"],
        ["message: `Sign in to your organization for ${entry.label}?`,", "message: `是否登录 ${entry.label} 所在的组织？`,", "message: `是否登入 ${entry.label} 的組織？`,"],
        ["'Continue only if you just chose to sign in with your organization '", "'仅当您刚才主动选择通过组织登录时才继续。'", "'僅在您剛才選擇透過組織登入時才繼續。'"],
        ["`in this window. ${entry.label} will get access to your `", "`继续后，${entry.label} 将获得访问权限，可访问您的`", "`繼續後，${entry.label} 將取得權限，可存取您的`"],
        ['"organization\'s Google Cloud account.\\n"', '"所属组织的 Google Cloud 账户。\\n"', '"所屬組織的 Google Cloud 帳戶。\\n"'],
        ["`Workforce pool: ${names[1]}  Provider: ${names[2]}`", "`Workforce 池：${names[1]}  提供方：${names[2]}`", "`Workforce 集區：${names[1]}  提供者：${names[2]}`"],
        ["`Identity provider: ${provider}`", "`身份提供方：${provider}`", "`身分提供者：${provider}`"],
        ["message: `${name} can't be the SSH config file`,", "message: `${name} 无法作为 SSH 配置文件`,", "message: `${name} 無法作為 SSH 設定檔`,"],
        ["title: 'Choose another SSH config file',", "title: '选择其他 SSH 配置文件',", "title: '選取其他 SSH 設定檔',"],
        ["buttons: ['Choose Another File…', 'Cancel'],", "buttons: ['选择其他文件…', '取消'],", "buttons: ['選取其他檔案…', '取消'],"],
        ["title: 'Could not restart the SSH server',", "title: '无法重启 SSH 服务器',", "title: '無法重新啟動 SSH 伺服器',"],
        ["message: `${entry.label} still runs Antigravity server ${running}.`,", "message: `${entry.label} 仍在运行 Antigravity 服务器 ${running}。`,", "message: `${entry.label} 仍在執行 Antigravity 伺服器 ${running}。`,"],
        ["buttons: ['Allow', \"Don't Allow\"],", "buttons: ['允许', '不允许'],", "buttons: ['允許', '不允許'],"],
        ["title: 'Microphone access',", "title: '麦克风权限',", "title: '麥克風存取權限',"],
        ["message: `Allow ${label} to use your microphone?`,", "message: `允许 ${label} 使用您的麦克风吗？`,", "message: `允許 ${label} 使用您的麥克風嗎？`,"],
        ["detail: `The page in this window comes from ${label}. If you allow it, that ` +", "detail: `此窗口中的页面来自 ${label}。如果您允许，只要其任意` +", "detail: `此視窗中的頁面來自 ${label}。如果您允許，只要其任一` +"],
        ["\"host can use this computer's microphone for voice whenever one of \" +", "\"主机窗口处于打开状态，该主机即可使用此电脑的麦克风进行语音输入。\" +", "\"視窗處於開啟狀態，該主機即可使用此電腦的麥克風進行語音輸入。\" +"],
        ["'its windows is open. Antigravity asks again after you quit it.',", "'退出 Antigravity 后，下次将重新询问。',", "'結束 Antigravity 後，下次將會重新詢問。',"],
        ["buttons: ['Continue', 'Cancel'],", "buttons: ['继续', '取消'],", "buttons: ['繼續', '取消'],"],
        ["message: `Finish this sign-in on ${entry.label}?`,", "message: `要在 ${entry.label} 上完成此次登录吗？`,", "message: `要在 ${entry.label} 上完成此次登入嗎？`,"],
        ["detail: `Continue only if you just chose to sign in from the ${entry.label} ` +", "detail: `仅当您刚才主动选择从 ${entry.label} 窗口登录时才继续。` +", "detail: `僅在您剛才選擇從 ${entry.label} 視窗登入時才繼續。` +"],
        ["'window. Your browser opens the sign-in page; once you sign in, ' +", "'您的浏览器将打开登录页面；完成登录后，' +", "'您的瀏覽器將會開啟登入頁面；完成登入後，' +"],
        ["`${entry.label} gets access to that account.\\n` +", "`${entry.label} 将获得该账户的访问权限。\\n` +", "`${entry.label} 將取得該帳戶的存取權限。\\n` +"],
        ["`Sign-in page: ${(0, types_1.sanitizeRemoteText)(new URL(origin).host, 200)}`,", "`登录页面：${(0, types_1.sanitizeRemoteText)(new URL(origin).host, 200)}`,", "`登入頁面：${(0, types_1.sanitizeRemoteText)(new URL(origin).host, 200)}`,"],
        ["buttons: ['Take Over', 'Cancel'],", "buttons: ['接管', '取消'],", "buttons: ['接管', '取消'],"],
        ["title: 'Shared home directory',", "title: '共享主目录',", "title: '共用家目錄',"],
        ["? `This window's Antigravity server runs on ${host}, another machine that shares your home directory.`", "? `此窗口的 Antigravity 服务器正在 ${host} 上运行（另一台共享您主目录的机器）。`", "? `此視窗的 Antigravity 伺服器正在 ${host} 上執行（另一台共用您家目錄的機器）。`"],
        ["? `Your Antigravity server runs on ${host}, another machine that shares your home directory.`", "? `您的 Antigravity 服务器正在 ${host} 上运行（另一台共享您主目录的机器）。`", "? `您的 Antigravity 伺服器正在 ${host} 上執行（另一台共用您家目錄的機器）。`"],
        [": `${host}, another machine that shares your home directory, started your Antigravity server.`,", ": `${host}（另一台共享您主目录的机器）启动了您的 Antigravity 服务器。`,", ": `${host}（另一台共用您家目錄的機器）啟動了您的 Antigravity 伺服器。`,"],
        ["? `${label} reached ${here} this time. Cancel and reconnect to try again for ${host}, or take over to stop the server on ${host}, and its agents, and run it on ${here} instead.`", "? `${label} 本次连接到了 ${here}。您可以取消并重新连接以再次尝试连接 ${host}，或选择“接管”以停止 ${host} 上的服务器及其智能体，改为在 ${here} 上运行。`", "? `${label} 本次連線至 ${here}。您可以取消並重新連線以再次嘗試連線 ${host}，或選擇「接管」以停止 ${host} 上的伺服器及其代理，改為在 ${here} 上執行。`"],
        ["? `${label} reached ${here}. Take over to stop the server on ${host}, and its agents, and run it on ${here} instead. To keep it running, connect to ${host}.`", "? `${label} 已连接到 ${here}。选择“接管”将停止 ${host} 上的服务器及其智能体，改为在 ${here} 上运行。若需保持其运行，请连接到 ${host}。`", "? `${label} 已連線至 ${here}。選擇「接管」將停止 ${host} 上的伺服器及其代理，改為在 ${here} 上執行。若要保持其執行，請連線至 ${host}。`"],
        [": `${label} reached ${here}. Take over only if that server no longer runs, for example if ${host} was shut down or replaced: if it still runs, both servers would write the same files. To check, connect to ${host}.`,", ": `${label} 已连接到 ${here}。仅在确认该服务器已停止运行（例如 ${host} 已关机或被替换）时才选择“接管”：若它仍在运行，两个服务器将同时写入同一批文件。如需确认，请连接到 ${host}。`,", ": `${label} 已連線至 ${here}。僅在確認該伺服器已停止執行（例如 ${host} 已關機或被取代）時才選擇「接管」：若它仍在執行，兩個伺服器將會同時寫入相同的檔案。若要確認，請連線至 ${host}。`,"],
        ["const what = terminals === 0 ? 'agent or task' : 'agent, task or terminal';", "const what = terminals === 0 ? '智能体或任务' : '智能体、任务或终端';", "const what = terminals === 0 ? '代理或任務' : '代理、任務或終端機';"],
        ["buttons: ['Restart', 'Later'],", "buttons: ['重启', '稍后'],", "buttons: ['重新啟動', '稍後'],"],
        ["title: 'Restart SSH server',", "title: '重启 SSH 服务器',", "title: '重新啟動 SSH 伺服器',"],
        ["message: `${label} is running server ${running}; this app is ${expected}. Restart the server now?`,", "message: `${label} 正在运行服务器 ${running}，当前应用版本为 ${expected}。是否立即重启服务器？`,", "message: `${label} 正在執行伺服器 ${running}，目前應用程式版本為 ${expected}。是否立即重新啟動伺服器？`,"],
        ["detail: `Any ${what} still running on it stops. The server starts again with this app's version.`,", "detail: `其上仍在运行的任何${what}都将停止。服务器将以当前应用版本重新启动。`,", "detail: `其上仍在執行的任何${what}都將停止。伺服器將以目前應用程式版本重新啟動。`,"]
    ],
    'dist/remote/sshPrompts.js': [
        ["message: confirm ? `${label} asks:` : 'Touch your security key',", "message: confirm ? `${label} 询问：` : '请轻触您的安全密钥',", "message: confirm ? `${label} 詢問：` : '請輕觸您的安全金鑰',"],
        ["const TOUCH_TITLE = 'Touch your security key';", "const TOUCH_TITLE = '请轻触您的安全密钥';", "const TOUCH_TITLE = '請輕觸您的安全金鑰';"],
        ["<p class=\"context\">Connecting to <span id=\"label\"></span></p>", "<p class=\"context\">正在连接到 <span id=\"label\"></span></p>", "<p class=\"context\">正在連線至 <span id=\"label\"></span></p>"],
        ["buttons: confirm ? ['Yes', 'No'] : ['Cancel'],", "buttons: confirm ? ['是', '否'] : ['取消'],", "buttons: confirm ? ['是', '否'] : ['取消'],"],
        [">Asked again: your last answer may not have worked.<", ">再次询问：您上次的回答可能未生效。<", ">再次詢問：您上次的回答可能無效。<"],
        [">That's too long.<", ">输入内容过长。<", ">輸入內容過長。<"],
        ['>Cancel</button>', '>取消</button>', '>取消</button>'],
        ['>Continue</button>', '>继续</button>', '>繼續</button>'],
        ["(who) => (isAccount(who) ? ['Password', who] : undefined),", "(who) => (isAccount(who) ? ['密码', who] : undefined),", "(who) => (isAccount(who) ? ['密碼', who] : undefined),"],
        ["(who) => (isAccount(who) ? ['Current password', who] : undefined),", "(who) => (isAccount(who) ? ['当前密码', who] : undefined),", "(who) => (isAccount(who) ? ['目前密碼', who] : undefined),"],
        ["(who) => (isAccount(who) ? ['New password', who] : undefined),", "(who) => (isAccount(who) ? ['新密码', who] : undefined),", "(who) => (isAccount(who) ? ['新密碼', who] : undefined),"],
        ["(who) => (isAccount(who) ? ['Confirm new password', who] : undefined),", "(who) => (isAccount(who) ? ['确认新密码', who] : undefined),", "(who) => (isAccount(who) ? ['確認新密碼', who] : undefined),"],
        ["['Passphrase', baseName(key)]", "['密钥口令', baseName(key)]", "['金鑰密碼', baseName(key)]"],
        ["? `${asked[0]} for ${hostPromptsMarked ? asked[1] : label}`", "? `${hostPromptsMarked ? asked[1] : label} 的${asked[0]}`", "? `${hostPromptsMarked ? asked[1] : label} 的${asked[0]}`"],
        ["? `Trust ${hostName(host.split(' (')[0])}?`", "? `信任 ${hostName(host.split(' (')[0])}？`", "? `信任 ${hostName(host.split(' (')[0])}？`"],
        ["? `Connect to ${hostName(host)} anyway?`", "? `仍要连接到 ${hostName(host)}？`", "? `仍要連線至 ${hostName(host)} 嗎？`"],
        ["return 'Accept updated host keys?';", "return '接受更新的主机密钥？';", "return '接受更新的主機金鑰嗎？';"],
        ["return key ? `Add ${baseName(key.split(' (')[0])} to ssh-agent?` : undefined;", "return key ? `将 ${baseName(key.split(' (')[0])} 添加到 ssh-agent？` : undefined;", "return key ? `要將 ${baseName(key.split(' (')[0])} 新增至 ssh-agent 嗎？` : undefined;"],
        ["return `Question from ${who}`;", "return `来自 ${who} 的询问`;", "return `來自 ${who} 的詢問`;"],
        ["return `Verification code for ${who}`;", "return `${who} 的验证码`;", "return `${who} 的驗證碼`;"],
        ["return `Password for ${who}`;", "return `${who} 的密码`;", "return `${who} 的密碼`;"],
        ["return /\\bpin\\b/i.test(text) ? `PIN for ${who}` : `Sign in to ${who}`;", "return /\\bpin\\b/i.test(text) ? `${who} 的 PIN` : `登录到 ${who}`;", "return /\\bpin\\b/i.test(text) ? `${who} 的 PIN` : `登入 ${who}`;"]
    ],
    'dist/deviceChooser.js': [
        ["hid: 'HID device',", "hid: 'HID 设备',", "hid: 'HID 裝置',"],
        ["usb: 'USB device',", "usb: 'USB 设备',", "usb: 'USB 裝置',"],
        ["serial: 'serial port',", "serial: '串口设备',", "serial: '序列埠裝置',"],
        ["'Unknown device'", "'未知设备'", "'未知裝置'"],
        ["title: 'Connect a device',", "title: '连接设备',", "title: '連線裝置',"],
        ["message: `${origin} wants to connect to a ${KIND_NOUNS[kind]}`,", "message: `${origin} 请求连接到 ${KIND_NOUNS[kind]}`,", "message: `${origin} 想要連線至 ${KIND_NOUNS[kind]}`,"],
        ["? 'Select a device:'", "? '请选择设备：'", "? '請選取裝置：'"],
        [": 'No compatible devices found.',", ": '未找到兼容设备。',", ": '找不到相容的裝置。',"],
        ["buttons: [...snapshot.map(({ label }) => label), 'Cancel'],", "buttons: [...snapshot.map(({ label }) => label), '取消'],", "buttons: [...snapshot.map(({ label }) => label), '取消'],"]
    ],
    'dist/webauthn.js': [
        ["details.relyingPartyId || 'this site'", "details.relyingPartyId || '当前站点'", "details.relyingPartyId || '目前網站'"],
        ["title: 'Choose a Passkey',", "title: '选择通行密钥 (Passkey)',", "title: '選擇通行金鑰 (Passkey)',"],
        ["message: `Sign in to ${rpLabel}`,", "message: `登录 ${rpLabel}`,", "message: `登入 ${rpLabel}`,"],
        ["detail: 'Select a passkey account to continue:',", "detail: '请选择一个通行密钥账户以继续：',", "detail: '請選取通行金鑰帳戶以繼續：',"],
        ["buttons: [...accountLabels, 'Cancel'],", "buttons: [...accountLabels, '取消'],", "buttons: [...accountLabels, '取消'],"]
    ],
    'dist/webviewPopupSecurity.js': [
        ["insecure: 'Not secure',", "insecure: '不安全',", "insecure: '不安全',"],
        ["dangerous: '⚠ Not secure',", "dangerous: '⚠ 不安全',", "dangerous: '⚠ 不安全',"],
        ["'Your connection to this site is not secure',", "'您与此网站的连接不安全',", "'您與此網站的連線不安全',"],
        ["'You should not enter any sensitive information on this site (for '", "'请勿在此网站输入任何敏感信息（例如'", "'請勿在此網站輸入任何機密資訊（例如'"],
        ["'example, passwords or credit cards), because it could be stolen by '", "'密码或信用卡信息），因为这些信息可能会被'", "'密碼或信用卡號碼），因為這些資訊可能會遭'"],
        ["'attackers.',", "'攻击者窃取。',", "'攻擊者竊取。',"],
        ["'Connection is secure',", "'连接安全',", "'連線安全',"],
        ["'Your information (for example, passwords or credit card numbers) is '", "'您的信息（例如密码或信用卡号）在发送至此网站时'", "'您的資訊（例如密碼或信用卡號碼）傳送至此網站時'"],
        ["'private when it is sent to this site.',", "'会受到私密保护。',", "'均為私密傳輸。',"],
        ["['Connection security information is not available for this page']", "['无法获取此页面的连接安全信息']", "['無法取得此頁面的連線安全資訊']"],
        [": 'unknown'", ": '未知'", ": '未知'"],
        ["'Certificate is valid' : 'Certificate details'", "'证书有效' : '证书详情'", "'憑證有效' : '憑證詳細資料'"],
        ["`Error: ${state.certificateError}`", "`错误：${state.certificateError}`", "`錯誤：${state.certificateError}`"],
        ["`Issued to: ${certificate.subjectName}`", "`颁发给：${certificate.subjectName}`", "`核發給：${certificate.subjectName}`"],
        ["`Issued by: ${certificate.issuer}`", "`颁发者：${certificate.issuer}`", "`核發者：${certificate.issuer}`"],
        ["`Valid from: ${formatDate(certificate.validFromMs)}`", "`生效时间：${formatDate(certificate.validFromMs)}`", "`有效起始日期：${formatDate(certificate.validFromMs)}`"],
        ["`Valid until: ${formatDate(certificate.validToMs)}`", "`过期时间：${formatDate(certificate.validToMs)}`", "`有效截止日期：${formatDate(certificate.validToMs)}`"],
        ["`Protocol: ${certificate.protocol}`", "`协议：${certificate.protocol}`", "`通訊協定：${certificate.protocol}`"],
        ["(state.url || 'This page')", "(state.url || '当前页面')", "(state.url || '目前頁面')"],
        ["label: 'Connection info…',", "label: '连接信息…',", "label: '連線資訊…',"],
        ["title: 'Connection info',", "title: '连接信息',", "title: '連線資訊',"],
        ["buttons: ['OK'],", "buttons: ['确定'],", "buttons: ['確定'],"]
    ],
    'dist/provisionSplash.js': [
        ["<div>Setting up WSL: ${escapeHtml(distro)}</div>", "<div>正在初始化 WSL：${escapeHtml(distro)}</div>", "<div>正在設定 WSL：${escapeHtml(distro)}</div>"]
    ],
    'dist/ideInstall/wizardHtml.js': [
        ["<title>Welcome to Antigravity</title>", "<title>欢迎使用 Antigravity</title>", "<title>歡迎使用 Antigravity</title>"],
        [">Setting up…</div>", ">正在设置…</div>", ">正在設定…</div>"],
        ["<h1>Welcome to the new Antigravity!</h1>", "<h1>欢迎使用全新 Antigravity！</h1>", "<h1>歡迎使用全新 Antigravity！</h1>"],
        ["<p>Antigravity has been redesigned to put agents first with new capabilities. If you'd still like a code editor, you can download it as a separate app named <b>Antigravity IDE</b>.</p>", "<p>Antigravity 经过全新设计，以智能体为核心并带来了全新能力。如果您仍需要代码编辑器，可将其作为名为 <b>Antigravity IDE</b> 的独立应用下载。</p>", "<p>Antigravity 經過全新設計，以代理為核心並帶來全新功能。如果您仍需要程式碼編輯器，可將其作為名為 <b>Antigravity IDE</b> 的獨立應用程式下載。</p>"],
        ["<span>Download the Antigravity IDE</span>", "<span>下载 Antigravity IDE</span>", "<span>下載 Antigravity IDE</span>"],
        [">Explore the new Antigravity</button>", ">探索全新 Antigravity</button>", ">探索全新 Antigravity</button>"]
    ]
};

const MAIN_PROCESS_PATCH_TARGETS = Object.keys(MAIN_PROCESS_TEXT_TABLES);

function patchMainProcessModule(relPath, content, useTw) {
    const pairs = MAIN_PROCESS_TEXT_TABLES[relPath];
    if (!pairs) return content;
    let out = content;
    let hitCount = 0;
    for (const [needle, sc, tc] of pairs) {
        const replacement = useTw ? tc : sc;
        if (out.includes(needle)) {
            out = out.split(needle).join(replacement);
            hitCount++;
        }
    }
    if (hitCount > 0) {
        console.log(`[修改] 已向 ${relPath} 注入原生弹窗/界面汉化（${hitCount} 处）`);
    }
    return out;
}

module.exports = {
    patchPreloadJs,
    patchUtilsJs,
    patchMenuJs,
    patchTrayJs,
    patchLoadingOverlayJs,
    patchUpdaterJs,
    patchMainProcessModule,
    MAIN_PROCESS_PATCH_TARGETS
};
