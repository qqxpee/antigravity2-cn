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

test('Worked for / Thought for progress headers translate trailing update counts in SC and TC', async t => {
    const html = `
      <button id="worked-combined">Worked for 3m · 1 update</button>
      <button id="thought-combined">Thought for 12s · 4 updates</button>
      <button id="split-header"><span>Worked for 3m</span><span> · 1 update</span></button>
      <span id="standalone-update">2 updates</span>
    `;
    const w = await fixture(t, html);
    assert.equal(w.document.getElementById('worked-combined').textContent, '已工作 3 分钟 · 1 项更新');
    assert.equal(w.document.getElementById('thought-combined').textContent, '已思考 12 秒 · 4 项更新');
    assert.equal(w.document.getElementById('split-header').textContent, '已工作 3 分钟 · 1 项更新');
    assert.equal(w.document.getElementById('standalone-update').textContent, '2 项更新');

    const domTw = createDom(html);
    t.after(() => domTw.window.close());
    domTw.window.eval(loadRuntime({ traditional: true }));
    await settle();
    assert.equal(domTw.window.document.getElementById('worked-combined').textContent, '已工作 3 分鐘 · 1 項更新');
    assert.equal(domTw.window.document.getElementById('thought-combined').textContent, '已思考 12 秒 · 4 項更新');
    assert.equal(domTw.window.document.getElementById('split-header').textContent, '已工作 3 分鐘 · 1 項更新');
    assert.equal(domTw.window.document.getElementById('standalone-update').textContent, '2 項更新');
});

test('Swarm sidecar UI translates chrome, onboarding, overview cards, graph replay, legend and filters while isolating board messages and roster IDs', async t => {
    const swarmHtml = `
      <div id="board" data-testid="swarm-board">
        <header class="header">
          <div class="header-row">
            <h1 id="swarm-title" data-testid="swarm-title">PPT正式汇报四稿深析与技能学习机制</h1>
            <span id="live" title="Updates automatically" data-testid="swarm-live"><span id="live-label">Live</span></span>
          </div>
          <nav class="tabs" aria-label="Swarm views" data-testid="swarm-tabs">
            <button id="tab-ov" data-testid="swarm-tab-overview">Overview</button>
            <button id="tab-feed" data-testid="swarm-tab-feed">Board<span id="cnt-feed">10</span></button>
            <button id="tab-mem" data-testid="swarm-tab-members">Members<span id="cnt-mem">6</span></button>
            <button id="tab-graph" data-testid="swarm-tab-graph">Graph</button>
            <button id="tab-raw" data-testid="swarm-tab-raw">Raw</button>
          </nav>
        </header>
        <section id="tab-overview">
          <div class="o2">
            <div class="o2-onb-h" id="onb-title">Your swarm is starting</div>
            <div class="o2-progt" id="ov-progt"><b>3 of 10</b> tasks done</div>
            <div class="o2-st" id="ov-blocked">Blocked</div>
            <span class="o2-dot" id="ov-dot" aria-label="queued"></span>
            <div class="o2-mnow" id="ov-quota">@worker-2 ran out of quota — Rate limit exceeded</div>
          </div>
          <div id="ov-notice">The narrator (<b>narrator-1</b>) was stopped. Ask the coordinator to add a new one (<code>@narrator-1</code>).</div>
          <div id="ov-ack">Last change: “<button class="ref">#42</button>”</div>
        </section>
        <section id="tab-body-feed">
          <input id="f-search" type="search" placeholder="Search" aria-label="Search posts">
          <button id="f-toggle" title="Filters" aria-label="Filters"></button>
          <select id="f-agent" aria-label="Filter by poster">
            <option value="">From anyone</option>
            <option value="coordinator">From coordinator</option>
          </select>
          <select id="f-mention" aria-label="Filter by recipient">
            <option value="">To anyone</option>
            <option value="@none">To no one</option>
            <option value="@all">To @all</option>
            <option value="critic-architect">To critic-architect</option>
          </select>
          <button id="chip-coord" title="coordinator · Coordinator · Active · 3 posts\nClick to hide from the board">
            <span class="chip-name">coordinator (you)</span>
          </button>
          <button id="chip-idle" title="worker-2: No posts yet"></button>
          <div class="divider" data-testid="swarm-unread-divider" id="unread-div">New</div>
          <div class="msg-body md" id="post-body">@critic-architect Settings Overview Board Live Graph</div>
          <span class="sys-text" id="sys-msg">created #design — Overview Board</span>
        </section>
        <section id="tab-body-graph">
          <div class="player">
            <button id="replay-play" title="Play / pause replay (space)" aria-label="Play replay"></button>
            <button id="replay-live" title="Show everything and follow live">Live</button>
            <span id="replay-label"><b>10</b> of 10 · #10 at 9:00 (+15m 25s)</span>
            <label class="switch" title="Hide killed and inactive members from the graph"><span>Hide inactive</span></label>
            <label class="switch" title="Draw @all as an edge to every member"><span>Expand @all</span></label>
            <select id="replay-timing" aria-label="Replay pacing" title="Replay pacing">
              <option value="even" selected>Even pacing</option>
              <option value="real">Real-time gaps</option>
            </select>
          </div>
          <svg id="graph" data-testid="swarm-graph" aria-label="Who @mentions whom">
            <path class="edge"><title id="edge-tip">coordinator → critic-architect: 5 direct, 2 via @all</title></path>
            <g class="node">
              <title id="node-tip">coordinator · Coordinator · Active · 5 steps · 3 posts\nClick to open conversation</title>
              <text class="node-label" id="node-coord">coordinator</text>
            </g>
          </svg>
          <div class="graph-legend">
            <span class="legend-item" id="lg-1">@mention, width = count</span>
            <span class="legend-item" id="lg-2">via @all</span>
            <span class="legend-item" id="lg-3">posted with no mention</span>
            <span class="legend-item" id="lg-4">@all posts, drawn by Expand @all</span>
          </div>
        </section>
        <section id="tab-body-raw">
          <div class="raw-meta"><span class="path" id="raw-path">/Users/demo/board.jsonl</span><span class="size" id="raw-size">· 4.2 KB · 10 lines</span></div>
          <pre id="raw" class="raw">{"agent":"coordinator","text":"Settings"}</pre>
        </section>
      </div>
      <div id="same-doc-outside-swarm">
        <span id="outside-board">Board</span>
        <span id="outside-graph">Graph</span>
        <span id="outside-raw">Raw</span>
      </div>
    `;
    const w = await fixture(t, swarmHtml);

    assert.equal(w.document.getElementById('live').getAttribute('title'), '自动更新');
    assert.equal(w.document.getElementById('live-label').textContent, '实时');
    assert.equal(w.document.getElementById('tab-ov').textContent, '概览');
    assert.equal(w.document.getElementById('tab-feed').textContent, '看板10');
    assert.equal(w.document.getElementById('tab-mem').textContent, '成员6');
    assert.equal(w.document.getElementById('tab-graph').textContent, '关系图');
    assert.equal(w.document.getElementById('tab-raw').textContent, '原始数据');
    assert.equal(w.document.getElementById('onb-title').textContent, '你的 Swarm 正在启动');
    assert.equal(w.document.getElementById('ov-progt').textContent, '3 / 10 项任务已完成');
    assert.equal(w.document.getElementById('ov-blocked').textContent, '受阻');
    assert.equal(w.document.getElementById('ov-dot').getAttribute('aria-label'), '排队中');
    assert.equal(w.document.getElementById('ov-quota').textContent, '@worker-2 配额已耗尽 — Rate limit exceeded');
    assert.equal(w.document.getElementById('ov-notice').textContent, '解说员 (narrator-1) 已停止。可让协调器新增一个 (@narrator-1)。');
    assert.equal(w.document.getElementById('ov-ack').textContent, '上次变更：“#42”');
    assert.equal(w.document.getElementById('f-search').getAttribute('placeholder'), '搜索');
    assert.equal(w.document.getElementById('f-search').getAttribute('aria-label'), '搜索消息');
    assert.equal(w.document.getElementById('f-toggle').getAttribute('title'), '筛选');
    assert.equal(w.document.getElementById('f-agent').options[0].textContent, '来自任何人');
    assert.equal(w.document.getElementById('f-agent').options[1].textContent, '来自 coordinator');
    assert.equal(w.document.getElementById('f-agent').options[1].value, 'coordinator');
    assert.equal(w.document.getElementById('f-mention').options[0].textContent, '发给任何人');
    assert.equal(w.document.getElementById('f-mention').options[1].textContent, '未提及任何人');
    assert.equal(w.document.getElementById('f-mention').options[2].textContent, '发给 @all');
    assert.equal(w.document.getElementById('f-mention').options[3].textContent, '发给 critic-architect');
    assert.equal(w.document.getElementById('chip-coord').getAttribute('title'), 'coordinator · 协调器 · 活跃 · 3 条消息\n点击在看板中隐藏');
    assert.equal(w.document.querySelector('#chip-coord .chip-name').textContent, 'coordinator（你）');
    assert.equal(w.document.getElementById('chip-idle').getAttribute('title'), 'worker-2：暂无消息');
    assert.equal(w.document.getElementById('unread-div').textContent, '新消息');
    assert.equal(w.document.getElementById('replay-label').textContent, '10 / 10 · #10 于 9:00 (+15 分钟 25 秒)');
    w.document.getElementById('replay-label').innerHTML = '<b>10 posts</b> over 15m 25s';
    await settle();
    assert.equal(w.document.getElementById('replay-label').textContent, '10 条消息 · 历时 15 分钟 25 秒');
    assert.equal(w.document.getElementById('replay-timing').options[0].textContent, '匀速回放');
    assert.equal(w.document.getElementById('replay-timing').options[1].textContent, '按真实时间间隔');
    assert.equal(w.document.getElementById('replay-timing').value, 'even');
    assert.equal(w.document.getElementById('edge-tip').textContent, 'coordinator → critic-architect：5 次直接提及，2 次通过 @all');
    assert.equal(w.document.getElementById('node-tip').textContent, 'coordinator · 协调器 · 活跃 · 5 步 · 3 条消息\n点击打开会话');
    assert.equal(w.document.getElementById('node-coord').textContent, 'coordinator');
    assert.equal(w.document.getElementById('lg-1').textContent, '@提及（线宽代表次数）');
    assert.equal(w.document.getElementById('lg-2').textContent, '通过 @all 广播');
    assert.equal(w.document.getElementById('lg-3').textContent, '未 @提及他人的发言');
    assert.equal(w.document.getElementById('lg-4').textContent, '@all 广播消息（开启“展开 @all”时连线）');
    assert.equal(w.document.getElementById('raw-path').textContent, '/Users/demo/board.jsonl');
    assert.equal(w.document.getElementById('raw-size').textContent, '· 4.2 KB · 10 行');
    assert.equal(w.document.getElementById('raw').textContent, '{"agent":"coordinator","text":"Settings"}');
    assert.equal(w.document.getElementById('post-body').textContent, '@critic-architect Settings Overview Board Live Graph');
    assert.equal(w.document.getElementById('sys-msg').textContent, 'created #design — Overview Board');
    assert.equal(w.document.getElementById('outside-board').textContent, 'Board');
    assert.equal(w.document.getElementById('outside-graph').textContent, 'Graph');
    assert.equal(w.document.getElementById('outside-raw').textContent, 'Raw');

    const nonSwarm = await fixture(t, '<div id="plain-board">Board</div><div id="plain-graph">Graph</div><div id="plain-raw">Raw</div>');
    assert.equal(nonSwarm.document.getElementById('plain-board').textContent, 'Board');
    assert.equal(nonSwarm.document.getElementById('plain-graph').textContent, 'Graph');
    assert.equal(nonSwarm.document.getElementById('plain-raw').textContent, 'Raw');

    const domTw = createDom(swarmHtml);
    t.after(() => domTw.window.close());
    domTw.window.eval(loadRuntime({ traditional: true }));
    await settle();
    assert.equal(domTw.window.document.getElementById('tab-graph').textContent, '關係圖');
    assert.equal(domTw.window.document.getElementById('tab-raw').textContent, '原始資料');
    assert.equal(domTw.window.document.getElementById('ov-progt').textContent, '3 / 10 項任務已完成');
    assert.equal(domTw.window.document.getElementById('ov-blocked').textContent, '受阻');
    assert.equal(domTw.window.document.getElementById('ov-dot').getAttribute('aria-label'), '排隊中');
    assert.equal(domTw.window.document.getElementById('ov-quota').textContent, '@worker-2 配額已耗盡 — Rate limit exceeded');
    assert.equal(domTw.window.document.getElementById('ov-notice').textContent, '解說員 (narrator-1) 已停止。可請協調器新增一個 (@narrator-1)。');
    assert.equal(domTw.window.document.getElementById('ov-ack').textContent, '上次變更：「#42」');
    assert.equal(domTw.window.document.getElementById('chip-idle').getAttribute('title'), 'worker-2：尚無訊息');
    assert.equal(domTw.window.document.getElementById('unread-div').textContent, '新訊息');
    assert.equal(domTw.window.document.getElementById('replay-label').textContent, '10 / 10 · #10 於 9:00 (+15 分鐘 25 秒)');
    assert.equal(domTw.window.document.getElementById('replay-timing').options[0].textContent, '等速重播');
    assert.equal(domTw.window.document.getElementById('lg-4').textContent, '@all 廣播訊息（開啟「展開 @all」時連線）');
});

test('subagent incoming message header and input placeholder translate in SC and TC', async t => {
    const html = `
      <div>
        <button id="incoming-parent">Message from Parent Agent</button>
        <button id="incoming-role">Message from Codebase Researcher</button>
        <div id="placeholder-full">Message subagent, @ to mention, / for actions</div>
        <div id="placeholder-short">Message subagent, @ to mention</div>
      </div>
    `;
    const w = await fixture(t, html);
    assert.equal(w.document.getElementById('incoming-parent').textContent, '来自父级智能体的消息');
    assert.equal(w.document.getElementById('incoming-role').textContent, '来自 Codebase Researcher 的消息');
    assert.equal(w.document.getElementById('placeholder-full').textContent, '向子代理发送消息，使用 @ 提及，/ 执行操作');
    assert.equal(w.document.getElementById('placeholder-short').textContent, '向子代理发送消息，使用 @ 提及');

    const domTw = createDom(html);
    t.after(() => domTw.window.close());
    domTw.window.eval(loadRuntime({ traditional: true }));
    await settle();
    assert.equal(domTw.window.document.getElementById('incoming-parent').textContent, '來自父級代理的訊息');
    assert.equal(domTw.window.document.getElementById('placeholder-full').textContent, '向子代理傳送訊息，使用 @ 提及，/ 執行操作');
    assert.equal(domTw.window.document.getElementById('placeholder-short').textContent, '向子代理傳送訊息，使用 @ 提及');
});

test('NUX onboarding split TextNodes and post-onboarding welcome tip translate without global single-word pollution', async t => {
    const html = `
      <div>
        <span id="nux-card1">Customize your experience across the agent, plugins, and product from the settings and marketplace. We won\u2019t show you ads or let advertisers influence what Antigravity says.</span>
        <span id="nux-card1-split">Customize your experience across the agent, plugins, and product from the settings and marketplace. We won\u2019t show you ads or let advertisers influence what <b>Antigravity</b> says.</span>
        <span id="nux-card3"><b>Antigravity</b>\u2019s agents are powerful and will help you get a lot done better and faster than before, but still make sure to verify the actions taken by the agent.</span>
        <span id="nux-terms-title">Help us improve Antigravity.</span>
        <span id="nux-terms-desc">Allow Google to collect and use your Interactions data, subject to the <a href="#">Google <b>Antigravity</b> Terms of Service</a> and <a href="#">Google Privacy Policy</a>. You can control this from your settings at any point.</span>
        <p id="nux-enterprise">For <b>your plan</b>, <b>Antigravity</b> does not collect any of your prompts, content, or model responses but will still collect general usage patterns (e.g., feature adoption, active user counts).</p>
        <p id="nux-analytics"><b>Antigravity</b> does not collect any of your prompts, content, or model responses but does collect general usage patterns such as feature adoption and active user counts (\u201cproduct analytics\u201d). Telemetry data will be handled in accordance with the Google Privacy Policy.</p>
        <li><a href="#">Privacy Notice</a> (excluding product analytics data)</li>
        <p id="nux-news">Sign up for newsletters, tips and tricks, and other notifications about <b>Antigravity</b>.</p>
        <p id="welcome-tip" data-testid="post-onboarding-welcome-tip"><span>Tip:</span> Press <kbd>⌘⇧A</kbd> to switch to the Gemini app. Your agents keep working in the background.</p>
        <span id="random-says">says.</span>
      </div>
    `;
    const w = await fixture(t, html);
    assert.equal(w.document.getElementById('nux-card1-split').textContent, '从设置与市场中自定义您在智能体、插件及产品上的各项体验。我们不会向您展示广告，也不会让广告主影响 Antigravity 所说的内容。');
    assert.equal(w.document.getElementById('nux-card3').textContent, 'Antigravity 的智能体功能强大，可帮助您比以往更好、更快地完成更多工作，但仍请务必核验智能体执行的操作。');
    assert.equal(w.document.getElementById('nux-terms-title').textContent, '帮助改进 Antigravity。');
    assert.equal(w.document.getElementById('nux-terms-desc').textContent, '允许 Google 收集并使用您的交互数据，但须遵守Google Antigravity服务条款以及Google 隐私政策。您可以随时在设置中控制此选项。');
    assert.equal(w.document.getElementById('nux-enterprise').textContent, '对于您的计划，Antigravity不会收集您的任何提示词、内容或模型响应，但仍会收集一般使用模式（例如功能采用率、活跃用户数）。');
    assert.equal(w.document.getElementById('nux-analytics').textContent, 'Antigravity 不会收集您的任何提示词、内容或模型回复，但会收集功能采用率与活跃用户数等常规使用模式（“产品分析”）。遥测数据将按照 Google 隐私政策处理。');
    assert.equal(w.document.querySelector('li').textContent, '隐私声明（不含产品分析数据）');
    assert.equal(w.document.getElementById('nux-news').textContent, '订阅关于以下内容的新闻通讯、技巧提示及其他通知：Antigravity。');
    assert.equal(w.document.getElementById('welcome-tip').textContent, '提示：按 ⌘⇧A 即可切换至 Gemini 应用。您的智能体会在后台继续运行。');
    assert.equal(w.document.getElementById('random-says').textContent, 'says.');

    const reactCard3 = w.document.createElement('span');
    reactCard3.append(
        w.document.createTextNode('Antigravity'),
        w.document.createTextNode('\u2019s agents are powerful and will help you get a lot done better and faster than before, but still make sure to verify the actions taken by the agent.')
    );
    w.document.body.appendChild(reactCard3);
    await settle();
    assert.equal(reactCard3.textContent, 'Antigravity 的智能体功能强大，可帮助您比以往更好、更快地完成更多工作，但仍请务必核验智能体执行的操作。');

    const domTw = createDom(html);
    t.after(() => domTw.window.close());
    domTw.window.eval(loadRuntime({ traditional: true }));
    await settle();
    assert.equal(domTw.window.document.getElementById('nux-card1-split').textContent, '從設定與市集中自訂您在代理、外掛程式及產品上的各項體驗。我們不會向您顯示廣告，也不會讓廣告客戶影響 Antigravity 所說的內容。');
    assert.equal(domTw.window.document.getElementById('nux-card3').textContent, 'Antigravity 的代理功能強大，能協助您比以往更好、更快地完成更多工作，但仍請務必驗證代理執行的操作。');
    assert.equal(domTw.window.document.getElementById('welcome-tip').textContent, '提示：按 ⌘⇧A 即可切換至 Gemini 應用程式。您的代理會在背景繼續執行。');
    assert.equal(domTw.window.document.getElementById('random-says').textContent, 'says.');
});

test('v2.32.1 SSH, macOS permissions, multi-agent layout, draft capsule and plugin credentials translate without single-word pollution', async t => {
    const html = `
      <div>
        <div id="ssh-err" data-testid="ssh-connect-error"><span id="ssh-err-title">Couldn\u2019t connect to </span></div>
        <p id="ssh-empty">No hosts in ~/.ssh/config yet. Type one above.</p>
        <div id="ssh-cfg-title">SSH Config (~/.ssh/config)</div>
        <button id="ssh-hidden">3 hidden hosts</button>
        <div id="ssh-connecting">Connecting to devbox\u2026</div>
        <span id="perm-badge-miss" data-testid="computer-permissions-badge-accessibility">Missing</span>
        <span id="perm-badge-ok" data-testid="computer-permissions-badge-screenRecording">Granted \u2713</span>
        <span id="perm-tip">Click <strong>Open \u2197</strong> to open macOS Privacy &amp; Security.</span>
        <div id="layout-bar" data-agy-layout-bar="">
          <span id="layout-label">Layout</span>
          <div id="layout-select" aria-label="Layout" data-agy-layout="stage">
            <span id="opt-stage" data-agy-layout-option="stage">Stage</span>
            <span id="opt-desktop" data-agy-layout-option="desktop">Desktop</span>
            <span id="opt-grid" data-agy-layout-option="grid">Grid</span>
          </div>
        </div>
        <button id="tile-focus" title="Codebase \u00b7 worker-1 (Focus this tile)">Codebase</button>
        <button id="tile-back" title="Codebase \u00b7 worker-1 (Back to all agents)">Back to all agents</button>
        <div id="icon-rg" role="radiogroup" aria-label="Icon"></div>
        <div id="color-rg" role="radiogroup" aria-label="Color"></div>
        <button id="draft-btn" aria-label="Resume 2 comment drafts"><span>2 Drafts</span></button>
        <p id="plugin-creds">Sign-ins to GitHub, Linear are kept in the cloud with your account. Other credentials stay on this machine. Credentials are only sent to the domains listed.</p>
        <p id="sandbox-warn-two">Default and Auto need the terminal sandbox, which isn't available on this host.</p>
        <p id="sandbox-warn-one">Default needs the terminal sandbox, which isn't available on this host.</p>
        <span id="org-managed" title="managed by your organization">managed by your organization</span>
        <span id="msg-ing">Messaging Codebase Researcher</span>
        <span id="msg-ed">Messaged Codebase Researcher</span>
        <p id="msg-prose">Messaging other services over HTTP requires valid credentials.</p>
        <div id="save-err">Failed to save project settings: Network error</div>

        <span id="plain-click">Click</span>
        <span id="plain-missing">Missing</span>
        <span id="plain-layout">Layout</span>
        <span id="plain-stage">Stage</span>
        <span id="plain-design">Design</span>
        <div id="plain-icon" aria-label="Icon">Icon</div>
        <div id="plain-color" aria-label="Color">Color</div>
      </div>
    `;
    const w = await fixture(t, html);
    w.document.getElementById('ssh-err-title').appendChild(w.document.createTextNode('devbox'));
    w.document.getElementById('ssh-empty').textContent = '';
    w.document.getElementById('ssh-empty').append(
        w.document.createTextNode('No hosts in '),
        w.document.createTextNode('~/.ssh/config'),
        w.document.createTextNode(' yet. Type one above.')
    );
    await settle();

    assert.equal(w.document.getElementById('ssh-err-title').textContent, '无法连接到 devbox');
    assert.equal(w.document.getElementById('ssh-empty').textContent, '在 ~/.ssh/config 中暂未配置主机，请在上方直接输入。');
    assert.equal(w.document.getElementById('ssh-cfg-title').textContent, 'SSH 配置 (~/.ssh/config)');
    assert.equal(w.document.getElementById('ssh-hidden').textContent, '3 个已隐藏的主机');
    assert.equal(w.document.getElementById('ssh-connecting').textContent, '正在连接到 devbox…');
    assert.equal(w.document.getElementById('perm-badge-miss').textContent, '未授权');
    assert.equal(w.document.getElementById('perm-badge-ok').textContent, '已授权 ✓');
    assert.equal(w.document.getElementById('perm-tip').textContent, '点击打开 ↗ 以打开 macOS“隐私与安全性”。');
    assert.equal(w.document.getElementById('layout-label').textContent, '布局');
    assert.equal(w.document.getElementById('layout-select').getAttribute('aria-label'), '布局');
    assert.equal(w.document.getElementById('opt-stage').textContent, '舞台');
    assert.equal(w.document.getElementById('opt-desktop').textContent, '桌面');
    assert.equal(w.document.getElementById('opt-grid').textContent, '网格');
    assert.equal(w.document.getElementById('tile-focus').getAttribute('title'), 'Codebase · worker-1（聚焦此视图）');
    assert.equal(w.document.getElementById('tile-back').getAttribute('title'), 'Codebase · worker-1（返回全部智能体）');
    assert.equal(w.document.getElementById('icon-rg').getAttribute('aria-label'), '图标');
    assert.equal(w.document.getElementById('color-rg').getAttribute('aria-label'), '颜色');
    assert.equal(w.document.getElementById('draft-btn').getAttribute('aria-label'), '恢复 2 条评论草稿');
    assert.equal(w.document.getElementById('draft-btn').textContent, '2 条草稿');
    assert.equal(w.document.getElementById('plugin-creds').textContent, 'GitHub, Linear 的登录信息会随您的账户保存在云端。其他凭据保留在本机上。凭据仅会发送至所列出的域名。');
    assert.equal(w.document.getElementById('sandbox-warn-two').textContent, '默认 (Default) 和 自动 (Auto) 需要终端沙盒，但此主机不可用。');
    assert.equal(w.document.getElementById('sandbox-warn-one').textContent, '默认 (Default) 需要终端沙盒，但此主机不可用。');
    assert.equal(w.document.getElementById('org-managed').textContent, '由您的组织管理');
    assert.equal(w.document.getElementById('org-managed').getAttribute('title'), '由您的组织管理');
    assert.equal(w.document.getElementById('msg-ing').textContent, '正在向 Codebase Researcher 发送消息');
    assert.equal(w.document.getElementById('msg-ed').textContent, '已向 Codebase Researcher 发送消息');
    assert.equal(w.document.getElementById('msg-prose').textContent, 'Messaging other services over HTTP requires valid credentials.');
    assert.equal(w.document.getElementById('save-err').textContent, '保存项目设置失败：Network error');

    assert.equal(w.document.getElementById('plain-click').textContent, 'Click');
    assert.equal(w.document.getElementById('plain-missing').textContent, 'Missing');
    assert.equal(w.document.getElementById('plain-layout').textContent, 'Layout');
    assert.equal(w.document.getElementById('plain-stage').textContent, 'Stage');
    assert.equal(w.document.getElementById('plain-design').textContent, 'Design');
    assert.equal(w.document.getElementById('plain-icon').getAttribute('aria-label'), 'Icon');
    assert.equal(w.document.getElementById('plain-color').getAttribute('aria-label'), 'Color');

    const domTw = createDom(html);
    t.after(() => domTw.window.close());
    domTw.window.eval(loadRuntime({ traditional: true }));
    await settle();
    assert.equal(domTw.window.document.getElementById('perm-badge-miss').textContent, '未授權');
    assert.equal(domTw.window.document.getElementById('perm-tip').textContent, '按一下開啟 ↗ 以開啟 macOS「隱私權與安全性」。');
    assert.equal(domTw.window.document.getElementById('layout-label').textContent, '版面配置');
    assert.equal(domTw.window.document.getElementById('layout-select').getAttribute('aria-label'), '版面配置');
    assert.equal(domTw.window.document.getElementById('opt-grid').textContent, '網格');
    assert.equal(domTw.window.document.getElementById('tile-focus').getAttribute('title'), 'Codebase · worker-1（聚焦此窗格）');
    assert.equal(domTw.window.document.getElementById('icon-rg').getAttribute('aria-label'), '圖示');
    assert.equal(domTw.window.document.getElementById('color-rg').getAttribute('aria-label'), '顏色');
    assert.equal(domTw.window.document.getElementById('draft-btn').getAttribute('aria-label'), '恢復 2 則評論草稿');
    assert.equal(domTw.window.document.getElementById('draft-btn').textContent, '2 則草稿');
    assert.equal(domTw.window.document.getElementById('plugin-creds').textContent, 'GitHub, Linear 的登入資訊會隨您的帳戶儲存在雲端。其他憑證保留在本機上。憑證僅會傳送至所列出的網域。');
    assert.equal(domTw.window.document.getElementById('sandbox-warn-two').textContent, '預設 (Default) 與 自動 (Auto) 需要終端機沙箱，但此主機無法使用。');
    assert.equal(domTw.window.document.getElementById('sandbox-warn-one').textContent, '預設 (Default) 需要終端機沙箱，但此主機無法使用。');
    assert.equal(domTw.window.document.getElementById('org-managed').textContent, '由您的組織管理');
    assert.equal(domTw.window.document.getElementById('msg-ing').textContent, '正在傳送訊息給 Codebase Researcher');
    assert.equal(domTw.window.document.getElementById('msg-ed').textContent, '已傳送訊息給 Codebase Researcher');
    assert.equal(domTw.window.document.getElementById('save-err').textContent, '儲存專案設定失敗：Network error');
    assert.equal(domTw.window.document.getElementById('plain-click').textContent, 'Click');
    assert.equal(domTw.window.document.getElementById('plain-missing').textContent, 'Missing');
    assert.equal(domTw.window.document.getElementById('plain-design').textContent, 'Design');
});

test('protected containers isolate attributes and scripts while contextual siblings and duration boundaries hold', async t => {
    const html = `
      <div>
        <div class="monaco-editor">
          <input id="monaco-input" placeholder="Search" title="Settings" aria-label="Filter">
        </div>
        <div class="terminal">
          <span id="term-span" title="Close">Settings</span>
        </div>
        <div data-testid="planner-response-text">
          <span id="ai-span" title="Open">Open</span>
        </div>
        <input id="normal-input" placeholder="Search">
        <script id="inline-script">const label = "Settings";</script>
        <p id="archived-tip">View archived in the sidebar <b>More</b> menu)</p>
        <p id="unsafe-link">Proceed to <span>example.com</span> (unsafe)</p>
        <span id="dur-ms">Thought for 12ms</span>
        <span id="dur-mo">Thought for 5mo</span>
        <span id="dur-m">Thought for 5m</span>
      </div>
    `;
    const w = await fixture(t, html);
    const monacoInput = w.document.getElementById('monaco-input');
    assert.equal(monacoInput.getAttribute('placeholder'), 'Search');
    assert.equal(monacoInput.getAttribute('title'), 'Settings');
    assert.equal(monacoInput.getAttribute('aria-label'), 'Filter');
    assert.equal(w.document.getElementById('term-span').getAttribute('title'), 'Close');
    assert.equal(w.document.getElementById('term-span').textContent, 'Settings');
    assert.equal(w.document.getElementById('ai-span').getAttribute('title'), 'Open');
    assert.equal(w.document.getElementById('ai-span').textContent, 'Open');
    assert.equal(w.document.getElementById('normal-input').getAttribute('placeholder'), '搜索');

    w.document.getElementById('inline-script').firstChild.nodeValue = 'Settings';
    await settle();
    assert.equal(w.document.getElementById('inline-script').textContent, 'Settings');

    assert.equal(w.document.getElementById('archived-tip').textContent, '在侧边栏中查看已归档项更多菜单中查看。');
    assert.equal(w.document.getElementById('unsafe-link').textContent, '继续前往 example.com（不安全）');
    assert.equal(w.document.getElementById('dur-ms').textContent, '已思考 12ms');
    assert.equal(w.document.getElementById('dur-mo').textContent, '已思考 5mo');
    assert.equal(w.document.getElementById('dur-m').textContent, '已思考 5 分钟');
});

test('v2.32.2 template literals, voice mic prompts, plugin/skill labels and Best of N external descriptions translate in SC and TC', async t => {
    const html = `
      <div>
        <h2 id="voice-title">Choose Antigravity's Voice</h2>
        <span id="mic-inline">Microphone blocked. Allow in System Settings.</span>
        <p id="mic-split">Microphone blocked. Allow in <a href="#">Privacy Settings</a>.</p>
        <p id="perm-act">Agent needs permission to act on /tmp/demo</p>
        <p id="dl-block">The browser blocked the download of report.pdf: the agent browser does not download this file type (text/html)</p>
        <span id="nav-block">Blocked navigation to "https://example.invalid"</span>
        <span id="partner-plugins">Build with Google Plugins</span>
        <span id="open-plugin">Open the figma plugin</span>
        <span id="open-skill">Open my-skill skill</span>
        <span id="mcp-cfg">The github MCP server requires configuration parameters before it can be started.</span>
        <span id="auto-created">Created automation "Daily Sync".</span>
        <button id="unfold-btn" title="Unfold lines 10-25">Unfold lines 10-25</button>
        <select><option id="mic-opt" value="">System default (Built-in Mic)</option></select>
        <div id="slash-compact"><span>compact</span><span>Compact the conversation now (summarize history to free up the context window).</span></div>
        <div id="slash-plan"><span>plan</span><span>Plan carefully before executing a task.</span></div>
      </div>
    `;
    const w = await fixture(t, html);
    assert.equal(w.document.getElementById('voice-title').textContent, '选择 Antigravity 的声音');
    assert.equal(w.document.getElementById('mic-inline').textContent, '麦克风已被阻止。请在 System Settings 中允许。');
    assert.equal(w.document.getElementById('mic-split').textContent, '麦克风已被阻止。请在以下位置允许访问：隐私设置。');
    assert.equal(w.document.getElementById('perm-act').textContent, '智能体需要权限才能对 /tmp/demo 执行操作');
    assert.equal(w.document.getElementById('dl-block').textContent, '浏览器已阻止下载 report.pdf：智能体浏览器不支持下载此文件类型 (text/html)');
    assert.equal(w.document.getElementById('nav-block').textContent, '已阻止导航至：“https://example.invalid”');
    assert.equal(w.document.getElementById('partner-plugins').textContent, '基于 Google 插件构建');
    assert.equal(w.document.getElementById('open-plugin').textContent, '打开 figma 插件');
    assert.equal(w.document.getElementById('open-skill').textContent, '打开 my-skill 技能');
    assert.equal(w.document.getElementById('mcp-cfg').textContent, 'github MCP 服务器需要配置参数后才能启动。');
    assert.equal(w.document.getElementById('auto-created').textContent, '已创建自动化任务“Daily Sync”。');
    assert.equal(w.document.getElementById('unfold-btn').getAttribute('title'), '展开第 10-25 行');
    assert.equal(w.document.getElementById('mic-opt').textContent, '系统默认 (Built-in Mic)');
    assert.equal(w.document.getElementById('slash-compact').children[0].textContent, 'compact');
    assert.equal(w.document.getElementById('slash-compact').children[1].textContent, '立即压缩当前对话（总结历史记录以释放上下文窗口）。');
    assert.equal(w.document.getElementById('slash-plan').children[0].textContent, 'plan');
    assert.equal(w.document.getElementById('slash-plan').children[1].textContent, '在执行任务前仔细制定计划。');

    const domTw = createDom(html);
    t.after(() => domTw.window.close());
    domTw.window.eval(loadRuntime({ traditional: true }));
    await settle();
    assert.equal(domTw.window.document.getElementById('voice-title').textContent, '選擇 Antigravity 的聲音');
    assert.equal(domTw.window.document.getElementById('mic-split').textContent, '麥克風已被封鎖。請在以下位置允許存取：隱私權設定。');
    assert.equal(domTw.window.document.getElementById('partner-plugins').textContent, '以 Google 外掛程式建構');
    assert.equal(domTw.window.document.getElementById('unfold-btn').getAttribute('title'), '展開第 10-25 行');
    assert.equal(domTw.window.document.getElementById('slash-compact').children[1].textContent, '立即壓縮目前對話（摘要歷史記錄以釋放上下文視窗）。');
    assert.equal(domTw.window.document.getElementById('slash-plan').children[1].textContent, '在執行任務前仔細擬定計畫。');
});

test('runtime guards non-DOM sandboxes, preserves restore_page TextNode, and handles See all & mixed Show more', async t => {
    const vm = require('node:vm');
    assert.doesNotThrow(() => {
        vm.runInNewContext(loadRuntime(), { setTimeout, clearTimeout, console });
    });

    const w = await fixture(t, `
        <span id="icon" class="google-symbols">restore_page</span>
        <button id="mixed-show"><span id="badge">Show 5</span> more...</button>
        <button id="see-all">See all (5)</button>
    `);
    const icon = w.document.getElementById('icon');
    const textNodes = Array.from(icon.childNodes).filter(n => n.nodeType === w.Node.TEXT_NODE);
    assert.equal(textNodes.length, 1);
    assert.equal(textNodes[0].nodeValue, '');
    assert.equal(icon.querySelectorAll('svg[data-ag-icon-fallback="restore_page"]').length, 1);

    textNodes[0].nodeValue = 'restore_page';
    w.__agCnRuntimeStart();
    await settle();
    assert.equal(icon.querySelectorAll('svg[data-ag-icon-fallback="restore_page"]').length, 1);
    assert.equal(textNodes[0].nodeValue, '');

    assert.equal(w.document.getElementById('badge').textContent, 'Show 5');
    assert.equal(w.document.getElementById('mixed-show').lastChild.nodeValue, ' 个...');
    assert.equal(w.document.getElementById('see-all').textContent, '显示全部 (5)');

    const domTw = createDom('<button id="see-all">See all (5)</button>');
    t.after(() => domTw.window.close());
    domTw.window.eval(loadRuntime({ traditional: true }));
    await settle();
    assert.equal(domTw.window.document.getElementById('see-all').textContent, '顯示全部 (5)');
});

test('v2.33.0 browsing data, keybinding scheme, bundles, coordinator pickers, permissions and dynamic prompts translate in SC and TC without single-word pollution', async t => {
    const html = `
      <div>
        <h2 id="browsing-title">Clear Browsing Data?</h2>
        <span id="browsing-history">Browsing history</span>
        <span id="cookies-site">Cookies by Site</span>
        <span id="kb-scheme">Keybinding Scheme</span>
        <span id="browser-agent">Enable Browser Agent</span>
        <button id="add-bundle">Add bundle</button>
        <button id="rm-bundle">Remove bundle</button>
        <button id="insert-main">Insert into main conversation</button>
        <button id="sq-unarch">Unarchive the main conversation to insert</button>
        <p id="cookie-err" data-testid="browser-site-data-delete-error">Couldn't delete cookies for <span>example.com</span>. Try again.</p>
        <div id="clearing-site">Clearing cookies and site data for example.com</div>
        <p id="no-match-split" data-testid="browser-site-data-no-match">No sites match \u201c<span>alpha.dev</span>\u201d.</p>
        <div id="no-match-full">No sites match "beta.dev".</div>
        <div id="kb-filter">Inspect live bindings or record custom key chords filtered to <code>antigravity.</code> commands.</div>
        <div id="signin-remote">You're signing in on devbox-01. Your sign-in stays on that machine.</div>
        <button id="mcp-acc" aria-label="Account this MCP server uses: work@example.com"></button>
        <button id="go-turn" aria-label="Go to turn 3 of 12"></button>
        <button id="plan-steps" aria-label="Plan, 2 of 5 steps done"></button>
        <button id="rm-shortcut" aria-label="Remove shortcut Cmd+K for Command Palette"></button>
        <button id="reset-cmd" aria-label="Reset command palette to default"></button>
        <div id="no-bundles">No bundles found for</div>
        <div id="no-plugins-q">No plugins found for "lint".</div>
        <div id="dup-folder">Duplicate folder name</div>
        <div id="dup-rule">Duplicate rule name</div>
        <div id="dup-wf">Duplicate workflow name</div>
        <div id="bundle-prefix">3 plugins. Disabling or removing the bundle applies only to the ones it installed.</div>
        <div id="comment-pg">Comment on page 2</div>
        <div id="edit-comment">Edit comment: fix typo</div>
        <div id="export-err">Failed to export artifact</div>
        <div id="del-ws-err">Failed to delete workspace</div>
        <div id="gh-lbl" aria-label="GitHub: Authentication required"></div>
        <div id="ssh-lbl">SSH: devbox-01</div>
        <div id="see-doc">See Docs: https://example.com</div>
        <input id="acc-lbl" aria-label="Label for work@example.com" />
        <button id="more-lbl" aria-label="More for devbox-01"></button>
        <button id="safe-del-ws">Delete Workspace</button>
        <button id="unsafe-del-var">Delete MyCustomVar</button>
        <div id="meta-row" class="flex flex-wrap items-baseline gap-1 text-xs text-muted-foreground"><span id="meta-init">Initialized with</span><code>defaultConfig</code></div>
        <div id="meta-decl-row" class="flex flex-wrap items-baseline gap-1 text-xs text-muted-foreground"><span id="meta-decl">Declared by</span><code>corePkg</code></div>
        <p id="prose-init">Initialized with a custom environment variable for testing.</p>
        <button id="ico-robot" data-testid="coordinator-icon-option-smart_toy" role="radio" aria-label="Robot"></button>
        <button id="ico-code" data-testid="coordinator-icon-option-code_blocks" role="radio" aria-label="Code"></button>
        <button id="ico-flask" data-testid="coordinator-icon-option-science" role="radio" aria-label="Flask"></button>
        <button id="col-blue" data-testid="coordinator-color-option-blue" role="radio" aria-label="Blue"></button>
        <button id="perm-q1">Allow browser downloads from this site?</button>
        <button id="perm-q2">Save rule to always allow running this command outside the sandbox?</button>
        <span id="loc-btn" aria-label="Where the agent runs, current: This computer"></span>
        <button id="plan-go">Proceed with implementation plan and 3 comments</button>
        <div id="upd-prog">You have 2 conversations in progress. Updating will interrupt them, and they will automatically resume once the update completes.</div>
        <div id="model-gone">Gemini 2.5 Pro is no longer available. Runs use Gemini 3 Flash instead.</div>
        <div role="menu" aria-label="Select model"><span id="model-unavail">Unavailable</span></div>
        <span id="plain-unavail">Unavailable</span>
        <div id="model-avail-1">Claude 3.7 Sonnet is currently available to Pro users.</div>
        <div id="model-avail-2">Gemini 2.5 Pro is now available on Google AI Pro. Third-party model access will no longer be available starting on May 15, 2026.</div>
        <div id="model-dep-only">Claude 3.5 Sonnet will no longer be available on your current plan starting on 2026-06-01</div>
        <div id="model-dep-3p">Third-party model access will no longer be available on your current plan starting on 15 July 2026.</div>
        <div id="icon-safe"><span id="w-code">Code</span><span id="w-eye">Eye</span><span id="w-hub">Hub</span><span id="w-shield">Shield</span><span id="w-robot">Robot</span><span id="w-flask">Flask</span></div>
        <button id="plain-radio" role="radio" aria-label="Code"></button>
      </div>
    `;

    const w = await fixture(t, html);
    assert.equal(w.document.getElementById('browsing-title').textContent, '清除浏览数据？');
    assert.equal(w.document.getElementById('browsing-history').textContent, '浏览历史记录');
    assert.equal(w.document.getElementById('cookies-site').textContent, '按网站管理 Cookie');
    assert.equal(w.document.getElementById('kb-scheme').textContent, '快捷键方案');
    assert.equal(w.document.getElementById('browser-agent').textContent, '启用浏览器智能体');
    assert.equal(w.document.getElementById('add-bundle').textContent, '添加套件');
    assert.equal(w.document.getElementById('rm-bundle').textContent, '移除套件');
    assert.equal(w.document.getElementById('insert-main').textContent, '插入到主会话');
    assert.equal(w.document.getElementById('sq-unarch').textContent, '请先取消归档主会话再插入');
    assert.equal(w.document.getElementById('cookie-err').textContent, '无法删除以下网站的 Cookie：example.com，请重试。');
    assert.equal(w.document.getElementById('clearing-site').textContent, '正在清除以下网站的 Cookie 和网站数据：example.com');
    assert.equal(w.document.getElementById('no-match-split').textContent, '没有匹配“alpha.dev”的网站。');
    assert.equal(w.document.getElementById('no-match-full').textContent, '没有匹配“beta.dev”的网站。');
    assert.equal(w.document.getElementById('kb-filter').textContent, '查看实时按键绑定或录制自定义组合键，当前筛选范围为 antigravity. 命令。');
    assert.equal(w.document.getElementById('signin-remote').textContent, '您正在 devbox-01 上登录。登录状态仅保留在该机器上。');
    assert.equal(w.document.getElementById('mcp-acc').getAttribute('aria-label'), '此 MCP 服务器使用的账户：work@example.com');
    assert.equal(w.document.getElementById('go-turn').getAttribute('aria-label'), '跳转到第 3 / 12 轮');
    assert.equal(w.document.getElementById('plan-steps').getAttribute('aria-label'), '计划，已完成 2 / 5 步');
    assert.equal(w.document.getElementById('rm-shortcut').getAttribute('aria-label'), '移除 命令面板 的快捷键 Cmd+K');
    assert.equal(w.document.getElementById('reset-cmd').getAttribute('aria-label'), '将 命令面板 重置为默认值');
    assert.equal(w.document.getElementById('no-bundles').textContent, '未找到匹配的套件：');
    assert.equal(w.document.getElementById('no-plugins-q').textContent, '未找到与“lint”匹配的插件');
    assert.equal(w.document.getElementById('dup-folder').textContent, '文件夹名称重复');
    assert.equal(w.document.getElementById('dup-rule').textContent, '规则名称重复');
    assert.equal(w.document.getElementById('dup-wf').textContent, '工作流名称重复');
    assert.equal(w.document.getElementById('bundle-prefix').textContent, '3 个插件。停用或移除此套件仅会影响由它安装的项目。');
    assert.equal(w.document.getElementById('export-err').textContent, '导出产物失败');
    assert.equal(w.document.getElementById('del-ws-err').textContent, '删除工作区失败');
    assert.equal(w.document.getElementById('gh-lbl').getAttribute('aria-label'), 'GitHub：需要身份验证');
    assert.equal(w.document.getElementById('ssh-lbl').textContent, 'SSH：devbox-01');
    assert.equal(w.document.getElementById('see-doc').textContent, '查看 文档：https://example.com');
    assert.equal(w.document.getElementById('acc-lbl').getAttribute('aria-label'), 'work@example.com 的标签');
    assert.equal(w.document.getElementById('more-lbl').getAttribute('aria-label'), 'devbox-01 的更多操作');
    assert.equal(w.document.getElementById('safe-del-ws').textContent, '删除工作区');
    assert.equal(w.document.getElementById('unsafe-del-var').textContent, 'Delete MyCustomVar');
    assert.equal(w.document.getElementById('meta-init').textContent, '初始化来源');
    assert.equal(w.document.getElementById('meta-decl').textContent, '声明来源');
    assert.equal(w.document.getElementById('prose-init').textContent, 'Initialized with a custom environment variable for testing.');
    assert.equal(w.document.getElementById('ico-robot').getAttribute('aria-label'), '机器人');
    assert.equal(w.document.getElementById('ico-code').getAttribute('aria-label'), '代码');
    assert.equal(w.document.getElementById('ico-flask').getAttribute('aria-label'), '烧瓶');
    assert.equal(w.document.getElementById('col-blue').getAttribute('aria-label'), '蓝色');
    assert.equal(w.document.getElementById('perm-q1').textContent, '是否允许从此网站进行浏览器下载？');
    assert.equal(w.document.getElementById('perm-q2').textContent, '是否保存规则以始终允许在沙箱外运行此命令？');
    assert.equal(w.document.getElementById('loc-btn').getAttribute('aria-label'), '智能体运行位置，当前：此电脑');
    assert.equal(w.document.getElementById('plan-go').textContent, '按实施计划并附带 3 条评论继续执行');
    assert.equal(w.document.getElementById('upd-prog').textContent, '您有 2 个正在进行的会话。更新将暂时中断它们，更新完成后会自动恢复。');
    assert.equal(w.document.getElementById('model-gone').textContent, 'Gemini 2.5 Pro 已不再可用，运行时将改用 Gemini 3 Flash。');
    assert.equal(w.document.getElementById('model-unavail').textContent, '不可用');
    assert.equal(w.document.getElementById('plain-unavail').textContent, 'Unavailable');
    assert.equal(w.document.getElementById('model-avail-1').textContent, 'Claude 3.7 Sonnet 目前已向 Pro 用户 开放。');
    assert.equal(w.document.getElementById('model-avail-2').textContent, 'Gemini 2.5 Pro 现已向 Google AI Pro 开放。第三方模型访问权限将自 2026 年 5 月 15 日 起不再提供。');
    assert.equal(w.document.getElementById('model-dep-only').textContent, 'Claude 3.5 Sonnet 将自 2026 年 6 月 1 日 起不再在您当前的方案中提供');
    assert.equal(w.document.getElementById('model-dep-3p').textContent, '第三方模型访问权限将自 2026 年 7 月 15 日 起不再在您当前的方案中提供。');
    assert.equal(w.document.getElementById('w-code').textContent, 'Code');
    assert.equal(w.document.getElementById('w-eye').textContent, 'Eye');
    assert.equal(w.document.getElementById('w-hub').textContent, 'Hub');
    assert.equal(w.document.getElementById('w-shield').textContent, 'Shield');
    assert.equal(w.document.getElementById('w-robot').textContent, 'Robot');
    assert.equal(w.document.getElementById('w-flask').textContent, 'Flask');
    assert.equal(w.document.getElementById('plain-radio').getAttribute('aria-label'), 'Code');

    const domTw = createDom(html);
    t.after(() => domTw.window.close());
    domTw.window.eval(loadRuntime({ traditional: true }));
    await settle();
    assert.equal(domTw.window.document.getElementById('browsing-title').textContent, '清除瀏覽資料？');
    assert.equal(domTw.window.document.getElementById('browsing-history').textContent, '瀏覽記錄');
    assert.equal(domTw.window.document.getElementById('cookies-site').textContent, '依網站檢視 Cookie');
    assert.equal(domTw.window.document.getElementById('kb-scheme').textContent, '快速鍵方案');
    assert.equal(domTw.window.document.getElementById('browser-agent').textContent, '啟用瀏覽器代理');
    assert.equal(domTw.window.document.getElementById('add-bundle').textContent, '新增套件');
    assert.equal(domTw.window.document.getElementById('rm-bundle').textContent, '移除套件');
    assert.equal(domTw.window.document.getElementById('sq-unarch').textContent, '請先取消封存主對話再插入');
    assert.equal(domTw.window.document.getElementById('cookie-err').textContent, '無法刪除以下網站的 Cookie：example.com，請重試。');
    assert.equal(domTw.window.document.getElementById('no-match-split').textContent, '沒有符合「alpha.dev」的網站。');
    assert.equal(domTw.window.document.getElementById('no-match-full').textContent, '沒有符合「beta.dev」的網站。');
    assert.equal(domTw.window.document.getElementById('kb-filter').textContent, '檢視即時按鍵繫結或錄製自訂組合鍵，目前篩選範圍為 antigravity. 指令。');
    assert.equal(domTw.window.document.getElementById('signin-remote').textContent, '您正在 devbox-01 上登入。登入狀態僅保留在該機器上。');
    assert.equal(domTw.window.document.getElementById('go-turn').getAttribute('aria-label'), '前往第 3 / 12 輪');
    assert.equal(domTw.window.document.getElementById('plan-steps').getAttribute('aria-label'), '計畫，已完成 2 / 5 步');
    assert.equal(domTw.window.document.getElementById('rm-shortcut').getAttribute('aria-label'), '移除 命令選擇區 的快速鍵 Cmd+K');
    assert.equal(domTw.window.document.getElementById('reset-cmd').getAttribute('aria-label'), '將 命令選擇區 重設為預設值');
    assert.equal(domTw.window.document.getElementById('no-bundles').textContent, '找不到符合以下條件的套件：');
    assert.equal(domTw.window.document.getElementById('no-plugins-q').textContent, '找不到與「lint」相符的外掛程式');
    assert.equal(domTw.window.document.getElementById('bundle-prefix').textContent, '3 個外掛程式。停用或移除此套件僅會影響由它安裝的項目。');
    assert.equal(domTw.window.document.getElementById('comment-pg').textContent, '第 2 頁的評論');
    assert.equal(domTw.window.document.getElementById('edit-comment').textContent, '編輯評論：fix typo');
    assert.equal(domTw.window.document.getElementById('export-err').textContent, '匯出成品失敗');
    assert.equal(domTw.window.document.getElementById('ico-code').getAttribute('aria-label'), '程式碼');
    assert.equal(domTw.window.document.getElementById('col-blue').getAttribute('aria-label'), '藍色');
    assert.equal(domTw.window.document.getElementById('perm-q1').textContent, '是否允許從此網站進行瀏覽器下載？');
    assert.equal(domTw.window.document.getElementById('loc-btn').getAttribute('aria-label'), '代理執行位置，目前：此電腦');
    assert.equal(domTw.window.document.getElementById('model-unavail').textContent, '無法使用');
    assert.equal(domTw.window.document.getElementById('plain-unavail').textContent, 'Unavailable');
    assert.equal(domTw.window.document.getElementById('model-avail-1').textContent, 'Claude 3.7 Sonnet 目前已向 Pro 使用者 開放。');
    assert.equal(domTw.window.document.getElementById('model-avail-2').textContent, 'Gemini 2.5 Pro 現已向 Google AI Pro 開放。第三方模型存取權限將自 2026 年 5 月 15 日 起不再提供。');
    assert.equal(domTw.window.document.getElementById('model-dep-only').textContent, 'Claude 3.5 Sonnet 將自 2026 年 6 月 1 日 起不再於您目前的方案中提供');
    assert.equal(domTw.window.document.getElementById('model-dep-3p').textContent, '第三方模型存取權限將自 2026 年 7 月 15 日 起不再於您目前的方案中提供。');
    assert.equal(domTw.window.document.getElementById('w-code').textContent, 'Code');
});

test('v2.34.0 orchestrator settings, sidebar customization, dynamic templates and contextual hints translate in SC and TC', async t => {
    const html = `
      <div>
        <h2 id="orch-title">Orchestrator Settings</h2>
        <span id="think-eff">Thinking effort</span>
        <button id="cust-sb" aria-label="Customize Sidebar">Customize Sidebar</button>
        <p id="screen-lock">Screen locked: agents can't use this Mac until you unlock it</p>
        <div id="disc-err">Couldn't disconnect GitHub: network timeout</div>
        <div id="load-err">Failed to load page Settings: 500</div>
        <button id="more-opt" aria-label="More options for devbox-01">...</button>
        <span id="new-conv">Opens the New Conversation screen for this workspace</span>
        <p id="send-hint"><span>Messages now send immediately. Configure in</span><a href="#">Settings</a></p>
        <p id="sys-click"><span>In System Settings, click</span><strong>Privacy</strong></p>
        <p id="already-on"><span>Already on? Select</span><strong>Antigravity</strong></p>
      </div>
    `;

    const w = await fixture(t, html);
    assert.equal(w.document.getElementById('orch-title').textContent, '编排器设置');
    assert.equal(w.document.getElementById('think-eff').textContent, '思考深度');
    assert.equal(w.document.getElementById('cust-sb').getAttribute('aria-label'), '自定义侧边栏');
    assert.equal(w.document.getElementById('screen-lock').textContent, '屏幕已锁定：在您解锁前，智能体无法使用此 Mac');
    assert.equal(w.document.getElementById('disc-err').textContent, '无法断开 GitHub 的连接：network timeout');
    assert.equal(w.document.getElementById('load-err').textContent, '加载页面 Settings 失败：500');
    assert.equal(w.document.getElementById('more-opt').getAttribute('aria-label'), 'devbox-01 的更多选项');
    assert.equal(w.document.getElementById('new-conv').textContent, '打开此 工作区 的新会话界面');
    assert.equal(w.document.getElementById('send-hint').querySelector('span').textContent, '消息现已改为立即发送。可在');
    assert.equal(w.document.getElementById('sys-click').querySelector('span').textContent, '在“系统设置”中，点击 ');
    assert.equal(w.document.getElementById('already-on').querySelector('span').textContent, '已经开启？请选择 ');

    const domTw = createDom(html);
    t.after(() => domTw.window.close());
    domTw.window.eval(loadRuntime({ traditional: true }));
    await settle();
    assert.equal(domTw.window.document.getElementById('orch-title').textContent, '編排器設定');
    assert.equal(domTw.window.document.getElementById('cust-sb').getAttribute('aria-label'), '自訂側邊欄');
    assert.equal(domTw.window.document.getElementById('screen-lock').textContent, '螢幕已鎖定：在您解鎖前，代理無法使用此 Mac');
    assert.equal(domTw.window.document.getElementById('disc-err').textContent, '無法中斷 GitHub 的連線：network timeout');
    assert.equal(domTw.window.document.getElementById('load-err').textContent, '載入頁面 Settings 失敗：500');
    assert.equal(domTw.window.document.getElementById('more-opt').getAttribute('aria-label'), 'devbox-01 的更多選項');
    assert.equal(domTw.window.document.getElementById('new-conv').textContent, '開啟此 工作區 的新對話畫面');
    assert.equal(domTw.window.document.getElementById('send-hint').querySelector('span').textContent, '訊息現已改為立即傳送。可在');
    assert.equal(domTw.window.document.getElementById('sys-click').querySelector('span').textContent, '在「系統設定」中，按一下 ');
});

test('region eligibility errors, login FAQ link, Available for project, and step counters translate in SC and TC', async t => {
    const html = `
      <div>
        <p id="loc-err">Your current account is not eligible for Antigravity, because it is not currently available in your location.</p>
        <p id="not-elig">This account is not eligible for Antigravity.</p>
        <p id="reg-unsup">Your current region is not supported.</p>
        <p id="faq-wrap">Please verify your account, then sign in again to continue. Learn more by visiting our <a id="faq-link" href="#">FAQ</a>.</p>
        <span id="verify-btn">Verify</span>
        <span id="lower-verify">verify</span>
        <span id="avail-proj">Available for my-gcp-proj project</span>
        <span id="avail-proj-split">Available for <code>my-gcp-proj</code> project</span>
        <span id="plan-steps" aria-label="Plan, 3 of 5 steps done"></span>
        <span id="q-of" aria-label="Question 2 of 4"></span>
      </div>
    `;

    const w = await fixture(t, html);
    assert.equal(w.document.getElementById('loc-err').textContent, '您当前的账户无权使用 Antigravity，因为您所在的地区目前暂不支持此服务。');
    assert.equal(w.document.getElementById('not-elig').textContent, '当前账户无权使用 Antigravity。');
    assert.equal(w.document.getElementById('reg-unsup').textContent, '当前不支持您所在的地区。');
    assert.equal(w.document.getElementById('faq-link').textContent, '常见问题');
    assert.equal(w.document.getElementById('verify-btn').textContent, '验证');
    assert.equal(w.document.getElementById('lower-verify').textContent, 'verify');
    assert.equal(w.document.getElementById('avail-proj').textContent, '适用于 my-gcp-proj 项目');
    assert.equal(w.document.getElementById('avail-proj-split').textContent, '适用于 my-gcp-proj 项目');
    assert.equal(w.document.getElementById('plan-steps').getAttribute('aria-label'), '计划，已完成 3 / 5 步');
    assert.equal(w.document.getElementById('q-of').getAttribute('aria-label'), '第 2 / 4 个问题');

    const domTw = createDom(html);
    t.after(() => domTw.window.close());
    domTw.window.eval(loadRuntime({ traditional: true }));
    await settle();
    assert.equal(domTw.window.document.getElementById('loc-err').textContent, '您目前的帳戶不符合使用 Antigravity 的資格，因為您所在的地區目前不支援此服務。');
    assert.equal(domTw.window.document.getElementById('not-elig').textContent, '目前帳戶不符合使用 Antigravity 的資格。');
    assert.equal(domTw.window.document.getElementById('reg-unsup').textContent, '目前不支援您所在的地區。');
    assert.equal(domTw.window.document.getElementById('faq-link').textContent, '常見問題');
    assert.equal(domTw.window.document.getElementById('verify-btn').textContent, '驗證');
    assert.equal(domTw.window.document.getElementById('lower-verify').textContent, 'verify');
    assert.equal(domTw.window.document.getElementById('avail-proj').textContent, '適用於 my-gcp-proj 專案');
    assert.equal(domTw.window.document.getElementById('avail-proj-split').textContent, '適用於 my-gcp-proj 專案');
    assert.equal(domTw.window.document.getElementById('plan-steps').getAttribute('aria-label'), '計畫，已完成 3 / 5 步');
    assert.equal(domTw.window.document.getElementById('q-of').getAttribute('aria-label'), '第 2 / 4 個問題');
});

test('v2.35.0 inbox mode, dictation languages, plugin permissions and dynamic templates translate in SC and TC', async t => {
    const html = `
      <div>
        <span id="inbox-mode">Inbox Mode</span>
        <span id="dict-lang">Dictation languages</span>
        <span id="plug-perm">Plugin permissions</span>
        <p id="revoke-msg">All file permissions will be revoked. The plugin will ask before doing this again.</p>
        <span id="ai-credits">Available AI credits: 1,250</span>
        <button id="dismiss-btn" aria-label="Dismiss: Update ready">x</button>
        <span id="move-to">Move to Archive</span>
        <span id="new-ws">New workspace...</span>
        <span id="no-lang">No matching languages for "klingon"</span>
        <span id="rm-from">Remove from Favorites</span>
        <button id="rev-all" aria-label="Revoke all: GitHub">Revoke all</button>
        <button id="rev-one" aria-label="Revoke: Read files">x</button>
      </div>
    `;

    const w = await fixture(t, html);
    assert.equal(w.document.getElementById('inbox-mode').textContent, '收件箱模式');
    assert.equal(w.document.getElementById('dict-lang').textContent, '听写语言');
    assert.equal(w.document.getElementById('plug-perm').textContent, '插件权限');
    assert.equal(w.document.getElementById('revoke-msg').textContent, '将撤销全部 file permissions。插件在再次执行此操作前会先征求您的同意。');
    assert.equal(w.document.getElementById('ai-credits').textContent, '可用 AI 额度：1,250');
    assert.equal(w.document.getElementById('dismiss-btn').getAttribute('aria-label'), '忽略：Update ready');
    assert.equal(w.document.getElementById('move-to').textContent, '移动到归档');
    assert.equal(w.document.getElementById('new-ws').textContent, '新建工作区...');
    assert.equal(w.document.getElementById('no-lang').textContent, '未找到与“klingon”匹配的语言');
    assert.equal(w.document.getElementById('rm-from').textContent, '从 Favorites 移除');
    assert.equal(w.document.getElementById('rev-all').getAttribute('aria-label'), '全部撤销：GitHub');
    assert.equal(w.document.getElementById('rev-all').textContent, '全部撤销');
    assert.equal(w.document.getElementById('rev-one').getAttribute('aria-label'), '撤销：Read files');

    const domTw = createDom(html);
    t.after(() => domTw.window.close());
    domTw.window.eval(loadRuntime({ traditional: true }));
    await settle();
    assert.equal(domTw.window.document.getElementById('inbox-mode').textContent, '收件匣模式');
    assert.equal(domTw.window.document.getElementById('dict-lang').textContent, '聽寫語言');
    assert.equal(domTw.window.document.getElementById('plug-perm').textContent, '外掛程式權限');
    assert.equal(domTw.window.document.getElementById('revoke-msg').textContent, '將撤銷全部 file permissions。外掛程式在再次執行此操作前會先徵求您的同意。');
    assert.equal(domTw.window.document.getElementById('ai-credits').textContent, '可用 AI 點數：1,250');
    assert.equal(domTw.window.document.getElementById('dismiss-btn').getAttribute('aria-label'), '關閉：Update ready');
    assert.equal(domTw.window.document.getElementById('move-to').textContent, '移至封存');
    assert.equal(domTw.window.document.getElementById('new-ws').textContent, '新增工作區...');
    assert.equal(domTw.window.document.getElementById('no-lang').textContent, '找不到與「klingon」相符的語言');
    assert.equal(domTw.window.document.getElementById('rm-from').textContent, '從 Favorites 移除');
    assert.equal(domTw.window.document.getElementById('rev-all').getAttribute('aria-label'), '全部撤銷：GitHub');
    assert.equal(domTw.window.document.getElementById('rev-one').getAttribute('aria-label'), '撤銷：Read files');
});

test('v2.35.1 deep audit strings, dynamic templates and split DOM nodes translate in SC and TC', async t => {
    const html = `
      <div>
        <span id="answered">Answered in chat</span>
        <span id="auto-res">Auto-Resolve</span>
        <button id="back5" aria-label="Back 5s (←)">b</button>
        <span id="clone-loc">Clone locally</span>
        <span id="site-reach">This site can’t be reached</span>
        <span id="page-work">This page isn’t working</span>
        <p id="quota-reset">Your quota for Gemini 4 Pro will reset on Dec 1, 2026. Switch to another available model to continue.</p>
        <p id="need-credits">You need at least 50 AI Credits to send messages. To continue using Gemini 4 Pro now, purchase more AI Credits.</p>
        <span id="retry-in">Model unavailable, retrying in 5s (attempt 2/3)</span>
        <span id="attach-img">3 image attachments</span>
        <span id="left-hm">2h 15m left</span>
        <span id="best-of">Start Best-of-<span>3</span></span>
        <div id="gen-steps">Generation Steps (<span>4</span>)</div>
        <div id="no-mcp">No MCP servers found for "<span>foo</span>"</div>
      </div>
    `;

    const w = await fixture(t, html);
    assert.equal(w.document.getElementById('answered').textContent, '已在聊天中回复');
    assert.equal(w.document.getElementById('auto-res').textContent, '自动解决');
    assert.equal(w.document.getElementById('back5').getAttribute('aria-label'), '后退 5 秒 (←)');
    assert.equal(w.document.getElementById('clone-loc').textContent, '克隆到本地');
    assert.equal(w.document.getElementById('site-reach').textContent, '无法访问此网站');
    assert.equal(w.document.getElementById('page-work').textContent, '此页面无法正常运作');
    assert.equal(w.document.getElementById('quota-reset').textContent, '您的 Gemini 4 Pro 配额将于 Dec 1, 2026 重置。请切换至其他可用模型以继续。');
    assert.equal(w.document.getElementById('need-credits').textContent, '您需要至少 50 AI 额度才能发送消息。要立即继续使用 Gemini 4 Pro，请购买更多 AI 额度。');
    assert.equal(w.document.getElementById('retry-in').textContent, '模型暂不可用，5 秒后重试（第 2/3 次尝试）');
    assert.equal(w.document.getElementById('attach-img').textContent, '3 张图片附件');
    assert.equal(w.document.getElementById('left-hm').textContent, '剩余 2 小时 15 分钟');
    assert.equal(w.document.getElementById('best-of').textContent, '启动 Best-of-3');
    assert.equal(w.document.getElementById('gen-steps').textContent, '生成步骤 (4)');
    assert.equal(w.document.getElementById('no-mcp').textContent, '未找到与“foo”匹配的 MCP 服务器');

    const domTw = createDom(html);
    t.after(() => domTw.window.close());
    domTw.window.eval(loadRuntime({ traditional: true }));
    await settle();
    assert.equal(domTw.window.document.getElementById('answered').textContent, '已在聊天中回覆');
    assert.equal(domTw.window.document.getElementById('auto-res').textContent, '自動解決');
    assert.equal(domTw.window.document.getElementById('back5').getAttribute('aria-label'), '倒轉 5 秒 (←)');
    assert.equal(domTw.window.document.getElementById('clone-loc').textContent, '複製至本機');
    assert.equal(domTw.window.document.getElementById('site-reach').textContent, '無法連線到這個網站');
    assert.equal(domTw.window.document.getElementById('quota-reset').textContent, '您的 Gemini 4 Pro 配額將於 Dec 1, 2026 重設。請切換至其他可用模型以繼續。');
    assert.equal(domTw.window.document.getElementById('need-credits').textContent, '您需要至少 50 AI 點數才能傳送訊息。若要立即繼續使用 Gemini 4 Pro，請購買更多 AI 點數。');
    assert.equal(domTw.window.document.getElementById('retry-in').textContent, '模型暫時無法使用，5 秒後重試（第 2/3 次嘗試）');
    assert.equal(domTw.window.document.getElementById('attach-img').textContent, '3 張圖片附件');
    assert.equal(domTw.window.document.getElementById('left-hm').textContent, '剩餘 2 小時 15 分鐘');
    assert.equal(domTw.window.document.getElementById('best-of').textContent, '啟動 Best-of-3');
    assert.equal(domTw.window.document.getElementById('gen-steps').textContent, '產生步驟 (4)');
    assert.equal(domTw.window.document.getElementById('no-mcp').textContent, '找不到與「foo」相符的 MCP 伺服器');
});

test('v2.35.1 additional UI badges, attributes, plan toggles and TW 已發布 hold in SC and TC', async t => {
    const html = `
      <div>
        <span id="inbox">Inbox</span>
        <span id="resolved">Resolved</span>
        <span id="prov">Provisioning</span>
        <span id="chosen">Chosen</span>
        <button id="applied-btn" aria-label="Applied DarkTheme">Applied</button>
        <button id="show-btn" aria-label="Show MyPlugin">x</button>
        <span id="plan-tog">Build API. Show plan</span>
        <span id="pub-tw">Published feat/x to origin.</span>
        <span id="err-line">Error: timeout</span>
        <span id="trig">Triggered nightly-sync</span>
        <span id="tok">Rules: 1,200 tokens</span>
      </div>
    `;
    const w = await fixture(t, html);
    assert.equal(w.document.getElementById('inbox').textContent, '收件箱');
    assert.equal(w.document.getElementById('resolved').textContent, '已解决');
    assert.equal(w.document.getElementById('prov').textContent, '正在配置');
    assert.equal(w.document.getElementById('chosen').textContent, '已选中');
    assert.equal(w.document.getElementById('applied-btn').getAttribute('aria-label'), '已应用 DarkTheme');
    assert.equal(w.document.getElementById('applied-btn').textContent, '已应用');
    assert.equal(w.document.getElementById('show-btn').getAttribute('aria-label'), '显示 MyPlugin');
    assert.equal(w.document.getElementById('plan-tog').textContent, 'Build API。显示计划');
    assert.equal(w.document.getElementById('pub-tw').textContent, '已发布 feat/x 至 origin。');
    assert.equal(w.document.getElementById('err-line').textContent, '错误：timeout');
    assert.equal(w.document.getElementById('trig').textContent, '已触发 nightly-sync');
    assert.equal(w.document.getElementById('tok').textContent, '规则：1,200 Token');

    const domTw = createDom(html);
    t.after(() => domTw.window.close());
    domTw.window.eval(loadRuntime({ traditional: true }));
    await settle();
    assert.equal(domTw.window.document.getElementById('inbox').textContent, '收件匣');
    assert.equal(domTw.window.document.getElementById('resolved').textContent, '已解決');
    assert.equal(domTw.window.document.getElementById('prov').textContent, '佈建中');
    assert.equal(domTw.window.document.getElementById('chosen').textContent, '已選取');
    assert.equal(domTw.window.document.getElementById('applied-btn').getAttribute('aria-label'), '已套用 DarkTheme');
    assert.equal(domTw.window.document.getElementById('applied-btn').textContent, '已套用');
    assert.equal(domTw.window.document.getElementById('show-btn').getAttribute('aria-label'), '顯示 MyPlugin');
    assert.equal(domTw.window.document.getElementById('plan-tog').textContent, 'Build API。顯示計畫');
    assert.equal(domTw.window.document.getElementById('pub-tw').textContent, '已發布 feat/x 至 origin。');
    assert.equal(domTw.window.document.getElementById('err-line').textContent, '錯誤：timeout');
    assert.equal(domTw.window.document.getElementById('trig').textContent, '已觸發 nightly-sync');
    assert.equal(domTw.window.document.getElementById('tok').textContent, '規則：1,200 Token');
});

test('PR #68 short words do not pollute lowercase identifiers and Show <host> in the list again translates cleanly', async t => {
    const html = `
      <div>
        <span id="lc-move">move</span>
        <span id="lc-never">never</span>
        <span id="lc-self">self</span>
        <span id="lc-failed">failed</span>
        <span id="lc-resolve">resolve</span>
        <span id="tc-move">Move</span>
        <button id="show-host" aria-label="Show example.com in the list again">x</button>
      </div>
    `;
    const w = await fixture(t, html);
    assert.equal(w.document.getElementById('lc-move').textContent, 'move');
    assert.equal(w.document.getElementById('lc-never').textContent, 'never');
    assert.equal(w.document.getElementById('lc-self').textContent, 'self');
    assert.equal(w.document.getElementById('lc-failed').textContent, 'failed');
    assert.equal(w.document.getElementById('lc-resolve').textContent, 'resolve');
    assert.equal(w.document.getElementById('tc-move').textContent, '移动');
    assert.equal(w.document.getElementById('show-host').getAttribute('aria-label'), '重新在列表中显示 example.com');

    const domTw = createDom(html);
    t.after(() => domTw.window.close());
    domTw.window.eval(loadRuntime({ traditional: true }));
    await settle();
    assert.equal(domTw.window.document.getElementById('lc-self').textContent, 'self');
    assert.equal(domTw.window.document.getElementById('tc-move').textContent, '移動');
    assert.equal(domTw.window.document.getElementById('show-host').getAttribute('aria-label'), '重新在清單中顯示 example.com');
});
test('v2.35.1 icon-font fallbacks stay untranslated, permission pill uses short labels, history titles stay isolated, and Show N more keeps the source ellipsis', async t => {
    const html = `
        <span id="i-comment" class="google-symbols" style="font-size: 18px">comment</span>
        <span id="i-quote" class="google-symbols">format_quote</span>
        <span id="i-laptop" class="google-symbols">laptop_shield</span>
        <span id="i-unknown" class="google-symbols">settings</span>
        <button data-testid="permissions-selector-trigger"><span id="pill-turbo">Turbo</span></button>
        <button data-testid="permissions-selector-trigger"><span id="pill-default">Default</span></button>
        <span id="plain-default">Default</span>
        <div data-testid="conversation-row-history"><span id="hist-title" class="truncate">Settings</span></div>
        <button id="more-plain">Show 3 more</button>
        <button id="more-ell">Show 3 more...</button>
        <button id="move-cn">Move to Archive</button>
    `;
    const w = await fixture(t, html);
    const doc = w.document;
    for (const [id, name] of [['i-comment', 'comment'], ['i-quote', 'format_quote'], ['i-laptop', 'laptop_shield']]) {
        const el = doc.getElementById(id);
        assert.equal(el.querySelectorAll(`svg[data-ag-icon-fallback="${name}"]`).length, 1, name);
        assert.equal(el.textContent, '', `${name} 的图标名称不应以文字显示或被翻译`);
    }
    // 宽高跟随宿主字号（1em），rem 等非 px 单位也不会算错
    assert.equal(doc.querySelector('#i-comment svg').getAttribute('width'), '1em');
    assert.equal(doc.getElementById('i-unknown').textContent, 'settings');
    assert.equal(doc.getElementById('pill-turbo').textContent, '极速');
    assert.equal(doc.getElementById('pill-default').textContent, '默认');
    assert.equal(doc.getElementById('plain-default').textContent, '默认 (Default)');
    assert.equal(doc.getElementById('hist-title').textContent, 'Settings');
    assert.equal(doc.getElementById('more-plain').textContent, '显示另外 3 个');
    assert.equal(doc.getElementById('more-ell').textContent, '显示另外 3 个...');

    // React 复用同一个图标节点改成别的图标时，替换 SVG 而不是叠加
    const quoteText = Array.from(doc.getElementById('i-quote').childNodes).find(n => n.nodeType === w.Node.TEXT_NODE);
    quoteText.nodeValue = 'comment';
    await settle();
    assert.equal(doc.querySelectorAll('#i-quote svg').length, 1);
    assert.equal(doc.querySelector('#i-quote svg').getAttribute('data-ag-icon-fallback'), 'comment');

    const domTw = createDom(html);
    t.after(() => domTw.window.close());
    domTw.window.eval(loadRuntime({ traditional: true }));
    await settle();
    assert.equal(domTw.window.document.getElementById('pill-turbo').textContent, '極速');
    assert.equal(domTw.window.document.getElementById('more-plain').textContent, '顯示另外 3 個');
});

test('v2.35.1 React-split sentences keep CJK spacing, automation hints translate their nouns, and SC/TC templates read naturally', async t => {
    // 结构照 v2.35.1 React 实际输出：相邻字符串各自成为文字节点，" " 是独立节点，<!----> 是 Fragment 边界
    const html = `
        <span role="status" id="ps2">In System Settings, click <strong>+</strong>, choose<!----> <!----><strong>Antigravity</strong>, then turn it on.<!----> <!---->Already on? Select <strong>Antigravity</strong>, click <strong>–</strong>, then<!----> <!---->click <strong>+</strong> and add it again.</span>
        <span id="kb">Inspect live bindings or record custom key chords filtered to<!----> <code>antigravity.</code> <!---->commands.</span>
        <span id="msg">Messages now send immediately. Configure in<!----> <span class="whitespace-nowrap"><button>settings</button>.</span></span>
        <span id="wk2"><span class="font-semibold">Weekly</span> on<!----> <!----><span class="font-semibold">Monday</span> around<!----> <!----><span class="font-semibold">9:00 AM</span></span>
        <div id="dp">Agents created by <!---->Foo Plugin<!----> run in a dedicated<!----> <!---->project<!----> with its own permissions, which you can change anytime in the <!---->project<!----> settings page.<!----> On top of those defaults, Foo Plugin requests the access below.</div>
        <div id="toast">Agents created by this automation run in a dedicated project with its own permissions. You can change the permissions in the project settings page.</div>
        <div id="stopn">Stop 3 items?</div>
        <div id="noapp" class="text-muted-foreground">No plugin found for<!----> <!----><span class="font-mono">foo-bar</span>.</div>
        <div id="perm2">Antigravity needs both to use your computer.</div>
        <div id="relaunch">Relaunch Antigravity to finish Screen Recording.</div>
        <div id="tool1">1 tool</div><div id="tool2">5 tools · sign in for more</div>
        <div id="conn">Connecting to devbox…</div><div id="conn2">Connecting to devbox</div>
        <div data-testid="running-selection-bar"><span id="sel" class="text-foreground">3<!----> selected</span></div>
    `;
    const expected = {
        ps2: ['在“系统设置”中，点击 +，选择 Antigravity，然后将其开启。已经开启？请选择 Antigravity，点击 –，然后点击 + 重新添加。', '在「系統設定」中，按一下 +，選取 Antigravity，然後將它開啟。已經開啟？請選取 Antigravity，按一下 –，然後按一下 + 重新加入。'],
        kb: ['查看实时按键绑定或录制自定义组合键，当前筛选范围为 antigravity. 命令。', '檢視即時按鍵繫結或錄製自訂組合鍵，目前篩選範圍為 antigravity. 指令。'],
        msg: ['消息现已改为立即发送。可在设置中调整。', '訊息現已改為立即傳送。可在設定中調整。'],
        wk2: ['每周星期一约 9:00 AM', '每週星期一約 9:00 AM'],
        dp: ['由 Foo Plugin 创建的智能体运行在专用的项目中并拥有独立权限，您可以随时在项目设置页面中更改。除上述默认权限外，Foo Plugin 还请求以下访问权限。', '由 Foo Plugin 建立的代理執行於專用的專案中並擁有獨立權限，您可以隨時在專案設定頁面中變更。除上述預設權限外，Foo Plugin 還請求以下存取權限。'],
        toast: ['此自动化创建的智能体会在具有独立权限的专用项目中运行。您可以在项目设置页面更改权限。', '此自動化建立的代理會在具有獨立權限的專屬專案中執行。您可以在專案設定頁面變更權限。'],
        stopn: ['确定要停止 3 个项目吗？', '確定要停止 3 個項目嗎？'],
        noapp: ['未找到插件 foo-bar。', '找不到外掛程式 foo-bar。'],
        perm2: ['Antigravity 需要这两项权限才能控制您的电脑。', 'Antigravity 需要這兩項權限才能操作您的電腦。'],
        relaunch: ['请重新启动 Antigravity 以完成“屏幕录制”设置。', '請重新啟動 Antigravity 以完成「螢幕錄製」設定。'],
        tool1: ['1 个工具', '1 個工具'],
        tool2: ['5 个工具 · 登录以获取更多', '5 個工具 · 登入以取得更多'],
        conn: ['正在连接到 devbox…', '正在連線至 devbox…'],
        conn2: ['正在连接到 devbox', '正在連線至 devbox'],
        sel: ['3 项已选中', '3 項已選取']
    };
    const w = await fixture(t, html);
    for (const [id, [sc]] of Object.entries(expected)) {
        assert.equal(w.document.getElementById(id).textContent, sc, `SC ${id}`);
    }
    const domTw = createDom(html);
    t.after(() => domTw.window.close());
    domTw.window.eval(loadRuntime({ traditional: true }));
    await settle();
    for (const [id, [, tc]] of Object.entries(expected)) {
        assert.equal(domTw.window.document.getElementById(id).textContent, tc, `TC ${id}`);
    }
    // 两侧都是元素（并排按钮）时，中间的空白是分隔用的，不收掉
    const w2 = await fixture(t, '<div id="pair"><button>Cancel</button> <button>Settings</button></div>');
    assert.equal(w2.document.getElementById('pair').textContent, '取消 设置');
});

test('plugin and feature names stay in the original language in SC and TC (#63)', async t => {
    const html = `
        <span id="n1">Chief of Staff</span><span id="n2">Concierge</span><span id="n3">Data Agent Kit</span>
        <span id="n4">Google Workspace</span><span id="n5">Google Developer Knowledge</span>
        <span id="s1">Sent to Chief of Staff</span><span id="s2">Chief of Staff voice mode is active</span>
        <span id="s3">Welcome to the Concierge</span>
    `;
    const names = { n1: 'Chief of Staff', n2: 'Concierge', n3: 'Data Agent Kit', n4: 'Google Workspace', n5: 'Google Developer Knowledge' };
    const w = await fixture(t, html);
    for (const [id, name] of Object.entries(names)) assert.equal(w.document.getElementById(id).textContent, name, `SC ${name}`);
    assert.equal(w.document.getElementById('s1').textContent, '已发送给 Chief of Staff');
    // 原本误用 Concierge 的译名「语音助手」
    assert.equal(w.document.getElementById('s2').textContent, 'Chief of Staff 语音模式已启用');
    assert.equal(w.document.getElementById('s3').textContent, '欢迎使用 Concierge');
    const domTw = createDom(html);
    t.after(() => domTw.window.close());
    domTw.window.eval(loadRuntime({ traditional: true }));
    await settle();
    for (const [id, name] of Object.entries(names)) assert.equal(domTw.window.document.getElementById(id).textContent, name, `TC ${name}`);
    assert.equal(domTw.window.document.getElementById('s2').textContent, 'Chief of Staff 語音模式已啟用');
});

test('CJK gap collapse is undone when React reuses neighbor text nodes, and nested markup is walked once', async t => {
    const html = '<span id="pair">Settings<!----> <!---->Help</span>';
    const w = await fixture(t, html);
    const pair = w.document.getElementById('pair');
    assert.equal(pair.textContent, '设置帮助');
    // React 重用同一批文字节点换成英文：收掉的空白要还原；换回可翻译文字时再次收合
    pair.firstChild.data = 'Alice';
    pair.lastChild.data = 'Bob';
    await settle();
    assert.equal(pair.textContent, 'Alice Bob');
    pair.firstChild.data = 'Settings';
    pair.lastChild.data = 'Help';
    await settle();
    assert.equal(pair.textContent, '设置帮助');

    const domTw = createDom(html);
    t.after(() => domTw.window.close());
    domTw.window.eval(loadRuntime({ traditional: true }));
    await settle();
    const pairTw = domTw.window.document.getElementById('pair');
    assert.equal(pairTw.textContent, '設定說明');
    pairTw.firstChild.data = 'Alice';
    pairTw.lastChild.data = 'Bob';
    await settle();
    assert.equal(pairTw.textContent, 'Alice Bob');

    // 判断空白时不翻译相邻子树：嵌套结构每个节点只遍历一次（修正前每多一层调用次数加倍）
    const vm = require('node:vm');
    const counter = createDom('');
    t.after(() => counter.window.close());
    const js = loadRuntime();
    const prefix = js.slice(0, js.indexOf('    const observer ='))
        .replace('function translateNode(node) {', 'function translateNode(node) {globalThis.calls++;');
    const context = { Node: counter.window.Node, document: counter.window.document, setTimeout, clearTimeout, console, calls: 0 };
    vm.runInNewContext(prefix + '\n globalThis.hooks = { translateNode }; })();', context);
    const doc = counter.window.document;
    let nested = doc.createElement('span');
    nested.append('X');
    const depth = 12;
    for (let i = 0; i < depth; i++) {
        const parent = doc.createElement('span');
        parent.append('X甲', ' ', nested);
        nested = parent;
    }
    doc.body.append(nested);
    context.hooks.translateNode(nested);
    const nodes = 3 * depth + 2;
    assert.ok(context.calls <= 2 * nodes, `translateNode called ${context.calls} times for ${nodes} nodes`);
});

test('slash command names and sidebar plugin names remain in English while descriptions and working hints translate in SC and TC', async t => {
    const html = `
      <div>
        <div role="listbox">
          <div role="option"><span id="cmd-goal">goal</span><span id="desc-goal">Run until the specified goal is completely finished</span></div>
          <div role="option"><span id="cmd-schedule">schedule</span><span id="desc-schedule">Run an instruction on a recurring schedule or as a one-time timer</span></div>
          <div role="option"><span id="cmd-plan">plan</span><span id="desc-plan">Plan carefully before executing a task.</span></div>
          <div role="option"><span id="cmd-plugin">plugin</span></div>
          <div role="option"><span id="cmd-automation">automation</span></div>
          <div role="option"><span id="cmd-grill">grill-me</span></div>
          <div role="option"><span id="cmd-learn">learn</span></div>
          <div role="option"><span id="cmd-boost">boost</span></div>
          <div role="option"><span id="cmd-btw">btw</span></div>
          <div role="option"><span id="cmd-slash">/schedule</span></div>
          <div role="option"><span id="cmd-split-prefix">/</span><span id="cmd-models">models</span><span id="desc-models">Select model</span></div>
        </div>
        <aside data-testid="sidebar">
          <section>
            <h3 id="sb-plugins-hdr">Plugins</h3>
            <div data-plugin-id="chrome-devtools"><span id="plug-chrome">Chrome DevTools</span><button id="plug-open-chrome" aria-label="Open the Chrome DevTools plugin">Open</button></div>
            <div><span id="plug-mwg">Modern Web Guidance</span></div>
            <div><span id="plug-ws">Google Workspace</span></div>
            <div><span id="plug-dak">Data Agent Kit</span></div>
            <button id="plug-open-k" aria-label="Open the Knowledge plugin"><span id="plug-knowledge">Knowledge</span></button>
            <button id="plug-mkp">Open Marketplace</button>
            <button id="plug-more">See more</button>
          </section>
          <section>
            <h3 id="sb-other-hdr">Knowledge</h3>
          </section>
        </aside>
        <div id="work-hook">Hook Json SessionStart</div>
        <div id="work-run">Running scan dicts for slug and lowercase keys</div>
        <div id="work-dur">1m 31s</div>
        <p id="prose-run">Running tests on CI requires valid credentials.</p>
      </div>
    `;
    const w = await fixture(t, html);
    assert.equal(w.document.getElementById('cmd-goal').textContent, 'goal');
    assert.equal(w.document.getElementById('desc-goal').textContent, '持续运行，直到指定的目标完全完成');
    assert.equal(w.document.getElementById('cmd-schedule').textContent, 'schedule');
    assert.equal(w.document.getElementById('desc-schedule').textContent, '按周期计划或作为一次性定时器运行指令');
    assert.equal(w.document.getElementById('cmd-plan').textContent, 'plan');
    assert.equal(w.document.getElementById('desc-plan').textContent, '在执行任务前仔细制定计划。');
    assert.equal(w.document.getElementById('cmd-plugin').textContent, 'plugin');
    assert.equal(w.document.getElementById('cmd-automation').textContent, 'automation');
    assert.equal(w.document.getElementById('cmd-grill').textContent, 'grill-me');
    assert.equal(w.document.getElementById('cmd-learn').textContent, 'learn');
    assert.equal(w.document.getElementById('cmd-boost').textContent, 'boost');
    assert.equal(w.document.getElementById('cmd-btw').textContent, 'btw');
    assert.equal(w.document.getElementById('cmd-slash').textContent, '/schedule');
    assert.equal(w.document.getElementById('cmd-models').textContent, 'models');
    assert.equal(w.document.getElementById('desc-models').textContent, '选择模型');

    assert.equal(w.document.getElementById('sb-plugins-hdr').textContent, '插件');
    assert.equal(w.document.getElementById('plug-chrome').textContent, 'Chrome DevTools');
    assert.equal(w.document.getElementById('plug-open-chrome').getAttribute('aria-label'), '打开 Chrome DevTools 插件');
    assert.equal(w.document.getElementById('plug-mwg').textContent, 'Modern Web Guidance');
    assert.equal(w.document.getElementById('plug-ws').textContent, 'Google Workspace');
    assert.equal(w.document.getElementById('plug-dak').textContent, 'Data Agent Kit');
    assert.equal(w.document.getElementById('plug-knowledge').textContent, 'Knowledge');
    assert.equal(w.document.getElementById('plug-open-k').getAttribute('aria-label'), '打开 Knowledge 插件');
    assert.equal(w.document.getElementById('plug-mkp').textContent, '打开市场');
    assert.equal(w.document.getElementById('plug-more').textContent, '展开更多');
    assert.equal(w.document.getElementById('sb-other-hdr').textContent, '知识库');

    assert.equal(w.document.getElementById('work-hook').textContent, '钩子 Json SessionStart');
    assert.equal(w.document.getElementById('work-run').textContent, '正在运行 scan dicts for slug and lowercase keys');
    assert.equal(w.document.getElementById('work-dur').textContent, '1 分钟 31 秒');
    assert.equal(w.document.getElementById('prose-run').textContent, 'Running tests on CI requires valid credentials.');

    const domTw = createDom(html);
    t.after(() => domTw.window.close());
    domTw.window.eval(loadRuntime({ traditional: true }));
    await settle();
    assert.equal(domTw.window.document.getElementById('cmd-goal').textContent, 'goal');
    assert.equal(domTw.window.document.getElementById('cmd-models').textContent, 'models');
    assert.equal(domTw.window.document.getElementById('plug-knowledge').textContent, 'Knowledge');
    assert.equal(domTw.window.document.getElementById('sb-other-hdr').textContent, '知識庫');
    assert.equal(domTw.window.document.getElementById('work-hook').textContent, '鉤子 Json SessionStart');
    assert.equal(domTw.window.document.getElementById('work-run').textContent, '正在執行 scan dicts for slug and lowercase keys');
    assert.equal(domTw.window.document.getElementById('work-dur').textContent, '1 分鐘 31 秒');
});

test('sidecar plugin modal keeps plugin name untranslated, translates side-pane sentence, Title-Case section headings, and higher-tier upgrade notice', async t => {
    const html = `
      <div>
        <div role="dialog" id="sidecar-modal">
          <div id="hdr-row"><span id="modal-plugin">Context Usage</span><span id="modal-status">Running</span></div>
          <div id="modal-path">desktop-context/context</div>
          <div id="banner">
            <div id="banner-title">Side Pane UI Available</div>
            <p id="banner-desc-split">Stream and control <span>Context Usage</span> directly in the side pane.</p>
            <p id="banner-desc-single">Stream and control Context Usage directly in the side pane.</p>
            <button id="open-sp">Open in side pane</button>
          </div>
          <div><span id="lbl-type">Type</span><span>UI Plugin (SidePanel)</span></div>
          <div><span id="lbl-cmd">Command</span><span>node main.mjs</span></div>
          <div><span id="lbl-host">Host Endpoint</span></div>
        </div>
        <span id="outside-cu">Context usage</span>
        <h3 id="sec-nav">Navigation</h3>
        <h3 id="sec-sug">Suggestions</h3>
        <h3 id="sec-rec">Recommended</h3>
        <span id="lbl-days">Days</span>
        <span id="lc-nav">navigation</span>
        <p id="upgrade-ultra">You can upgrade to a higher Google AI Ultra plan to receive the highest rate limits.</p>
      </div>
    `;
    const w = await fixture(t, html);
    assert.equal(w.document.getElementById('modal-plugin').textContent, 'Context Usage');
    assert.equal(w.document.getElementById('modal-status').textContent, '运行中');
    assert.equal(w.document.getElementById('banner-title').textContent, '侧边面板界面可用');
    assert.equal(w.document.getElementById('banner-desc-split').textContent, '直接在侧边面板中流式传输与控制 Context Usage。');
    assert.equal(w.document.getElementById('banner-desc-single').textContent, '直接在侧边面板中流式传输与控制 Context Usage。');
    assert.equal(w.document.getElementById('open-sp').textContent, '在侧边面板中打开');
    assert.equal(w.document.getElementById('lbl-type').textContent, '类型');
    assert.equal(w.document.getElementById('lbl-cmd').textContent, '命令');
    assert.equal(w.document.getElementById('lbl-host').textContent, '主机端点');
    assert.equal(w.document.getElementById('outside-cu').textContent, '上下文用量');
    assert.equal(w.document.getElementById('sec-nav').textContent, '导航');
    assert.equal(w.document.getElementById('sec-sug').textContent, '建议');
    assert.equal(w.document.getElementById('sec-rec').textContent, '推荐');
    assert.equal(w.document.getElementById('lbl-days').textContent, '天');
    assert.equal(w.document.getElementById('lc-nav').textContent, 'navigation');
    assert.equal(w.document.getElementById('upgrade-ultra').textContent, '您可以升级到更高级别的 Google AI Ultra 计划以获得最高的速率限制。');

    const domTw = createDom(html);
    t.after(() => domTw.window.close());
    domTw.window.eval(loadRuntime({ traditional: true }));
    await settle();
    assert.equal(domTw.window.document.getElementById('modal-plugin').textContent, 'Context Usage');
    assert.equal(domTw.window.document.getElementById('banner-desc-split').textContent, '直接在側邊面板中串流傳輸與控制 Context Usage。');
    assert.equal(domTw.window.document.getElementById('banner-desc-single').textContent, '直接在側邊面板中串流傳輸與控制 Context Usage。');
    assert.equal(domTw.window.document.getElementById('lbl-type').textContent, '類型');
    assert.equal(domTw.window.document.getElementById('lbl-cmd').textContent, '指令');
    assert.equal(domTw.window.document.getElementById('outside-cu').textContent, '上下文用量');
    assert.equal(domTw.window.document.getElementById('sec-nav').textContent, '導覽');
    assert.equal(domTw.window.document.getElementById('sec-sug').textContent, '建議');
    assert.equal(domTw.window.document.getElementById('sec-rec').textContent, '推薦');
    assert.equal(domTw.window.document.getElementById('lbl-days').textContent, '天');
    assert.equal(domTw.window.document.getElementById('lc-nav').textContent, 'navigation');
    assert.equal(domTw.window.document.getElementById('upgrade-ultra').textContent, '您可以升級至更高等級的 Google AI Ultra 方案以獲得最高的速率限制。');
});

test('folded step summaries without counts and plan mode tool labels translate while code blocks stay isolated', async t => {
    const html = `
      <div>
        <span id="fs-1">Explored, ran command</span>
        <span id="fs-2">Explored, edited, ran command</span>
        <span id="fs-3">Explored, ran 2 commands</span>
        <span id="fs-4">Exploring, running command</span>
        <span id="pm-exit">exit_plan_mode</span>
        <span id="pm-enter">enter_plan_mode</span>
        <code id="pm-code">exit_plan_mode</code>
      </div>
    `;
    const w = await fixture(t, html);
    assert.equal(w.document.getElementById('fs-1').textContent, '已探索，已运行命令');
    assert.equal(w.document.getElementById('fs-2').textContent, '已探索，已编辑，已运行命令');
    assert.equal(w.document.getElementById('fs-3').textContent, '已探索，已运行 2 个命令');
    assert.equal(w.document.getElementById('fs-4').textContent, '正在探索，正在运行命令');
    assert.equal(w.document.getElementById('pm-exit').textContent, '退出规划模式');
    assert.equal(w.document.getElementById('pm-enter').textContent, '进入规划模式');
    assert.equal(w.document.getElementById('pm-code').textContent, 'exit_plan_mode');

    const domTw = createDom(html);
    t.after(() => domTw.window.close());
    domTw.window.eval(loadRuntime({ traditional: true }));
    await settle();
    assert.equal(domTw.window.document.getElementById('fs-1').textContent, '已探索，已執行指令');
    assert.equal(domTw.window.document.getElementById('fs-2').textContent, '已探索，已編輯，已執行指令');
    assert.equal(domTw.window.document.getElementById('fs-3').textContent, '已探索，已執行 2 個指令');
    assert.equal(domTw.window.document.getElementById('fs-4').textContent, '正在探索，正在執行指令');
    assert.equal(domTw.window.document.getElementById('pm-exit').textContent, '退出規劃模式');
    assert.equal(domTw.window.document.getElementById('pm-enter').textContent, '進入規劃模式');
    assert.equal(domTw.window.document.getElementById('pm-code').textContent, 'exit_plan_mode');
});

test('tool call section labels, truncation hints, hover notices, and progress pills translate safely in SC and TC', async t => {
    const html = `
      <div>
        <div id="btw-single">Applies to /btw and messages sent after this turn</div>
        <div id="btw-split">Applies to <code>/btw</code> and messages sent after this turn</div>
        <span id="fc-single">3 files changed</span>
        <span id="fc-one">1 file changed</span>
        <span id="fc-diff">3 files changed +66 -0</span>
        <div id="fc-split"><span>3</span><span> files changed</span></div>
        <p id="fc-prose">These files changed yesterday</p>
        <span id="st-single">3/3 steps</span>
        <span id="st-one">1/1 step</span>
        <div id="st-split"><span>3/3</span><span> steps</span></div>
        <span id="st-plain">steps</span>
        <div id="lbl-args">Arguments</div>
        <div id="lbl-out">Output</div>
        <div id="lbl-res">Result</div>
        <div id="lbl-resp">Response</div>
        <span id="lc-args">arguments</span>
        <span id="lc-res">result</span>
        <span id="lc-resp">response</span>
        <div id="tr-lines">... 24 more lines, truncated for display.</div>
        <div id="tr-one">… 1 more line, truncated for display.</div>
        <div id="tr-chars">... 120 more characters, truncated for display.</div>
        <div id="tr-split">... <span>24</span><span> more lines, truncated for display.</span></div>
        <div id="undo-rewind">Only the conversation will be rewound; your files will be left as-is.</div>
      </div>
    `;
    const w = await fixture(t, html);
    assert.equal(w.document.getElementById('btw-single').textContent, '适用于 /btw 及本轮之后发送的消息');
    assert.equal(w.document.getElementById('btw-split').textContent, '适用于 /btw 及本轮之后发送的消息');
    assert.equal(w.document.getElementById('fc-single').textContent, '3 个文件已更改');
    assert.equal(w.document.getElementById('fc-one').textContent, '1 个文件已更改');
    assert.equal(w.document.getElementById('fc-diff').textContent, '3 个文件已更改 +66 -0');
    assert.equal(w.document.getElementById('fc-split').textContent, '3 个文件已更改');
    assert.equal(w.document.getElementById('fc-prose').textContent, 'These files changed yesterday');
    assert.equal(w.document.getElementById('st-single').textContent, '3/3 步骤');
    assert.equal(w.document.getElementById('st-one').textContent, '1/1 步骤');
    assert.equal(w.document.getElementById('st-split').textContent, '3/3 步骤');
    assert.equal(w.document.getElementById('st-plain').textContent, 'steps');
    assert.equal(w.document.getElementById('lbl-args').textContent, '参数');
    assert.equal(w.document.getElementById('lbl-out').textContent, '输出');
    assert.equal(w.document.getElementById('lbl-res').textContent, '结果');
    assert.equal(w.document.getElementById('lbl-resp').textContent, '响应');
    assert.equal(w.document.getElementById('lc-args').textContent, 'arguments');
    assert.equal(w.document.getElementById('lc-res').textContent, 'result');
    assert.equal(w.document.getElementById('lc-resp').textContent, 'response');
    assert.equal(w.document.getElementById('tr-lines').textContent, '... 还有 24 行，已截断显示。');
    assert.equal(w.document.getElementById('tr-one').textContent, '… 还有 1 行，已截断显示。');
    assert.equal(w.document.getElementById('tr-chars').textContent, '... 还有 120 个字符，已截断显示。');
    assert.equal(w.document.getElementById('tr-split').textContent, '... 24 行，已截断显示。');
    assert.equal(w.document.getElementById('undo-rewind').textContent, '仅回退对话进度，您的文件将保持原样不变。');

    const domTw = createDom(html);
    t.after(() => domTw.window.close());
    domTw.window.eval(loadRuntime({ traditional: true }));
    await settle();
    assert.equal(domTw.window.document.getElementById('btw-single').textContent, '適用於 /btw 與本輪之後傳送的訊息');
    assert.equal(domTw.window.document.getElementById('btw-split').textContent, '適用於 /btw 與本輪之後傳送的訊息');
    assert.equal(domTw.window.document.getElementById('fc-single').textContent, '3 個檔案已變更');
    assert.equal(domTw.window.document.getElementById('fc-diff').textContent, '3 個檔案已變更 +66 -0');
    assert.equal(domTw.window.document.getElementById('fc-split').textContent, '3 個檔案已變更');
    assert.equal(domTw.window.document.getElementById('fc-prose').textContent, 'These files changed yesterday');
    assert.equal(domTw.window.document.getElementById('st-single').textContent, '3/3 步驟');
    assert.equal(domTw.window.document.getElementById('st-split').textContent, '3/3 步驟');
    assert.equal(domTw.window.document.getElementById('st-plain').textContent, 'steps');
    assert.equal(domTw.window.document.getElementById('lbl-args').textContent, '參數');
    assert.equal(domTw.window.document.getElementById('lbl-out').textContent, '輸出');
    assert.equal(domTw.window.document.getElementById('lbl-res').textContent, '結果');
    assert.equal(domTw.window.document.getElementById('lbl-resp').textContent, '回應');
    assert.equal(domTw.window.document.getElementById('lc-args').textContent, 'arguments');
    assert.equal(domTw.window.document.getElementById('tr-lines').textContent, '... 還有 24 行，已截斷顯示。');
    assert.equal(domTw.window.document.getElementById('tr-chars').textContent, '... 還有 120 個字元，已截斷顯示。');
    assert.equal(domTw.window.document.getElementById('tr-split').textContent, '... 24 行，已截斷顯示。');
    assert.equal(domTw.window.document.getElementById('undo-rewind').textContent, '僅回退對話進度，您的檔案將保持原樣不變。');
});

test('third-party sidecar plugin iframes and aux-pane plugin tabs stay untranslated while built-in Swarm sidecars still translate', async t => {
    const thirdPartyHtml = `
      <div>
        <div id="sp-token">TOKEN USAGE</div>
        <div id="sp-tools">Tool calls</div>
        <div id="sp-sys">System prompt</div>
        <div id="sp-rules">Rules</div>
        <div id="sp-skills">Skills</div>
        <div id="sp-sub">Subagents</div>
        <div id="sp-plug">Plugins</div>
        <div id="sp-mcp">MCP Tools</div>
        <div id="sp-turns">105 turns</div>
      </div>
    `;
    const hostDom = createDom('<iframe id="third-party-frame"></iframe><iframe id="swarm-frame"></iframe>');
    t.after(() => hostDom.window.close());

    const thirdPartyFrame = hostDom.window.document.getElementById('third-party-frame');
    thirdPartyFrame.contentDocument.body.innerHTML = thirdPartyHtml;
    thirdPartyFrame.contentWindow.eval(loadRuntime());
    await settle();
    assert.equal(thirdPartyFrame.contentDocument.getElementById('sp-token').textContent, 'TOKEN USAGE');
    assert.equal(thirdPartyFrame.contentDocument.getElementById('sp-tools').textContent, 'Tool calls');
    assert.equal(thirdPartyFrame.contentDocument.getElementById('sp-sys').textContent, 'System prompt');
    assert.equal(thirdPartyFrame.contentDocument.getElementById('sp-rules').textContent, 'Rules');
    assert.equal(thirdPartyFrame.contentDocument.getElementById('sp-skills').textContent, 'Skills');
    assert.equal(thirdPartyFrame.contentDocument.getElementById('sp-sub').textContent, 'Subagents');
    assert.equal(thirdPartyFrame.contentDocument.getElementById('sp-plug').textContent, 'Plugins');
    assert.equal(thirdPartyFrame.contentDocument.getElementById('sp-mcp').textContent, 'MCP Tools');
    assert.equal(thirdPartyFrame.contentDocument.getElementById('sp-turns').textContent, '105 turns');

    const swarmFrameHtml = `
      <div data-testid="swarm-board">
        <div id="tab-overview"><span id="sw-ov">Overview</span></div>
      </div>
    `;
    const swarmFrame = hostDom.window.document.getElementById('swarm-frame');
    swarmFrame.contentDocument.body.innerHTML = swarmFrameHtml;
    swarmFrame.contentWindow.eval(loadRuntime());
    await settle();
    assert.equal(swarmFrame.contentDocument.getElementById('sw-ov').textContent, '概览');

    const auxHtml = `
      <div>
        <div role="tablist">
          <button role="tab" id="tab-review">Review</button>
          <button role="tab" id="tab-cu">Context Usage</button>
          <button role="tab" id="tab-notes">Notes</button>
        </div>
        <div data-testid="aux-pane">
          <button id="aux-review">Review</button>
          <button id="aux-open-file">Open File</button>
          <button id="aux-side-q">Side Question</button>
          <button id="aux-cu">Context Usage</button>
          <div role="menuitem" id="menu-skills-used">Skills Used</div>
        </div>
        <span id="builtin-cu">Context usage</span>
        <iframe data-testid="sidecar-iframe" src="http://localhost:51956"></iframe>
      </div>
    `;
    const w = await fixture(t, auxHtml);
    assert.equal(w.document.getElementById('tab-review').textContent, '评审');
    assert.equal(w.document.getElementById('tab-cu').textContent, 'Context Usage');
    assert.equal(w.document.getElementById('tab-notes').textContent, 'Notes');
    assert.equal(w.document.getElementById('aux-open-file').textContent, '打开文件');
    assert.equal(w.document.getElementById('aux-side-q').textContent, '侧边提问');
    assert.equal(w.document.getElementById('aux-cu').textContent, 'Context Usage');
    assert.equal(w.document.getElementById('menu-skills-used').textContent, '已用技能');
    assert.equal(w.document.getElementById('builtin-cu').textContent, '上下文用量');

    const domTw = createDom(auxHtml);
    t.after(() => domTw.window.close());
    domTw.window.eval(loadRuntime({ traditional: true }));
    await settle();
    assert.equal(domTw.window.document.getElementById('tab-review').textContent, '審查');
    assert.equal(domTw.window.document.getElementById('tab-cu').textContent, 'Context Usage');
    assert.equal(domTw.window.document.getElementById('tab-notes').textContent, 'Notes');
    assert.equal(domTw.window.document.getElementById('aux-open-file').textContent, '開啟檔案');
    assert.equal(domTw.window.document.getElementById('aux-side-q').textContent, '側邊提問');
    assert.equal(domTw.window.document.getElementById('aux-cu').textContent, 'Context Usage');
    assert.equal(domTw.window.document.getElementById('menu-skills-used').textContent, '已使用技能');
    assert.equal(domTw.window.document.getElementById('builtin-cu').textContent, '上下文用量');
});

test('expanded tool call labels and truncation hints inside soft-isolated siblings translate while preserving code and thinking text', async t => {
    const html = `
      <div>
        <div data-testid="thinking-collapsible-trigger">Thought for 11s</div>
        <div id="thinking-body">Thinking about Arguments and Output in Result</div>
        <div id="tool-wrap">
          <div class="font-mono" id="mono-tool">
            <div id="mono-args">Arguments</div>
            <pre><code id="mono-code">{"Arguments": "Result"}</code></pre>
            <div id="mono-out">Output</div>
            <div id="mono-trunc">... 24 more lines, truncated for display.</div>
          </div>
          <div translate="no" id="tn-tool">
            <span id="tn-res">Result</span>
            <pre><code>ok</code></pre>
            <span id="tn-resp">Response</span>
          </div>
          <div class="code-block" id="cb-tool">
            <div id="cb-args">arguments</div>
            <pre><code>raw</code></pre>
            <div id="cb-out">output</div>
          </div>
        </div>
        <div id="normal-adj">
          <span id="adj-args">arguments</span>
          <pre><code>x = 1</code></pre>
        </div>
        <div id="hdr-wrap-box">
          <div class="header-row"><strong id="nested-args">Arguments</strong><button>Copy</button></div>
          <div class="code-viewer"><div class="code-line">raw line</div></div>
        </div>
        <em id="jsx-em-trunc">... 24 more lines, truncated for display.</em>
        <div data-testid="thinking-collapsible-trigger">Executed search</div>
        <div id="tool-step-body">
          <div id="step-args">Arguments</div>
          <div class="font-mono">output payload</div>
          <p><em id="step-em-trunc">... 12 more lines, truncated for display.</em></p>
        </div>
        <div translate="no" id="keep-tn">Knowledge</div>
        <span id="plain-lc">arguments</span>
      </div>
    `;
    const w = await fixture(t, html, win => {
      const em1 = win.document.getElementById('jsx-em-trunc');
      em1.textContent = '';
      for (const s of ['... ', '24', ' more ', 'lines', ', truncated for display.']) em1.appendChild(win.document.createTextNode(s));
      const em2 = win.document.getElementById('step-em-trunc');
      em2.textContent = '';
      for (const s of ['... ', '12', ' more ', 'lines', ', truncated for display.']) em2.appendChild(win.document.createTextNode(s));
    });
    assert.equal(w.document.getElementById('thinking-body').textContent, 'Thinking about Arguments and Output in Result');
    assert.equal(w.document.getElementById('mono-args').textContent, '参数');
    assert.equal(w.document.getElementById('mono-code').textContent, '{"Arguments": "Result"}');
    assert.equal(w.document.getElementById('mono-out').textContent, '输出');
    assert.equal(w.document.getElementById('mono-trunc').textContent, '... 还有 24 行，已截断显示。');
    assert.equal(w.document.getElementById('tn-res').textContent, '结果');
    assert.equal(w.document.getElementById('tn-resp').textContent, '响应');
    assert.equal(w.document.getElementById('cb-args').textContent, '参数');
    assert.equal(w.document.getElementById('cb-out').textContent, '输出');
    assert.equal(w.document.getElementById('adj-args').textContent, '参数');
    assert.equal(w.document.getElementById('nested-args').textContent, '参数');
    assert.equal(w.document.getElementById('jsx-em-trunc').textContent, '... 还有 24 行，已截断显示。');
    assert.equal(w.document.getElementById('step-args').textContent, '参数');
    assert.equal(w.document.getElementById('step-em-trunc').textContent, '... 还有 12 行，已截断显示。');
    assert.equal(w.document.getElementById('keep-tn').textContent, 'Knowledge');
    assert.equal(w.document.getElementById('plain-lc').textContent, 'arguments');

    const domTw = createDom(html);
    t.after(() => domTw.window.close());
    const em1Tw = domTw.window.document.getElementById('jsx-em-trunc');
    em1Tw.textContent = '';
    for (const s of ['... ', '24', ' more ', 'lines', ', truncated for display.']) em1Tw.appendChild(domTw.window.document.createTextNode(s));
    const em2Tw = domTw.window.document.getElementById('step-em-trunc');
    em2Tw.textContent = '';
    for (const s of ['... ', '12', ' more ', 'lines', ', truncated for display.']) em2Tw.appendChild(domTw.window.document.createTextNode(s));
    domTw.window.eval(loadRuntime({ traditional: true }));
    await settle();
    assert.equal(domTw.window.document.getElementById('thinking-body').textContent, 'Thinking about Arguments and Output in Result');
    assert.equal(domTw.window.document.getElementById('mono-args').textContent, '參數');
    assert.equal(domTw.window.document.getElementById('mono-out').textContent, '輸出');
    assert.equal(domTw.window.document.getElementById('mono-trunc').textContent, '... 還有 24 行，已截斷顯示。');
    assert.equal(domTw.window.document.getElementById('tn-res').textContent, '結果');
    assert.equal(domTw.window.document.getElementById('tn-resp').textContent, '回應');
    assert.equal(domTw.window.document.getElementById('cb-args').textContent, '參數');
    assert.equal(domTw.window.document.getElementById('cb-out').textContent, '輸出');
    assert.equal(domTw.window.document.getElementById('adj-args').textContent, '參數');
    assert.equal(domTw.window.document.getElementById('nested-args').textContent, '參數');
    assert.equal(domTw.window.document.getElementById('jsx-em-trunc').textContent, '... 還有 24 行，已截斷顯示。');
    assert.equal(domTw.window.document.getElementById('step-args').textContent, '參數');
    assert.equal(domTw.window.document.getElementById('step-em-trunc').textContent, '... 還有 12 行，已截斷顯示。');
    assert.equal(domTw.window.document.getElementById('keep-tn').textContent, 'Knowledge');
    assert.equal(domTw.window.document.getElementById('plain-lc').textContent, 'arguments');
});

test('turn indicator hover attachments, counter, and command exit codes translate in SC and TC', async t => {
    const html = `
      <div>
        <div id="att-title">处理以上三个问题 (3 image attachments)</div>
        <span id="att-single">(1 image attachment)</span>
        <span id="att-file">(2 file attachments)</span>
        <span id="turn-cnt">4 of 14</span>
        <span id="exit-dot">· Exited with code 1</span>
        <span id="exit-bare">Exited with code 0</span>
        <div id="exit-comb">Ran npm test · Exited with code 1</div>
        <div id="exit-split"><span>Exited with code </span><span>1</span></div>
        <span id="ctx-folder">Folder</span>
        <span id="ctx-drive">Drive</span>
        <span id="lc-folder">folder</span>
        <span id="lc-drive">drive</span>
      </div>
    `;
    const w = await fixture(t, html);
    assert.equal(w.document.getElementById('att-title').textContent, '处理以上三个问题 (3 张图片附件)');
    assert.equal(w.document.getElementById('att-single').textContent, '(1 张图片附件)');
    assert.equal(w.document.getElementById('att-file').textContent, '(2 个文件附件)');
    assert.equal(w.document.getElementById('turn-cnt').textContent, '4 / 14');
    assert.equal(w.document.getElementById('exit-dot').textContent, '· 已退出，退出码 1');
    assert.equal(w.document.getElementById('exit-bare').textContent, '已退出，退出码 0');
    assert.equal(w.document.getElementById('exit-comb').textContent, '已运行 npm test · 已退出，退出码 1');
    assert.equal(w.document.getElementById('exit-split').textContent, '已退出，退出码 1');
    assert.equal(w.document.getElementById('ctx-folder').textContent, '文件夹');
    assert.equal(w.document.getElementById('ctx-drive').textContent, '云端硬盘');
    assert.equal(w.document.getElementById('lc-folder').textContent, 'folder');
    assert.equal(w.document.getElementById('lc-drive').textContent, 'drive');

    const domTw = createDom(html);
    t.after(() => domTw.window.close());
    domTw.window.eval(loadRuntime({ traditional: true }));
    await settle();
    assert.equal(domTw.window.document.getElementById('att-title').textContent, '处理以上三个问题 (3 張圖片附件)');
    assert.equal(domTw.window.document.getElementById('att-single').textContent, '(1 張圖片附件)');
    assert.equal(domTw.window.document.getElementById('att-file').textContent, '(2 個檔案附件)');
    assert.equal(domTw.window.document.getElementById('turn-cnt').textContent, '4 / 14');
    assert.equal(domTw.window.document.getElementById('exit-dot').textContent, '· 已結束，結束碼 1');
    assert.equal(domTw.window.document.getElementById('exit-bare').textContent, '已結束，結束碼 0');
    assert.equal(domTw.window.document.getElementById('exit-comb').textContent, '已執行 npm test · 已結束，結束碼 1');
    assert.equal(domTw.window.document.getElementById('exit-split').textContent, '已結束，結束碼 1');
    assert.equal(domTw.window.document.getElementById('ctx-folder').textContent, '資料夾');
    assert.equal(domTw.window.document.getElementById('ctx-drive').textContent, '雲端硬碟');
    assert.equal(domTw.window.document.getElementById('lc-folder').textContent, 'folder');
    assert.equal(domTw.window.document.getElementById('lc-drive').textContent, 'drive');
});
