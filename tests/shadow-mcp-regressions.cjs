const assert = require('node:assert/strict');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');
const { loadRuntime } = require('./helpers/runtime-loader.cjs');

function fixture(html, beforeInject) {
    const dom = new JSDOM(html, { url: 'https://example.invalid', runScripts: 'outside-only' });
    const { window } = dom;
    const timers = new Map();
    let nextTimer = 0;
    window.console = { log() {}, warn() {}, error() {} };
    window.setTimeout = (callback, delay) => {
        const id = ++nextTimer;
        timers.set(id, { callback, delay });
        return id;
    };
    window.clearTimeout = id => timers.delete(id);
    Object.defineProperty(window.document, 'readyState', { value: 'complete' });
    if (beforeInject) beforeInject(window);
    window.eval(loadRuntime());
    return {
        window,
        async flush() {
            await new Promise(resolve => setImmediate(resolve));
        },
        runCaptureTimer() {
            const captureTimers = [...timers.entries()].filter(([, timer]) => timer.delay === 600);
            assert.equal(captureTimers.length, 1, 'A single MCP capture should be scheduled');
            const [id, timer] = captureTimers[0];
            timers.delete(id);
            timer.callback();
        },
        close() { window.close(); },
    };
}

test('translates pre-existing shadow content and observes later text changes', async t => {
    const f = fixture('<div id="host"></div>', window => {
        window.document.getElementById('host').attachShadow({ mode: 'open' }).innerHTML = '<button>Settings</button>';
    });
    t.after(() => f.close());
    const button = f.window.document.getElementById('host').shadowRoot.querySelector('button');
    await f.flush();
    assert.equal(button.textContent, '设置');
    button.firstChild.nodeValue = 'Cancel';
    await f.flush();
    assert.equal(button.textContent, '取消');
});

test('finds nested existing shadow roots without translating protected editor content', async t => {
    const f = fixture('<div id="outer"></div><div id="editor" contenteditable="true"></div>', window => {
        const outer = window.document.getElementById('outer').attachShadow({ mode: 'open' });
        const innerHost = window.document.createElement('div');
        outer.append(innerHost);
        innerHost.attachShadow({ mode: 'open' }).innerHTML = '<button>Settings</button>';
        window.document.getElementById('editor').attachShadow({ mode: 'open' }).innerHTML = '<span>Settings</span>';
    });
    t.after(() => f.close());
    await f.flush();
    const nested = f.window.document.getElementById('outer').shadowRoot.firstChild.shadowRoot;
    assert.equal(nested.textContent, '设置');
    nested.firstChild.textContent = 'Cancel';
    await f.flush();
    assert.equal(nested.textContent, '取消');
    assert.equal(f.window.document.getElementById('editor').shadowRoot.textContent, 'Settings');
});

test('continues translating shadow roots attached after startup', async t => {
    const f = fixture('<div id="host"></div>');
    t.after(() => f.close());
    const root = f.window.document.getElementById('host').attachShadow({ mode: 'open' });
    root.innerHTML = '<button>Settings</button>';
    await f.flush();
    assert.equal(root.textContent, '设置');
});

test('refreshes MCP exports when a same-size catalog changes on reopening', async t => {
    let writes = 0;
    const f = fixture('<div data-testid="add-mcp-screen"></div>', window => {
        const screen = window.document.querySelector('[data-testid="add-mcp-screen"]');
        screen.__reactFiber$test = { memoizedProps: { mcpTemplates: [{ id: 'a', title: 'A', description: 'old' }] } };
        const storage = Object.getPrototypeOf(window.localStorage);
        const setItem = storage.setItem;
        storage.setItem = function (key, value) {
            if (key === '__antigravity_mcp_dump__') writes++;
            return setItem.call(this, key, value);
        };
    });
    t.after(() => f.close());
    await f.flush();
    f.runCaptureTimer();
    assert.equal(JSON.parse(f.window.localStorage.getItem('__antigravity_mcp_dump__'))[0].id, 'a');
    const screen = f.window.document.querySelector('[data-testid="add-mcp-screen"]');
    screen.__reactFiber$test.memoizedProps.mcpTemplates = [{ id: 'b', title: 'B', description: 'new' }];
    screen.remove();
    f.window.document.body.append(screen);
    await f.flush();
    f.runCaptureTimer();
    assert.equal(JSON.parse(f.window.localStorage.getItem('__antigravity_mcp_dump__'))[0].id, 'b');
    assert.equal(f.window.__antigravity_mcp_dump__[0].description, 'new');
    assert.equal(f.window.__exportMcpCatalog()[0].title, 'B');
    assert.equal(writes, 2);

    screen.remove();
    f.window.document.body.append(screen);
    await f.flush();
    f.runCaptureTimer();
    assert.equal(writes, 2, 'Unchanged catalog content should not be persisted again');
});
