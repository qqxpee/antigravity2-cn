(() => {
    if (typeof window !== 'undefined' && typeof window.__agCnRuntimeStart === 'function') {
        window.__agCnRuntimeStart();
        return;
    }
    // V13.0 模块化表驱动物理隔离引擎 (原生独立 JS 运行时)
    const USE_TW = __USE_TW_PLACEHOLDER__;
    const map = new Map(Object.entries(DICT_PLACEHOLDER));
    const lowerMap = new Map();
    const LOWER_WORDS_EXCLUDE = new Set(['on', 'in', 'to', 'at', 'by', 'for', 'with', 'as', 'system', 'review', 'active', 'browser', 'global', 'including', 'and', 'or', 'file', 'files', 'help', 'app', 'plan', 'search', 'coordinator']);
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
    const CODE_ISOLATION_SELECTOR = 'pre, code, .monaco-editor, .cm-editor, .cm-line, [contenteditable="true"], [contenteditable="plaintext-only"], [contenteditable=""], [data-lexical-editor], .terminal, .xterm, .code-line, .code-block, .line-content, [aria-label="File Viewer"], [aria-label="文件查看器"], [aria-label="檔案檢視器"], [data-file-uri], [data-uri], [class*="diffEditor"], .token, .hljs, [class*="mtk"], .font-mono, [data-quotable-inline="true"], .context-scope-mention, [data-testid="file-title-name"], [data-testid="entity-pill"], [data-project-card="true"], [data-testid="conversation-row-sidebar"] span.truncate, [translate="no"], .notranslate, .md-divider-spacing, .cursor-edit, [data-testid="user-input-step"] [data-quotable="true"], [data-testid="user-input-step"] .whitespace-pre-wrap, [data-testid="planner-response-text"], [data-testid="thinking-collapsible-trigger"] + div, [data-testid="thinking-collapsible-trigger"] ~ div, .msg-body, .sys-text, .node-label, .raw-meta .path, .o2-mauth, .o2-wchip.bee > span:last-child, .o2-m[data-o2who]:not(.all) > span:last-child';

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
        const match = val.match(/^(.+?)\s*\(((?:Ctrl|Cmd|Alt|Shift|⌘|⌥|⇧|⌃)\+?[^)]*|Enter|Escape|Esc|Space|Tab|Backspace|Delete|⏎|←|→|↑|↓|Aa|ab|\.\*|-|0|[a-zA-Z0-9])\)$/i);
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

    function formatCompactDuration(str) {
        return String(str || '').trim()
            .replace(/(\d+)\s*d\b/gi, '$1 天')
            .replace(/(\d+)\s*h\b/gi, USE_TW ? '$1 小時' : '$1 小时')
            .replace(/(\d+)\s*m\b/gi, USE_TW ? '$1 分鐘' : '$1 分钟')
            .replace(/(\d+)\s*s\b/gi, '$1 秒');
    }

    const SCOPED_SWARM_MAP = {
        'Board': ['看板', '看板'],
        'Graph': ['关系图', '關係圖'],
        'Raw': ['原始数据', '原始資料'],
        'Reconnecting': ['正在重连', '正在重新連線'],
        'Replay': ['回放', '重播'],
        'Follow': ['跟随', '跟隨'],
        'Latest': ['最新', '最新'],
        'Channels': ['频道', '頻道'],
        'Filters': ['筛选', '篩選'],
        'Coordinator': ['协调器', '協調器'],
        'Waiting': ['等待中', '等待中'],
        'Retired': ['已退役', '已退役'],
        'Paused': ['已暂停', '已暫停'],
        'Working...': ['工作中...', '工作中...'],
        'Working': ['工作中', '工作中'],
        'Empty.': ['暂无内容。', '尚無內容。'],
        '(empty)': ['（空）', '（空）'],
        'stale': ['已过期', '已過期'],
        'system:': ['系统：', '系統：'],
        'Goal': ['目标', '目標'],
        'Team': ['团队', '團隊'],
        'Threads': ['工作线', '討論串'],
        'Now': ['当前', '目前'],
        'Progress': ['进度', '進度'],
        'Tasks': ['任务', '任務'],
        'Other': ['其他', '其他'],
        'Moving': ['推进中', '推進中'],
        'Reply': ['回复', '回覆'],
        'Frames': ['画面', '畫面'],
        'All': ['全部', '全部'],
        'all channels': ['全部频道', '全部頻道'],
        'Remote': ['远程', '遠端'],
        'updating': ['更新中', '更新中'],
        'watching': ['监听中', '監聽中'],
        'stopped': ['已停止', '已停止'],
        'Needs you': ['待你处理', '待你處理'],
        'Not started': ['未开始', '尚未開始'],
        'Blocked': ['受阻', '受阻'],
        'Running': ['运行中', '執行中'],
        'Done': ['已完成', '已完成'],
        'Open': ['打开', '開啟'],
        'Active': ['活跃', '執行中'],
        'Killed': ['已终止', '已終止'],
        'queued': ['排队中', '排隊中'],
        'running': ['运行中', '執行中'],
        'blocked': ['受阻', '受阻'],
        'done': ['已完成', '已完成'],
        'active': ['活跃', '執行中'],
        'paused': ['已暂停', '已暫停']
    };

    function isSwarmUiContext(el) {
        try {
            const doc = (el && el.ownerDocument) || (typeof document !== 'undefined' ? document : null);
            if (doc && (doc.getElementById('swarm-title') || doc.getElementById('replay-label') || doc.querySelector('[data-testid^="swarm-"]'))) {
                return true;
            }
            if (el && typeof el.closest === 'function') {
                return Boolean(el.closest('[data-testid^="swarm-"], .o2, .player, .graph-legend, .raw-toolbar'));
            }
        } catch (e) {}
        return false;
    }

    function translateSwarmComposite(raw) {
        if (!raw || typeof raw !== 'string') return null;
        const trimmed = raw.trim();
        const edgeMatch = trimmed.match(/^([^\s→]+)\s*→\s*([^\s:]+):\s*(\d+)\s+direct(?:,\s*(\d+)\s+via @all)?$/i);
        if (edgeMatch) {
            return edgeMatch[1] + ' → ' + edgeMatch[2] + '：' + edgeMatch[3] + ' 次直接提及' +
                (edgeMatch[4] ? ('，' + edgeMatch[4] + (USE_TW ? ' 次透過 @all' : ' 次通过 @all')) : '');
        }
        const outsiderMatch = trimmed.match(/^(\S+)\s+\(not on the roster\)$/i);
        if (outsiderMatch) {
            return outsiderMatch[1] + (USE_TW ? '（不在成員名單中）' : '（不在成员名单中）');
        }
        const sharedBoardMatch = trimmed.match(/^Shared\s+(.+?)\s+board(?:\s+(.*))?$/i);
        if (sharedBoardMatch) {
            return (USE_TW ? '共用 ' : '共享 ') + sharedBoardMatch[1] + ' 看板' + (sharedBoardMatch[2] ? ' ' + sharedBoardMatch[2] : '');
        }
        const runsOnMatch = trimmed.match(/^Runs on\s+(.+)$/);
        if (runsOnMatch) {
            return (USE_TW ? '執行於 ' : '运行于 ') + runsOnMatch[1];
        }
        const errMatch = trimmed.match(/^Error:\s*(.+)$/i);
        if (errMatch) {
            return (USE_TW ? '錯誤：' : '错误：') + errMatch[1];
        }
        const openMemberMatch = trimmed.match(/^Open\s+([a-z0-9][a-z0-9._-]*)$/);
        if (openMemberMatch) {
            return (USE_TW ? '開啟 ' : '打开 ') + openMemberMatch[1];
        }
        const noPostsTipMatch = trimmed.match(/^([^:]+):\s*No posts yet$/i);
        if (noPostsTipMatch) {
            return noPostsTipMatch[1] + (USE_TW ? '：尚無訊息' : '：暂无消息');
        }
        if (!raw.includes('·') && !raw.includes('\n')) return null;
        let changed = false;
        const lines = raw.split('\n').map(line => {
            const ln = norm(line);
            if (map.has(ln)) {
                changed = true;
                return map.get(ln);
            }
            if (!line.includes(' · ')) return line;
            const segs = line.split(' · ').map(seg => {
                const s = seg.trim();
                if (s === 'Coordinator') { changed = true; return USE_TW ? '協調器' : '协调器'; }
                if (s === 'Working') { changed = true; return '工作中'; }
                if (s === 'Active') { changed = true; return USE_TW ? '執行中' : '活跃'; }
                if (s === 'Waiting') { changed = true; return '等待中'; }
                if (s === 'Killed') { changed = true; return USE_TW ? '已終止' : '已终止'; }
                if (/^\d+\s+posts?$/i.test(s)) { changed = true; return s.replace(/^(\d+)\s+posts?$/i, (_, n) => n + (USE_TW ? ' 則訊息' : ' 条消息')); }
                if (/^\d+\s+steps?$/i.test(s)) { changed = true; return s.replace(/^(\d+)\s+steps?$/i, '$1 步'); }
                if (/^\d+\s+unaddressed$/i.test(s)) { changed = true; return s.replace(/^(\d+)\s+unaddressed$/i, (_, n) => n + (USE_TW ? ' 則未指定對象' : ' 条未指定对象')); }
                if (/^\d+\s+unread$/i.test(s)) { changed = true; return s.replace(/^(\d+)\s+unread$/i, (_, n) => n + (USE_TW ? ' 則未讀' : ' 条未读')); }
                if (/^runs on\s+(.+)$/i.test(s)) { changed = true; return s.replace(/^runs on\s+(.+)$/i, (_, h) => (USE_TW ? '執行於 ' : '运行于 ') + h); }
                return seg;
            });
            return segs.join(' · ');
        });
        return changed ? lines.join('\n') : null;
    }

    function translatePermissionChoice(value) {
        if (typeof value !== 'string') return null;

        const saveRule = value.match(/^\s*Yes,\s+save rule for\s+('[\s\S]*'|"[\s\S]*")\s+(in this conversation|globally)\s*$/i);
        if (saveRule) {
            const pattern = saveRule[1];
            const isConv = saveRule[2].toLowerCase() === 'in this conversation';
            if (USE_TW) {
                return isConv ? ('是，在此對話中為 ' + pattern + ' 儲存規則') : ('是，全域為 ' + pattern + ' 儲存規則');
            }
            return isConv ? ('是，在此会话中为 ' + pattern + ' 保存规则') : ('是，全局为 ' + pattern + ' 保存规则');
        }

        const match = value.match(/^\s*Yes,\s+and always allow\s+([\s\S]+)$/i);
        if (!match || /^in this (?:project|conversation)$/i.test(norm(match[1]))) return null;

        // 客户端在命令外层引号之后追加作用域，需先保留命令原文再拼接范围前缀
        const scoped = match[1].match(/^('[\s\S]*'|"[\s\S]*")\s+in this (project|conversation)\s*$/i);
        const command = scoped ? scoped[1] : match[1].trimEnd();
        const scope = scoped && scoped[2] ? scoped[2].toLowerCase() : '';
        if (USE_TW) {
            if (scope === 'conversation') return '是，且在此對話中一律允許執行 ' + command;
            if (scope === 'project') return '是，且在此專案中一律允許執行 ' + command;
            return '是，且一律允許執行 ' + command;
        }
        if (scope === 'conversation') return '是，且在此会话中始终允许运行 ' + command;
        if (scope === 'project') return '是，且在此项目中始终允许运行 ' + command;
        return '是，且始终允许运行 ' + command;
    }

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
        [/^Hey\s+(.+?),\s+what should we build today\??$/i, (m, name) => name.trim().toLowerCase() === 'there' ? (USE_TW ? "嗨，今天我們要打造什麼？" : "嗨，今天我们要构建什么？") : (USE_TW ? ("嗨 " + name.trim() + "，今天我們要打造什麼？") : ("嗨 " + name.trim() + "，今天我们要构建什么？"))],
        [/^Welcome back,\s*(.+?)\.\s*Where should we pick up\??$/i, (m, name) => USE_TW ? ("歡迎回來，" + name.trim() + "。我們從哪裡繼續？") : ("欢迎回来，" + name.trim() + "。我们从哪里继续？")],
        [/^Welcome back\.\s*Where should we pick up\??$/i, () => USE_TW ? "歡迎回來。我們從哪裡繼續？" : "欢迎回来。我们从哪里继续？"],
        [/^Good to see you,\s*(.+?)\.\s*What's next\??$/i, (m, name) => USE_TW ? ("很高興見到您，" + name.trim() + "。接下來做什麼？") : ("很高兴见到您，" + name.trim() + "。接下来做什么？")],
        [/^Good to see you\.\s*What's next\??$/i, () => USE_TW ? "很高興見到您。接下來做什麼？" : "很高兴见到您。接下来做什么？"],
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
        [/^Send all\s*\((\d+)\)$/i, (m, num) => USE_TW ? ("全部傳送 (" + num + ")") : ("全部发送 (" + num + ")")],
        [/^Open (Live transcript|Voice transcript),\s*(.+?)(?:\.\s*Summarizing call)?$/i, (m, kind, dur) => {
            const kZh = /^Live/i.test(kind) ? (USE_TW ? "即時逐字稿" : "实时转录") : (USE_TW ? "語音逐字稿" : "语音转录");
            const suffix = /Summarizing call$/i.test(m) ? (USE_TW ? "。正在摘要通話" : "。正在总结通话") : "";
            return (USE_TW ? "開啟" : "打开") + kZh + "，" + dur + suffix;
        }],
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
        [/^Yes, allow downloads from (.+) for this run$/i, (m, site) => USE_TW ? ("是，本次執行允許從 " + site + " 下載") : ("是，本次运行允许从 " + site + " 下载")],
        [/^Yes, allow downloads from (.+) in this conversation$/i, (m, site) => USE_TW ? ("是，在此對話中允許從 " + site + " 下載") : ("是，在此会话中允许从 " + site + " 下载")],
        [/^Yes, always allow downloads from (.+)$/i, (m, site) => USE_TW ? ("是，一律允許從 " + site + " 下載") : ("是，始终允许从 " + site + " 下载")],
        [/^Yes, allow (.+) in this conversation$/i, (m, target) => USE_TW ? ("是，在此對話中允許 " + target) : ("是，在此会话中允许 " + target)],
        [/^Yes, always allow (.+)$/i, (m, target) => USE_TW ? ("是，一律允許 " + target) : ("是，始终允许 " + target)],
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
        [/^(Thought|Thinking|Worked) for\s+(.+)$/i, (m, verb, rest) => {
            const vZh = /^Thought/i.test(verb) ? "已思考 " : (/^Thinking/i.test(verb) ? "正在思考 " : "已工作 ");
            let durPart = rest.trim();
            let updateSuffix = "";
            const updMatch = durPart.match(/^(.*?)\s*·\s*(\d+)\s+updates?$/i);
            if (updMatch) {
                durPart = updMatch[1].trim();
                updateSuffix = " · " + updMatch[2] + (USE_TW ? " 項更新" : " 项更新");
            }
            const dZh = durPart.replace(/(\d+)\s*h(?:ours?|r)?/gi, USE_TW ? "$1 小時" : "$1 小时").replace(/(\d+)\s*m(?:inutes?|in)?/gi, USE_TW ? "$1 分鐘" : "$1 分钟").replace(/(\d+)\s*s(?:econds?|ec)?/gi, "$1 秒");
            return vZh + dZh + updateSuffix;
        }],
        [/^(?:(·\s*))?(\d+)\s+updates?$/i, (m, dot, num) => (dot ? " · " : "") + num + (USE_TW ? " 項更新" : " 项更新")],
        [/^Low contrast ratio \(([^)]+)\)\.\s*Text may be hard to read\.?$/i, (m, ratio) => USE_TW ? ("對比度過低 (" + ratio + ")，文字可能難以閱讀。") : ("对比度过低 (" + ratio + ")，文字可能难以阅读。")],
        [/^Preview unavailable\s*[—–-]\s*(.+)$/i, (m, reason) => (USE_TW ? "預覽不可用 — " : "预览不可用 — ") + reason],
        [/^Proceed to\s+(.+?)\s+\(unsafe\)$/i, (m, host) => USE_TW ? ("繼續前往 " + host + "（不安全）") : ("继续前往 " + host + "（不安全）")],
        [/^\(?for example, passwords, messages, or credit cards\)?\.?$/i, () => USE_TW ? "（例如：密碼、訊息或信用卡）。" : "（例如：密码、通讯内容或信用卡）。"],
        [/^may sign you out of this site\.?$/i, () => USE_TW ? "可能會導致您退出此網站。" : "可能会导致您退出此网站。"],
        [/^normally uses encryption to protect your information\. When the browser tried to connect to$/i, () => USE_TW ? "通常使用加密技術來保護您的資訊。當瀏覽器本次嘗試連線至 " : "通常使用加密技术来保护您的信息。当浏览器本次尝试连接到 "],
        [/^this time, the website sent back unusual and incorrect credentials\.?$/i, () => USE_TW ? " 時，該網站傳回了異常且不正確的憑證。" : " 时，该网站发回了异常且不正确的凭据。"],
        [/^(.+?)\s+normally uses encryption to protect your information\.\s*When the browser tried to connect to\s+(.+?)\s+this time,\s*the website sent back unusual and incorrect credentials\.?$/i, (m, h1, h2) => USE_TW ? (h1 + " 通常使用加密技術來保護您的資訊。當瀏覽器本次嘗試連線至 " + h2 + " 時，該網站傳回了異常且不正確的憑證。") : (h1 + " 通常使用加密技术来保护您的信息。当浏览器本次尝试连接到 " + h2 + " 时，该网站发回了异常且不正确的凭据。")],
        [/^The certificate was rejected \((.+)\)\.\s*$/i, (m, code) => USE_TW ? ("憑證已被拒絕 (" + code + ")。") : ("证书已被拒绝 (" + code + ")。")],
        [/^Nothing is running on port (\d+)$/i, (m, port) => USE_TW ? ("連接埠 " + port + " 上沒有執行中的服務") : ("端口 " + port + " 上没有正在运行的服务")],
        [/^Resume the conversation to start its workspace again, then start the server on port (\d+) and retry\.$/i, (m, port) => USE_TW ? ("請恢復對話以重新啟動其工作區，然後在連接埠 " + port + " 上啟動伺服器並重試。") : ("请恢复会话以重新启动其工作区，然后在端口 " + port + " 上启动服务器并重试。")],
        [/^No server is listening on port (\d+) inside the remote workspace\. Start it, or ask the agent to, then retry\.$/i, (m, port) => USE_TW ? ("遠端工作區內的連接埠 " + port + " 沒有伺服器正在監聽。請啟動伺服器（或請代理啟動），然後重試。") : ("远程工作区内的端口 " + port + " 没有服务器正在监听。请启动服务器（或让智能体启动），然后重试。")],
        [/^Help us improve\s+(.+?)\.?$/i, (m, app) => USE_TW ? ("協助我們改進 " + app + "。") : ("帮助我们改进 " + app + "。")],
        [/^Get Anything Done with\s+(.+)$/i, (m, app) => USE_TW ? ("使用 " + app + " 搞定一切") : ("用 " + app + " 搞定一切")],
        [/^Customize your experience from visual themes to how autonomous your agent acts and what\s+(.+?)\s+says\.?$/i, (m, app) => USE_TW ? ("自訂您的使用體驗，從視覺佈景主題到代理的自主程度以及 " + app + " 的提示音。") : ("自定义您的使用体验，从视觉主题到智能体的自主程度以及 " + app + " 的提示音。")],
        [/^(.+?)'s agents are powerful\.\s*They can edit files,\s*run commands,\s*and browse the web\.?$/i, (m, app) => USE_TW ? (app + " 的代理功能強大，可以編輯檔案、執行指令以及瀏覽網頁。") : (app + " 的智能体功能强大，可以编辑文件、运行命令以及浏览网页。")],
        [/^Google\s+(.+?)\s+Terms of Service$/i, (m, app) => USE_TW ? ("Google " + app + " 服務條款") : ("Google " + app + " 服务条款")],
        [/^Review permissions for\s+(.+)$/i, (m, name) => USE_TW ? ("檢視 " + name + " 的權限") : ("查看 " + name + " 的权限")],
        [/^Auth code for\s+(.+)$/i, (m, name) => USE_TW ? (name + " 的授權碼") : (name + " 的授权码")],
        [/^(.+?),\s*(\d+)\s+grants?$/i, (m, name, count) => USE_TW ? (name + "，" + count + " 項授權") : (name + "，" + count + " 项授权")],
        [/^Set up\s+(.+)$/i, (m, name) => USE_TW ? ("設定 " + name) : ("配置 " + name)],
        [/^On top of those defaults,\s*(.+?)\s+requests the access below\.$/i, (m, name) => USE_TW ? ("除上述預設權限外，" + name + " 還請求以下存取權限。") : ("除上述默认权限外，" + name + " 还请求以下访问权限。")],
        [/^(\d+)\s+calls?\s*·\s*([0-9.]+)\s*MB$/i, (m, count, mb) => USE_TW ? (count + " 次通話 · " + mb + " MB") : (count + " 次通话 · " + mb + " MB")],
        [/^Deleted\s+(\d+)\s+recordings?\s*\(([0-9.]+)\s*MB\)$/i, (m, count, mb) => USE_TW ? ("已刪除 " + count + " 筆錄音（" + mb + " MB）") : ("已删除 " + count + " 条录音（" + mb + " MB）")],
        [/^Failed to delete recordings:\s*(.+)$/i, (m, err) => USE_TW ? ("刪除錄音失敗：" + err) : ("删除录音失败：" + err)],
        [/^This deletes\s+(\d+)\s+call recordings?\s*\(([0-9.]+)\s*MB\)\s+from your machine\.\s*You can't undo this\.$/i, (m, count, mb) => USE_TW ? ("這將從您的電腦中刪除 " + count + " 筆通話錄音（" + mb + " MB）。此操作無法復原。") : ("这将从您的计算机中删除 " + count + " 条通话录音（" + mb + " MB）。此操作无法撤销。")],
        [/^Step\s+(\d+)\s+of\s+(\d+)$/i, (m, a, b) => USE_TW ? ("第 " + a + " 步，共 " + b + " 步") : ("第 " + a + " 步，共 " + b + " 步")],
        [/^\+(\d+)\s+more$/i, (m, num) => USE_TW ? ("另外 +" + num + " 項") : ("另外 +" + num + " 项")],
        [/^Not referenced by any feature\s*\((\d+)\)$/i, (m, num) => USE_TW ? ("未被任何功能引用 (" + num + ")") : ("未被任何功能引用 (" + num + ")")],
        [/^Zipping\s+(.+?)(\.\.\.|…)?$/i, (m, name) => USE_TW ? ("正在壓縮 " + name + "...") : ("正在压缩 " + name + "...")],
        [/^There are currently no Build with\s+(.+?)\s+plugins available\.?$/i, (m, partner) => USE_TW ? ("目前沒有可用的 Build with " + partner + " 外掛程式。") : ("当前没有可用的 Build with " + partner + " 插件。")],
        [/^To switch accounts,\s*sign out in the\s+(.+?)\s+and sign in again\.?$/i, (m, place) => USE_TW ? ("如需切換帳戶，請在" + place + "中登出並重新登入。") : ("如需切换账户，请在" + place + "中退出登录并重新登录。")],
        [/^No MCP servers found for\s+"(.+)"$/i, (m, q) => USE_TW ? ('找不到與「' + q + '」相關的 MCP 伺服器') : ('未找到与“' + q + '”相关的 MCP 服务器')],
        [/^Agents created by\s+(.+?)\s+can apply across workspaces,\s*while project agents apply to\s+(.+?)\.?$/i, (m, a, b) => USE_TW ? ("由 " + a + " 建立的代理可跨工作區套用，而專案代理僅套用至 " + b + "。") : ("由 " + a + " 创建的智能体可跨工作区生效，而项目智能体仅作用于 " + b + "。")],
        [/^An?\s+(automation|scheduled task)\s+with this name already exists\.\s*Choose a different name\.?$/i, (m, kind) => USE_TW ? ("已存在同名的" + (/automation/i.test(kind) ? "自動化任務" : "排程任務") + "，請選擇其他名稱。") : ("已存在同名的" + (/automation/i.test(kind) ? "自动化任务" : "定时任务") + "，请选择其他名称。")],
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
        }],

        // Swarm 伴生面板 (Sidecar) 动态消息、回放、关系图与概览状态
        [/^(\d+)\s+posts?$/i, (m, n) => n + (USE_TW ? " 則訊息" : " 条消息")],
        [/^(\d+)\s+posts?\s+since the view was updated$/i, (m, n) => USE_TW ? ("自檢視上次更新以來有 " + n + " 則新訊息") : ("自视图上次更新以来有 " + n + " 条新消息")],
        [/^Narrator read up to #(\d+) of (\d+)$/i, (m, a, b) => USE_TW ? ("解說員已讀至 #" + a + " / " + b) : ("解说员已读至 #" + a + " / " + b)],
        [/^read #(\d+)(?:\s*·\s*updated\s+(.+?)\s+ago)?$/i, (m, seq, dur) => (USE_TW ? "已讀至 #" : "已读至 #") + seq + (dur ? (" · " + formatCompactDuration(dur) + "前更新") : "")],
        [/^Posted in #([^\s;]+);\s*click to show only #([^\s;]+)$/i, (m, c1, c2) => USE_TW ? ("發佈於 #" + c1 + "；按一下僅顯示 #" + c2) : ("发布于 #" + c1 + "；点击仅显示 #" + c2)],
        [/^#([^\s]+)\s+\(archived\)$/i, (m, ch) => "#" + ch + (USE_TW ? "（已封存）" : "（已归档）")],
        [/^#([^\s]+)\s+is archived:\s*this addresses nobody$/i, (m, ch) => "#" + ch + (USE_TW ? " 已封存：不會通知任何成員" : " 已归档：不会通知任何成员")],
        [/^Everyone in #([^\s]+)$/i, (m, ch) => "#" + ch + (USE_TW ? " 中的所有成員" : " 中的所有成员")],
        [/^Go to #(\d+)(?:\s*\(([^)]+)\))?$/i, (m, seq, who) => (USE_TW ? "前往 #" : "跳转到 #") + seq + (who ? (" (" + who + ")") : "")],
        [/^The narrator's last step failed:\s*(.+)$/i, (m, detail) => (USE_TW ? "解說員上一步驟失敗：" : "解说员上一步执行失败：") + detail],
        [/^the narrator's view failed \((.+)\)$/i, (m, r) => USE_TW ? ("解說員檢視載入失敗 (" + r + ")") : ("解说员视图加载失败 (" + r + ")")],
        [/^overview\s*·\s*from the narrator's notes\s*\((.+)\)$/i, (m, r) => {
            const rNorm = norm(r);
            const rZh = map.get(rNorm) || r;
            return (USE_TW ? "概覽 · 來自解說員筆記（" : "概览 · 来自解说员笔记（") + rZh + "）";
        }],
        [/^Opening (.+?)'s conversation needs the app\.$/i, (m, who) => USE_TW ? ("需要在應用程式中開啟 " + who + " 的對話。") : ("需要在客户端应用中打开 " + who + " 的会话。")],
        [/^(.+?) runs on (.+?); open it there\.$/i, (m, name, host) => USE_TW ? (name + " 執行於 " + host + "；請在該處開啟。") : (name + " 运行于 " + host + "；请在该处打开。")],
        [/^Copied ["“](.+)["”]\.\s*Paste it in the chat\.$/i, (m, txt) => USE_TW ? ("已複製「" + txt + "」。請貼到對話框中。") : ("已复制“" + txt + "”。请粘贴到聊天框中。")],
        [/^Type ["“](.+)["”]\s+in the chat\.$/i, (m, txt) => USE_TW ? ("請在對話框中輸入「" + txt + "」。") : ("请在聊天框中输入“" + txt + "”。")],
        [/^Copied ["“](.+)["”]\.\s*Paste it to the coordinator and say what you want changed\.$/i, (m, txt) => USE_TW ? ("已複製「" + txt + "」。請貼給協調器並說明您想修改的內容。") : ("已复制“" + txt + "”。请粘贴给协调器并说明您想修改的内容。")],
        [/^Tell the coordinator:\s*["“](.+)["”]$/i, (m, txt) => USE_TW ? ("請告訴協調器：「" + txt + "」") : ("请告诉协调器：“" + txt + "”")],
        [/^@([^\s]+)\s+ran out of quota(?:\s+for\s+(.+?))?(?:\s+—\s+(.+))?$/i, (m, who, dur, detail) => "@" + who + (USE_TW ? " 配額已耗盡" : " 配额已耗尽") + (dur ? ((USE_TW ? "（已持續 " : "（已持续 ") + formatCompactDuration(dur) + "）") : "") + (detail ? (" — " + detail) : "")],
        [/^@([^\s]+)\s+looks stuck(?:\s+for\s+(.+?))?(?:\s+—\s+(.+))?$/i, (m, who, dur, detail) => "@" + who + " 似乎卡住了" + (dur ? ((USE_TW ? "（已持續 " : "（已持续 ") + formatCompactDuration(dur) + "）") : "") + (detail ? (" — " + detail) : "")],
        [/^@([^\s]+)\s+hit an error(?:\s+for\s+(.+?))?(?:\s+—\s+(.+))?$/i, (m, who, dur, detail) => "@" + who + (USE_TW ? " 發生錯誤" : " 遇到错误") + (dur ? ((USE_TW ? "（已持續 " : "（已持续 ") + formatCompactDuration(dur) + "）") : "") + (detail ? (" — " + detail) : "")],
        [/^seen just now$/i, () => USE_TW ? "剛剛上線" : "刚刚在线"],
        [/^last seen (\d+(?:s|m|h|d)) ago$/i, (m, dur) => (USE_TW ? "上次上線：" : "上次在线：") + formatCompactDuration(dur) + "前"],
        [/^(\d+)\s+of\s+(\d+)\s+tasks?\s+done$/i, (m, d, tot) => d + " / " + tot + (USE_TW ? " 項任務已完成" : " 项任务已完成")],
        [/^([0-9]+\/[0-9]+|[0-9]+%)\s+done$/i, (m, lbl) => "已完成 " + lbl],
        [/^(\d+)\s+needs?\s+you$/i, (m, n) => n + (USE_TW ? " 項待你處理" : " 项待你处理")],
        [/^(\d+)\s+blocked$/i, (m, n) => n + (USE_TW ? " 項受阻" : " 项受阻")],
        [/^(\d+)\s+threads?\s+open$/i, (m, n) => n + (USE_TW ? " 個討論串進行中" : " 条工作线进行中")],
        [/^(\d+)\s+active$/i, (m, n) => n + (USE_TW ? " 項進行中" : " 项进行中")],
        [/^Up next\s*·\s*(\d+)$/i, (m, n) => (USE_TW ? "接下來 · " : "接下来 · ") + n],
        [/^Last change:\s*[“"](.+)[”"]$/i, (m, txt) => (USE_TW ? "上次變更：「" : "上次变更：“") + txt + (USE_TW ? "」" : "”")],
        [/^Remote\s*·\s*(\d+)\s+machines?$/i, (m, n) => (USE_TW ? "遠端 · " : "远程 · ") + n + (USE_TW ? " 台機器" : " 台机器")],
        [/^Remote\s*·\s*(reconnecting|connecting|unavailable)$/i, (m, st) => {
            const stLow = st.toLowerCase();
            const stZh = stLow === 'reconnecting'
                ? (USE_TW ? '正在重新連線' : '正在重连')
                : (stLow === 'connecting' ? (USE_TW ? '正在連線' : '正在连接') : '不可用');
            return (USE_TW ? "遠端 · " : "远程 · ") + stZh;
        }],
        [/^Message from\s+(.+)$/, (m, sender) => {
            const sNorm = norm(sender);
            const sZh = sNorm === 'Parent Agent'
                ? (USE_TW ? '父級代理' : '父级智能体')
                : (map.get(sNorm) || sender);
            const isCjk = /[\u4e00-\u9fff]/.test(sZh);
            return (isCjk ? (USE_TW ? '來自' : '来自') : (USE_TW ? '來自 ' : '来自 ')) + sZh + (isCjk ? (USE_TW ? '的訊息' : '的消息') : (USE_TW ? ' 的訊息' : ' 的消息'));
        }],
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
        if (valNorm === 'No' && p.tagName === 'SPAN') {
            const writeIn = p.nextElementSibling;
            const hint = '(tell the agent what to do instead)';
            const placeholder = writeIn && typeof writeIn.getAttribute === 'function' ? writeIn.getAttribute('placeholder') : null;
            if (writeIn && typeof writeIn.matches === 'function' && writeIn.matches('textarea[data-testid="ask-question-writein"]') &&
                (placeholder === hint || placeholder === map.get(hint))) {
                return '否';
            }
        }
        if ((valNorm === 'Proceed to' || valNorm === '(unsafe)') && pText.includes('Proceed to') && pText.includes('(unsafe)')) {
            return valNorm === 'Proceed to' ? (USE_TW ? "繼續前往 " : "继续前往 ") : (USE_TW ? "（不安全）" : "（不安全）");
        }
        if (valNorm === 'Customize your experience from visual themes to how autonomous your agent acts and what') {
            return USE_TW ? "自訂您的使用體驗，從視覺佈景主題到代理的自主程度以及 " : "自定义您的使用体验，从视觉主题到智能体的自主程度以及 ";
        }
        if (valNorm === "Customize your experience across the agent, plugins, and product from the settings and marketplace. We won't show you ads or let advertisers influence what") {
            return USE_TW
                ? "從設定與市集中自訂您在代理、外掛程式及產品上的各項體驗。我們不會向您顯示廣告，也不會讓廣告客戶影響 "
                : "从设置与市场中自定义您在智能体、插件及产品上的各项体验。我们不会向您展示广告，也不会让广告主影响 ";
        }
        if (valNorm === 'says.' && (pText.includes('autonomous') || pText.includes('自主程度') || pText.includes('influence what') || pText.includes('广告主影响') || pText.includes('廣告客戶影響'))) {
            return (pText.includes('influence what') || pText.includes('广告主影响') || pText.includes('廣告客戶影響'))
                ? (USE_TW ? " 所說的內容。" : " 所说的内容。")
                : " 的提示音。";
        }
        if (valNorm === "'s agents are powerful. They can edit files, run commands, and browse the web.") {
            return USE_TW ? " 的代理功能強大，可以編輯檔案、執行指令以及瀏覽網頁。" : " 的智能体功能强大，可以编辑文件、运行命令以及浏览网页。";
        }
        if (valNorm === "'s agents are powerful and will help you get a lot done better and faster than before, but still make sure to verify the actions taken by the agent.") {
            return USE_TW
                ? " 的代理功能強大，能協助您比以往更好、更快地完成更多工作，但仍請務必驗證代理執行的操作。"
                : " 的智能体功能强大，可帮助您比以往更好、更快地完成更多工作，但仍请务必核验智能体执行的操作。";
        }
        if (valNorm === '(excluding product analytics data)' && (pText.includes('Privacy Notice') || pText.includes('隐私声明') || pText.includes('隱私聲明') || pText.includes('隱私權聲明'))) {
            return USE_TW ? "（不含產品分析資料）" : "（不含产品分析数据）";
        }
        if (valNorm === 'Terms of Service' && pText.startsWith('Google ')) {
            return USE_TW ? " 服務條款" : " 服务条款";
        }
        if (valNorm === 'Sign up for newsletters, informational emails, and special offers about') {
            return USE_TW ? "訂閱有關 " : "订阅有关 ";
        }
        if (valNorm === '.' && (pText.includes('Sign up for newsletters') || pText.includes('订阅有关') || pText.includes('訂閱有關') || pText.includes('订阅关于') || pText.includes('訂閱關於'))) {
            return (pText.includes('以下内容') || pText.includes('以下內容'))
                ? "。"
                : (USE_TW ? " 的電子報、資訊郵件與特別優惠。" : " 的新闻通讯、资讯邮件和特别优惠。");
        }
        if ((valNorm === 'For' || valNorm === ',') && (pText.includes('does not collect and use your Interactions data') || pText.includes('does not collect any of your prompts') || pText.includes('不会收集您的任何提示') || pText.includes('不會收集您的任何提示'))) {
            if (valNorm === 'For') return USE_TW ? "針對 " : "对于 ";
            if (valNorm === ',') return "，";
        }
        if (valNorm === 'does not collect and use your Interactions data for model training, and retains it only to provide the service.') {
            return USE_TW ? " 不會收集或使用您的互動資料進行模型訓練，僅為提供服務而保留該資料。" : " 不会收集或使用您的交互数据进行模型训练，仅为提供服务而保留该数据。";
        }
        if (valNorm.startsWith('does not collect any of your prompts, content, or model responses') && valNorm.includes('general usage patterns such as feature adoption')) {
            return USE_TW
                ? " 不會收集您的任何提示詞、內容或模型回覆，但會收集功能採用率與活躍使用者人數等一般使用模式（「產品分析」）。遙測資料將依據 Google 隱私權政策處理。"
                : " 不会收集您的任何提示词、内容或模型回复，但会收集功能采用率与活跃用户数等常规使用模式（“产品分析”）。遥测数据将按照 Google 隐私政策处理。";
        }
        if ((typeof p.closest === 'function' && p.closest('[data-testid="post-onboarding-welcome-tip"]')) || (p.getAttribute && p.getAttribute('data-testid') === 'post-onboarding-welcome-tip') || pText.includes('to switch to the Gemini app')) {
            if (valNorm === 'Press') return " 按 ";
            if (valNorm === 'to switch to the Gemini app. Your agents keep working in the background.') {
                return USE_TW
                    ? " 即可切換至 Gemini 應用程式。您的代理會在背景繼續執行。"
                    : " 即可切换至 Gemini 应用。您的智能体会在后台继续运行。";
            }
        }
        if (valNorm === 'To switch accounts, sign out in the') {
            return USE_TW ? "如需切換帳戶，請在" : "如需切换账户，请在";
        }
        if ((valNorm === 'settings page' || valNorm === 'settings page.') && (pText.includes('switch accounts') || pText.includes('切换账户') || pText.includes('切換帳戶'))) {
            return USE_TW ? (valNorm.endsWith('.') ? "設定頁面。" : "設定頁面") : (valNorm.endsWith('.') ? "设置页面。" : "设置页面");
        }
        if (valNorm === 'and sign in again.' && (pText.includes('switch accounts') || pText.includes('切换账户') || pText.includes('切換帳戶'))) {
            return USE_TW ? "中登出並重新登入。" : "中退出登录并重新登录。";
        }
        if (valNorm === 'There are currently no Build with') {
            return USE_TW ? "目前沒有可用的 Build with " : "当前没有可用的 Build with ";
        }
        if (valNorm === 'plugins available.' && (pText.includes('Build with') || pText.includes('目前沒有可用的') || pText.includes('当前没有可用的'))) {
            return USE_TW ? " 外掛程式。" : " 插件。";
        }
        if (valNorm === 'Not referenced by any feature (' && pText.includes('Not referenced by any feature')) {
            return "未被任何功能引用 (";
        }
        if (valNorm === 'Only for' && (pText.includes('overrides Global') || pText.includes('覆盖全局') || pText.includes('覆寫全域'))) {
            return USE_TW ? "僅針對 " : "仅针对 ";
        }
        if ((valNorm === 'Allow' || valNorm === 'to access your microphone in' || valNorm === 'to use Voice.') && (pText.includes('to use Voice') || pText.includes('访问您的麦克风') || pText.includes('存取您的麥克風'))) {
            if (valNorm === 'Allow') return USE_TW ? "請允許 " : "请允许 ";
            if (valNorm === 'to access your microphone in') return USE_TW ? " 在 " : " 在 ";
            if (valNorm === 'to use Voice.') return USE_TW ? " 中存取您的麥克風以使用語音功能。" : " 中访问您的麦克风以使用语音功能。";
        }
        if (p.id === 'replay-label' || (typeof p.closest === 'function' && p.closest('#replay-label'))) {
            const ofMatch = valNorm.match(/^of\s+(\d+)(?:\s*·\s*#(\d+)\s+at\s+(.+?)\s*\(\+([^)]+)\))?$/i);
            if (ofMatch) {
                return " / " + ofMatch[1] + (ofMatch[2]
                    ? (" · #" + ofMatch[2] + (USE_TW ? " 於 " : " 于 ") + ofMatch[3] + " (+" + formatCompactDuration(ofMatch[4]) + ")")
                    : "");
            }
            const overMatch = valNorm.match(/^over\s+(.+)$/i);
            if (overMatch) {
                return (USE_TW ? " · 歷時 " : " · 历时 ") + formatCompactDuration(overMatch[1]);
            }
        }
        if (p.tagName === 'OPTION' && p.parentElement) {
            if (p.parentElement.id === 'f-agent' && /^From\s+(.+)$/i.test(valNorm)) {
                return valNorm.replace(/^From\s+(.+)$/i, (_, who) => (USE_TW ? "來自 " : "来自 ") + who);
            }
            if (p.parentElement.id === 'f-mention' && /^To\s+(.+)$/i.test(valNorm)) {
                return valNorm.replace(/^To\s+(.+)$/i, (_, who) => (USE_TW ? "傳給 " : "发给 ") + who);
            }
        }
        if (p.classList && p.classList.contains('chip-name') && /\s+\(you\)$/i.test(valNorm)) {
            return valNorm.replace(/\s+\(you\)$/i, "（你）");
        }
        if (p.classList && p.classList.contains('size') && /\d+\s+lines?$/i.test(valNorm)) {
            return valNorm.replace(/(\d+)\s+lines?$/i, "$1 行");
        }
        if (p.id === 'empty-body') {
            if (valNorm === 'Swarms started in this conversation appear here automatically, with their board, members and @mention graph. Start one with') {
                return USE_TW
                    ? "在此對話中啟動的 Swarm 會自動顯示於此，包含看板、成員清單與 @提及關係圖。輸入 "
                    : "在此会话中启动的 Swarm 会自动显示在这里，包含看板、成员列表和 @提及关系图。输入 ";
            }
            if (valNorm === 'Open this pane from a conversation to see its swarm. Swarms started there appear here automatically; start one with') {
                return USE_TW
                    ? "請從對話中開啟此面板以檢視其 Swarm。在對話中啟動的 Swarm 會自動顯示於此；輸入 "
                    : "请从会话中打开此面板以查看其 Swarm。在会话中启动的 Swarm 会自动显示在这里；输入 ";
            }
            if (valNorm === '.') {
                return USE_TW ? " 即可啟動。" : " 即可启动。";
            }
        }
        if (p.id === 'ov-notice' || (typeof p.closest === 'function' && p.closest('#ov-notice'))) {
            if (valNorm === 'The narrator (') return USE_TW ? "解說員 (" : "解说员 (";
            if (valNorm === ') was stopped. Ask the coordinator to add a new one (') {
                return USE_TW ? ") 已停止。可請協調器新增一個 (" : ") 已停止。可让协调器新增一个 (";
            }
            if (valNorm === ').') return ")。";
        }
        if (p.id === 'ov-ack' || (typeof p.closest === 'function' && p.closest('#ov-ack'))) {
            if (/^Last change:\s*[“"]$/i.test(valNorm)) return USE_TW ? "上次變更：「" : "上次变更：“";
            if (/^[”"]$/.test(valNorm)) return USE_TW ? "」" : "”";
        }
        if ((p.classList && p.classList.contains('o2-progt')) || (typeof p.closest === 'function' && p.closest('.o2-progt'))) {
            const progMatch = valNorm.match(/^(\d+)\s+of\s+(\d+)$/i);
            if (progMatch) return progMatch[1] + " / " + progMatch[2];
            if (/^tasks?\s+done$/i.test(valNorm)) {
                return (originalVal.startsWith(' ') ? ' ' : '') + (USE_TW ? "項任務已完成" : "项任务已完成");
            }
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
                const inSwarmEl = isSwarmUiContext(node);
                for (const attr of ['placeholder', 'title', 'aria-label']) {
                    const v = node.getAttribute(attr);
                    if (v) {
                        const t = norm(v);
                        let newAttr = translatePermissionChoice(v);
                        if (!newAttr && inSwarmEl && Object.prototype.hasOwnProperty.call(SCOPED_SWARM_MAP, t)) {
                            newAttr = SCOPED_SWARM_MAP[t][USE_TW ? 1 : 0];
                        }
                        if (!newAttr) {
                            if (isFilePathOrUri(t)) continue;
                            newAttr = translateExactOrDynamic(t);
                        }
                        if (!newAttr && inSwarmEl) {
                            newAttr = translateSwarmComposite(v);
                        }
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

                // 处理 v2.31.0 Coordinator 逐词流式欢迎语段落
                if (node.getAttribute && node.getAttribute('data-testid') === 'coordinator-welcome') {
                    const paragraphs = node.querySelectorAll ? node.querySelectorAll('p') : [];
                    for (const p of paragraphs) {
                        const pNorm = norm(p.textContent || '');
                        if (/^Welcome to\s+(.+?)\.\s*I coordinate the work for this project\./i.test(pNorm)) {
                            const strongEl = p.querySelector && p.querySelector('strong');
                            const nameClone = strongEl ? strongEl.cloneNode(true) : null;
                            p.textContent = '';
                            p.appendChild(document.createTextNode(USE_TW ? '歡迎使用 ' : '欢迎使用 '));
                            if (nameClone) p.appendChild(nameClone);
                            p.appendChild(document.createTextNode(USE_TW
                                ? '。我負責協調此專案的工作。您可以向我提問或交辦任務，我會直接回覆或啟動並行工作代理。'
                                : '。我负责协调此项目的工作。您可以向我提问或交办任务，我会直接回答或启动并行工作代理。'));
                            p.setAttribute('translate', 'no');
                        } else if (/^(?:You|您)\s+can follow the workers in the Dashboard/i.test(pNorm)) {
                            p.textContent = USE_TW
                                ? '您可以在儀表板中追蹤工作代理的進度，當任務完成或需要您處理時，我會發布更新。'
                                : '您可以在仪表盘中跟进工作代理的进度，当任务完成或需要您处理时，我会发布更新。';
                            p.setAttribute('translate', 'no');
                        }
                    }
                    return;
                }

                // 处理新手引导 "Get Anything Done with <AppName>" 拆分文本节点
                if (/^Get Anything Done with\s+(.+)$/i.test(elText)) {
                    const textChildren = Array.from(node.childNodes).filter(c => c.nodeType === Node.TEXT_NODE);
                    if (textChildren.length >= 2 && norm(textChildren[0].nodeValue) === 'Get Anything Done with') {
                        textChildren[0].nodeValue = USE_TW ? '使用 ' : '用 ';
                        translatedValues.set(textChildren[0], textChildren[0].nodeValue);
                        const suffixNode = document.createTextNode(' 搞定一切');
                        translatedValues.set(suffixNode, suffixNode.nodeValue);
                        node.appendChild(suffixNode);
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

                if (translatedValues.get(node) !== originalVal) {
                    const permChoiceTrans = translatePermissionChoice(originalVal);
                    if (permChoiceTrans && permChoiceTrans !== originalVal) {
                        translatedValues.set(node, permChoiceTrans);
                        node.nodeValue = permChoiceTrans;
                        return;
                    }
                }

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
                if ((valNorm === 'New' || (cachedValue === originalVal && valNorm === map.get('New'))) && node.parentElement?.getAttribute?.('data-testid') === 'swarm-unread-divider') {
                    const unreadLabel = USE_TW ? '新訊息' : '新消息';
                    if (originalVal !== unreadLabel) {
                        translatedValues.set(node, unreadLabel);
                        node.nodeValue = unreadLabel;
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
                const inSwarmText = isSwarmUiContext(node.parentElement);
                const scopedSwarmHit = (inSwarmText && Object.prototype.hasOwnProperty.call(SCOPED_SWARM_MAP, valNorm))
                    ? SCOPED_SWARM_MAP[valNorm][USE_TW ? 1 : 0]
                    : null;
                const commonTrans = scopedSwarmHit !== null ? scopedSwarmHit : translateExactOrDynamic(valNorm);
                if (commonTrans !== null) {
                    newVal = commonTrans;
                } else {
                    const ctxTrans = translateContextualText(node, originalVal, valNorm);
                    if (ctxTrans !== null) {
                        newVal = ctxTrans;
                    } else {
                        const swarmComp = inSwarmText ? translateSwarmComposite(originalVal) : null;
                        if (swarmComp !== null) {
                            newVal = swarmComp;
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
    if (typeof window !== 'undefined') {
        window.__agCnRuntimeStart = startEngine;
    }

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
