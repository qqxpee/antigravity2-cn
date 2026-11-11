const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { readAsarLayout, patchAsarArchive, validateAsarCandidate } = require('../src/asar_patcher');
const { patchPreloadJs, patchUtilsJs } = require('../src/main_patches');

const signature = '/* --- ANTIGRAVITY CHINESE LOCALIZATION START --- */';
const signatureEnd = '/* --- ANTIGRAVITY CHINESE LOCALIZATION END --- */';

function writeArchive(destination, entries, unpackDirs = []) {
    const header = { files: {} };
    const bodies = [];
    let offset = 0;
    for (const [relative, value] of Object.entries(entries)) {
        const parts = relative.split('/');
        let node = header;
        let current = '';
        for (const part of parts.slice(0, -1)) {
            current = current ? `${current}/${part}` : part;
            node.files[part] ||= { files: {} };
            node = node.files[part];
            if (unpackDirs.includes(current)) node.unpacked = true;
        }
        const body = Buffer.from(value.body);
        const entry = { size: body.length };
        if (value.unpacked) {
            entry.unpacked = true;
        } else {
            entry.offset = String(offset);
            offset += body.length;
            bodies.push(body);
        }
        node.files[parts.at(-1)] = entry;
    }
    const json = Buffer.from(JSON.stringify(header));
    const payloadSize = Math.ceil((json.length + 4) / 4) * 4;
    const prefix = Buffer.alloc(12 + payloadSize);
    prefix.writeUInt32LE(4, 0);
    prefix.writeUInt32LE(payloadSize + 4, 4);
    prefix.writeUInt32LE(payloadSize, 8);
    prefix.writeUInt32LE(json.length, 12);
    json.copy(prefix, 16);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, Buffer.concat([prefix, ...bodies]));
}

test('patchAsarArchive updates target files in-place and preserves unpacked layout', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'antigravity-asar-test-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    const src = path.join(root, 'app.asar');
    const dst = path.join(root, 'app.asar.tmp');
    writeArchive(src, {
        'dist/preload.js': { body: '// original preload' },
        'package.json': { body: '{"version":"2.30.0"}' },
        'node_modules/mcp/index.js': { body: '// external MCP', unpacked: true },
    }, ['node_modules/mcp']);

    patchAsarArchive(src, dst, new Map([
        ['dist/preload.js', orig => `${orig}\n${signature}`],
    ]));

    validateAsarCandidate(src, dst, signature);
    const layout = readAsarLayout(dst);
    assert.equal(layout.files.get('node_modules/mcp/index.js').unpacked, true);
    assert.equal(layout.files.get('package.json').body.toString('utf8'), '{"version":"2.30.0"}');
});

test('validateAsarCandidate rejects tampered non-target files or lost unpacked flags', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'antigravity-asar-test-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    const src = path.join(root, 'app.asar');
    const badUnpacked = path.join(root, 'bad-unpacked.asar');
    const baseEntries = {
        'dist/preload.js': { body: `// original\n${signature}` },
        'package.json': { body: '{"version":"2.30.0"}' },
        'node_modules/mcp/index.js': { body: '// external MCP', unpacked: true },
    };
    writeArchive(src, baseEntries, ['node_modules/mcp']);
    writeArchive(badUnpacked, {
        ...baseEntries,
        'node_modules/mcp/index.js': { body: '// external MCP', unpacked: false },
    });

    assert.throws(() => validateAsarCandidate(src, badUnpacked, signature), /ASAR layout changed/);
});

test('patchUtilsJs injects localization only into verified sidecar-iframe child frames', async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'antigravity-sidecar-test-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    const src = path.join(root, 'app.asar');
    const dst = path.join(root, 'app.asar.tmp');
    writeArchive(src, {
        'dist/preload.js': { body: '// original preload' },
        'dist/utils.js': { body: "const path_1 = { default: require('path') };\nconst fs = require('fs');\nconst electron_1 = require('electron');\nfunction configureWindow(win, hubContents, guardExternalNavigation) {\n    hubContents.on('will-navigate', guardExternalNavigation);\n}\nmodule.exports = { configureWindow };" },
        'package.json': { body: '{"version":"2.31.0"}' },
    });

    const translationJs = `${signature}\nwindow.__localizedSidecar = true;\n${signatureEnd}`;
    patchAsarArchive(src, dst, new Map([
        ['dist/preload.js', orig => patchPreloadJs(orig, translationJs, signature, signatureEnd)],
        ['dist/utils.js', orig => patchUtilsJs(orig, signature, signatureEnd)],
    ]));
    validateAsarCandidate(src, dst, signature);

    const layout = readAsarLayout(dst);
    const patchedPreload = layout.files.get('dist/preload.js').body.toString('utf8');
    const patchedUtils = layout.files.get('dist/utils.js').body.toString('utf8');
    new vm.Script(patchedUtils);

    const distDir = path.join(root, 'dist-sim');
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(path.join(distDir, 'preload.js'), patchedPreload, 'utf8');

    const hubListeners = new Map();
    const winListeners = new Map();
    const injectedScripts = [];
    const mainFrame = {
        url: 'https://127.0.0.1:51000/index.html',
        origin: 'https://127.0.0.1:51000',
        isDestroyed: () => false,
        executeJavaScript(expr) {
            const evalDom = vm.createContext({
                URL,
                location: { href: 'https://127.0.0.1:51000/index.html', origin: 'https://127.0.0.1:51000' },
                document: {
                    querySelectorAll(sel) {
                        assert.equal(sel, 'iframe[data-testid="sidecar-iframe"]');
                        return [{ getAttribute: name => (name === 'src' ? 'http://127.0.0.1:52123/index.html?conversationId=abc' : null) }];
                    },
                },
            });
            return Promise.resolve(vm.runInContext(expr, evalDom));
        },
    };
    const hubContents = {
        mainFrame,
        isDestroyed: () => false,
        on(ev, fn) { hubListeners.set(ev, [...(hubListeners.get(ev) || []), fn]); },
        off(ev, fn) { hubListeners.set(ev, (hubListeners.get(ev) || []).filter(f => f !== fn)); },
    };
    const win = {
        isDestroyed: () => false,
        on(ev, fn) { winListeners.set(ev, [...(winListeners.get(ev) || []), fn]); },
    };

    const utilsMod = { exports: {} };
    vm.runInNewContext(patchedUtils, {
        module: utilsMod,
        exports: utilsMod.exports,
        __dirname: distDir,
        globalThis: {},
        URL,
        Promise,
        require(name) {
            if (name === 'path') return path;
            if (name === 'fs') return fs;
            if (name === 'electron') return { webFrameMain: { fromId: () => null } };
            throw new Error(`Unexpected module in utils.js: ${name}`);
        },
    });
    utilsMod.exports.configureWindow(win, hubContents, () => {});

    const finishLoadHandlers = hubListeners.get('did-frame-finish-load') || [];
    assert.equal(finishLoadHandlers.length, 1);

    const makeFrame = ({ url, origin, parent = mainFrame }) => ({
        url,
        origin,
        parent,
        isDestroyed: () => false,
        executeJavaScript(code) {
            injectedScripts.push({ url, code });
            return Promise.resolve();
        },
    });

    const browserFrame = makeFrame({ url: 'http://localhost:3000/app', origin: 'http://localhost:3000' });
    const sidecarFrame = makeFrame({ url: 'http://127.0.0.1:52123/index.html?conversationId=abc', origin: 'http://127.0.0.1:52123' });
    const nestedSrcdoc = makeFrame({ url: 'about:srcdoc', origin: 'null', parent: sidecarFrame });

    finishLoadHandlers[0]({ frame: mainFrame }, true, 1, 1);
    finishLoadHandlers[0]({ frame: browserFrame }, false, 1, 2);
    finishLoadHandlers[0]({ frame: nestedSrcdoc }, false, 1, 3);
    finishLoadHandlers[0]({ frame: sidecarFrame }, false, 1, 4);
    await new Promise(resolve => setTimeout(resolve, 20));

    assert.equal(injectedScripts.length, 1);
    assert.equal(injectedScripts[0].url, 'http://127.0.0.1:52123/index.html?conversationId=abc');
    assert.equal(injectedScripts[0].code, translationJs);

    for (const fn of winListeners.get('closed') || []) fn();
    assert.equal((hubListeners.get('did-frame-finish-load') || []).length, 0);
    assert.equal((hubListeners.get('did-frame-navigate') || []).length, 0);
});
