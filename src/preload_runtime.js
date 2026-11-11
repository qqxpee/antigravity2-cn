(() => {
    // V13.0 模块化表驱动物理隔离引擎 (原生独立 JS 运行时)
    const USE_TW = __USE_TW_PLACEHOLDER__;
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
    const CODE_ISOLATION_SELECTOR = 'pre, code, .monaco-editor, .cm-editor, .cm-line, [contenteditable="true"], [contenteditable="plaintext-only"], [contenteditable=""], [data-lexical-editor], .terminal, .xterm, .code-line, .code-block, .line-content, [aria-label="File Viewer"], [aria-label="文件查看器"], [aria-label="檔案檢視器"], [data-file-uri], [data-uri], [class*="diffEditor"], .token, .hljs, [class*="mtk"], .font-mono, [data-quotable-inline="true"], .context-scope-mention, [data-testid="file-title-name"], [data-testid="entity-pill"], [data-project-card="true"], [data-testid="conversation-row-sidebar"] span.truncate, [translate="no"], .notranslate, .md-divider-spacing, .cursor-edit, [data-testid="user-input-step"] [data-quotable="true"], [data-testid="user-input-step"] .whitespace-pre-wrap, [data-testid="planner-response-text"], [data-testid="thinking-collapsible-trigger"] + div, [data-testid="thinking-collapsible-trigger"] ~ div';

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
        return s.replace(/\s+/g, ' ').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...').trim();
    }

    function translateWithShortcut(val) {
        if (!val) return null;
        const match = val.match(/^(.+?)\s*\(((?:Ctrl|Cmd|Alt|Shift|⌘|⌥|⇧|⌃)\+?[^)]*|Enter|Escape|Esc|Space|Tab|Backspace|Delete|⏎|Aa|ab|\.\*|-|0|[a-zA-Z0-9])\)$/i);
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
        if (/\s*\((?:Default|預設|默认)\)$/i.test(trimmed)) {
            trimmed = trimmed.replace(/\s*\((?:Default|預設|默认)\)$/i, '').trim();
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
        return /^[a-zA-Z]:[\\/]/.test(s) || /^[\\/~].*[\\/]/.test(s) || /[\\/]SKILL\.md/i.test(s) || /[\\/]\.gemini[\\/]/i.test(s) || /^file:\/\//i.test(s);
    }

    function formatUsageDuration(value) {
        const text = value.trim();
        const tokens = /([0-9]+(?:\.[0-9]+)?)\s*(years?|yr|months?|mo|weeks?|w|days?|d|hours?|h|minutes?|min|m|seconds?|sec|s)(?![a-z])/gi;
        const parts = [];
        let end = 0;
        for (const match of text.matchAll(tokens)) {
            const gap = text.slice(end, match.index);
            if (!/^[\s,]*$/.test(gap) && !(end === 0 && gap.trim() === '<')) return null;
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
        const limit = value.match(/^([0-9]+)(?:h|[- ]hours?)\s+limit$/i);
        if (limit) return limit[1] + (USE_TW ? ' 小時上限' : ' 小时限额');
        const remaining = value.match(/^([0-9]+(?:\.[0-9]+)?\s*%|%)\s+left$/i);
        if (remaining) return remaining[1] + (USE_TW ? ' 剩餘' : ' 剩余');
        const reset = value.match(/^(?:Resets|Refreshes)\s+in\s+(.+)$/i);
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
            label = (menu.getAttribute('aria-labelledby') || '').trim().split(/\s+/).map(id => {
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
                if ((menu.getAttribute('aria-labelledby') || '').split(/\s+/).includes(target.id)) {
                    translateNode(menu);
                }
            }
        }
    }

    // ==========================================
    // 声明式动态正则规则表 (Table-Driven Dynamic Rules)
    // ==========================================
    const UNIT_MAP = {
        s: ['秒', '秒'],
        m: ['分钟', '分鐘'],
        h: ['小时', '小時'],
        d: ['天', '天'],
        w: ['周', '週'],
        mo: ['个月', '個月'],
        yr: ['年', '年']
    };

    const DYNAMIC_RULES = [
        // 列表展开 / 收起明细
        [/^Show\s+(\d+)\s+more(\s+(results?|items?|commands?|options?))?(\.\.\.|…)?$/i, (m, num, p2, type) => {
            if (type) {
                if (/result/i.test(type)) return USE_TW ? ("顯示另外 " + num + " 個結果...") : ("显示另外 " + num + " 个结果...");
                if (/command/i.test(type)) return USE_TW ? ("顯示另外 " + num + " 個指令...") : ("显示另外 " + num + " 个命令...");
                if (/item/i.test(type)) return USE_TW ? ("顯示另外 " + num + " 個項目...") : ("显示另外 " + num + " 个项目...");
                if (/option/i.test(type)) return USE_TW ? ("顯示另外 " + num + " 個選項...") : ("显示另外 " + num + " 个选项...");
            }
            return USE_TW ? ("顯示另外 " + num + " 個...") : ("显示另外 " + num + " 个...");
        }],
        [/^Show\s+(\d+)\s+breakdown(s)?$/i, (m, num) => USE_TW ? ("顯示 " + num + " 項明細") : ("显示 " + num + " 项细目")],
        [/^Hide\s+breakdown(s)?$/i, () => USE_TW ? "收起明細" : "收起细目"],
        [/^Show\s+breakdown(s)?$/i, () => USE_TW ? "顯示明細" : "显示细目"],
        [/^(?:\+\s*)?See\s+(\d+)\s+more(?:\s+(.+))?$/i, (m, num) => {
            const hasPlus = /^\+/.test(m);
            return (hasPlus ? "+ " : "") + (USE_TW ? ("展開另外 " + num + " 項") : ("展开另外 " + num + " 项"));
        }],
        [/^See\s+more\s+in\s+(.+)$/i, (m, name) => USE_TW ? ("在 " + name + " 中展開更多") : ("在 " + name + " 中展开更多")],
        [/^See all\s*\((\d+)\)$/i, (m, num) => USE_TW ? ("顯示全部 (" + num + ")") : ("显示全部 (" + num + ")")],

        // 会话删除与统计
        [/^(?:(Permanently delete)\s+)?(.+?)\s+including\s+(\d+)\s+active conversations?([.。])?$/i, (m, del, name, count, dot) => {
            const delPrefix = del ? (USE_TW ? "永久刪除 " : "永久删除 ") : "";
            const suffix = dot ? "。" : "";
            return delPrefix + name + (USE_TW ? ("（包含 " + count + " 個活躍對話）") : ("（包含 " + count + " 个活跃会话）")) + suffix;
        }],
        [/^including\s+(\d+)\s+active conversations?([.。])?$/i, (m, count, dot) => (USE_TW ? ("包含 " + count + " 個活躍對話") : ("包含 " + count + " 个活跃会话")) + (dot ? "。" : "")],
        [/^(\d+)\s+active conversations?([.。])?$/i, (m, count, dot) => (USE_TW ? (count + " 個活躍對話") : (count + " 个活跃会话")) + (dot ? "。" : "")],
        [/^Are you sure you want to delete (the |this )?project (.+?)\??$/i, (m, article, name) => USE_TW ? ("您確定要刪除專案 " + name + " 嗎？") : ("您确定要删除项目 " + name + " 吗？")],
        [/^Marked\s+(\d+)\s+conversations?\s+as\s+read$/i, (m, count) => USE_TW ? ("已將 " + count + " 個對話標記為已讀") : ("已将 " + count + " 个会话标记为已读")],
        [/^No more older messages,\s*showing\s+(\d+)\s+of\s+(\d+)$/i, (m, a, b) => USE_TW ? ("沒有更多歷史訊息，目前顯示 " + a + " / " + b + " 則") : ("没有更多历史消息，当前显示 " + a + " / " + b + " 条")],

        // 问候语与语音交互
        [/^Hi\s+(.+?),\s+what can we get done today\??$/i, (m, name) => USE_TW ? ("嗨 " + name + "，今天有什麼我們可以一起完成的？") : ("嗨 " + name + "，今天有什么我们可以一起完成的？")],
        [/^What can we get done today\??$/i, () => USE_TW ? "今天有什麼我們可以一起完成的？" : "今天有什么我们可以一起完成的？"],
        [/^Good to see you(?:,\s*(.+?))?[.!]*$/i, (m, name) => (name && name.trim()) ? (USE_TW ? ("很高興見到您，" + name.trim() + "。") : ("很高兴见到您，" + name.trim() + "。")) : (USE_TW ? "很高興見到您。" : "很高兴见到您。")],
        [/^Welcome back(?:,\s*(.+?))?[.!]*$/i, (m, name) => (name && name.trim()) ? (USE_TW ? ("歡迎回來，" + name.trim() + "。") : ("欢迎回来，" + name.trim() + "。")) : (USE_TW ? "歡迎回來。" : "欢迎回来。")],
        [/^Hello,\s*(.+?)[.!]*$/i, (m, name) => USE_TW ? ("你好，" + name.trim() + "。") : ("你好，" + name.trim() + "。")],
        [/^Hello[.!]$/i, () => "你好。"],
        [/^Hi there[.!]*$/i, () => "您好。"],
        [/^Hi\s+([^\s.!]+)[.!]*$/i, (m, name) => name.toLowerCase() === 'there' ? "您好。" : (USE_TW ? ("嗨，" + name.trim() + "。") : ("嗨，" + name.trim() + "。"))],
        [/^(.+?),\s+voice\s+(\d+)\s+of\s+(\d+)$/i, (m, name, curr, total) => USE_TW ? (name + "，聲音 " + curr + " / " + total) : (name + "，音色 " + curr + " / " + total)],
        [/^Voice\s+speed,\s+([0-9.]+x)$/i, (m, spd) => USE_TW ? ("語速，" + spd) : ("语速，" + spd)],

        // 按钮与快捷提示
        [/^Send message\s+(Enter|⏎|\u23ce)$/i, (m, key) => (USE_TW ? "發送消息 " : "发送消息 ") + key],
        [/^Queue message\s+(Enter|⏎|\u23ce)$/i, (m, key) => (USE_TW ? "排隊發送消息 " : "排队发送消息 ") + key],
        [/^Select all in$/i, () => USE_TW ? "全選 " : "全选 "],
        [/^Uses your local clone,$/i, () => USE_TW ? "使用本機複製版本，" : "使用本地克隆版本，"],
        [/^to have the agent generate a plan\.?$/i, () => USE_TW ? "讓代理生成計劃。" : "让智能体生成计划。"],

        // 配额刷新与 AI 额度提示
        [/^(?:Refreshes|You have (?:used (?:some|all) of|reached) your (?:weekly|5-hour) limit, it will fully refresh) in (\d+) days?, (\d+) hours?\.?$/i, (m, d, h) => USE_TW ? (d + " 天 " + h + " 小時後更新") : (d + " 天 " + h + " 小时后刷新")],
        [/^(?:Refreshes|You have (?:used (?:some|all) of|reached) your (?:weekly|5-hour) limit, it will fully refresh) in (\d+) hours?, (\d+) minutes?\.?$/i, (m, h, min) => USE_TW ? (h + " 小時 " + min + " 分鐘後更新") : (h + " 小时 " + min + " 分钟后刷新")],
        [/^(?:Refreshes|You have (?:used (?:some|all) of|reached) your (?:weekly|5-hour) limit, it will fully refresh) in (\d+) days?\.?$/i, (m, d) => USE_TW ? (d + " 天後更新") : (d + " 天后刷新")],
        [/^(?:Refreshes|You have (?:used (?:some|all) of|reached) your (?:weekly|5-hour) limit, it will fully refresh) in (\d+) hours?\.?$/i, (m, h) => USE_TW ? (h + " 小時後更新") : (h + " 小时后刷新")],
        [/^(?:Refreshes|You have (?:used (?:some|all) of|reached) your (?:weekly|5-hour) limit, it will fully refresh) in (\d+) minutes?\.?$/i, (m, min) => USE_TW ? (min + " 分鐘後更新") : (min + " 分钟后刷新")],
        [/^(?:Refreshes|You have (?:used (?:some|all) of|reached) your (?:weekly|5-hour) limit, it will fully refresh) in less than a minute\.?$/i, () => USE_TW ? "不到 1 分鐘後更新" : "不到 1 分钟后刷新"],
        [/^(?:Refreshes|You have (?:used (?:some|all) of|reached) your (?:weekly|5-hour) limit, it will fully refresh) in a few seconds\.?$/i, () => USE_TW ? "幾秒後更新" : "几秒后刷新"],
        [/^Available AI Credits: (\d+)$/i, (m, num) => USE_TW ? ("可用 AI 額度: " + num) : ("可用 AI 额度: " + num)],
        [/^Your plan's baseline quota will refresh on (.+?)\.?\s*To continue using this model now, enable AI Credit overages\.?$/i, (m, when) => USE_TW ? ("您方案的基準配額將於 " + when + " 刷新。如需立即繼續使用此模型，請啟用 AI 點數超額使用。") : ("您方案的基础配额将于 " + when + " 刷新。如需立即继续使用此模型，请启用 AI 额度超量使用。")],
        [/^You have hit your weekly limit, it refreshes in (.+?)\. If on a supported paid plan, you can use AI credits in the interim or upgrade to a higher tier\.$/i, (m, when) => USE_TW ? ("您已達到每週額度限制，將於 " + when + " 刷新。若您使用受支援的付費方案，可在此期間使用 AI 點數，或升級至更高層級。") : ("您已达到每周额度限制，将于 " + when + " 刷新。若您使用受支持的付费计划，可在此期间使用 AI 额度，或升级至更高层级。")],
        [/^You have hit your weekly limit, the (\d+)-hour limit does not currently apply\. Your weekly limit will fully refresh in (.+?)\.$/i, (m, h, when) => USE_TW ? ("您已達到每週額度限制，" + h + " 小時限制目前不適用。您的每週額度限制將於 " + when + " 完全更新。") : ("您已达到每周额度限制，" + h + " 小时限制目前不适用。您的每周额度限制将于 " + when + " 完全刷新。")],

        // 预设、权限与工具 Token 预算
        [/^Learn more about$/i, () => USE_TW ? "瞭解更多關於" : "了解更多关于"],
        [/^Learn more about (.+)$/i, (m, p) => {
            let translatedPreset = p;
            const pLow = p.toLowerCase();
            if (pLow === 'default' || pLow.includes('默认') || pLow.includes('預設')) translatedPreset = USE_TW ? "預設 (Default)" : "默认 (Default)";
            else if (pLow === 'inherit global' || pLow.includes('继承全局') || pLow.includes('繼承全域')) translatedPreset = USE_TW ? "繼承全域 (Inherit Global)" : "继承全局 (Inherit Global)";
            else if (pLow === 'full machine' || pLow.includes('全机') || pLow.includes('全機')) translatedPreset = USE_TW ? "全機存取 (Full Machine)" : "全机访问 (Full Machine)";
            else if (pLow === 'turbo mode' || pLow.includes('极速') || pLow.includes('極速')) translatedPreset = USE_TW ? "極速模式 (Turbo Mode)" : "极速模式 (Turbo Mode)";
            else if (pLow === 'custom' || pLow.includes('自定义') || pLow.includes('自訂')) translatedPreset = USE_TW ? "自訂 (Custom)" : "自定义 (Custom)";
            return USE_TW ? ("瞭解更多關於 " + translatedPreset + " 的詳細資訊") : ("了解更多关于 " + translatedPreset + " 的信息");
        }],
        [/^Yes, and always allow '(.+)' in this project$/i, (m, cmd) => USE_TW ? ("是，且在此專案中一律允許執行 '" + cmd + "'") : ("是，且在此项目中始终允许运行 '" + cmd + "'")],
        [/^Yes, and always allow '(.+)'$/i, (m, cmd) => USE_TW ? ("是，且一律允許執行 '" + cmd + "'") : ("是，且始终允许运行 '" + cmd + "'")],
        [/^(\d+) tools? enabled$/i, (m, num) => USE_TW ? (num + " 個工具已啟用") : (num + " 个工具已启用")],
        [/^Hide\s+tools$/i, () => "收起工具"],
        [/^(\d+)\s+tools$/i, (m, num) => num + (USE_TW ? " 個工具" : " 个工具")],
        [/^(\d+)\s+tools?\s+excluded$/i, (m, num) => num + (USE_TW ? " 個工具已排除" : " 个工具已排除")],
        [/^Exceeded the rules token budget\.\s+Full rule content\s+\(([\d,]+)\s+tokens?\)\s+was replaced with a lightweight file-path pointer in context\.$/i, (m, num) => USE_TW ? ("已超出規則 Token 預算。完整規則內容 (" + num + " 個 Token) 已在上下文中替換為輕量級檔案路徑指標。") : ("已超出规则 Token 预算。完整规则内容 (" + num + " 个 Token) 已在上下文中替换为轻量级文件路径指针。")],
        [/^All tools in this MCP server\s+\(([\d,]+)\s+tokens?\)\s+exceeded the customization budget and were excluded from context\.$/i, (m, num) => USE_TW ? ("此 MCP 伺服器中的所有工具 (" + num + " 個 Token) 均已超出自訂項預算，並已從上下文中排除。") : ("此 MCP 服务器中的所有工具 (" + num + " 个 Token) 均已超出自定义项预算，并已从上下文中排除。")],
        [/^(\d+)\s+tools?\s+in this MCP server\s+\(([\d,]+)\s+tokens?\)\s+exceeded the customization budget and were excluded from context\.$/i, (m, tCount, num) => USE_TW ? ("此 MCP 伺服器中有 " + tCount + " 個工具 (" + num + " 個 Token) 超出自訂項預算，並已從上下文中排除。") : ("此 MCP 服务器中有 " + tCount + " 个工具 (" + num + " 个 Token) 超出自定义项预算，并已从上下文中排除。")],
        [/^Exceeded the customization token budget\s+\(([\d,]+)\s+tokens?\)\s+and was excluded from context\.$/i, (m, num) => USE_TW ? ("超出自訂項 Token 預算 (" + num + " 個 Token)，已從上下文中排除。") : ("超出自定义项 Token 预算 (" + num + " 个 Token)，已从上下文中排除。")],
        [/^(Rules|Skills|Mcp Tools): ([\d,]+) tokens$/i, (m, kind, num) => {
            const kindMap = { "Rules": USE_TW ? "規則" : "规则", "Skills": "技能", "Mcp Tools": "MCP 工具" };
            return (kindMap[kind] || kind) + "：" + num + " Token";
        }],

        // 版本、时间戳与超时报错
        [/^Version\s+([\d.]+)$/i, (m, v) => "版本 " + v],
        [/^just now$/i, () => USE_TW ? "剛剛" : "刚刚"],
        [/^(\d+)(s|m|h|d|w|mo|yr)\s+ago$/i, (m, num, unit) => {
            const pair = UNIT_MAP[unit.toLowerCase()];
            return num + (pair ? pair[USE_TW ? 1 : 0] : unit) + "前";
        }],
        [/^(.+?): context deadline exceeded$/i, (m, prefix) => prefix + (USE_TW ? ": 要求逾時 (context deadline exceeded)" : ": 请求超时 (context deadline exceeded)")],
        [/^(.+?): i\/o timeout$/i, (m, prefix) => prefix + (USE_TW ? ": I/O 逾時 (i/o timeout)" : ": I/O 超时 (i/o timeout)")],

        // 远程 MCP 通用描述句式
        [/^The (.+?) remote MCP server lets you access and run (.+?) tools to (.+)$/i, (m, name, tools) => name + (USE_TW ? " 遠端 MCP 伺服器可讓您存取並執行 " : " 远程 MCP 服务器可让您访问并运行 ") + tools + (USE_TW ? " 工具以進行管理與操作。" : " 工具以进行管理与操作。")],
        [/^The (.+?) remote MCP server lets you manage (.+) resources\.?$/i, (m, name, res) => name + (USE_TW ? " 遠端 MCP 伺服器可讓您管理 " : " 远程 MCP 服务器可让您管理 ") + res + (USE_TW ? " 資源。" : " 资源。")],
        [/^The (.+?) remote MCP server (allows you to|lets you) (.+)$/i, (m, name, verb, rest) => {
            const text = rest.replace(/enroll projects/gi, USE_TW ? "註冊專案" : "注册项目")
                             .replace(/generate audit and scope reports/gi, USE_TW ? "產生稽核與範圍報告" : "生成审计与范围报告")
                             .replace(/check resource enrollment statuses/gi, USE_TW ? "檢查資源註冊狀態" : "检查资源注册状态")
                             .replace(/in the (.+?) region/gi, (rm, r) => (USE_TW ? "在 " + r + " 區域" : "在 " + r + " 区域"));
            return name + (USE_TW ? " 遠端 MCP 伺服器允許您 " : " 远程 MCP 服务器允许您 ") + text;
        }],

        // 反馈、思考状态、浏览器安全警告与步骤汇总
        [/^Send feedback as(\s+(.+))?$/i, (m, p1, email) => email ? ("以 " + email + (USE_TW ? " 身分傳送意見回饋" : " 身份发送反馈")) : (USE_TW ? "以此身分傳送意見回饋：" : "以如下身份发送反馈：")],
        [/^(Thought|Thinking|Worked) for\s+(.+)$/i, (m, verb, dur) => {
            const vZh = /^Thought/i.test(verb) ? "已思考 " : (/^Thinking/i.test(verb) ? "正在思考 " : "已工作 ");
            const dZh = dur.trim().replace(/(\d+)\s*h(?:ours?|r)?/gi, USE_TW ? "$1 小時" : "$1 小时").replace(/(\d+)\s*m(?:inutes?|in)?/gi, USE_TW ? "$1 分鐘" : "$1 分钟").replace(/(\d+)\s*s(?:econds?|ec)?/gi, "$1 秒");
            return vZh + dZh;
        }],
        [/^Low contrast ratio \(([^)]+)\)\.\s*Text may be hard to read\.?$/i, (m, ratio) => USE_TW ? ("對比度過低 (" + ratio + ")，文字可能難以閱讀。") : ("对比度过低 (" + ratio + ")，文字可能难以阅读。")],
        [/^Preview unavailable\s*[—–-]\s*(.+)$/i, (m, reason) => (USE_TW ? "預覽不可用 — " : "预览不可用 — ") + reason],
        [/^Proceed to\s+(.+?)\s+\(unsafe\)$/i, (m, host) => USE_TW ? ("繼續前往 " + host + "（不安全）") : ("继续前往 " + host + "（不安全）")],
        [/^\(?for example, passwords, messages, or credit cards\)?\.?$/i, () => USE_TW ? "（例如：密碼、訊息或信用卡）。" : "（例如：密码、通讯内容或信用卡）。"],
        [/^may sign you out of this site\.?$/i, () => USE_TW ? "可能會導致您退出此網站。" : "可能会导致您退出此网站。"],
        [/^normally uses encryption to protect your information\. When the browser tried to connect to$/i, () => USE_TW ? "通常使用加密技術來保護您的資訊。當瀏覽器本次嘗試連線至 " : "通常使用加密技术来保护您的信息。当浏览器本次尝试连接到 "],
        [/^this time, the website sent back unusual and incorrect credentials\.?$/i, () => USE_TW ? " 時，該網站傳回了異常且不正確的憑證。" : " 时，该网站发回了异常且不正确的凭据。"],
        [/^(?:(Exploring|Explored|Editing|Edited|Running|Ran)\s+)?(\d+)\s+(files?|folders?|searches?|commands?|tasks?|pages?|browsers?|images?|actions?|artifacts?)(?:,\s*(?:(Exploring|Explored|Editing|Edited|Running|Ran)\s+)?(\d+)\s+(files?|folders?|searches?|commands?|tasks?|pages?|browsers?|images?|actions?|artifacts?))*$/i, (m) => {
            const verbMap = USE_TW
                ? { exploring: '正在探索', explored: '已探索', editing: '正在編輯', edited: '已編輯', running: '正在執行', ran: '已執行' }
                : { exploring: '正在探索', explored: '已探索', editing: '正在编辑', edited: '已编辑', running: '正在运行', ran: '已运行' };
            const nounMap = USE_TW
                ? { file: '個檔案', files: '個檔案', folder: '個資料夾', folders: '個資料夾', search: '次搜尋', searches: '次搜尋', command: '個指令', commands: '個指令', task: '個任務', tasks: '個任務', page: '個網頁', pages: '個網頁', browser: '次瀏覽器操作', browsers: '次瀏覽器操作', image: '張圖片', images: '張圖片', action: '項操作', actions: '項操作', artifact: '個產物', artifacts: '個產物' }
                : { file: '个文件', files: '个文件', folder: '个文件夹', folders: '个文件夹', search: '次搜索', searches: '次搜索', command: '个命令', commands: '个命令', task: '个任务', tasks: '个任务', page: '个网页', pages: '个网页', browser: '次浏览器操作', browsers: '次浏览器操作', image: '张图片', images: '张图片', action: '项操作', actions: '项操作', artifact: '个工件', artifacts: '个工件' };
            return m.split(/\s*,\s*/).map(part => {
                const pm = part.match(/^(?:(Exploring|Explored|Editing|Edited|Running|Ran)\s+)?(\d+)\s+(files?|folders?|searches?|commands?|tasks?|pages?|browsers?|images?|actions?|artifacts?)$/i);
                if (!pm) return part;
                const v = pm[1] ? (verbMap[pm[1].toLowerCase()] || pm[1]) + ' ' : '';
                const n = nounMap[pm[3].toLowerCase()] || pm[3];
                return v + pm[2] + ' ' + n;
            }).join('，');
        }]
,
        // v2.30.0 / v2.31.0 动态提示、引导、语音录音、CEL 与权限文案
        [/^Help us improve (.+)\.$/i, (m, name) => USE_TW ? ("協助我們改進 " + name + "。") : ("帮助我们改进 " + name + "。")],
        [/^Review permissions for (.+)$/i, (m, name) => USE_TW ? ("審查 " + name + " 的權限") : ("审查 " + name + " 的权限")],
        [/^Auth code for (.+)$/i, (m, name) => USE_TW ? (name + " 的授權碼") : (name + " 的授权码")],
        [/^(.+?),\s*(\d+)\s+grants?$/i, (m, label, num) => {
            const normLbl = norm(label);
            const lblZh = map.get(normLbl) || lowerMap.get(normLbl.toLowerCase()) || label;
            return USE_TW ? (lblZh + "，" + num + " 項授權") : (lblZh + "，" + num + " 项授权");
        }],
        [/^Nothing is running on port (\d+)$/i, (m, port) => USE_TW ? ("連接埠 " + port + " 上沒有正在執行的服務") : ("端口 " + port + " 上没有正在运行的服务")],
        [/^Resume the conversation to start its workspace again, then start the server on port (\d+) and retry\.?$/i, (m, port) => USE_TW ? ("請繼續對話以重新啟動其工作區，然後在連接埠 " + port + " 上啟動伺服器並重試。") : ("请继续会话以重新启动其工作区，然后在端口 " + port + " 上启动服务器并重试。")],
        [/^No server is listening on port (\d+) inside the remote workspace\. Start it, or ask the agent to, then retry\.?$/i, (m, port) => USE_TW ? ("遠端工作區內的連接埠 " + port + " 上沒有正在監聽的伺服器。請啟動該伺服器，或讓代理啟動它，然後重試。") : ("远程工作区内的端口 " + port + " 上没有正在监听的服务器。请启动该服务器，或让智能体启动它，然后重试。")],
        [/^(.+?) normally uses encryption to protect your information\. When the browser tried to connect to (.+?) this time, the website sent back unusual and incorrect credentials\.\s*(.*)$/i, (m, host1, host2, tail) => {
            let tailZh = tail;
            if (tail) {
                const tailNorm = norm(tail);
                if (map.has(tailNorm)) tailZh = map.get(tailNorm);
                else if (/^The certificate was rejected \((.+)\)\.$/i.test(tailNorm)) {
                    tailZh = tailNorm.replace(/^The certificate was rejected \((.+)\)\.$/i, (mm, code) => USE_TW ? ("憑證已被拒絕 (" + code + ")。") : ("证书已被拒绝 (" + code + ")。"));
                }
            }
            const baseZh = USE_TW
                ? (host1 + " 通常使用加密技術來保護您的資訊。當瀏覽器本次嘗試連線至 " + host2 + " 時，該網站傳回了異常且不正確的憑證。")
                : (host1 + " 通常使用加密技术来保护您的信息。当浏览器本次尝试连接到 " + host2 + " 时，该网站发回了异常且不正确的凭据。");
            return tailZh ? (baseZh + " " + tailZh) : baseZh;
        }],
        [/^The certificate was rejected \((.+)\)\.$/i, (m, code) => USE_TW ? ("憑證已被拒絕 (" + code + ")。") : ("证书已被拒绝 (" + code + ")。")],
        [/^,?\s*to help us improve and develop\s+(.+?)\s+and other Google machine-learning products and models in accordance with the$/i, (m, name) => USE_TW ? ("，以協助我們改進與開發 " + name + " 及其他 Google 機器學習產品與模型（遵循 ") : ("，以帮助我们改进和开发 " + name + " 及其他 Google 机器学习产品与模型（遵循 ")],
        [/^Get Anything Done with (.+)$/i, (m, name) => "使用 " + name + " 完成任何工作"],
        [/^Customize your experience across the agent, plugins, and product from the settings and marketplace\. We won't show you ads or let advertisers influence what (.+) says\.$/i, (m, name) => USE_TW ? ("在設定與市集中自訂涵蓋代理、外掛程式與產品的使用體驗。我們不會向您顯示廣告，也不會讓廣告商影響 " + name + " 的回答。") : ("在设置和插件市场中自定义涵盖智能体、插件和产品的使用体验。我们不会向您展示广告，也不会让广告商影响 " + name + " 的回答内容。")],
        [/^(.+)'s agents are powerful and will help you get a lot done better and faster than before, but still make sure to verify the actions taken by the agent\.$/i, (m, name) => USE_TW ? (name + " 的代理功能強大，能協助您比以往更好、更快地完成大量工作，但仍請務必核實代理所執行的操作。") : (name + " 的智能体功能强大，能帮助您比以往更好、更快地完成大量工作，但仍请务必核实智能体所执行的操作。")],
        [/^Hey\s+(.+)!$/i, (m, name) => "嗨，" + name + "！"],
        [/^Set up\s+(.+)$/i, (m, name) => (USE_TW ? "設定 " : "设置 ") + name],
        [/^On top of those defaults,\s*(.+?)\s+requests the access below\.$/i, (m, name) => USE_TW ? (" 除上述預設權限外，" + name + " 還要求以下存取權限。") : (" 除上述默认权限外，" + name + " 还请求以下访问权限。")],
        [/^(\d+)\s+calls?\s*·\s*([0-9.]+)\s*MB$/i, (m, num, mb) => USE_TW ? (num + " 次通話 · " + mb + " MB") : (num + " 次通话 · " + mb + " MB")],
        [/^Deleted\s+(\d+)\s+recordings?\s*\(([0-9.]+)\s*MB\)$/i, (m, num, mb) => USE_TW ? ("已刪除 " + num + " 筆錄音紀錄 (" + mb + " MB)") : ("已删除 " + num + " 条录音记录 (" + mb + " MB)")],
        [/^Failed to delete recordings:\s*(.+)$/i, (m, err) => (USE_TW ? "刪除錄音紀錄失敗：" : "删除录音记录失败：") + err],
        [/^This deletes\s+(\d+)\s+call recordings?\s*\(([0-9.]+)\s*MB\)\s+from your machine\.\s*You can't undo this\.$/i, (m, num, mb) => USE_TW ? ("這將從您的本機刪除 " + num + " 筆通話錄音紀錄 (" + mb + " MB)。此操作無法復原。") : ("这将从您的本机删除 " + num + " 条通话录音记录 (" + mb + " MB)。此操作无法撤销。")],
        [/^Step\s+(\d+)\s+of\s+(\d+)$/i, (m, a, b) => "第 " + a + " 步（共 " + b + " 步）"],
        [/^\+(\d+)\s+more$/i, (m, num) => "+" + num + (USE_TW ? " 項更多" : " 项更多")],
        [/^Not referenced by any feature\s*\((\d+)\)$/i, (m, num) => "未被任何功能引用 (" + num + ")"],
        [/^Zipping\s+(.+?)(?:\.\.\.|…)?$/i, (m, name) => (USE_TW ? "正在壓縮 " : "正在压缩 ") + name + "…"],
        [/^To switch accounts,\s*sign out in the\s+(.+?)\s+and sign in again\.$/i, (m, mgr) => {
            const mgrZh = map.get(norm(mgr)) || mgr;
            return USE_TW ? ("如需切換帳號，請在" + mgrZh + "中登出並重新登入。") : ("如需切换账号，请在" + mgrZh + "中退出登录并重新登录。");
        }],
        [/^There are currently no Build with\s+(.+?)\s+plugins available\.$/i, (m, name) => USE_TW ? ("目前尚無可用的 " + name + " 建構外掛程式。") : ("当前暂无可用的 " + name + " 构建插件。")],
        [/^No MCP servers found for\s+"(.+)"$/i, (m, q) => USE_TW ? ("找不到與「" + q + "」相符的 MCP 伺服器") : ("未找到与“" + q + "”匹配的 MCP 服务器")],
    ];

    function translateExactOrDynamic(t) {
        const usageTrans = translateUsageText(t);
        if (usageTrans) return usageTrans;
        const shortcutTrans = translateWithShortcut(t);
        if (shortcutTrans) return shortcutTrans;
        if (map.has(t)) return map.get(t);
        const lower = t.toLowerCase();
        if (lowerMap.has(lower)) return lowerMap.get(lower);
        for (const [regex, replacer] of DYNAMIC_RULES) {
            if (regex.test(t)) return t.replace(regex, replacer);
        }
        return null;
    }

    // 处理受父节点上下文约束的碎片化 DOM 文本
    function translateContextualText(node, originalVal, valNorm) {
        const p = node.parentElement;
        if (!p) return null;
        const pText = p.textContent || '';

        if (/^(\d+)(s|m|h|d|w|mo|yr)$/i.test(valNorm)) {
            return valNorm.replace(/^(\d+)(s|m|h|d|w|mo|yr)$/i, (match, num, unit) => {
                const pair = UNIT_MAP[unit.toLowerCase()];
                let unitStr = pair ? pair[USE_TW ? 1 : 0] : unit;
                if (typeof p.closest === 'function' && p.closest('[data-testid="conversation-row-sidebar"]')) {
                    unitStr += "前";
                }
                return num + unitStr;
            });
        }
        if ((valNorm === 'Card' || valNorm === 'of') && ((typeof p.closest === 'function' && p.closest('[data-testid="card-deck-counter"]')) || (p.getAttribute && p.getAttribute('data-testid') === 'card-deck-counter'))) {
            return valNorm === 'Card' ? "卡片 " : " / ";
        }
        if (pText.includes('For corp passwords (such as')) {
            if (valNorm === 'For corp passwords (such as') return USE_TW ? "如需使用公司密碼（例如 " : "如需使用公司密码（例如 ";
            if (valNorm === 'or') return " 或 ";
            if (valNorm.startsWith('), use an external SSH session')) return valNorm.replace(/^\), use an external SSH session/i, USE_TW ? "），請使用外部 SSH 工作階段" : "），请使用外部 SSH 会话");
            if (valNorm.startsWith('. For non-corp passwords')) return USE_TW ? "。對於非公司密碼或 SSH 密碼複雜密碼，請允許下一次提示並重新執行指令。" : "。对于非公司密码或 SSH 密码短语，请允许下一次提示并重新运行命令。";
        }
        if ((valNorm === 'Type' || valNorm === 'and select') && ((typeof p.closest === 'function' && p.closest('[data-testid="plan-command-fyi-alert"]')) || pText.includes('generate a plan'))) {
            return valNorm === 'Type' ? (USE_TW ? "輸入" : "输入") : (USE_TW ? "並選取" : "并选择");
        }
        if (valNorm === 'and' && (pText.includes('Privacy Policy') || pText.includes('Terms of Service') || pText.includes('隐私政策') || pText.includes('隱私權政策'))) {
            return "以及";
        }
        if (valNorm === 'Variables' && ((typeof p.closest === 'function' && (p.closest('[data-testid="trigger-cel-tokens"]') || p.closest('[data-testid="trigger-cel-optional-section"]'))) || /Target|Fields|Helpers|目标|目標|字段|欄位/.test(pText))) {
            return USE_TW ? "變數" : "变量";
        }
        if ((valNorm === 'Search conversations with' || valNorm === 'in the top left.') && pText.includes('in the top left')) {
            return valNorm === 'Search conversations with' ? (USE_TW ? "使用左上角的" : "可通过左上角的") : (USE_TW ? "搜尋對話。" : "搜索对话。");
        }
        if ((valNorm === 'View archived in the sidebar' || valNorm === 'menu)') && pText.includes('View archived in the sidebar')) {
            return valNorm === 'View archived in the sidebar' ? (USE_TW ? "已歸檔對話可在側邊欄" : "已归档对话可在侧边栏") : (USE_TW ? "選單中查看。" : "菜单中查看。");
        }
        if ((valNorm === 'For help, visit' || valNorm === 'or join the' || valNorm === 'chat space') && pText.includes('chat space')) {
            if (valNorm === 'For help, visit') return USE_TW ? "如需協助，請造訪" : "如需帮助，请访问";
            if (valNorm === 'or join the') return "或加入";
            if (valNorm === 'chat space') return USE_TW ? "聊天空間" : "聊天空间";
        }
        if ((valNorm === 'when working' || valNorm === 'in this project' || valNorm === 'in these conversations') && /when working|Global Permissions|全局权限|全域權限|Global Settings|全局设置|全域設定/.test(pText)) {
            if (valNorm === 'when working') {
                return pText.includes('in this project')
                    ? (USE_TW ? "（在此專案中工作時）" : "（在此项目中工作时）")
                    : (USE_TW ? "（在這些對話中工作時）" : "（在这些会话中工作时）");
            }
            return "";
        }
        if ((valNorm === 'Use' || originalVal === 'Use ') && ((typeof p.closest === 'function' && p.closest('[data-testid="voice-picker-use"]')) || (p.getAttribute && p.getAttribute('data-testid') === 'voice-picker-use'))) {
            return "使用 ";
        }
        if ((valNorm === 'Change' || valNorm === 'Change…' || valNorm === 'Change...') && ((typeof p.closest === 'function' && (p.closest('[data-testid="voice-settings-change"]') || p.closest('[data-testid="builtin-browser-download-dir-change"]'))) || (p.getAttribute && (p.getAttribute('data-testid') === 'voice-settings-change' || p.getAttribute('data-testid') === 'builtin-browser-download-dir-change')))) {
            const hasEllipsis = valNorm.includes('…') || valNorm.includes('...');
            return USE_TW ? (hasEllipsis ? "變更…" : "變更") : (hasEllipsis ? "更改…" : "更改");
        }
        if ((typeof p.closest === 'function' && p.closest('[data-testid="voice-picker"]')) || (p.querySelector && p.querySelector('[data-testid="voice-picker-settings-link"]'))) {
            if (valNorm.startsWith('Powered by Gemini Live')) return USE_TW ? "由 Gemini Live 提供技術支援 · " : "由 Gemini Live 提供技术支持 · ";
            if (valNorm === 'You can change this in') return USE_TW ? "您稍後可在 " : "您稍后可在 ";
            if (valNorm === 'later.') return USE_TW ? " 中變更。" : " 中更改。";
        }
        if ((valNorm === 'Proceed to' || valNorm === '(unsafe)') && /^(?:Proceed to|继续前往|繼續前往)\s+.+\s*(?:\(unsafe\)|（不安全）)$/i.test(pText.trim())) {
            return valNorm === 'Proceed to' ? (USE_TW ? "繼續前往 " : "继续前往 ") : "（不安全）";
        }
        if (valNorm === 'Not referenced by any feature (' && /Not referenced by any feature\s*\(\s*\d+\s*\)/i.test(pText)) {
            return "未被任何功能引用 (";
        }
        if (valNorm === 'See all (' && /See all\s*\(\s*\d+\s*\)/i.test(pText)) {
            return USE_TW ? "顯示全部 (" : "显示全部 (";
        }
        if (valNorm === 'No MCP servers found for "' && /^No MCP servers found for\s+"/i.test(pText.trim())) {
            return USE_TW ? '找不到與 "' : '未找到与 "';
        }
        if (valNorm === '"' && /^(?:No MCP servers found for|未找到与|找不到與)\s+"/i.test(pText.trim())) {
            return USE_TW ? '" 相符的 MCP 伺服器' : '" 匹配的 MCP 服务器';
        }
        if (valNorm === 'Zipping' && /^Zipping\s+/i.test(pText.trim())) {
            return USE_TW ? "正在壓縮 " : "正在压缩 ";
        }
        if (valNorm === 'For' && (pText.includes('does not collect any of your prompts') || pText.includes('不会收集您的任何提示词') || pText.includes('不會收集您的任何提示詞'))) {
            return USE_TW ? "對於 " : "对于 ";
        }
        if (/does not collect any of your prompts, content, or model responses/i.test(valNorm)) {
            const lead = /^,\s*/.test(valNorm) ? "，" : "";
            return lead + (USE_TW
                ? "不會收集您的任何提示詞、內容或模型回應，但仍會收集一般使用模式（例如功能採用率、活躍使用者數）。"
                : "不会收集您的任何提示词、内容或模型响应，但仍会收集一般使用模式（例如功能采用率、活跃用户数）。");
        }
        if (valNorm === ', to help us improve and develop') {
            return USE_TW ? "，以協助我們改進與開發 " : "，以帮助我们改进和开发 ";
        }
        if (valNorm === 'and other Google machine-learning products and models in accordance with the') {
            return USE_TW ? " 及其他 Google 機器學習產品與模型（遵循 " : " 及其他 Google 机器学习产品与模型（遵循 ";
        }
        if (valNorm === '. You can control this from your settings at any point.') {
            return USE_TW ? "）。您可以隨時在設定中控制此選項。" : "）。您可以随时在设置中控制此选项。";
        }
        if (valNorm === '. Your use is subject to the') {
            return USE_TW ? "。您的使用行為受 " : "。您的使用行为受 ";
        }
        if (valNorm === 'necessary rights' && (pText.includes('content or files that you upload') || pText.includes('请勿生成侵犯他人权利') || pText.includes('請勿產生侵犯他人權利'))) {
            return USE_TW ? "必要權利" : "必要权利";
        }
        if (valNorm.startsWith('to any content or files that you upload')) {
            return USE_TW
                ? "。請勿產生侵犯他人權利的內容（包括欺騙、騷擾或傷害他人的內容）。使用 Antigravity 時，您必須遵守 Google 的 "
                : "。请勿生成侵犯他人权利的内容（包括欺骗、骚扰或伤害他人的内容）。使用 Antigravity 时，您必须遵守 Google 的 ";
        }
        if (valNorm === 'needs a few details from you before it can run.') {
            return USE_TW ? " 需要您提供一些詳細資訊才能執行。" : " 需要您提供一些详细信息才能运行。";
        }
        if (valNorm === 'in your browser.' && (pText.includes('Finish signing in') || pText.includes('请在浏览器中完成登录') || pText.includes('請在瀏覽器中完成登入') || pText.includes('完成登录至') || pText.includes('完成登入至'))) {
            if (pText.includes('Finish signing in to') || pText.includes('完成登录至') || pText.includes('完成登入至')) {
                return USE_TW ? "（在瀏覽器中）。" : "（在浏览器中）。";
            }
            return "";
        }
        if (valNorm === 'To switch accounts, sign out in the') {
            return USE_TW ? "如需切換帳號，請在" : "如需切换账号，请在";
        }
        if (valNorm === 'and sign in again.' && (pText.includes('To switch accounts') || pText.includes('如需切换账号') || pText.includes('如需切換帳號'))) {
            return USE_TW ? "中登出並重新登入。" : "中退出登录并重新登录。";
        }
        if (valNorm === 'There are currently no Build with') {
            return USE_TW ? "目前尚無可用的 " : "当前暂无可用的 ";
        }
        if (valNorm === 'plugins available.' && (pText.includes('no Build with') || pText.includes('当前暂无可用的') || pText.includes('目前尚無可用的'))) {
            return USE_TW ? " 建構外掛程式。" : " 构建插件。";
        }
        if (valNorm === '. Change it in the model menu.') {
            return USE_TW ? "。可在模型選單中切換。" : "。可在模型菜单中切换。";
        }
        if (valNorm === 'Microphone blocked. Allow in') {
            return USE_TW ? "麥克風已被封鎖。請在以下位置允許存取：" : "麦克风已被阻止。请在以下位置允许访问：";
        }
        if (valNorm === 'to use Voice.') {
            return USE_TW ? " 以使用語音模式。" : " 以使用语音模式。";
        }
        if (valNorm === 'anchor clause on') {
            return USE_TW ? "錨定子句（針對 " : "锚定子句（针对 ";
        }
        if (valNorm === '— narrow matched events by status, priority, or event details') {
            return USE_TW ? "— 依狀態、優先順序或事件詳細資訊縮小相符事件的範圍" : "— 按状态、优先级或事件详情缩小匹配事件的范围";
        }
        if (valNorm === '— specify at least one user, team, component, or resource (joined with') {
            return USE_TW ? "— 請至少指定一個使用者、團隊、元件或資源（使用以下運算子連接：" : "— 请至少指定一个用户、团队、组件或资源（使用以下运算符连接：";
        }
        if (valNorm === 'run in a dedicated') {
            return USE_TW ? " 建立的代理執行於專用的 " : " 创建的智能体运行在专用的 ";
        }
        if (valNorm === 'with its own permissions, which you can change anytime in the') {
            return USE_TW ? " 中並擁有獨立權限，您可以隨時在 " : " 中并拥有独立权限，您可以随时在 ";
        }
        if (valNorm === 'A similar' && (pText.includes('already exists on this computer') || pText.includes('已在此电脑上存在') || pText.includes('已在此電腦上存在'))) {
            return USE_TW ? "類似的" : "类似的";
        }
        if (valNorm === 'with this name already exists on this computer. Run it remotely, or go back and rename it.') {
            return USE_TW ? "已在此電腦上存在同名項目。請改為遠端執行，或返回並重新命名。" : "已在此电脑上存在同名项。请改为远程运行，或返回并重命名。";
        }
        if (pText.includes('can only be deleted by deleting that automation') || pText.includes('只能通过删除该自动化任务来一并删除') || pText.includes('只能透過刪除該自動化工作來一併刪除')) {
            if (/^This\s+(.+?)\s+is managed by the$/i.test(valNorm)) {
                return valNorm.replace(/^This\s+(.+?)\s+is managed by the$/i, (m, kind) => {
                    const kindZh = map.get(norm(kind)) || lowerMap.get(norm(kind).toLowerCase()) || kind;
                    return "此" + kindZh + "由 ";
                });
            }
            if (valNorm === 'This') return "此";
            if (valNorm === 'is managed by the') return "由 ";
            if (valNorm === 'automation and can only be deleted by deleting that automation.') {
                return USE_TW ? " 自動化工作管理，只能透過刪除該自動化工作來一併刪除。" : " 自动化任务管理，只能通过删除该自动化任务来一并删除。";
            }
        }
        if (pText.includes('already exists') || pText.includes('已在此电脑上存在') || pText.includes('已在此電腦上存在') || pText.includes('）已存在。')) {
            if (valNorm === 'An' || valNorm === 'A') return "";
            if (valNorm === 'automation') return USE_TW ? "自動化工作 " : "自动化任务 ";
            if (valNorm === 'scheduled task') return USE_TW ? "排程工作 " : "计划任务 ";
            if (valNorm === 'with the ID "' || valNorm === 'with ID') return USE_TW ? "（ID 為 " : "（ID 为 ";
            if (valNorm === '" already exists.' || valNorm === 'already exists.') return "）已存在。";
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
                if (isCodeOrEditor(node) || node.isContentEditable) return;
                if (node.classList && (node.classList.contains('monaco-editor') || node.classList.contains('terminal') || node.classList.contains('xterm'))) return;

                // 处理 FastPick / 列表底部的 "Show <N> more..." 复合节点
                const elText = node.textContent ? node.textContent.trim() : '';
                if (/^Show\s+\d+\s+more(?:\.\.\.|…)?$/i.test(elText)) {
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
                        const m = elText.match(/^Show\s+(\d+)\s+more(?:\.\.\.|…)?$/i);
                        if (m) {
                            textChildren[0].nodeValue = USE_TW ? ('顯示另外 ' + m[1] + ' 個...') : ('显示另外 ' + m[1] + ' 个...');
                            translatedValues.set(textChildren[0], textChildren[0].nodeValue);
                        }
                    }
                } else if (/^Get Anything Done with\s+(.+)$/i.test(elText) && node.children.length === 0) {
                    const textChildren = Array.from(node.childNodes).filter(c => c.nodeType === Node.TEXT_NODE);
                    if (textChildren.length >= 2) {
                        for (let i = 0; i < textChildren.length; i++) {
                            const tc = textChildren[i];
                            const v = norm(tc.nodeValue);
                            if (/^Get Anything Done with$/i.test(v)) {
                                tc.nodeValue = '使用 ';
                                translatedValues.set(tc, tc.nodeValue);
                            } else if (i === textChildren.length - 1 && v) {
                                tc.nodeValue = tc.nodeValue + ' 完成任何工作';
                                translatedValues.set(tc, tc.nodeValue);
                            }
                        }
                    }
                }

                // 处理语音助手选择器底部 "Use <VoiceName>" 复合按钮
                if (node.getAttribute && node.getAttribute('data-testid') === 'voice-picker-use') {
                    const textChildren = Array.from(node.childNodes).filter(c => c.nodeType === Node.TEXT_NODE);
                    for (const tc of textChildren) {
                        const v = tc.nodeValue;
                        if (v === 'Use ' || norm(v) === 'Use') {
                            tc.nodeValue = '使用 ';
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
                    /^(?:Show|显示另外|顯示另外)\s+\d+\s+(?:more|个|個)(?:\.\.\.|…)?$/i.test(parentText) ||
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

                // 核心：如果是 skeleton 骨架占位文本，强制打上不翻译标记
                if (originalVal.toLowerCase().includes('pack.info')) {
                    const parent = node.parentElement;
                    if (parent) {
                        if (parent.getAttribute('translate') !== 'no') parent.setAttribute('translate', 'no');
                        try { if (!parent.classList.contains('notranslate')) parent.classList.add('notranslate'); } catch (e) {}
                    }
                    return;
                }

                const valNorm = norm(originalVal);
                const cachedValue = translatedValues.get(node);
                if ((valNorm === 'New' || (cachedValue === originalVal && valNorm === map.get('New'))) && isModelMenuText(node)) {
                    if (originalVal !== '新') {
                        translatedValues.set(node, '新');
                        node.nodeValue = '新';
                    }
                    return;
                }
                if (cachedValue === originalVal) return;

                // Material Symbol 字体缺失图标修复
                if (valNorm === 'restore_page' && node.parentElement && (
                    (typeof node.parentElement.classList?.contains === 'function' && node.parentElement.classList.contains('google-symbols')) ||
                    (typeof node.parentElement.className === 'string' && node.parentElement.className.includes('google-symbols'))
                )) {
                    node.parentElement.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0" style="display:inline-block;vertical-align:middle"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>';
                    return;
                }

                let newVal = originalVal;
                const commonTrans = translateExactOrDynamic(valNorm);
                if (commonTrans !== null) {
                    newVal = commonTrans;
                } else {
                    const ctxTrans = translateContextualText(node, originalVal, valNorm);
                    if (ctxTrans !== null) {
                        newVal = ctxTrans;
                    } else if (valNorm.length > 15 && valNorm.includes(' ')) {
                        // 长句子串滑动替换与末尾截断智能匹配
                        const isTruncated = (valNorm.endsWith('...') || valNorm.endsWith('…')) && valNorm.length >= 35;
                        const cleanVal = isTruncated ? valNorm.replace(/(\.\.\.|…)$/, '').trim().toLowerCase() : '';
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
        try { observeRoot(sr); } catch (e) {}
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
