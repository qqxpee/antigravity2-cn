const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createDom, loadRuntime } = require('./helpers/runtime-loader.cjs');

// 繁体模式：React 拆段句子的空白收合、译文片段前后空白、字体图标 SVG 与名称字段（v2.35.1 审查回归）
const settle = () => new Promise(resolve => setTimeout(resolve, 35));

test('CJK gap handling follows node removal, deep inline edits, author whitespace, reused separators and streaming neighbors', async t => {
    const dom = createDom('<!doctype html><html><body></body></html>');
    t.after(() => dom.window.close());
    const win = dom.window;
    const doc = win.document;
    const pause = settle;
    // 停用启动后 100ms～6s 的多阶段全文扫描：扫描落在计数区间内，会把整份文件的读取次数算进来
    win.setTimeout = () => 0;
    win.eval(loadRuntime({ traditional: true }));
    const add = html => { const el = doc.createElement('div'); el.innerHTML = html; doc.body.append(el); return el; };

    const removal = add('<span>Settings<!----> <!----><b>Help</b>Bob</span>');
    const deep = add('<span>Settings<!----> <!----><a><span><span><span>Help</span></span></span></a></span>');
    const author = add('<span style="white-space:pre-wrap">甲<!----> <!---->乙</span>');
    const sep = add('<span>Settings<!----> <!---->Help</span>');
    const stream = doc.createTextNode('測試');
    const host = doc.createElement('div');
    host.setAttribute('data-testid', 'planner-response-text');
    const section = doc.createElement('section');
    for (let i = 0; i < 1200; i++) { const s = doc.createElement('span'); s.textContent = 'abcdefghij'; section.append(s); }
    host.append(stream, section);
    const box = doc.createElement('div');
    box.append('甲', ' ', host);
    doc.body.append(box);
    await pause();
    assert.equal(removal.textContent, '設定說明Bob');
    assert.equal(deep.textContent, '設定說明');
    // 两侧都不是这里翻译出来的中文（作者刻意留的空白、用户或 AI 的内容）：不动
    assert.equal(author.textContent, '甲 乙');

    // React 只删除节点（addedNodes 为空）：删除位置两侧重新判断，空白还原
    removal.querySelector('b').remove();
    // 四层行内标记里的文字换成英文：外层的空白也要还原
    deep.querySelector('a span span span').firstChild.data = 'Bob';
    await pause();
    assert.equal(removal.textContent, '設定 Bob');
    assert.equal(deep.textContent, '設定 Bob');

    // 收掉的空白被 React 改成分隔字再清空：旧纪录作废，之后不得「还原」出已删掉的空白
    const sepSpan = sep.firstChild;
    const gap = Array.from(sepSpan.childNodes).find(n => n.nodeType === win.Node.TEXT_NODE && n.data === '');
    gap.data = '/';
    await pause();
    gap.data = '';
    await pause();
    sepSpan.firstChild.data = 'Alice';
    sepSpan.lastChild.data = 'Bob';
    await pause();
    assert.equal(sep.textContent, 'AliceBob');

    // 串流中的 AI 回复紧邻空白：判断空白时不读整段回复，也不收掉两侧都未经翻译的空白
    const desc = Object.getOwnPropertyDescriptor(win.Node.prototype, 'textContent');
    let hostReads = 0;
    Object.defineProperty(host, 'textContent', { configurable: true, get() { hostReads++; return desc.get.call(this); } });
    for (let i = 0; i < 3; i++) { stream.data = '測試' + i; await pause(); }
    delete host.textContent;
    assert.equal(hostReads, 0);
    assert.ok(box.textContent.startsWith('甲 測試2'), box.textContent.slice(0, 8));
});

test('icon fallbacks clean up after the icon class is removed and keep accessible names; attribute rules and source ellipsis survive', async t => {
    const dom = createDom('<!doctype html><html><body></body></html>');
    t.after(() => dom.window.close());
    const win = dom.window;
    const doc = win.document;
    const pause = settle;
    // 停用启动后 100ms～6s 的多阶段全文扫描：慢机器上扫描落在两次断言之间，会改变刻意构造的多文字节点图标宿主等结果
    win.setTimeout = () => 0;
    win.eval(loadRuntime({ traditional: true }));
    const add = html => { const el = doc.createElement('div'); el.innerHTML = html; doc.body.append(el); return el; };

    const icon = add('<span class="google-symbols">comment</span>');
    const buttons = add('<button><span class="google-symbols">comment</span></button><button><span class="google-symbols" aria-hidden="true">comment</span></button>');
    const labels = add('<button aria-label="Label for Foo">a</button><button aria-label="Open the Swarm UI">b</button><button aria-label="Open Settings">c</button>');
    const ellipsis = add('<span>Show 3 more results…</span><button title="Show 3 more…">x</button>');
    await pause();

    // React 重用图标的文字节点、拿掉图标 class 并改成一般文字：补画的 SVG 要移除
    const iconSpan = icon.firstChild;
    assert.equal(iconSpan.querySelectorAll('svg').length, 1);
    iconSpan.className = '';
    Array.from(iconSpan.childNodes).find(n => n.nodeType === win.Node.TEXT_NODE).data = 'Help';
    await pause();
    assert.equal(iconSpan.querySelectorAll('svg').length, 0);
    assert.equal(iconSpan.textContent, '說明');

    // 按钮只靠图标名称提供无障碍名称：清空文字后由 SVG 带著名称；宿主已隐藏时 SVG 也隐藏
    const [named, hidden] = buttons.querySelectorAll('svg');
    assert.equal(named.getAttribute('role'), 'img');
    assert.equal(named.getAttribute('aria-label'), '評論');
    assert.equal(hidden.getAttribute('aria-hidden'), 'true');
    assert.equal(hidden.hasAttribute('aria-label'), false);

    // 属性：既有规则照常生效；代入的片段是完整英文词组时保留原文，不拼成中英夹杂
    const [labelFor, swarm, open] = labels.querySelectorAll('button');
    assert.equal(labelFor.getAttribute('aria-label'), 'Foo 的標籤');
    assert.equal(swarm.getAttribute('aria-label'), 'Open the Swarm UI');
    assert.equal(open.getAttribute('aria-label'), '開啟設定');

    // 原文用单一字符的「…」时，译文也用「…」
    assert.equal(ellipsis.querySelector('span').textContent, '顯示另外 3 個結果…');
    assert.equal(ellipsis.querySelector('button').getAttribute('title'), '顯示另外 3 個…');
});

test('CJK spacing keeps the space beside Latin or symbols, ignores reused nodes, skips fillers the same way on both sides, re-checks grown ancestors, stays bounded and leaves editors alone', async t => {
    const dom = createDom('<!doctype html><html><body></body></html>');
    t.after(() => dom.window.close());
    const win = dom.window;
    const doc = win.document;
    const pause = settle;
    // JSDOM 没有实作 isContentEditable：照浏览器的行为补上，才能测「事后变成可编辑」的段落
    Object.defineProperty(win.HTMLElement.prototype, 'isContentEditable', { configurable: true, get() { return !!this.closest('[contenteditable="true"]'); } });
    // 停用启动后 100ms～6s 的多阶段全文扫描：扫描落在计数区间内，会把整份文件的读取次数算进来
    win.setTimeout = () => 0;
    win.eval(loadRuntime({ traditional: true }));
    const el = (tag, ...parts) => { const e = doc.createElement(tag); for (const p of parts) e.append(p); return e; };
    const para = (...parts) => { const p = el('p', ...parts); doc.body.append(p); return p; };
    // v2.35.1 声明权限对话框的实际切法（名称之后的片段）
    const rest = [' run in a dedicated', ' ', 'workspace', ' with its own permissions, which you can change anytime in the ', 'workspace', ' settings page.'];
    const tail = '建立的代理執行於專用的工作區中並擁有獨立權限，您可以隨時在工作區設定頁面中變更。';

    // 译文靠空白那一侧是英文或符号：空白保留
    const google = para('by allowing Google to collect and use my Interactions data, subject to the Google ', el('a', 'Privacy Policy'));
    const crumb = para('Settings - ', el('a', 'General'));
    // 曾是译文的节点被 React 重用为用户内容
    const reused = para('Settings', ' ', '乙');
    // 片段与名称之间有空文字节点（占位）
    const filler = para('Agents created by ', '', '我的外掛', ...rest);
    // 名称是行内小元素，之后 React 在开头插入第三个子元素
    const inline = el('span', el('b', '我的'), el('i', '外掛'));
    const grown = para('Agents created by ', inline, ...rest);
    // 翻译后才变成可编辑的段落
    const editable = para('Agents created by ', 'Foo', ...rest);
    await pause();

    assert.equal(google.textContent, '，允許 Google 收集並使用我的互動資料，並遵守 Google 隱私權政策');
    assert.equal(crumb.textContent, '設定 - 一般');

    assert.equal(reused.textContent, '設定乙');
    reused.firstChild.data = '甲';
    await pause();
    assert.equal(reused.textContent, '甲 乙');
    // 用户内容之后刚好等于旧译文：不再当作本套件的译文，两侧都是用户的中文，空白不动
    reused.firstChild.data = '設定';
    await pause();
    assert.equal(reused.textContent, '設定 乙');

    assert.equal(filler.textContent, '由我的外掛' + tail);
    filler.childNodes[2].data = 'Foo';
    await pause();
    assert.equal(filler.textContent, '由 Foo ' + tail);

    assert.equal(grown.textContent, '由我的外掛' + tail);
    inline.prepend(el('em', 'Foo'));
    await pause();
    assert.ok(grown.textContent.startsWith('由 Foo我的外掛 建立'), grown.textContent);

    assert.equal(editable.textContent, '由 Foo ' + tail);
    editable.setAttribute('contenteditable', 'true');
    editable.childNodes[1].data = '我的';
    await pause();
    assert.equal(editable.textContent, '由 我的 ' + tail);

    // 紧邻空白的元素开头有大量空文字节点（例如串流回复）：每次变动只看有限个邻居
    const nodeTypeDesc = Object.getOwnPropertyDescriptor(win.Node.prototype, 'nodeType');
    const countReads = async fillers => {
        const reply = el('div');
        for (let i = 0; i < fillers; i++) reply.append('');
        const stream = doc.createTextNode('x');
        reply.append(stream);
        para('Settings', ' ', reply);
        await pause();
        let reads = 0;
        Object.defineProperty(win.Node.prototype, 'nodeType', { configurable: true, get() { reads++; return nodeTypeDesc.get.call(this); } });
        try {
            for (let i = 0; i < 3; i++) { stream.data = 'y' + i; await pause(); }
        } finally {
            Object.defineProperty(win.Node.prototype, 'nodeType', nodeTypeDesc);
        }
        return reads;
    };
    const few = await countReads(0);
    const many = await countReads(1000);
    assert.ok(many - few < 200, `nodeType 讀取次數：沒有空節點 ${few}、1000 個空節點 ${many}`);
});

test('icon fallbacks handle blank text, host label removal and reused text nodes; capitalized names stay translatable and a moved source ellipsis keeps its form', async t => {
    const dom = createDom('<!doctype html><html><body></body></html>');
    t.after(() => dom.window.close());
    const win = dom.window;
    const doc = win.document;
    const pause = settle;
    // 停用启动后 100ms～6s 的多阶段全文扫描：慢机器上扫描落在两次断言之间，会改变刻意构造的多文字节点图标宿主等结果
    win.setTimeout = () => 0;
    win.eval(loadRuntime({ traditional: true }));
    const add = html => { const el = doc.createElement('div'); el.innerHTML = html; doc.body.append(el); return el; };
    const textOf = el => Array.from(el.childNodes).find(n => n.nodeType === win.Node.TEXT_NODE);

    const blank = add('<span class="google-symbols">comment</span>');
    const labelled = add('<button><span class="google-symbols" aria-label="Comments">comment</span></button>');
    const sentence = doc.createElement('p');
    for (const t of ['Agents created by ', '我的外掛', ' run in a dedicated', ' ', 'workspace', ' settings page.']) sentence.append(t);
    doc.body.append(sentence);
    const attrs = add('<button title="Keep: My Project">a</button><button aria-label="Label for Foo…">b</button>');
    await pause();

    // 图标文字改成空白：补画的 SVG 要移除，不能被空白判断提早挡下
    const blankHost = blank.firstChild;
    assert.equal(blankHost.querySelectorAll('svg').length, 1);
    textOf(blankHost).data = ' ';
    await pause();
    assert.equal(blankHost.querySelectorAll('svg').length, 0);

    // 宿主另有名称时 SVG 隐藏；React 拿掉宿主的名称后，改由 SVG 带图标名称
    const labelledHost = labelled.querySelector('.google-symbols');
    const labelledSvg = labelledHost.querySelector('svg');
    assert.equal(labelledSvg.getAttribute('aria-hidden'), 'true');
    labelledHost.removeAttribute('aria-label');
    await pause();
    assert.equal(labelledSvg.hasAttribute('aria-hidden'), false);
    assert.equal(labelledSvg.getAttribute('role'), 'img');
    assert.ok(labelledSvg.getAttribute('aria-label'));

    // 曾显示「由 」的文字节点被重用为图标：之后邻近内容改变，也不得把「由 」写回 SVG 旁
    const prefix = sentence.firstChild;
    assert.equal(prefix.data, '由');
    sentence.className = 'google-symbols';
    prefix.data = 'comment';
    await pause();
    assert.equal(sentence.querySelectorAll('svg').length, 1);
    sentence.childNodes[2].data = 'Foo';
    await pause();
    assert.equal(prefix.data, '');

    // 大写开头的是名称，不是英文词组：照常套用规则
    const [keep, labelFor] = attrs.querySelectorAll('button');
    assert.equal(keep.getAttribute('title'), '保留：My Project');
    // 规则调整语序后，原文结尾的「…」落在译文中间，仍维持原文的写法
    assert.equal(labelFor.getAttribute('aria-label'), 'Foo… 的標籤');
});

test('dictionary fragments drop built-in edge spaces next to Chinese names, restore them when React swaps the name, and leave user-chosen names untranslated', async t => {
    const dom = createDom('<!doctype html><html><body></body></html>');
    t.after(() => dom.window.close());
    const win = dom.window;
    const doc = win.document;
    const pause = settle;
    // 停用启动后 100ms～6s 的多阶段全文扫描：慢机器上扫描落在两次断言之间，会改变刻意构造的多文字节点图标宿主等结果
    win.setTimeout = () => 0;
    win.eval(loadRuntime({ traditional: true }));
    // v2.35.1 声明权限对话框的实际切法：每段字符串是独立文字节点，名称是第 2 个节点
    const sentence = name => {
        const p = doc.createElement('p');
        for (const t of ['Agents created by ', name, ' run in a dedicated', ' ', 'workspace', ' with its own permissions, which you can change anytime in the ', 'workspace', ' settings page.']) p.append(t);
        doc.body.append(p);
        return p;
    };
    const tail = '建立的代理執行於專用的工作區中並擁有獨立權限，您可以隨時在工作區設定頁面中變更。';
    const cjk = sentence('自動化任務');
    const latin = sentence('Foo Plugin');
    // 名称是用户取的：刚好和字典词条相同（Settings）也不翻译
    const dictionaryName = sentence('Settings');
    await pause();
    assert.equal(cjk.textContent, '由自動化任務' + tail);
    assert.equal(latin.textContent, '由 Foo Plugin ' + tail);
    assert.equal(dictionaryName.textContent, '由 Settings ' + tail);

    cjk.childNodes[1].data = 'Foo Plugin';
    latin.childNodes[1].data = '我的外掛';
    await pause();
    assert.equal(cjk.textContent, '由 Foo Plugin ' + tail);
    assert.equal(latin.textContent, '由我的外掛' + tail);
});

test('SC mode: automation sentence fragments drop edge spaces next to Chinese names, keep user-chosen names, and icon names stay untranslated', async t => {
    const dom = createDom('<!doctype html><html><body></body></html>');
    t.after(() => dom.window.close());
    const win = dom.window;
    const doc = win.document;
    // 停用启动后 100ms～6s 的多阶段全文扫描：慢机器上扫描落在两次断言之间，会改变刻意构造的多文字节点图标宿主等结果
    win.setTimeout = () => 0;
    win.eval(loadRuntime());
    // v2.35.1 自动化智能体权限说明的实际切法：名称是独立文字节点
    const rest = [' run in a dedicated', ' ', 'workspace', ' with its own permissions, which you can change anytime in the ', 'workspace', ' settings page.'];
    const tail = '创建的智能体运行在专用的工作区中并拥有独立权限，您可以随时在工作区设置页面中更改。';
    const sentence = name => { const p = doc.createElement('p'); for (const s of ['Agents created by ', name, ...rest]) p.append(s); doc.body.append(p); return p; };
    const cjk = sentence('我的插件');
    const latin = sentence('Foo Plugin');
    const dictName = sentence('Settings');
    const icons = doc.createElement('div');
    icons.innerHTML = '<span class="google-symbols">comment</span><span class="google-symbols">settings</span>';
    doc.body.append(icons);
    await settle();

    assert.equal(cjk.textContent, '由我的插件' + tail);
    assert.equal(latin.textContent, '由 Foo Plugin ' + tail);
    // 名称由用户命名：刚好与词典词条相同也不翻译
    assert.equal(dictName.textContent, '由 Settings ' + tail);
    assert.equal(icons.querySelectorAll('svg[data-ag-icon-fallback="comment"]').length, 1);
    assert.equal(icons.textContent, 'settings');

    // React 换掉名称：空白依新名称重新判断
    cjk.childNodes[1].data = 'Foo Plugin';
    latin.childNodes[1].data = '我的插件';
    await settle();
    assert.equal(cjk.textContent, '由 Foo Plugin ' + tail);
    assert.equal(latin.textContent, '由我的插件' + tail);
});
