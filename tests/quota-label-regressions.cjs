const test = require('node:test');
const assert = require('node:assert/strict');
const { createDom, loadRuntime } = require('./helpers/runtime-loader.cjs');

async function render(t, html, options = {}) {
    const dom = createDom(html);
    t.after(() => dom.window.close());
    dom.window.eval(loadRuntime(options));
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
    await new Promise(resolve => setTimeout(resolve, 20));
    return dom.window.document;
}

test('usage labels retain percentages and full multi-unit reset durations', async t => {
    const doc = await render(t, '<span id="limit">5h limit</span><span id="percent">83</span><span id="left">% left</span><span id="reset">Resets in 4d 9h</span>');
    assert.equal(doc.querySelector('#limit').textContent, '5 小时限额');
    assert.equal(doc.querySelector('#percent').textContent, '83');
    assert.equal(doc.querySelector('#left').textContent, '% 剩余');
    assert.equal(doc.querySelector('#reset').textContent, '4 天 9 小时 后重置');
});

test('usage tooltips support long, compact and traditional duration labels', async t => {
    const doc = await render(t, '<span id="long" title="Resets in 1 week, 2 days, 3 hours, 4 minutes">100% left</span><span id="short">Resets in &lt;1m</span>', { traditional: true });
    assert.equal(doc.querySelector('#long').title, '1 週 2 天 3 小時 4 分鐘 後重設');
    assert.equal(doc.querySelector('#long').textContent, '100% 剩餘');
    assert.equal(doc.querySelector('#short').textContent, '<1 分鐘 後重設');
});

test('unknown reset formats keep their original time instead of discarding it', async t => {
    const doc = await render(t, '<span id="x">Resets in an unknown duration</span>');
    assert.equal(doc.querySelector('#x').textContent, 'Resets in an unknown duration');
});

test('bare durations do not claim that a future quota reset happened ago', async t => {
    const doc = await render(t, '<span id="duration">1w</span><span id="elapsed">5h ago</span><div data-testid="conversation-row-sidebar"><small id="row">3d</small></div>');
    assert.equal(doc.querySelector('#duration').textContent, '1周');
    assert.equal(doc.querySelector('#elapsed').textContent, '5小时前');
    assert.equal(doc.querySelector('#row').textContent, '3天前');
});

test('New model badges use a status translation without changing New commands', async t => {
    const doc = await render(t, '<div role="menu" aria-label="Select model, current: Example"><div role="menuitem">Example <span id="badge">New</span></div></div><button id="command">New</button>');
    assert.equal(doc.querySelector('#badge').textContent, '新');
    assert.equal(doc.querySelector('#command').textContent, '新建');
});

test('New badges resolve model menu names through ARIA label references', async t => {
    const doc = await render(t, '<button id="trigger" aria-label="Select model, current: Example">Example</button><div role="menu" aria-labelledby="trigger"><div role="menuitem">Example <span id="badge">New</span></div></div><span id="label">Select model</span><div role="menu" aria-labelledby="label"><span id="text-badge">New</span></div><button id="command">New</button>');
    assert.equal(doc.querySelector('#badge').textContent, '新');
    assert.equal(doc.querySelector('#text-badge').textContent, '新');
    assert.equal(doc.querySelector('#command').textContent, '新建');
});

test('late model menu roles and labels correct an already cached New translation', async t => {
    const doc = await render(t, '<button id="trigger">Example</button><div id="menu"><div role="menuitem">Example <span id="badge">New</span></div></div><button id="command">New</button>');
    assert.equal(doc.querySelector('#badge').textContent, '新建');
    const menu = doc.querySelector('#menu');
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-labelledby', 'trigger');
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(doc.querySelector('#badge').textContent, '新建');
    doc.querySelector('#trigger').setAttribute('aria-label', 'Select model, current: Example');
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(doc.querySelector('#badge').textContent, '新');
    assert.equal(doc.querySelector('#command').textContent, '新建');
});

test('combined limit and reset duration labels translate in SC and TC', async t => {
    const html = '<span id="weekly">Weekly limit, resets in 5d 22h</span><span id="daily">Daily limit, resets in 3h 15m</span><span id="short">5h limit, resets in &lt;1m</span><span id="days">7d limit</span>';
    const docSc = await render(t, html);
    assert.equal(docSc.querySelector('#weekly').textContent, '每周限额，5 天 22 小时 后重置');
    assert.equal(docSc.querySelector('#daily').textContent, '每日限额，3 小时 15 分钟 后重置');
    assert.equal(docSc.querySelector('#short').textContent, '5 小时限额，<1 分钟 后重置');
    assert.equal(docSc.querySelector('#days').textContent, '7 天限额');

    const docTw = await render(t, html, { traditional: true });
    assert.equal(docTw.querySelector('#weekly').textContent, '每週上限，5 天 22 小時 後重設');
    assert.equal(docTw.querySelector('#daily').textContent, '每日上限，3 小時 15 分鐘 後重設');
    assert.equal(docTw.querySelector('#short').textContent, '5 小時上限，<1 分鐘 後重設');
    assert.equal(docTw.querySelector('#days').textContent, '7 天上限');
});

test('server-returned RPC quota and model tooltip strings translate in SC and TC', async t => {
    const html = [
        '<span id="tip">The original Gemini 4 model for advanced workflows</span>',
        '<span id="tip-dyn">The original Gemini 3.5 Pro model for advanced workflows.</span>',
        '<span id="bucket">Gemini 4 Argon Weekly Limit</span>',
        '<span id="grp">Models within this group: Gemini 4 Neon, Gemini 4 Hydrogen, Orchestrator (Neon), Gemini 3.8 Flash</span>',
        '<span id="argon">For paid Pro plans, Argon quota is separate. Higher Argon quota (included as part of the larger Gemini quota bucket) is available on Ultra plans.</span>',
        '<span id="hit-5h-apply">You have hit your 5-hour limit, so the weekly limit does not currently apply. Your 5-hour limit will refresh in 36 minutes.</span>',
        '<span id="hit-5h-credits">You have hit your 5-hour limit, it will refresh in 36 minutes. If on a supported paid plan, you can use AI credits in the interim.</span>',
        '<span id="used-5h">You have used some of your 5-hour limit, it will fully refresh in 4 hours, 54 minutes.</span>'
    ].join('');

    const docSc = await render(t, html);
    assert.equal(docSc.querySelector('#tip').textContent, '适用于高级工作流的初代 Gemini 4 模型');
    assert.equal(docSc.querySelector('#tip-dyn').textContent, '适用于高级工作流的初代 Gemini 3.5 Pro 模型');
    assert.equal(docSc.querySelector('#bucket').textContent, 'Gemini 4 Argon 每周限额');
    assert.equal(docSc.querySelector('#grp').textContent, '此分组包含的模型：Gemini 4 Neon, Gemini 4 Hydrogen, Orchestrator (Neon), Gemini 3.8 Flash');
    assert.equal(docSc.querySelector('#argon').textContent, '在 Pro 付费方案中，Argon 配额独立计算。Ultra 方案提供更高的 Argon 配额（包含在更大的 Gemini 配额池中）。');
    assert.equal(docSc.querySelector('#hit-5h-apply').textContent, '您已达到 5 小时限制，每周额度限制目前不适用。您的 5 小时限制将于 36 分钟刷新。');
    assert.equal(docSc.querySelector('#hit-5h-credits').textContent, '您已达到 5 小时限制，将于 36 分钟刷新。若您使用受支持的付费计划，可在此期间使用 AI 额度。');
    assert.equal(docSc.querySelector('#used-5h').textContent, '4 小时 54 分钟后刷新');

    const docTw = await render(t, html, { traditional: true });
    assert.equal(docTw.querySelector('#tip').textContent, '適合進階工作流程的初代 Gemini 4 模型');
    assert.equal(docTw.querySelector('#tip-dyn').textContent, '適合進階工作流程的初代 Gemini 3.5 Pro 模型');
    assert.equal(docTw.querySelector('#bucket').textContent, 'Gemini 4 Argon 每週上限');
    assert.equal(docTw.querySelector('#grp').textContent, '此群組包含的模型：Gemini 4 Neon, Gemini 4 Hydrogen, Orchestrator (Neon), Gemini 3.8 Flash');
    assert.equal(docTw.querySelector('#argon').textContent, '在 Pro 付費方案中，Argon 配額會獨立計算。Ultra 方案則提供更高的 Argon 配額（納入較大的 Gemini 配額池中）。');
    assert.equal(docTw.querySelector('#hit-5h-apply').textContent, '您已達到 5 小時限制，每週額度限制目前不適用。您的 5 小時限制將於 36 分鐘重設。');
    assert.equal(docTw.querySelector('#hit-5h-credits').textContent, '您已達到 5 小時限制，將於 36 分鐘重設。若您使用受支援的付費方案，可在此期間使用 AI 點數。');
    assert.equal(docTw.querySelector('#used-5h').textContent, '4 小時 54 分鐘後更新');
});

test('v2.34.0 Swarm Hive map, GIF export, and live timer/subagent counters translate in SC and TC', async t => {
    const html = `
        <div id="swarm-title">Untitled swarm</div>
        <button id="tab-hive">Hive</button>
        <div class="o2 hv">
            <div class="hv-bar">
                <div class="hv-sum"><span><b>12</b> threads</span><span class="busy"><i></i>3 working</span><span class="warn"><i></i>1 waiting</span><span class="bad"><i></i>2 stuck</span><span class="ok"><i></i>4 done</span></div>
                <div class="btn-group hv-zoom" aria-label="Zoom">
                    <button id="z-out" title="Zoom out" aria-label="Zoom out"></button>
                    <button id="z-in" title="Zoom in" aria-label="Zoom in"></button>
                    <button id="z-fit" title="Fit the whole swarm" aria-label="Fit the whole swarm"></button>
                </div>
            </div>
            <svg class="hv-svg" aria-label="Where each worker is, by thread"></svg>
            <div class="hv-bees">
                <button id="bee-work" class="hv-bee working" title="@worker-1 · Codebase Researcher · Working for @coordinator" aria-label="@worker-1 · Codebase Researcher · Working for @coordinator"><span class="hv-nm" id="nm-work">worker-1</span></button>
                <button id="bee-wait" class="hv-bee wait" title="@worker-2 · Waiting on @coordinator"><span class="hv-nm" id="nm-wait">design</span></button>
            </div>
            <div class="hv-key" aria-hidden="true">
                <span id="k-done"><i></i>Tasks done</span>
                <span id="k-sent"><i></i>Message just sent</span>
                <span id="k-waiton"><i></i>Waiting on</span>
                <span id="k-work"><i></i>Working</span>
                <span id="k-wait"><i></i>Waiting</span>
                <span id="k-ok"><i></i>Done</span>
            </div>
            <section class="hv-card">
                <span id="card-prog">3 of 5 done</span>
                <span id="card-bees">2 bees</span>
                <button id="row-open" title="Open @worker-1">x</button>
                <p id="card-empty">No one is on this thread yet.</p>
            </section>
            <span id="stall">Swarm stalled — no agents working</span>
            <span id="coord-ask">The coordinator asked. Answer it in its chat.</span>
            <span id="live-tip" title="Latest action: Reading config">x</span>
            <span id="exp-btn">Export GIF</span>
            <span id="exp-pct">Exporting 42%</span>
            <span id="exp-done">Exported swarm-graph.gif (12 frames · 1.2 MB)</span>
            <span id="exp-save">Right-click image to save, or open in a new tab.</span>
        </div>
        <span id="timers">Waiting for 2 timers</span>
        <span id="timer1">Waiting for timer</span>
        <span id="subrun">3 subagents/tasks running</span>
        <span id="subblk">1 subagent blocked</span>
    `;

    const docSc = await render(t, html);
    assert.equal(docSc.getElementById('tab-hive').textContent, '蜂巢');
    assert.equal(docSc.querySelector('.hv-zoom').getAttribute('aria-label'), '缩放');
    assert.equal(docSc.getElementById('z-out').getAttribute('title'), '缩小');
    assert.equal(docSc.getElementById('z-in').getAttribute('title'), '放大');
    assert.equal(docSc.getElementById('z-fit').getAttribute('title'), '缩放至完整蜂群');
    assert.equal(docSc.querySelector('.hv-svg').getAttribute('aria-label'), '各成员所在的工作线分布');
    assert.equal(docSc.querySelector('.hv-sum').textContent, '12 条工作线3 个工作中1 个等待中2 项卡住4 个已完成');
    assert.equal(docSc.getElementById('k-done').textContent, '任务已完成');
    assert.equal(docSc.getElementById('k-sent').textContent, '刚发送消息');
    assert.equal(docSc.getElementById('k-waiton').textContent, '等待中');
    assert.equal(docSc.getElementById('k-work').textContent, '工作中');
    assert.equal(docSc.getElementById('k-wait').textContent, '等待中');
    assert.equal(docSc.getElementById('k-ok').textContent, '已完成');
    assert.equal(docSc.getElementById('bee-work').getAttribute('title'), '@worker-1 · Codebase Researcher · 正在为 @coordinator 工作');
    assert.equal(docSc.getElementById('bee-wait').getAttribute('title'), '@worker-2 · 正在等待 @coordinator');
    assert.equal(docSc.getElementById('nm-work').textContent, 'worker-1');
    assert.equal(docSc.getElementById('nm-wait').textContent, 'design');
    assert.equal(docSc.getElementById('card-prog').textContent, '已完成 3 / 5 项');
    assert.equal(docSc.getElementById('card-bees').textContent, '2 位成员');
    assert.equal(docSc.getElementById('row-open').getAttribute('title'), '打开 @worker-1');
    assert.equal(docSc.getElementById('card-empty').textContent, '此工作线目前暂无成员。');
    assert.equal(docSc.getElementById('stall').textContent, '蜂群已停滞 — 当前没有成员工作中');
    assert.equal(docSc.getElementById('coord-ask').textContent, '协调器发起询问，请在协调器对话中回复。');
    assert.equal(docSc.getElementById('live-tip').getAttribute('title'), '最新动作：Reading config');
    assert.equal(docSc.getElementById('exp-btn').textContent, '导出 GIF');
    assert.equal(docSc.getElementById('exp-pct').textContent, '正在导出 42%');
    assert.equal(docSc.getElementById('exp-done').textContent, '已导出 swarm-graph.gif（12 帧 · 1.2 MB）');
    assert.equal(docSc.getElementById('exp-save').textContent, '右键点击图片即可保存，或在新标签页中打开。');
    assert.equal(docSc.getElementById('timers').textContent, '正在等待 2 个计时器');
    assert.equal(docSc.getElementById('timer1').textContent, '正在等待计时器');
    assert.equal(docSc.getElementById('subrun').textContent, '3 个子智能体/任务运行中');
    assert.equal(docSc.getElementById('subblk').textContent, '1 个子智能体受阻');

    const docTw = await render(t, html, { traditional: true });
    assert.equal(docTw.getElementById('tab-hive').textContent, '蜂巢');
    assert.equal(docTw.querySelector('.hv-sum').textContent, '12 個討論串3 個工作中1 個等待中2 項受阻4 個已完成');
    assert.equal(docTw.getElementById('k-done').textContent, '任務已完成');
    assert.equal(docTw.getElementById('k-sent').textContent, '剛傳送訊息');
    assert.equal(docTw.getElementById('k-waiton').textContent, '正在等待');
    assert.equal(docTw.getElementById('bee-work').getAttribute('title'), '@worker-1 · Codebase Researcher · 為 @coordinator 執行中');
    assert.equal(docTw.getElementById('exp-done').textContent, '已匯出 swarm-graph.gif（12 格 · 1.2 MB）');
});
