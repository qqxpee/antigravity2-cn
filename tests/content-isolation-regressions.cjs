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
    `;
    const w = await fixture(t, swarmHtml);
    w.eval(loadRuntime());
    await settle();

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
