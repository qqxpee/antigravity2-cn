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
