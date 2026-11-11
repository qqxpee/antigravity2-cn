const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createDom, loadRuntime } = require('./helpers/runtime-loader.cjs');

const settle = () => new Promise(resolve => setTimeout(resolve, 35));

async function fixture(t, html, beforeInject) {
    const dom = createDom(html);
    t.after(() => dom.window.close());
    beforeInject?.(dom.window);
    dom.window.eval(loadRuntime());
    await settle();
    return dom.window;
}

test('File Viewer isolation survives translating its accessible name', async t => {
    const w = await fixture(t, '<div aria-label="File Viewer"><span id="file">Settings</span></div><button id="ui">Settings</button>');
    assert.equal(w.document.querySelector('#file').textContent, 'Settings');
    assert.equal(w.document.querySelector('#ui').textContent, '设置');
    const file = w.document.querySelector('#file');
    file.textContent = 'Knowledge';
    await settle();
    assert.equal(file.textContent, 'Knowledge', 'subsequent mutations inside the file viewer must stay isolated');
});

test('textarea initial value and defaultValue are preserved while unfocused', async t => {
    const w = await fixture(t, '<textarea id="draft">Settings</textarea><button>Settings</button>');
    const draft = w.document.querySelector('#draft');
    assert.equal(draft.value, 'Settings');
    assert.equal(draft.defaultValue, 'Settings');
    assert.equal(draft.textContent, 'Settings');
    assert.equal(w.document.querySelector('button').textContent, '设置');
});

test('textarea dirty value and focused value survive initial and subsequent translation', async t => {
    const w = await fixture(t, '<textarea id="draft">Settings</textarea>', window => {
        const draft = window.document.querySelector('#draft');
        draft.value = 'Knowledge';
        draft.focus();
    });
    const draft = w.document.querySelector('#draft');
    assert.equal(draft.value, 'Knowledge');
    assert.equal(draft.defaultValue, 'Settings');
    draft.blur();
    draft.defaultValue = 'New Conversation';
    await settle();
    assert.equal(draft.value, 'Knowledge', 'changing the default must not overwrite the dirty draft');
    assert.equal(draft.defaultValue, 'New Conversation');
});

test('input values and contenteditable drafts remain unmodified', async t => {
    const w = await fixture(t, '<input id="input" value="Settings"><div contenteditable="true" id="editable">Knowledge</div><div contenteditable="plaintext-only" id="plain">Settings</div>');
    const input = w.document.querySelector('#input');
    assert.equal(input.value, 'Settings');
    assert.equal(input.defaultValue, 'Settings');
    assert.equal(w.document.querySelector('#editable').textContent, 'Knowledge');
    assert.equal(w.document.querySelector('#plain').textContent, 'Settings');
    input.value = 'Knowledge';
    w.document.querySelector('#editable').textContent = 'New Conversation';
    await settle();
    assert.equal(input.value, 'Knowledge');
    assert.equal(input.defaultValue, 'Settings');
    assert.equal(w.document.querySelector('#editable').textContent, 'New Conversation');
});

test('user messages, AI responses, code and URI-marked previews remain isolated', async t => {
    const w = await fixture(t, `
      <div data-testid="user-input-step"><div data-quotable="true" id="user">Settings</div></div>
      <div data-testid="planner-response-text" id="ai">Knowledge</div>
      <pre id="pre">Settings</pre><code id="code">Knowledge</code>
      <div data-file-uri="file:///example.txt" id="file">New Conversation</div>
      <div data-uri="file:///example.txt" id="uri">Settings</div>
      <div translate="no" id="no">Knowledge</div>
      <div id="absolute">C:\\Settings\\New Conversation</div>
      <div id="url">file:///Settings/Knowledge</div>
      <button id="ui">Settings</button>
    `);
    for (const [id, expected] of [
        ['user', 'Settings'], ['ai', 'Knowledge'], ['pre', 'Settings'], ['code', 'Knowledge'],
        ['file', 'New Conversation'], ['uri', 'Settings'], ['no', 'Knowledge'],
        ['absolute', 'C:\\Settings\\New Conversation'], ['url', 'file:///Settings/Knowledge'],
    ]) {
        assert.equal(w.document.getElementById(id).textContent, expected, id);
    }
    assert.equal(w.document.querySelector('#ui').textContent, '设置');
});

test('protected shadow hosts keep initial and dynamic descendants untouched', async t => {
    let shadow;
    const w = await fixture(t, '<div id="host" data-file-uri="file:///example.txt"></div>', window => {
        shadow = window.document.querySelector('#host').attachShadow({ mode: 'open' });
        shadow.innerHTML = '<span id="inside">Settings</span>';
    });
    assert.equal(shadow.querySelector('#inside').textContent, 'Settings');
    shadow.querySelector('#inside').textContent = 'Knowledge';
    const added = w.document.createElement('span');
    added.textContent = 'New Conversation';
    shadow.appendChild(added);
    await settle();
    assert.equal(shadow.querySelector('#inside').textContent, 'Knowledge');
    assert.equal(added.textContent, 'New Conversation');
});

test('native select preserves implicit and explicit option values and selection', async t => {
    const w = await fixture(t, '<form><select name="choice" id="pick"><option>Settings</option><option value="stable-id" selected>Knowledge</option></select></form>');
    const pick = w.document.querySelector('#pick');
    assert.equal(pick.options[0].value, 'Settings', 'an implicit value must not become a translated label');
    assert.equal(pick.options[1].value, 'stable-id');
    assert.equal(pick.options[1].defaultSelected, true);
    assert.equal(pick.selectedIndex, 1);
    assert.equal(pick.value, 'stable-id');
    assert.equal(new w.FormData(w.document.querySelector('form')).get('choice'), 'stable-id');
});

test('dynamic native option updates preserve form submission values', async t => {
    const w = await fixture(t, '<form><select name="choice" id="pick"><option>Settings</option></select></form>');
    const pick = w.document.querySelector('#pick');
    pick.options[0].textContent = 'Knowledge';
    await settle();
    assert.equal(pick.options[0].value, 'Knowledge');
    assert.equal(new w.FormData(w.document.querySelector('form')).get('choice'), 'Knowledge');
    const added = w.document.createElement('option');
    added.textContent = 'New Conversation';
    pick.appendChild(added);
    pick.selectedIndex = 1;
    await settle();
    assert.equal(added.value, 'New Conversation');
    assert.equal(new w.FormData(w.document.querySelector('form')).get('choice'), 'New Conversation');
});

test('input and textarea placeholders and titles are translated while values remain untouched', async t => {
    const w = await fixture(t, '<input id="search" placeholder="Search tasks..." title="Search tasks..." value="Settings"><textarea id="draft" placeholder="Search conversations...">Settings</textarea>');
    const search = w.document.querySelector('#search');
    const draft = w.document.querySelector('#draft');
    assert.equal(search.getAttribute('placeholder'), '搜索任务...');
    assert.equal(search.getAttribute('title'), '搜索任务...');
    assert.equal(search.value, 'Settings');
    assert.equal(draft.getAttribute('placeholder'), '搜索会话...');
    assert.equal(draft.value, 'Settings');
});

test('dynamic permission choices translate around commands without altering payloads or code blocks', async t => {
    const cmd = `'$p="$HOME\\.gemini\\GEMINI.md"; Get-Content $p'`;
    const w = await fixture(t, `
        <h2 id="title">Allow running this command outside the sandbox?</h2>
        <button id="conv"></button>
        <button id="proj"></button>
        <button id="unscoped"></button>
        <button id="static-conv">Yes, and always allow in this conversation</button>
        <pre id="code">Yes, and always allow 'command'</pre>
    `, window => {
        window.document.getElementById('conv').textContent = `Yes, and always allow ${cmd} in this conversation`;
        window.document.getElementById('proj').textContent = `Yes, and always allow ${cmd} in this project`;
        window.document.getElementById('unscoped').textContent = `Yes, and always allow echo run  in this conversation`;
    });
    assert.equal(w.document.getElementById('title').textContent, '是否允许在沙箱外运行此命令？');
    assert.equal(w.document.getElementById('conv').textContent, `是，且在此会话中始终允许运行 ${cmd}`);
    assert.equal(w.document.getElementById('proj').textContent, `是，且在此项目中始终允许运行 ${cmd}`);
    assert.equal(w.document.getElementById('unscoped').textContent, '是，且始终允许运行 echo run  in this conversation');
    assert.equal(w.document.getElementById('static-conv').textContent, '是，且在此会话中始终允许');
    assert.equal(w.document.getElementById('code').textContent, "Yes, and always allow 'command'");
});

test('permission write-in translates reject label and placeholder while preserving input value', async t => {
    const w = await fixture(t, '<label><input type="radio" value="__write_in__"><div><span id="reject">No</span><textarea id="answer" data-testid="ask-question-writein" placeholder="(tell the agent what to do instead)">No</textarea></div></label><span id="other">No</span>');
    const answer = w.document.getElementById('answer');
    assert.equal(w.document.getElementById('reject').textContent, '否');
    assert.equal(answer.getAttribute('placeholder'), '（告诉智能体改做什么）');
    assert.equal(answer.value, 'No');
    assert.equal(w.document.getElementById('other').textContent, 'No');
});

test('v2.30.0 and v2.31.0 dynamic and static UI strings translate in both SC and TC', async t => {
    const html = `
      <div id="port-title">Nothing is running on port 5173</div>
      <div id="port-desc">No server is listening on port 5173 inside the remote workspace. Start it, or ask the agent to, then retry.</div>
      <button id="unsafe">Proceed to localhost (unsafe)</button>
      <button id="unsafe-split">Proceed to <!-- -->localhost<!-- --> (unsafe)</button>
      <h2 id="nux-heading-split">Get Anything Done with <!-- -->Antigravity</h2>
      <div id="cert-err">The certificate was rejected (ERR_CERT_AUTHORITY_INVALID).</div>
      <p id="cert-adv">localhost normally uses encryption to protect your information. When the browser tried to connect to localhost this time, the website sent back unusual and incorrect credentials. The certificate is not issued by a trusted authority.</p>
      <span id="cookie-clear">Clearing cookies and site data for <span class="font-medium">example.com</span> may sign you out of this site.</span>
      <span id="nux-consent">Allow Google to collect and use your Interactions data, subject to the <a>Google Terms of Service</a>, to help us improve and develop Antigravity and other Google machine-learning products and models in accordance with the <a>Antigravity<!-- --> Privacy Notice</a>. You can control this from your settings at any point.</span>
      <p id="nux-opt">Customize your experience across the agent, plugins, and product from the settings and marketplace. We won't show you ads or let advertisers influence what Antigravity says.</p>
      <p id="nux-ctrl">Antigravity's agents are powerful and will help you get a lot done better and faster than before, but still make sure to verify the actions taken by the agent.</p>
      <p id="nux-corp">For <span>Acme</span>, Antigravity does not collect any of your prompts, content, or model responses but will still collect general usage patterns (e.g., feature adoption, active user counts).</p>
      <h1 id="hey-name">Hey Alice!</h1>
      <div id="voice-stats">3 calls · 1.2 MB</div>
      <div id="voice-del">This deletes 3 call recordings (1.2 MB) from your machine. You can't undo this.</div>
      <div id="perm-setup" aria-label="Reads, 2 grants">Set up GitHub</div>
      <div id="cel-step">Step 1 of 3</div>
      <button id="cel-more">+4 more</button>
      <div id="nux" title="Help us improve Antigravity.">One last thing before getting started...</div>
      <div id="cel" aria-label="Available CEL helper functions">Valid CEL</div>
      <div id="layout-kw-title">Knowledge Work</div>
      <div id="layout-kw-desc">Simplified interface for research, writing, and everyday tasks.</div>
      <div id="layout-se-title">Software Engineering</div>
      <div id="layout-se-desc">Full interface for coding, developer tools, and managing agents.</div>
      <span id="perm-subtitle">Configure what the agent can do in local and remote conversations.</span>
      <span id="unreferenced">Not referenced by any feature (<!-- -->3<!-- -->)</span>
      <div id="no-mcp">No MCP servers found for &quot;<!-- -->postgres<!-- -->&quot;</div>
      <button id="coord-create" title="Coordinator settings">Create Coordinator</button>
      <button id="auth-trouble">Trouble signing in? Enter authorization code</button>
    `;
    const w = await fixture(t, html);
    assert.equal(w.document.getElementById('port-title').textContent, '端口 5173 上没有正在运行的服务');
    assert.equal(w.document.getElementById('port-desc').textContent, '远程工作区内的端口 5173 上没有正在监听的服务器。请启动该服务器，或让智能体启动它，然后重试。');
    assert.equal(w.document.getElementById('unsafe').textContent, '继续前往 localhost（不安全）');
    assert.equal(w.document.getElementById('unsafe-split').textContent, '继续前往 localhost（不安全）');
    assert.equal(w.document.getElementById('nux-heading-split').textContent, '使用 Antigravity 完成任何工作');
    assert.equal(w.document.getElementById('cert-err').textContent, '证书已被拒绝 (ERR_CERT_AUTHORITY_INVALID)。');
    assert.equal(w.document.getElementById('cert-adv').textContent, 'localhost 通常使用加密技术来保护您的信息。当浏览器本次尝试连接到 localhost 时，该网站发回了异常且不正确的凭据。 证书并非由受信任的机构颁发。');
    assert.equal(w.document.getElementById('cookie-clear').textContent, '正在清除以下站点的 Cookie 和网站数据：example.com可能会导致您退出此网站。');
    assert.equal(w.document.getElementById('nux-consent').textContent, '允许 Google 收集并使用您的交互数据，但须遵守Google 服务条款，以帮助我们改进和开发 Antigravity 及其他 Google 机器学习产品与模型（遵循 Antigravity隐私声明）。您可以随时在设置中控制此选项。');
    assert.equal(w.document.getElementById('nux-opt').textContent, '在设置和插件市场中自定义涵盖智能体、插件和产品的使用体验。我们不会向您展示广告，也不会让广告商影响 Antigravity 的回答内容。');
    assert.equal(w.document.getElementById('nux-ctrl').textContent, 'Antigravity 的智能体功能强大，能帮助您比以往更好、更快地完成大量工作，但仍请务必核实智能体所执行的操作。');
    assert.equal(w.document.getElementById('nux-corp').textContent, '对于 Acme，不会收集您的任何提示词、内容或模型响应，但仍会收集一般使用模式（例如功能采用率、活跃用户数）。');
    assert.equal(w.document.getElementById('hey-name').textContent, '嗨，Alice！');
    assert.equal(w.document.getElementById('voice-stats').textContent, '3 次通话 · 1.2 MB');
    assert.equal(w.document.getElementById('voice-del').textContent, '这将从您的本机删除 3 条通话录音记录 (1.2 MB)。此操作无法撤销。');
    assert.equal(w.document.getElementById('perm-setup').getAttribute('aria-label'), '读取权限，2 项授权');
    assert.equal(w.document.getElementById('perm-setup').textContent, '设置 GitHub');
    assert.equal(w.document.getElementById('cel-step').textContent, '第 1 步（共 3 步）');
    assert.equal(w.document.getElementById('cel-more').textContent, '+4 项更多');
    assert.equal(w.document.getElementById('nux').getAttribute('title'), '帮助我们改进 Antigravity。');
    assert.equal(w.document.getElementById('nux').textContent, '在开始之前，还有最后一件事...');
    assert.equal(w.document.getElementById('cel').getAttribute('aria-label'), '可用的 CEL 辅助函数');
    assert.equal(w.document.getElementById('cel').textContent, '有效的 CEL 表达式');
    assert.equal(w.document.getElementById('layout-kw-title').textContent, '知识工作');
    assert.equal(w.document.getElementById('layout-kw-desc').textContent, '适用于研究、写作与日常任务的精简界面。');
    assert.equal(w.document.getElementById('layout-se-title').textContent, '软件工程');
    assert.equal(w.document.getElementById('layout-se-desc').textContent, '包含代码编写、开发工具和智能体管理的完整界面。');
    assert.equal(w.document.getElementById('perm-subtitle').textContent, '配置智能体在本地和远程会话中可执行的操作。');
    assert.equal(w.document.getElementById('unreferenced').textContent, '未被任何功能引用 (3)');
    assert.equal(w.document.getElementById('no-mcp').textContent, '未找到与 "postgres" 匹配的 MCP 服务器');
    assert.equal(w.document.getElementById('coord-create').getAttribute('title'), '协调器设置');
    assert.equal(w.document.getElementById('coord-create').textContent, '创建协调器');
    assert.equal(w.document.getElementById('auth-trouble').textContent, '登录遇到问题？输入授权码');

    const domTw = createDom(html);
    t.after(() => domTw.window.close());
    domTw.window.eval(loadRuntime({ traditional: true }));
    await settle();
    assert.equal(domTw.window.document.getElementById('port-title').textContent, '連接埠 5173 上沒有正在執行的服務');
    assert.equal(domTw.window.document.getElementById('unsafe').textContent, '繼續前往 localhost（不安全）');
    assert.equal(domTw.window.document.getElementById('unsafe-split').textContent, '繼續前往 localhost（不安全）');
    assert.equal(domTw.window.document.getElementById('nux-heading-split').textContent, '使用 Antigravity 完成任何工作');
    assert.equal(domTw.window.document.getElementById('cookie-clear').textContent, '正在清除以下網站的 Cookie 與網站資料：example.com可能會導致您退出此網站。');
    assert.equal(domTw.window.document.getElementById('perm-setup').getAttribute('aria-label'), '讀取權限，2 項授權');
    assert.equal(domTw.window.document.getElementById('nux').getAttribute('title'), '協助我們改進 Antigravity。');
    assert.equal(domTw.window.document.getElementById('cel').getAttribute('aria-label'), '可用的 CEL 輔助函式');
    assert.equal(domTw.window.document.getElementById('layout-kw-title').textContent, '知識工作');
    assert.equal(domTw.window.document.getElementById('layout-kw-desc').textContent, '適用於研究、寫作與日常任務的精簡介面。');
    assert.equal(domTw.window.document.getElementById('layout-se-title').textContent, '軟體工程');
    assert.equal(domTw.window.document.getElementById('layout-se-desc').textContent, '包含程式碼編寫、開發工具與代理管理的完整介面。');
    assert.equal(domTw.window.document.getElementById('perm-subtitle').textContent, '設定代理在本機與遠端對話中可執行的操作。');
    assert.equal(domTw.window.document.getElementById('unreferenced').textContent, '未被任何功能引用 (3)');
    assert.equal(domTw.window.document.getElementById('no-mcp').textContent, '找不到與 "postgres" 相符的 MCP 伺服器');
    assert.equal(domTw.window.document.getElementById('coord-create').getAttribute('title'), '協調器設定');
    assert.equal(domTw.window.document.getElementById('coord-create').textContent, '建立協調器');
    assert.equal(domTw.window.document.getElementById('auth-trouble').textContent, '登入遇到問題？輸入授權碼');
});
