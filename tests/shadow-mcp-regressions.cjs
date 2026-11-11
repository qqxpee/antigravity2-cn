const assert = require('node:assert/strict');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');
const { loadRuntime } = require('./helpers/runtime-loader.cjs');

function fixture(html, beforeInject) {
    const dom = new JSDOM(html, { url: 'https://example.invalid', runScripts: 'outside-only' });
    const { window } = dom;
    window.console = { log() {}, warn() {}, error() {} };
    Object.defineProperty(window.document, 'readyState', { value: 'complete' });
    if (beforeInject) beforeInject(window);
    window.eval(loadRuntime());
    return {
        window,
        async flush() {
            await new Promise(resolve => setImmediate(resolve));
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
