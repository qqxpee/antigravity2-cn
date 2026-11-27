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
        'Version': '版本',
        'Reload': '重新載入',
        'Force Reload': '強制重新載入',
        'Substitutions': '替代',
        'Show Substitutions': '顯示替代',
        'Smart Quotes': '智慧型引號',
        'Smart Dashes': '智慧型破折號',
        'Text Replacement': '文字替代',
        'Speech': '語音',
        'Start Speaking': '開始朗讀',
        'Stop Speaking': '停止朗讀',
        'Force Reload': '強制重新載入',
        'Reload Window': '重新載入視窗',
        'Toggle Fullscreen': '切換全螢幕',
        'Toggle Full-Screen': '切換全螢幕',
        'Enter Full Screen': '進入全螢幕',
        'Exit Full Screen': '退出全螢幕',
        'Appearance': '外觀',
        'Select Theme': '選取佈景主題',
        'Toggle Sidebar': '切換側邊欄',
        'Customize Sidebar': '自訂側邊欄',
        'Toggle Aux Pane': '切換輔助面板',
        'Toggle Terminal': '切換終端機',
        'Toggle Secondary Side Bar': '切換次要側邊欄',
        'Open Command Palette': '開啟命令選擇區',
        'Open Launchpad': '開啟啟動台',
        'Open Project Picker': '開啟專案選擇器',
        'Open Conversation History': '開啟對話記錄',
        'Open Keyboard Shortcuts': '開啟鍵盤快速鍵',
        'Keyboard Shortcuts': '鍵盤快速鍵',
        'Remove From Split': '結束分割',
        'Remove from Split': '從分割檢視中移除',
        'Equalize Split Panes': '均分分割窗格',
        'Next Aux Pane Tab': '下一個輔助面板分頁',
        'Previous Aux Pane Tab': '上一個輔助面板分頁',
        'Collapse All Folders': '摺疊所有資料夾',
        'Expand All Folders': '展開所有資料夾',
        'Word Wrap': '自動換行',
        'Toggle Word Wrap': '切換自動換行',
        'Front': '移至最前',
        'Show Previous Tab': '顯示上一個分頁',
        'Show Next Tab': '顯示下一個分頁',
        'Move Tab to New Window': '將分頁移至新視窗',
        'Merge All Windows': '合併所有視窗',
        'Tile Window to Left of Screen': '將視窗並排至螢幕左側',
        'Tile Window to Right of Screen': '將視窗並排至螢幕右側',
        'Move Window to Left Side of Screen': '將視窗移至螢幕左側',
        'Move Window to Right Side of Screen': '將視窗移至螢幕右側',
        'Fill': '填滿',
        'Center': '置中',
        'Move & Resize': '移動並調整大小',
        'New Conversation': '新增對話',
        'New Remote Window': '新增遠端視窗',
        'New Editor Window': '新增編輯器視窗',
        'New Tab': '新增分頁',
        'New Terminal Tab': '新增終端機分頁',
        'Open...': '開啟...',
        'Open Folder...': '開啟資料夾...',
        'Open Folder': '開啟資料夾',
        'Open Workspace...': '開啟工作區...',
        'Open Workspace': '開啟工作區',
        'Open Recent': '開啟最近項目',
        'Clear Menu': '清除選單',
        'Clear Recently Opened': '清除最近開啟記錄',
        'Save': '儲存',
        'Save As...': '另存新檔...',
        'Save All': '全部儲存',
        'Revert File': '還原檔案',
        'Close Tab': '關閉分頁',
        'Close Editor': '關閉編輯器',
        'Close Folder': '關閉資料夾',
        'Close Project': '關閉專案',
        'Connect to Remote...': '連線至遠端...',
        'Connect to Remote Workspace': '連線至遠端工作區',
        'Connect to SSH...': '連線至 SSH...',
        'Show in File Manager': '在檔案管理員中顯示',
        'Open in Editor': '在編輯器中開啟',
        'Exit': '結束',
        'Find': '尋找',
        'Find...': '尋找...',
        'Find in Conversation': '在對話中尋找',
        'Find Next': '找下一個',
        'Find Previous': '找上一個',
        'Replace': '取代',
        'Replace...': '取代...',
        'Spelling and Grammar': '拼字與文法',
        'Show Spelling and Grammar': '顯示拼字與文法',
        'Check Document Now': '立即檢查文件',
        'Check Spelling While Typing': '輸入時即時檢查拼字',
        'Check Grammar With Spelling': '連同拼字檢查文法',
        'Correct Spelling Automatically': '自動更正拼字',
        'Smart Copy/Paste': '智慧型拷貝/貼上',
        'Smart Links': '智慧型連結',
        'Data Detectors': '資料偵測器',
        'Transformations': '轉換',
        'Make Upper Case': '轉為大寫',
        'Make Lower Case': '轉為小寫',
        'Capitalize': '字首大寫',
        'Start Dictation...': '開始聽寫...',
        'Emoji & Symbols': '表情符號與符號',
        'Copy conversation markdown': '複製對話 Markdown',
        'Copy Conversation Markdown': '複製對話 Markdown',
        'Check for Updates...': '檢查更新...',
        'Download Update': '下載更新',
        'Restart to Update...': '重新啟動以更新...',
        'Settings': '設定',
        'Preferences': '偏好設定',
        'Open Settings': '開啟設定',
        'Hide': '隱藏',
        'Sign In': '登入',
        'Sign Out': '登出',
        'Sign out': '登出',
        'Install Shell Command': '安裝命令列工具',
        'Install IDE': '安裝 IDE',
        'Documentation': '說明文件',
        'Release Notes': '版本資訊',
        'Report Issue': '回報問題',
        'Send Feedback': '傳送意見回饋',
        'Provide Feedback': '提供意見回饋',
        'Download Diagnostics': '下載診斷資訊',
        'Show Logs': '顯示記錄檔',
        'Open Logs Folder': '開啟記錄檔資料夾',
        'About': '關於',
        'Privacy Policy': '隱私權政策',
        'Terms of Service': '服務條款',
        'License': '授權條款',
        'Developer': '開發人員',
        'Developer: Reset NUX': '開發人員：重設新使用者引導',
        'Developer: Reset Onboarding': '開發人員：重設初始引導',
        'Restart Main Language Server': '重新啟動主語言伺服器',
        'Clear Cache': '清除快取',
        'View Usage': '檢視用量'
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
        'Version': '版本',
        'Reload': '重新加载',
        'Force Reload': '强制重新加载',
        'Substitutions': '替换',
        'Show Substitutions': '显示替换',
        'Smart Quotes': '智能引号',
        'Smart Dashes': '智能破折号',
        'Text Replacement': '文本替换',
        'Speech': '语音',
        'Start Speaking': '开始朗读',
        'Stop Speaking': '停止朗读',
        'Reload Window': '重新加载窗口',
        'Toggle Fullscreen': '切换全屏',
        'Toggle Full-Screen': '切换全屏',
        'Enter Full Screen': '进入全屏',
        'Exit Full Screen': '退出全屏',
        'Appearance': '外观',
        'Select Theme': '选择主题',
        'Toggle Sidebar': '切换侧边栏',
        'Customize Sidebar': '自定义侧边栏',
        'Toggle Aux Pane': '切换辅助面板',
        'Toggle Terminal': '切换终端',
        'Toggle Secondary Side Bar': '切换次侧边栏',
        'Open Command Palette': '打开命令面板',
        'Open Launchpad': '打开启动台',
        'Open Project Picker': '打开项目选择器',
        'Open Conversation History': '打开会话历史',
        'Open Keyboard Shortcuts': '打开键盘快捷键',
        'Keyboard Shortcuts': '键盘快捷键',
        'Remove From Split': '退出拆分',
        'Remove from Split': '从拆分视图中移除',
        'Equalize Split Panes': '均分拆分面板',
        'Next Aux Pane Tab': '下一个辅助面板标签页',
        'Previous Aux Pane Tab': '上一个辅助面板标签页',
        'Collapse All Folders': '折叠所有文件夹',
        'Expand All Folders': '展开所有文件夹',
        'Word Wrap': '自动换行',
        'Toggle Word Wrap': '切换自动换行',
        'Front': '前置全部窗口',
        'Show Previous Tab': '显示上一个标签页',
        'Show Next Tab': '显示下一个标签页',
        'Move Tab to New Window': '将标签页移至新窗口',
        'Merge All Windows': '合并所有窗口',
        'Tile Window to Left of Screen': '将窗口拼贴到屏幕左侧',
        'Tile Window to Right of Screen': '将窗口拼贴到屏幕右侧',
        'Move Window to Left Side of Screen': '将窗口移到屏幕左侧',
        'Move Window to Right Side of Screen': '将窗口移到屏幕右侧',
        'Fill': '填充',
        'Center': '居中',
        'Move & Resize': '移动并调整大小',
        'New Conversation': '新建会话',
        'New Remote Window': '新建远程窗口',
        'New Editor Window': '新建编辑器窗口',
        'New Tab': '新建标签页',
        'New Terminal Tab': '新建终端标签页',
        'Open...': '打开...',
        'Open Folder...': '打开文件夹...',
        'Open Folder': '打开文件夹',
        'Open Workspace...': '打开工作区...',
        'Open Workspace': '打开工作区',
        'Open Recent': '打开最近项',
        'Clear Menu': '清除菜单',
        'Clear Recently Opened': '清除最近打开记录',
        'Save': '保存',
        'Save As...': '另存为...',
        'Save All': '全部保存',
        'Revert File': '恢复文件',
        'Close Tab': '关闭标签页',
        'Close Editor': '关闭编辑器',
        'Close Folder': '关闭文件夹',
        'Close Project': '关闭项目',
        'Connect to Remote...': '连接到远程...',
        'Connect to Remote Workspace': '连接到远程工作区',
        'Connect to SSH...': '连接到 SSH...',
        'Show in File Manager': '在文件管理器中显示',
        'Open in Editor': '在编辑器中打开',
        'Exit': '退出',
        'Find': '查找',
        'Find...': '查找...',
        'Find in Conversation': '在会话中查找',
        'Find Next': '查找下一个',
        'Find Previous': '查找上一个',
        'Replace': '替换',
        'Replace...': '替换...',
        'Spelling and Grammar': '拼写和语法',
        'Show Spelling and Grammar': '显示拼写和语法',
        'Check Document Now': '立即检查文稿',
        'Check Spelling While Typing': '键入时检查拼写',
        'Check Grammar With Spelling': '检查拼写和语法',
        'Correct Spelling Automatically': '自动纠正拼写',
        'Smart Copy/Paste': '智能拷贝/粘贴',
        'Smart Links': '智能链接',
        'Data Detectors': '数据检测器',
        'Transformations': '转换',
        'Make Upper Case': '变为大写',
        'Make Lower Case': '变为小写',
        'Capitalize': '首字母大写',
        'Start Dictation...': '开始听写...',
        'Emoji & Symbols': '表情与符号',
        'Copy conversation markdown': '复制会话 Markdown',
        'Copy Conversation Markdown': '复制会话 Markdown',
        'Check for Updates...': '检查更新...',
        'Download Update': '下载更新',
        'Restart to Update...': '重启以更新...',
        'Settings': '设置',
        'Preferences': '首选项',
        'Open Settings': '打开设置',
        'Hide': '隐藏',
        'Sign In': '登录',
        'Sign Out': '退出登录',
        'Sign out': '退出登录',
        'Install Shell Command': '安装命令行工具',
        'Install IDE': '安装 IDE',
        'Documentation': '文档',
        'Release Notes': '发行说明',
        'Report Issue': '报告问题',
        'Send Feedback': '发送反馈',
        'Provide Feedback': '提供反馈',
        'Download Diagnostics': '下载诊断信息',
        'Show Logs': '显示日志',
        'Open Logs Folder': '打开日志文件夹',
        'About': '关于',
        'Privacy Policy': '隐私政策',
        'Terms of Service': '服务条款',
        'License': '许可证',
        'Developer': '开发者',
        'Developer: Reset NUX': '开发者：重置新用户引导',
        'Developer: Reset Onboarding': '开发者：重置初始引导',
        'Restart Main Language Server': '重启主语言服务器',
        'Clear Cache': '清除缓存',
        'View Usage': '查看用量'
    }`};
    const lowerTranslations = Object.create(null);
    for (const [k, v] of Object.entries(translations)) {
        lowerTranslations[k.toLowerCase()] = v;
    }
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
            const normLabel = cleanLabel.replace(/…/g, '...').trim();
            if (!item._origLabel) item._origLabel = label;
            if (!item._origCleanLabel) item._origCleanLabel = cleanLabel;
            const hit = translations[cleanLabel] || translations[normLabel] || translations[label] || lowerTranslations[normLabel.toLowerCase()];
            if (hit) {
                item.label = hit + mnemonic;
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
        ["detail: 'Antigravity opened on Windows instead.',", "detail: 'Antigravity 已改为在 Windows 上打开。',", "detail: 'Antigravity 已改為在 Windows 上開啟。',"],
        ['`Failed to install the server into WSL distro "${WSL_DISTRO}":\\n${err.message}`', '`无法将服务器安装到 WSL 发行版“${WSL_DISTRO}”：\\n${err.message}`', '`無法將伺服器安裝到 WSL 發行版「${WSL_DISTRO}」：\\n${err.message}`']
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
        ["detail: `Any ${what} still running on it stops. The server starts again with this app's version.`,", "detail: `其上仍在运行的任何${what}都将停止。服务器将以当前应用版本重新启动。`,", "detail: `其上仍在執行的任何${what}都將停止。伺服器將以目前應用程式版本重新啟動。`,"],
        // reportError() 以参数传入的对话框标题（须排在上面的 title 列之后）
        ["'Could not restart the SSH server'", "'无法重启 SSH 服务器'", "'無法重新啟動 SSH 伺服器'"],
        ["'Could not stop the SSH server'", "'无法停止 SSH 服务器'", "'無法停止 SSH 伺服器'"],
        ["'Sign-in failed'", "'登录失败'", "'登入失敗'"],
        ["'Connection cancelled.'", "'连接已取消。'", "'已取消連線。'"]
    ],
    'dist/remote/sshPrompts.js': [
        // 页面语系只在繁体模式改为 zh-TW；简体模式保持原样（由上游决定）
        ['<html lang="en"', '<html lang="en"', '<html lang="zh-TW"'],
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
        // 页面语系只在繁体模式改为 zh-TW；简体模式保持原样（由上游决定）
        ['<html lang="en"', '<html lang="en"', '<html lang="zh-TW"'],
        ["<title>Welcome to Antigravity</title>", "<title>欢迎使用 Antigravity</title>", "<title>歡迎使用 Antigravity</title>"],
        [">Setting up…</div>", ">正在设置…</div>", ">正在設定…</div>"],
        ["<h1>Welcome to the new Antigravity!</h1>", "<h1>欢迎使用全新 Antigravity！</h1>", "<h1>歡迎使用全新 Antigravity！</h1>"],
        ["<p>Antigravity has been redesigned to put agents first with new capabilities. If you'd still like a code editor, you can download it as a separate app named <b>Antigravity IDE</b>.</p>", "<p>Antigravity 经过全新设计，以智能体为核心并带来了全新能力。如果您仍需要代码编辑器，可将其作为名为 <b>Antigravity IDE</b> 的独立应用下载。</p>", "<p>Antigravity 經過全新設計，以代理為核心並帶來全新功能。如果您仍需要程式碼編輯器，可將其作為名為 <b>Antigravity IDE</b> 的獨立應用程式下載。</p>"],
        ["<span>Download the Antigravity IDE</span>", "<span>下载 Antigravity IDE</span>", "<span>下載 Antigravity IDE</span>"],
        [">Explore the new Antigravity</button>", ">探索全新 Antigravity</button>", ">探索全新 Antigravity</button>"]
    ],
    'dist/remote/disconnectedPage.js': [
        // 页面语系只在繁体模式改为 zh-TW；简体模式保持原样（由上游决定）
        ['<html lang="en"', '<html lang="en"', '<html lang="zh-TW"'],
        ["reconnect: 'Reconnect',", "reconnect: '重新连接',", "reconnect: '重新連線',"],
        ["stop: 'Stop Server',", "stop: '停止服务',", "stop: '停止伺服器',"],
        ["close: 'Close',", "close: '关闭',", "close: '關閉',"],
        ["? 'Restarting…'", "? '正在重启…'", "? '正在重新啟動…'"],
        ["? 'Reconnecting…'", "? '正在重新连接…'", "? '正在重新連線…'"],
        [": 'Disconnected';", ": '已断开连接';", ": '已中斷連線';"],
        ["? `Restarting the Antigravity server on ${host}…`", "? `正在重启 ${host} 上的 Antigravity 服务…`", "? `正在重新啟動 ${host} 上的 Antigravity 伺服器…`"],
        ["? `Reconnecting to ${host}…`", "? `正在重新连接到 ${host}…`", "? `正在重新連線至 ${host}…`"],
        [": `Disconnected from ${host}`;", ": `已断开与 ${host} 的连接`;", ": `已中斷與 ${host} 的連線`;"],
        ["? 'This window opens it again once it has started.'", "? '服务启动完成后，此窗口将自动重新打开。'", "? '伺服器啟動完成後，此視窗將自動重新開啟。'"],
        ["? `Its server on ${host} stopped, and its agents with it.`", "? `其在 ${host} 上的服务已停止，相关的智能体也已随之停止。`", "? `其在 ${host} 上的伺服器已停止，相關的代理也已隨之停止。`"],
        [": `Agents keep running on ${host}.`", ": `智能体仍在 ${host} 上继续运行。`", ": `代理仍在 ${host} 上繼續執行。`"],
        ["? `Its agents on ${host} stopped with it.`", "? `其在 ${host} 上的智能体已随之停止。`", "? `其在 ${host} 上的代理已隨之停止。`"],
        [": `Agents keep running on ${host} unless its server stopped.`;", ": `除非其服务已停止，否则智能体仍在 ${host} 上继续运行。`;", ": `除非其伺服器已停止，否則代理仍在 ${host} 上繼續執行。`;"]
    ],
    'dist/remote/signInCallback.js': [
        // 页面语系只在繁体模式改为 zh-TW；简体模式保持原样（由上游决定）
        ['<html lang="en"', '<html lang="en"', '<html lang="zh-TW"'],
        ["const SIGNED_IN = page('You have successfully authenticated.', 'You can close this tab and return to Antigravity.');", "const SIGNED_IN = page('您已成功完成身份验证。', '您可以关闭此标签页并返回 Antigravity。');", "const SIGNED_IN = page('您已成功完成身分驗證。', '您可以關閉此分頁並返回 Antigravity。');"],
        ["return page(\"Sign-in didn't finish\", `Antigravity couldn't reach ${host} to finish signing in. ` +", "return page('登录未完成', `Antigravity 无法连接到 ${host} 以完成登录。` +", "return page('登入未完成', `Antigravity 無法連線至 ${host} 以完成登入。` +"],
        ["return page(\"Sign-in didn't finish\", 'This sign-in came back from another server than the sign-in page you ' +", "return page('登录未完成', '此登录回调来自与您此前同意的登录页不同的服务器，' +", "return page('登入未完成', '此登入回呼來自與您先前同意的登入頁不同的伺服器，' +"],
        ["`agreed to, so Antigravity didn't pass it on to ${host}.`);", "`因此 Antigravity 未将其传递给 ${host}。`);", "`因此 Antigravity 未將其傳遞給 ${host}。`);"],
        ["return page(\"Sign-in didn't finish\", `Antigravity on ${host} couldn't finish signing in (HTTP ${status}). ` +", "return page('登录未完成', `${host} 上的 Antigravity 无法完成登录 (HTTP ${status})。` +", "return page('登入未完成', `${host} 上的 Antigravity 無法完成登入 (HTTP ${status})。` +"],
        ["'Sign in again from Antigravity.');", "'请从 Antigravity 重新发起登录。');", "'請從 Antigravity 重新進行登入。');"]
    ],
    'dist/browserStream/capturePage.js': [
        ["<title>Browser Stream Capture</title>", "<title>浏览器串流捕获</title>", "<title>瀏覽器串流擷取</title>"],
        ["'Capture session failed'", "'捕获会话失败'", "'擷取工作階段失敗'"]
    ],
    // v2.35.1：SSH 错误对话框的说明与详情栏标签
    'dist/remote/sshErrorText.js': [
        ["'The connection was closed before it finished.'", "'连接在完成前被关闭。'", "'連線在完成前即被關閉。'"],
        ["`Windows SSH hosts aren't supported yet. ${sshArgs_1.LINUX_HOST_NEEDED}`", "`暂不支持 Windows SSH 主机。${sshArgs_1.LINUX_HOST_NEEDED}`", "`尚未支援 Windows SSH 主機。${sshArgs_1.LINUX_HOST_NEEDED}`"],
        ["`Error code: ${err.code}\\nLogs: ${logPath()}`", "`错误代码：${err.code}\\n日志：${logPath()}`", "`錯誤代碼：${err.code}\\n記錄檔：${logPath()}`"],
        ["`${text}\\nLogs: ${logPath()}`", "`${text}\\n日志：${logPath()}`", "`${text}\\n記錄檔：${logPath()}`"],
        ["`${label} reported: ${text}`", "`${label} 报告：${text}`", "`${label} 回報：${text}`"]
    ],
    // 通行密钥扫码窗口
    'dist/cablev2.js': [
        // 页面语系只在繁体模式改为 zh-TW；简体模式保持原样（由上游决定）
        ["<html lang=\"en\">", "<html lang=\"en\">", "<html lang=\"zh-TW\">"],
        ["<title>Passkeys</title>", "<title>通行密钥</title>", "<title>通行金鑰</title>"],
        ["<h1 class=\"sheet-title\">Passkeys</h1>", "<h1 class=\"sheet-title\">通行密钥</h1>", "<h1 class=\"sheet-title\">通行金鑰</h1>"],
        ["<p class=\"mechanism-header\">Use your phone or tablet</p>", "<p class=\"mechanism-header\">使用手机或平板电脑</p>", "<p class=\"mechanism-header\">使用手機或平板電腦</p>"],
        [">Scan this QR code with the camera on the device that has your passkey for ${safeRpId}</p>", ">请使用存有 ${safeRpId} 通行密钥的设备，用摄像头扫描此二维码</p>", ">請使用存有 ${safeRpId} 通行金鑰的裝置，以相機掃描此 QR 碼</p>"],
        ["onclick=\"window.close()\">Cancel</button>", "onclick=\"window.close()\">取消</button>", "onclick=\"window.close()\">取消</button>"],
        ["title: 'Passkeys'", "title: '通行密钥'", "title: '通行金鑰'"],
        ["updateStatus('Connecting to your device…')", "updateStatus('正在连接到您的设备…')", "updateStatus('正在連線至您的裝置…')"],
        ["updateStatus('Verify on your device to continue…')", "updateStatus('请在您的设备上完成验证以继续…')", "updateStatus('請在您的裝置上完成驗證以繼續…')"]
    ],
    'dist/qrEncoder.js': [
        ["aria-label=\"Passkey QR code\"", "aria-label=\"通行密钥二维码\"", "aria-label=\"通行金鑰 QR 碼\""]
    ],
    // SSH 连接失败对话框与断开页面的错误说明（给 AI 代理的错误码消息、只写入日志的字符串保留英文）
    'dist/remote/sshArgs.js': [
        ["'Antigravity needs a Linux host on x64 or arm64 with glibc 2.26 or newer.'", "'Antigravity 需要使用 glibc 2.26 或更高版本、x64 或 arm64 架构的 Linux 主机。'", "'Antigravity 需要使用 glibc 2.26 以上版本、x64 或 arm64 架構的 Linux 主機。'"],
        ["`Couldn't connect to the SSH host (${String(code)}).`", "`无法连接到 SSH 主机（${String(code)}）。`", "`無法連線至 SSH 主機（${String(code)}）。`"],
        ["'SSH authentication failed. Check your password, code or keys, then try again.'", "'SSH 身份验证失败。请检查密码、验证码或密钥，然后重试。'", "'SSH 驗證失敗。請檢查密碼、驗證碼或金鑰，然後再試一次。'"],
        ["'SSH authentication failed. Click Reconnect to sign in again.'", "'SSH 身份验证失败。请点击“重新连接”再次登录。'", "'SSH 驗證失敗。請按一下「重新連線」再次登入。'"],
        ["\"SSH authentication failed. Antigravity can't answer password or code prompts on Windows yet: set up key-based login with ssh-agent, then try again.\"", "'SSH 身份验证失败。Antigravity 目前在 Windows 上还无法应答密码或验证码提示：请用 ssh-agent 设置密钥登录，然后重试。'", "'SSH 驗證失敗。Antigravity 目前在 Windows 上還無法回應密碼或驗證碼提示：請用 ssh-agent 設定金鑰登入，然後再試一次。'"],
        ["\"That SSH host isn't valid. Enter an alias from your SSH config or a host like user@host or user@host:2222.\"", "'该 SSH 主机无效。请输入 SSH 配置中的别名，或 user@host、user@host:2222 这类主机。'", "'這個 SSH 主機無效。請輸入 SSH 設定中的別名，或 user@host、user@host:2222 這類主機。'"],
        ["\"The host's SSH key is unknown or has changed. Save it with ssh in a terminal. If it changed, ask the host's owner first: the connection may be intercepted.\"", "'主机的 SSH 密钥未知或已更改。请在终端中用 ssh 保存该密钥。如果密钥已更改，请先询问主机所有者：连接可能已被拦截。'", "'主機的 SSH 金鑰不明或已變更。請在終端機中用 ssh 儲存此金鑰。如果金鑰已變更，請先詢問主機擁有者：連線可能遭到攔截。'"],
        ["\"The host's SSH key has changed or isn't trusted. If it changed, ask the host's owner first: the connection may be intercepted.\"", "'主机的 SSH 密钥已更改或不受信任。如果密钥已更改，请先询问主机所有者：连接可能已被拦截。'", "'主機的 SSH 金鑰已變更或未受信任。如果金鑰已變更，請先詢問主機擁有者：連線可能遭到攔截。'"],
        ["`Couldn't connect to the SSH host. Check its name, your network and ssh config (e.g. a ProxyCommand), and that ssh to it works in a terminal${prompts === 'no' ? ' without a prompt' : ''}.`", "`无法连接到 SSH 主机。请检查主机名、网络和 ssh 配置（例如 ProxyCommand），并确认在终端中${prompts === 'no' ? '无需任何提示即可' : '可以'}用 ssh 连接到该主机。`", "`無法連線至 SSH 主機。請檢查主機名稱、網路與 ssh 設定（例如 ProxyCommand），並確認在終端機中${prompts === 'no' ? '不需任何提示就能' : '可以'}用 ssh 連線至該主機。`"],
        ["\"SSH can't use your SSH config file. Fix the problem ssh reports, or choose another config file.\"", "'SSH 无法使用您的 SSH 配置文件。请修复 ssh 报告的问题，或选择其他配置文件。'", "'SSH 無法使用您的 SSH 設定檔。請修正 ssh 回報的問題，或選擇其他設定檔。'"],
        ["'SSH port forwarding failed. Make sure the server allows TCP forwarding (AllowTcpForwarding) for your account, then try again.'", "'SSH 端口转发失败。请确认服务器允许您的账户使用 TCP 转发（AllowTcpForwarding），然后重试。'", "'SSH 連接埠轉送失敗。請確認伺服器允許您的帳戶使用 TCP 轉送（AllowTcpForwarding），然後再試一次。'"],
        ["`The SSH host isn't supported. ${exports.LINUX_HOST_NEEDED} Windows and macOS hosts aren't supported yet.`", "`不支持该 SSH 主机。${exports.LINUX_HOST_NEEDED}目前尚不支持 Windows 和 macOS 主机。`", "`不支援這個 SSH 主機。${exports.LINUX_HOST_NEEDED}目前尚未支援 Windows 與 macOS 主機。`"],
        ["'Another host that shares your home directory runs the Antigravity server. Connect to that host, or connect again and choose Take Over.'", "'另一台共享您主目录的主机正在运行 Antigravity 服务器。请连接到那台主机，或重新连接并选择“接管”。'", "'另一台共用您家目錄的主機正在執行 Antigravity 伺服器。請連線至那台主機，或重新連線並選擇「接管」。'"],
        ["\"Couldn't install the Antigravity server on the SSH host. Make sure it has free disk space, and that it or this computer can download from the internet.\"", "'无法在 SSH 主机上安装 Antigravity 服务器。请确认主机有可用的磁盘空间，并且主机或这台电脑能从互联网下载。'", "'無法在 SSH 主機上安裝 Antigravity 伺服器。請確認主機有可用的磁碟空間，且主機或這台電腦能從網際網路下載。'"],
        ["`The Antigravity server failed to start on the SSH host. See its log in ~/${types_1.REMOTE_INSTALL_ROOT}/data on that host.`", "`Antigravity 服务器无法在 SSH 主机上启动。请查看该主机 ~/${types_1.REMOTE_INSTALL_ROOT}/data 中的日志。`", "`Antigravity 伺服器無法在 SSH 主機上啟動。請查看該主機 ~/${types_1.REMOTE_INSTALL_ROOT}/data 中的記錄檔。`"],
        ["'The Antigravity server on the SSH host stopped. Reconnect to start it again.'", "'SSH 主机上的 Antigravity 服务器已停止。请重新连接以再次启动。'", "'SSH 主機上的 Antigravity 伺服器已停止。請重新連線以再次啟動。'"],
        ["'The SSH connection closed. Check your network connection, then reconnect.'", "'SSH 连接已关闭。请检查网络连接，然后重新连接。'", "'SSH 連線已關閉。請檢查網路連線，然後重新連線。'"],
        ["'The connection was cancelled.'", "'连接已取消。'", "'已取消連線。'"],
        ["\"Couldn't connect to the SSH host. Try ssh to it in a terminal, and see the Antigravity log for details.\"", "'无法连接到 SSH 主机。请在终端中尝试用 ssh 连接，并查看 Antigravity 日志了解详情。'", "'無法連線至 SSH 主機。請在終端機中試著用 ssh 連線，並查看 Antigravity 記錄檔了解詳情。'"]
    ],
    // 连接画面的进度状态与对话框显示的错误消息
    'dist/remote/sshConnection.js': [
        ["`Connecting to ${this.label}…`", "`正在连接到 ${this.label}…`", "`正在連線至 ${this.label}…`"],
        ["'Waiting for your answer…'", "'正在等待您的回答…'", "'正在等待您的回應…'"],
        ["`Uploading the Antigravity server to ${this.label}…`", "`正在将 Antigravity 服务器上传到 ${this.label}…`", "`正在將 Antigravity 伺服器上傳至 ${this.label}…`"],
        ["`Connecting to the Antigravity server on ${this.label}…`", "`正在连接 ${this.label} 上的 Antigravity 服务器…`", "`正在連線至 ${this.label} 上的 Antigravity 伺服器…`"],
        ["`Checking ${label}…`", "`正在检查 ${label}…`", "`正在檢查 ${label}…`"],
        ["`Waiting for another window to finish installing on ${label}…`", "`正在等待另一个窗口在 ${label} 上完成安装…`", "`正在等待另一個視窗在 ${label} 上完成安裝…`"],
        ["`Replacing an invalid server binary on ${label}…`", "`正在替换 ${label} 上无效的服务器程序…`", "`正在替換 ${label} 上無效的伺服器執行檔…`"],
        ["`Downloading the Antigravity server on ${label}…`", "`正在 ${label} 上下载 Antigravity 服务器…`", "`正在 ${label} 上下載 Antigravity 伺服器…`"],
        ["`Installed the Antigravity server on ${label}.`", "`已在 ${label} 上安装 Antigravity 服务器。`", "`已在 ${label} 上安裝 Antigravity 伺服器。`"],
        ["`Starting the Antigravity server on ${label}…`", "`正在 ${label} 上启动 Antigravity 服务器…`", "`正在 ${label} 上啟動 Antigravity 伺服器…`"],
        ["`Connecting to the running server on ${label}…`", "`正在连接 ${label} 上运行中的服务器…`", "`正在連線至 ${label} 上執行中的伺服器…`"],
        ["`Restarting the Antigravity server on ${label}…`", "`正在重启 ${label} 上的 Antigravity 服务器…`", "`正在重新啟動 ${label} 上的 Antigravity 伺服器…`"],
        ["`Checking whether another host still runs your Antigravity server…`", "`正在检查是否还有其他主机在运行您的 Antigravity 服务器…`", "`正在檢查是否仍有其他主機在執行您的 Antigravity 伺服器…`"],
        ["`Moving the Antigravity server to ${label}…`", "`正在将 Antigravity 服务器移至 ${label}…`", "`正在將 Antigravity 伺服器移至 ${label}…`"],
        ["`Timed out connecting to ${this.label}.`", "`连接 ${this.label} 超时。`", "`連線至 ${this.label} 逾時。`"],
        ["'Connection cancelled.'", "'连接已取消。'", "'已取消連線。'"],
        ["'Not connected.'", "'未连接。'", "'尚未連線。'"],
        ["exports.PROMPT_CANCELLED = 'Sign-in cancelled.';", "exports.PROMPT_CANCELLED = '已取消登录。';", "exports.PROMPT_CANCELLED = '已取消登入。';"],
        ["`The Antigravity server on ${this.label} has no HTTP port to stop it through.`", "`${this.label} 上的 Antigravity 服务器没有可用于停止它的 HTTP 端口。`", "`${this.label} 上的 Antigravity 伺服器沒有可用來停止它的 HTTP 連接埠。`"],
        ["`The Antigravity server on ${this.label} refused to stop (HTTP ${status}).`", "`${this.label} 上的 Antigravity 服务器拒绝停止（HTTP ${status}）。`", "`${this.label} 上的 Antigravity 伺服器拒絕停止（HTTP ${status}）。`"],
        ["`Could not confirm that the Antigravity server on ${this.label} stopped` +", "`无法确认 ${this.label} 上的 Antigravity 服务器已停止` +", "`無法確認 ${this.label} 上的 Antigravity 伺服器已停止` +"],
        ["(rpcError ? ` (${this.redact((0, types_1.sanitizeRemoteText)(rpcError))}).` : '.')", "(rpcError ? `（${this.redact((0, types_1.sanitizeRemoteText)(rpcError))}）。` : '。')", "(rpcError ? `（${this.redact((0, types_1.sanitizeRemoteText)(rpcError))}）。` : '。')"],
        ["why = 'it has no HTTP port';", "why = '它没有 HTTP 端口';", "why = '它沒有 HTTP 連接埠';"],
        ["why = 'an invalid answer';", "why = '响应无效';", "why = '回應無效';"],
        ["`The Antigravity server on ${this.label} didn't give this window a sign-in token (${why}).`", "`${this.label} 上的 Antigravity 服务器没有给此窗口登录令牌（${why}）。`", "`${this.label} 上的 Antigravity 伺服器沒有提供此視窗的登入權杖（${why}）。`"],
        ["`${this.label} did not start the setup within ${Math.round(firstLineMs / 1000)} s. ` +", "`${this.label} 未在 ${Math.round(firstLineMs / 1000)} 秒内开始设置。` +", "`${this.label} 未在 ${Math.round(firstLineMs / 1000)} 秒內開始設定。` +"],
        ["'ssh (e.g. a ProxyCommand or ProxyJump login) or a command in ' +", "'可能是 ssh（例如 ProxyCommand 或 ProxyJump 登录）或 ' +", "'可能是 ssh（例如 ProxyCommand 或 ProxyJump 登入）或 ' +"],
        ["'your shell startup files (e.g. ~/.bashrc) may be waiting for input.'", "'shell 启动文件（例如 ~/.bashrc）中的命令正在等待输入。'", "'shell 啟動檔（例如 ~/.bashrc）中的指令正在等待輸入。'"],
        ["\"Couldn't answer ssh's prompt.\"", "'无法应答 ssh 的提示。'", "'無法回應 ssh 的提示。'"],
        ["`Could not run \"${sshBin}\". Install OpenSSH or set ANTIGRAVITY_SSH_BIN.`", "`无法运行“${sshBin}”。请安装 OpenSSH 或设置 ANTIGRAVITY_SSH_BIN。`", "`無法執行「${sshBin}」。請安裝 OpenSSH 或設定 ANTIGRAVITY_SSH_BIN。`"],
        ["`Could not run ssh: ${err.message}`", "`无法运行 ssh：${err.message}`", "`無法執行 ssh：${err.message}`"],
        ["`ssh could not listen on its SOCKS port ${this.socksPort}.`", "`ssh 无法监听其 SOCKS 端口 ${this.socksPort}。`", "`ssh 無法監聽其 SOCKS 連接埠 ${this.socksPort}。`"],
        ["`${this.label} asked for an upload it can't need.`", "`${this.label} 请求了不必要的上传。`", "`${this.label} 要求了不必要的上傳。`"],
        ["`${this.label} sent a line longer than ${MAX_LINE_CHARS} characters.`", "`${this.label} 发送的单行超过 ${MAX_LINE_CHARS} 个字符。`", "`${this.label} 傳送的單行超過 ${MAX_LINE_CHARS} 個字元。`"],
        ["`Neither ${this.label} nor this computer could download the Antigravity server: ${errorMessage(err)}`", "`${this.label} 和这台电脑都无法下载 Antigravity 服务器：${errorMessage(err)}`", "`${this.label} 與這台電腦都無法下載 Antigravity 伺服器：${errorMessage(err)}`"],
        ["`The Antigravity server on ${this.label} stopped.`", "`${this.label} 上的 Antigravity 服务器已停止。`", "`${this.label} 上的 Antigravity 伺服器已停止。`"],
        ["`The connection to ${this.label} was lost: ${describeExit(code, signal, this.stderrTail)}`", "`与 ${this.label} 的连接已中断：${describeExit(code, signal, this.stderrTail)}`", "`與 ${this.label} 的連線已中斷：${describeExit(code, signal, this.stderrTail)}`"],
        ["'The SSH server does not allow port forwarding (AllowTcpForwarding).'", "'SSH 服务器不允许端口转发（AllowTcpForwarding）。'", "'SSH 伺服器不允許連接埠轉送（AllowTcpForwarding）。'"],
        ["`The Antigravity server on ${this.label} did not respond through the SSH tunnel (${(0, types_1.sanitizeRemoteText)(lastErr, 200)}).`", "`${this.label} 上的 Antigravity 服务器未通过 SSH 隧道响应（${(0, types_1.sanitizeRemoteText)(lastErr, 200)}）。`", "`${this.label} 上的 Antigravity 伺服器未透過 SSH 通道回應（${(0, types_1.sanitizeRemoteText)(lastErr, 200)}）。`"],
        ["`${this.label} asked to open a sign-in at ${origin} that can't finish on that host, so it was not opened.`", "`${this.label} 要求打开 ${origin} 的登录，但该登录无法在那台主机上完成，因此未打开。`", "`${this.label} 要求開啟 ${origin} 的登入，但該登入無法在那台主機上完成，因此未開啟。`"],
        ["`The sign-in request of the Antigravity server on ${this.label} doesn't match what this app expects, so it was not opened. ` +", "`${this.label} 上的 Antigravity 服务器发出的登录请求与此应用的预期不符，因此未打开。` +", "`${this.label} 上的 Antigravity 伺服器發出的登入要求與此應用程式的預期不符，因此未開啟。` +"],
        ["'Update Antigravity, or restart the server on that host.'", "'请更新 Antigravity，或重启那台主机上的服务器。'", "'請更新 Antigravity，或重新啟動那台主機上的伺服器。'"],
        ["`Local port ${port} is in use, so the sign-in callback can't ` +", "`本地端口 ${port} 已被占用，登录回调无法` +", "`本機連接埠 ${port} 已被占用，登入回呼無法` +"],
        ["`reach ${this.label}. Close the program using it and sign in again. ` +", "`到达 ${this.label}。请关闭占用该端口的程序，然后重新登录。` +", "`抵達 ${this.label}。請關閉占用該連接埠的程式，然後重新登入。` +"],
        ["'The connection was closed.'", "'连接已关闭。'", "'連線已關閉。'"],
        ["'Could not get a free loopback port.'", "'无法取得可用的回环端口。'", "'無法取得可用的回送連接埠。'"],
        ["const how = signal ? `signal ${signal}` : `exit code ${code}`;", "const how = signal ? `信号 ${signal}` : `退出代码 ${code}`;", "const how = signal ? `訊號 ${signal}` : `結束代碼 ${code}`;"],
        ["? `ssh exited (${how}): ${(0, types_1.sanitizeRemoteText)(lastLine, 300)}`", "? `ssh 已退出（${how}）：${(0, types_1.sanitizeRemoteText)(lastLine, 300)}`", "? `ssh 已結束（${how}）：${(0, types_1.sanitizeRemoteText)(lastLine, 300)}`"],
        [": `ssh exited (${how}).`", ": `ssh 已退出（${how}）。`", ": `ssh 已結束（${how}）。`"]
    ],
    // SSH 主机输入框的格式校验
    'dist/remote/sshDestination.js': [
        ["'The user name before \"@\" is missing.'", "'缺少“@”前面的用户名。'", "'缺少「@」前面的使用者名稱。'"],
        ["'The user name must not start with \"-\".'", "'用户名不能以“-”开头。'", "'使用者名稱不得以「-」開頭。'"],
        ["`\"${shown}\" isn't a valid user name.`", "`“${shown}”不是有效的用户名。`", "`「${shown}」不是有效的使用者名稱。`"],
        ["'The host name is missing.'", "'缺少主机名。'", "'缺少主機名稱。'"],
        ["'The host name must not start with \"-\".'", "'主机名不能以“-”开头。'", "'主機名稱不得以「-」開頭。'"],
        ["`\"${host}\" isn't a valid host name.`", "`“${host}”不是有效的主机名。`", "`「${host}」不是有效的主機名稱。`"],
        ["`Invalid port \"${port}\": use a number from 1 to 65535.`", "`端口“${port}”无效：请使用 1 到 65535 之间的数字。`", "`連接埠「${port}」無效：請使用 1 到 65535 之間的數字。`"],
        ["`\"${addr}\" isn't a valid IPv6 address. Write an IPv6 address with a port in brackets, for example [::1]:2222.`", "`“${addr}”不是有效的 IPv6 地址。带端口的 IPv6 地址请用方括号括起，例如 [::1]:2222。`", "`「${addr}」不是有效的 IPv6 位址。帶連接埠的 IPv6 位址請用方括號括住，例如 [::1]:2222。`"],
        ["`Missing \"]\" after the IPv6 address in \"${hostPort}\".`", "`“${hostPort}”中的 IPv6 地址后缺少“]”。`", "`「${hostPort}」中的 IPv6 位址後缺少「]」。`"],
        ["`Invalid percent-encoding in the user name \"${s}\".`", "`用户名“${s}”中的百分号编码无效。`", "`使用者名稱「${s}」中的百分比編碼無效。`"],
        ["'Write \"@\" inside the user name of an ssh:// URI as %40.'", "'ssh:// URI 的用户名中如有“@”，请写成 %40。'", "'ssh:// URI 的使用者名稱中若有「@」，請寫成 %40。'"],
        ["'Write an IPv6 address in an ssh:// URI in brackets, for example ssh://[::1]:2222.'", "'ssh:// URI 中的 IPv6 地址请用方括号括起，例如 ssh://[::1]:2222。'", "'ssh:// URI 中的 IPv6 位址請用方括號括住，例如 ssh://[::1]:2222。'"],
        ["'Enter an SSH host, for example \"devbox\" or \"user@host:2222\".'", "'请输入 SSH 主机，例如“devbox”或“user@host:2222”。'", "'請輸入 SSH 主機，例如「devbox」或「user@host:2222」。'"],
        ["`The SSH host is too long (at most ${MAX_DESTINATION_LENGTH} characters).`", "`SSH 主机过长（最多 ${MAX_DESTINATION_LENGTH} 个字符）。`", "`SSH 主機過長（最多 ${MAX_DESTINATION_LENGTH} 個字元）。`"],
        ["'The SSH host must not start with \"-\".'", "'SSH 主机不能以“-”开头。'", "'SSH 主機不得以「-」開頭。'"],
        ["'The SSH host must not contain spaces or control characters.'", "'SSH 主机不能包含空格或控制字符。'", "'SSH 主機不得包含空格或控制字元。'"],
        ["`The SSH host must not contain ${describeChar(bad[0])}.`", "`SSH 主机不能包含 ${describeChar(bad[0])}。`", "`SSH 主機不得包含 ${describeChar(bad[0])}。`"]
    ],
    // SSH 配置文件检查结果（按中文语序改写句式）
    'dist/remote/sshConfigHosts.js': [
        ["`The SSH config file ${problem}`", "`SSH 配置文件${problem}`", "`SSH 設定檔${problem}`"],
        ["`${shown} isn't a file.`", "`（${shown}）不是文件。`", "`（${shown}）不是檔案。`"],
        ["`${shown} can be changed by others: it must be yours or root's, and not group- or world-writable.`", "`（${shown}）可被他人修改：它必须属于您或 root，且不能允许用户组或所有人写入。`", "`（${shown}）可被他人修改：它必須屬於您或 root，且不得開放群組或所有人寫入。`"],
        ["const NOT_CONFIG = \"isn't an SSH config file\";", "const NOT_CONFIG = '不是 SSH 配置文件';", "const NOT_CONFIG = '不是 SSH 設定檔';"],
        ["const CHOOSE_CONFIG = 'Choose a file of ssh settings, such as ~/.ssh/config.';", "const CHOOSE_CONFIG = '请选择 ssh 配置文件，例如 ~/.ssh/config。';", "const CHOOSE_CONFIG = '請選擇 ssh 設定檔，例如 ~/.ssh/config。';"],
        ["const UNREADABLE = \"is saved in a way ssh can't read\";", "const UNREADABLE = '的保存格式 ssh 无法读取';", "const UNREADABLE = '的儲存格式 ssh 無法讀取';"],
        ["const SAVE_AS_UTF8 = 'Save it as UTF-8 without a byte-order mark.';", "const SAVE_AS_UTF8 = '请另存为不带字节顺序标记（BOM）的 UTF-8。';", "const SAVE_AS_UTF8 = '請另存為不含位元組順序標記（BOM）的 UTF-8。';"],
        ["notConfig(\"it's a binary file\")", "notConfig('这是二进制文件')", "notConfig('這是二進位檔案')"],
        ["notConfig('it holds a key or certificate')", "notConfig('其中包含密钥或证书')", "notConfig('其中包含金鑰或憑證')"],
        ["notConfig('it holds SSH public keys, like a .pub or authorized_keys file')", "notConfig('其中包含 SSH 公钥，例如 .pub 或 authorized_keys 文件')", "notConfig('其中包含 SSH 公開金鑰，例如 .pub 或 authorized_keys 檔案')"],
        ["notConfig('it lists SSH host keys, like known_hosts')", "notConfig('其中列出 SSH 主机密钥，例如 known_hosts')", "notConfig('其中列出 SSH 主機金鑰，例如 known_hosts')"],
        ["why: 'it starts with a byte-order mark',", "why: '它以字节顺序标记（BOM）开头',", "why: '它以位元組順序標記（BOM）開頭',"],
        ["why: \"it's saved as UTF-16\",", "why: '它以 UTF-16 保存',", "why: '它以 UTF-16 儲存',"],
        ["return `${file} ${what}: ${why}. ${fix}`;", "return `${file} ${what}：${why}。${fix}`;", "return `${file} ${what}：${why}。${fix}`;"],
        ["invalid('must be a path on one line.')", "invalid('必须是单行路径。')", "invalid('必須是單行路徑。')"],
        ["`must be an absolute path (got ${shown}).`", "`必须是绝对路径（当前为 ${shown}）。`", "`必須是絕對路徑（目前為 ${shown}）。`"],
        ["`must be on one of this computer's drives (got ${shown}).`", "`必须位于这台电脑的磁盘上（当前为 ${shown}）。`", "`必須位於這台電腦的磁碟機上（目前為 ${shown}）。`"],
        ["`can't be on a network share (${shown}).`", "`不能位于网络共享上（${shown}）。`", "`不得位於網路共用資料夾（${shown}）。`"],
        ["`${shown} doesn't exist or can't be read.`", "`（${shown}）不存在或无法读取。`", "`（${shown}）不存在或無法讀取。`"],
        ["`${shown} is now a link: choose the file again.`", "`（${shown}）现在是链接：请重新选择文件。`", "`（${shown}）現在是連結：請重新選擇檔案。`"],
        ["`${shown} is over 4 MiB.`", "`（${shown}）超过 4 MiB。`", "`（${shown}）超過 4 MiB。`"]
    ],
    // 连接前的主机与配置文件路径检查
    'dist/remote/sshBridge.js': [
        ["'The SSH config file must be a path of at most 4 KiB.'", "'SSH 配置文件路径最长 4 KiB。'", "'SSH 設定檔路徑最長 4 KiB。'"],
        ["'Enter an SSH host, for example \"devbox\" or \"user@host\".'", "'请输入 SSH 主机，例如“devbox”或“user@host”。'", "'請輸入 SSH 主機，例如「devbox」或「user@host」。'"]
    ],
    // Windows：在 WSL 中打开文件夹时的提示
    'dist/wsl.js': [
        ["`This folder belongs to the WSL distro \"${unc[1]}\", but this window is connected to \"${distro}\".`", "`此文件夹属于 WSL 发行版“${unc[1]}”，但此窗口连接的是“${distro}”。`", "`此資料夾屬於 WSL 發行版「${unc[1]}」，但此視窗連線的是「${distro}」。`"],
        ["'This folder is on the Windows filesystem. Accessing it from WSL (via /mnt) can be slow — for best performance keep projects inside the WSL filesystem.'", "'此文件夹位于 Windows 文件系统中。从 WSL（通过 /mnt）访问可能较慢；为获得最佳性能，请将项目放在 WSL 文件系统中。'", "'此資料夾位於 Windows 檔案系統。從 WSL（透過 /mnt）存取可能較慢；為了最佳效能，請將專案放在 WSL 檔案系統中。'"],
        ["`This location cannot be opened in WSL: ${winPath}`", "`无法在 WSL 中打开此位置：${winPath}`", "`無法在 WSL 中開啟此位置：${winPath}`"]
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
