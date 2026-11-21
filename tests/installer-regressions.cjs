const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const childProcess = require('node:child_process');
const { readAsarLayout, patchAsarArchive, validateAsarCandidate } = require('../src/asar_patcher');
const { patchPreloadJs, patchUtilsJs, patchTrayJs, patchLoadingOverlayJs, patchMainProcessModule } = require('../src/main_patches');
const { loadEngine } = require('./helpers/runtime-loader.cjs');

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
            const ChromeURL = class extends URL {
                get origin() {
                    return this.protocol === 'plugin:' ? `plugin://${this.hostname}` : super.origin;
                }
            };
            const evalDom = vm.createContext({
                URL: ChromeURL,
                location: { href: 'https://127.0.0.1:51000/index.html', origin: 'https://127.0.0.1:51000' },
                document: {
                    querySelectorAll(sel) {
                        assert.equal(sel, 'iframe[data-testid="sidecar-iframe"]');
                        return [
                            { getAttribute: name => (name === 'src' ? 'http://127.0.0.1:52123/index.html?conversationId=abc' : null) },
                            { getAttribute: name => (name === 'src' ? 'plugin://swarm-auth/?conversationId=abc' : null) },
                        ];
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
    const pluginSidecarFrame = makeFrame({ url: 'plugin://swarm-auth/?conversationId=abc', origin: 'plugin://swarm-auth' });
    const unknownPluginFrame = makeFrame({ url: 'plugin://other-auth/', origin: 'plugin://other-auth' });
    const nestedSrcdoc = makeFrame({ url: 'about:srcdoc', origin: 'null', parent: sidecarFrame });

    finishLoadHandlers[0]({ frame: mainFrame }, true, 1, 1);
    finishLoadHandlers[0]({ frame: browserFrame }, false, 1, 2);
    finishLoadHandlers[0]({ frame: nestedSrcdoc }, false, 1, 3);
    finishLoadHandlers[0]({ frame: sidecarFrame }, false, 1, 4);
    finishLoadHandlers[0]({ frame: pluginSidecarFrame }, false, 1, 5);
    finishLoadHandlers[0]({ frame: unknownPluginFrame }, false, 1, 6);
    await new Promise(resolve => setTimeout(resolve, 20));

    assert.equal(injectedScripts.length, 2);
    assert.equal(injectedScripts[0].url, 'http://127.0.0.1:52123/index.html?conversationId=abc');
    assert.equal(injectedScripts[0].code, translationJs);
    assert.equal(injectedScripts[1].url, 'plugin://swarm-auth/?conversationId=abc');
    assert.equal(injectedScripts[1].code, translationJs);

    for (const fn of winListeners.get('closed') || []) fn();
    assert.equal((hubListeners.get('did-frame-finish-load') || []).length, 0);
    assert.equal((hubListeners.get('did-frame-navigate') || []).length, 0);
});

test('patchPreloadJs prevents ASI syntax/runtime errors when original preload lacks trailing semicolon', () => {
    const original = 'const x = 1';
    const payload = `${signature}\n(() => { globalThis.__ran = true; })();\n${signatureEnd}`;
    const patched = patchPreloadJs(original, payload, signature, signatureEnd);
    const ctx = { globalThis: {} };
    vm.runInNewContext(patched, ctx);
    assert.equal(ctx.globalThis.__ran, true);
});

test('patchTrayJs count replacement is bounded and cleanTrayJsContent restores original expression', () => {
    const originalTray = [
        'function createTray() {',
        '    const actions = [];',
        "    countItem.label = (count > 0 ? count + ' agents' : 'No agents') + ' running';",
        '    const tail = "keep \' running\'; untouched";',
        '}',
        'function insertTrayMenuItem(position, options) {}',
    ].join('\n');

    const sc = patchTrayJs(originalTray, false);
    assert.match(sc, /个智能体运行中/);
    assert.match(sc, /const tail = "keep ' running'; untouched";/);

    const tc = patchTrayJs(sc, true);
    assert.match(tc, /個代理執行中/);
    assert.doesNotMatch(tc, /个智能体运行中/);

    const scAgain = patchTrayJs(tc, false);
    assert.equal(scAgain, sc);
});

test('validateAsarCandidate allows newly patched main-process dialog modules and cleanElectronCache clears Partitions caches', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'antigravity-main-dialog-test-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    const src = path.join(root, 'app.asar');
    const dst = path.join(root, 'app.asar.tmp');
    writeArchive(src, {
        'dist/preload.js': { body: '// original preload' },
        'dist/main.js': { body: "const opts = { buttons: ['Cancel', 'Quit'], title: 'Confirm Quit', message: 'Are you sure you want to quit?' };" },
        'dist/provisionSplash.js': { body: 'const h = `<div>Setting up WSL: ${escapeHtml(distro)}</div>`;' },
        'package.json': { body: '{"version":"2.32.2"}' },
    });

    patchAsarArchive(src, dst, new Map([
        ['dist/preload.js', orig => `${orig}\n${signature}`],
        ['dist/main.js', orig => patchMainProcessModule('dist/main.js', orig, false)],
        ['dist/provisionSplash.js', orig => patchMainProcessModule('dist/provisionSplash.js', orig, true)],
    ]));
    validateAsarCandidate(src, dst, signature);

    const layout = readAsarLayout(dst);
    assert.match(layout.files.get('dist/main.js').body.toString('utf8'), /确认退出/);
    assert.match(layout.files.get('dist/provisionSplash.js').body.toString('utf8'), /正在設定 WSL：/);

    if (process.platform === 'win32') {
        const fakeAppData = path.join(root, 'AppData', 'Roaming');
        const topCache = path.join(fakeAppData, 'Antigravity', 'Code Cache');
        const partCache = path.join(fakeAppData, 'Antigravity', 'Partitions', 'hub-browser-123', 'Code Cache');
        const ideCache = path.join(fakeAppData, 'Antigravity IDE', 'Partitions', 'hub-browser-abc', 'Cache');
        const keepData = path.join(fakeAppData, 'Antigravity', 'Partitions', 'hub-browser-123', 'Local Storage');
        for (const dir of [topCache, partCache, ideCache, keepData]) {
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, 'dummy.bin'), 'x');
        }
        const prevAppData = process.env.APPDATA;
        process.env.APPDATA = fakeAppData;
        t.after(() => { process.env.APPDATA = prevAppData; });
        loadEngine().cleanElectronCache();
        assert.equal(fs.existsSync(topCache), false);
        assert.equal(fs.existsSync(partCache), false);
        assert.equal(fs.existsSync(ideCache), false);
        assert.equal(fs.existsSync(keepData), true);
    }
});

test('requiring localization_engine from node -e does not invoke main() or kill Antigravity', () => {
    const childProcess = require('node:child_process');
    const engineDir = path.resolve(__dirname, '..');
    const out = childProcess.execFileSync(
        process.execPath,
        ['-e', "const eng = require('./localization_engine'); console.log(typeof eng.generateJs);"],
        { cwd: engineDir, encoding: 'utf8' }
    ).trim();
    assert.equal(out, 'function');
});

test('readAsarLayout rejects invalid headerSize2 framing and compareDicts rejects non-object JSON', t => {
    const { compareDicts } = require('../scripts/compare_dicts');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ag2cn-guard-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    const badAsar = path.join(root, 'bad.asar');
    writeArchive(badAsar, { 'dist/preload.js': { body: 'x' } });
    const raw = fs.readFileSync(badAsar);
    raw.writeUInt32LE(2, 8);
    fs.writeFileSync(badAsar, raw);
    assert.throws(() => readAsarLayout(badAsar), /Truncated ASAR header/);

    const tmpSc = path.join(root, 'dicts');
    const tmpTw = path.join(root, 'dicts_tw');
    fs.mkdirSync(tmpSc, { recursive: true });
    fs.mkdirSync(tmpTw, { recursive: true });
    fs.writeFileSync(path.join(tmpSc, 'test.json'), '["not-an-object"]', 'utf8');
    fs.writeFileSync(path.join(tmpTw, 'test.json'), '{}', 'utf8');
    assert.equal(compareDicts(tmpSc, tmpTw), false);
});

test('patchTrayJs and patchUtilsJs guard missing actions and missing win variables at runtime', () => {
    const traySample = 'function createTray(actions) { const contextMenu = actions || []; tray.setContextMenu(contextMenu); return contextMenu; } function emptyTray() { const contextMenu = []; tray.setContextMenu(contextMenu); }';
    const trayPatched = patchTrayJs(traySample, false);
    assert.match(trayPatched, /TRAY TRANSLATION START/);
    assert.match(trayPatched, /TRAY DOUBLE CLICK START/);
    const fakeTray = { setContextMenu() {}, on() {} };
    const builtMenu = vm.runInNewContext(`${trayPatched}; createTray([{ label: "Quit" }]);`, { tray: fakeTray });
    assert.equal(builtMenu[0].label, '退出');

    const trayWithoutActionsSample = 'function createTray() { const contextMenu = []; tray.setContextMenu(contextMenu); }';
    const trayWithoutActionsPatched = patchTrayJs(trayWithoutActionsSample, false);
    assert.doesNotThrow(() => {
        vm.runInNewContext(`${trayWithoutActionsPatched}; createTray();`, { tray: fakeTray });
    });

    const utilsSample = "function attach(hubContents, guardExternalNavigation) { hubContents.on('will-navigate', guardExternalNavigation); }";
    const utilsPatched = patchUtilsJs(utilsSample, signature, signatureEnd);
    assert.match(utilsPatched, /SIDECAR TRANSLATION START/);
    const hubEvents = {};
    const fakeHub = {
        isDestroyed: () => false,
        mainFrame: { executeJavaScript: () => Promise.resolve(false) },
        on: (ev, cb) => { hubEvents[ev] = cb; }
    };
    vm.runInNewContext(`${utilsPatched}; attach(hubContents, () => {});`, {
        hubContents: fakeHub,
        electron_1: { webFrameMain: { fromId: () => null } },
        console
    });
    assert.doesNotThrow(() => hubEvents['did-frame-finish-load']({}, false, 1, 2));
});

test('ensureWritePermission returns false on EPERM/EACCES and true on writable directories without chmod', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ag2cn-write-perm-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const engineDir = path.resolve(__dirname, '..');

    const runProbe = (mockCode) => {
        const script = [
            "const fs = require('fs');",
            "Object.defineProperty(process, 'platform', { value: 'win32' });",
            mockCode ? `fs.writeFileSync = () => { const e = new Error('denied'); e.code = '${mockCode}'; throw e; };` : '',
            "const { ensureWritePermission } = require('./localization_engine');",
            `process.stdout.write(String(ensureWritePermission(${JSON.stringify(root)})));`
        ].join('\n');
        const res = childProcess.spawnSync(process.execPath, ['-e', script], { cwd: engineDir, encoding: 'utf8' });
        assert.equal(res.status, 0, res.stderr);
        return res.stdout.trim();
    };

    assert.equal(runProbe('EPERM'), 'false');
    assert.equal(runProbe('EACCES'), 'false');
    assert.equal(runProbe(null), 'true');
});

test('resignAppOnMac and canRestartApp skip non-bundle staging dirs while preserving rollback on real bundle failure', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ag2cn-mac-bundle-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const enginePath = path.resolve(__dirname, '..', 'localization_engine.js');
    const source = fs.readFileSync(enginePath, 'utf8').replace(/\bmain\(\);\s*$/, '');

    const createMacEngine = (codesignStatus) => {
        const spawned = [];
        const ctx = vm.createContext({
            __dirname: path.dirname(enginePath),
            __filename: enginePath,
            Buffer,
            console: { log() {}, warn() {}, error() {} },
            process: {
                argv: [process.execPath, enginePath],
                platform: 'darwin',
                env: { ...process.env },
                execPath: process.execPath,
                exit() { throw new Error('unexpected exit'); },
            },
            require(name) {
                if (name === 'child_process' || name === 'node:child_process') {
                    return {
                        spawnSync(cmd, args) {
                            spawned.push({ cmd, args });
                            if (cmd === 'codesign') return { status: codesignStatus, stdout: '', stderr: codesignStatus === 0 ? '' : 'codesign failed' };
                            return { status: 0, stdout: '', stderr: '' };
                        },
                        execFileSync() { return ''; },
                        execSync() { return ''; },
                    };
                }
                if (name === './src/asar_patcher' || name === './src/main_patches') {
                    return require(path.resolve(__dirname, '..', name));
                }
                return require(name);
            },
        });
        vm.runInContext(source, ctx, { filename: enginePath });
        return { ctx, spawned };
    };

    // 1. Fake .app directory without Contents/MacOS or Contents/Info.plist
    const fakeBundle = path.join(root, 'staging.app');
    const fakeResources = path.join(fakeBundle, 'Contents', 'Resources');
    fs.mkdirSync(fakeResources, { recursive: true });
    const sim1 = createMacEngine(1);
    assert.equal(sim1.ctx.resignAppOnMac(fakeResources), true);
    assert.equal(sim1.ctx.canRestartApp(fakeBundle), false);
    assert.equal(sim1.spawned.length, 0);

    // 2. Plain staging directory without .app
    const plainStaging = path.join(root, 'plain-staging', 'resources');
    fs.mkdirSync(plainStaging, { recursive: true });
    const sim2 = createMacEngine(1);
    assert.equal(sim2.ctx.resignAppOnMac(plainStaging), true);
    assert.equal(sim2.ctx.canRestartApp(plainStaging), false);
    assert.equal(sim2.spawned.length, 0);

    // 3. Real .app bundle with Contents/MacOS: codesign failure must return false for rollback
    const realBundle = path.join(root, 'Antigravity.app');
    const realResources = path.join(realBundle, 'Contents', 'Resources');
    fs.mkdirSync(path.join(realBundle, 'Contents', 'MacOS'), { recursive: true });
    fs.mkdirSync(realResources, { recursive: true });
    const simFail = createMacEngine(1);
    assert.equal(simFail.ctx.resignAppOnMac(realResources), false);
    assert.equal(simFail.ctx.canRestartApp(realBundle), true);
    assert.ok(simFail.spawned.some(c => c.cmd === 'codesign'));
});

test('patchLoadingOverlayJs silently skips when <div class="text"> is absent and translates legacy markup', () => {
    const warnings = [];
    const origWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));
    try {
        const modernOverlay = '<body><svg class="logo"></svg></body>';
        assert.equal(patchLoadingOverlayJs(modernOverlay, false), modernOverlay);
        assert.equal(patchLoadingOverlayJs(modernOverlay, true), modernOverlay);
        assert.equal(warnings.length, 0);

        const legacyOverlay = '<div class="text">Loading Antigravity</div>';
        assert.match(patchLoadingOverlayJs(legacyOverlay, false), /正在加载 Antigravity…/);
        assert.match(patchLoadingOverlayJs(legacyOverlay, true), /正在載入 Antigravity…/);
        assert.equal(warnings.length, 0);
    } finally {
        console.warn = origWarn;
    }
});

test('main-process patches cover v2.33.0 wizardHtml, remoteManager dialogs and resilient sshPrompts buttons', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ag2cn-v233-main-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    const wizardSample = [
        '<title>Welcome to Antigravity</title>',
        '<div class="text" style="font-size: 13px;">Setting up…</div>',
        '<h1>Welcome to the new Antigravity!</h1>',
        "<p>Antigravity has been redesigned to put agents first with new capabilities. If you'd still like a code editor, you can download it as a separate app named <b>Antigravity IDE</b>.</p>",
        '<span>Download the Antigravity IDE</span>',
        '<button class="btn-primary" id="btn-skip">Explore the new Antigravity</button>'
    ].join('\n');

    const wizSc = patchMainProcessModule('dist/ideInstall/wizardHtml.js', wizardSample, false);
    assert.match(wizSc, /欢迎使用 Antigravity/);
    assert.match(wizSc, /正在设置…/);
    assert.match(wizSc, /探索全新 Antigravity/);

    const wizTw = patchMainProcessModule('dist/ideInstall/wizardHtml.js', wizardSample, true);
    assert.match(wizTw, /歡迎使用 Antigravity/);
    assert.match(wizTw, /正在設定…/);
    assert.match(wizTw, /程式碼編輯器/);

    const remoteSample = [
        "title: 'Choose another SSH config file',",
        "buttons: ['Choose Another File…', 'Cancel'],",
        "title: 'Could not restart the SSH server',",
        "message: `${entry.label} still runs Antigravity server ${running}.`,",
        "buttons: ['Allow', \"Don't Allow\"],",
        "title: 'Microphone access',",
        "message: `Allow ${label} to use your microphone?`,",
        "buttons: ['Continue', 'Cancel'],",
        "message: `Finish this sign-in on ${entry.label}?`,",
        "buttons: ['Take Over', 'Cancel'],",
        "title: 'Shared home directory',",
        "const what = terminals === 0 ? 'agent or task' : 'agent, task or terminal';",
        "buttons: ['Restart', 'Later'],",
        "title: 'Restart SSH server',",
        "detail: `Any ${what} still running on it stops. The server starts again with this app's version.`,"
    ].join('\n');

    const rmSc = patchMainProcessModule('dist/remote/remoteManager.js', remoteSample, false);
    assert.match(rmSc, /选择其他 SSH 配置文件/);
    assert.match(rmSc, /buttons: \['允许', '不允许'\]/);
    assert.match(rmSc, /麦克风权限/);
    assert.match(rmSc, /要在 \$\{entry\.label\} 上完成此次登录吗/);
    assert.match(rmSc, /共享主目录/);
    assert.match(rmSc, /智能体或任务/);
    assert.match(rmSc, /buttons: \['重启', '稍后'\]/);

    const rmTw = patchMainProcessModule('dist/remote/remoteManager.js', remoteSample, true);
    assert.match(rmTw, /buttons: \['允許', '不允許'\]/);
    assert.match(rmTw, /共用家目錄/);
    assert.match(rmTw, /代理、任務或終端機/);

    const sshSample = [
        "(who) => (isAccount(who) ? ['Password', who] : undefined),",
        "? `${asked[0]} for ${hostPromptsMarked ? asked[1] : label}`",
        "return `Question from ${who}`;",
        '<button id="cancel" class="custom-sec">Cancel</button><button id="continue" class="custom-cta">Continue</button>'
    ].join('\n');
    const sshSc = patchMainProcessModule('dist/remote/sshPrompts.js', sshSample, false);
    assert.match(sshSc, /\['密码', who\]/);
    assert.match(sshSc, /来自 \$\{who\} 的询问/);
    assert.match(sshSc, />取消<\/button><button id="continue" class="custom-cta">继续<\/button>/);

    const src = path.join(root, 'app.asar');
    const dst = path.join(root, 'app.asar.tmp');
    writeArchive(src, {
        'dist/preload.js': { body: '// original preload' },
        'dist/ideInstall/wizardHtml.js': { body: wizardSample },
    });
    patchAsarArchive(src, dst, new Map([
        ['dist/preload.js', orig => `${orig}\n${signature}`],
        ['dist/ideInstall/wizardHtml.js', orig => patchMainProcessModule('dist/ideInstall/wizardHtml.js', orig, false)],
    ]));
    assert.doesNotThrow(() => validateAsarCandidate(src, dst, signature));
});

test('ensure_localized validates flags, decodes UTF-16LE registry paths, guards elevated processes and aborts launch on fix failure', t => {
    const ensure = require('../scripts/ensure_localized');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ag2cn-ensure-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    // 1. Bat file must remain pure 7-bit ASCII with CRLF
    const batPath = path.resolve(__dirname, '..', '启动Antigravity(自动检查汉化).bat');
    const batBuf = fs.readFileSync(batPath);
    assert.equal([...batBuf].some(b => b > 127), false, 'launcher bat must be pure 7-bit ASCII');
    assert.equal(/(?<!\r)\n/.test(batBuf.toString('latin1')), false, 'launcher bat must use CRLF');

    // 2. Argument parsing & --huifu rejection & \resources normalization
    const fakeInstall = path.join(root, 'AG 中文版');
    const fakeRes = path.join(fakeInstall, 'resources');
    fs.mkdirSync(fakeRes, { recursive: true });
    writeArchive(path.join(fakeRes, 'app.asar'), { 'dist/preload.js': { body: '// original' } });

    const parsed = ensure.parseArgs([
        '--fix',
        '--launch',
        `--install-dir=${fakeRes}`,
        '--brand-title=hidden',
        '--tw'
    ]);
    assert.equal(parsed.fix, true);
    assert.equal(parsed.launch, true);
    assert.equal(parsed.brandTitle, 'hidden');
    assert.equal(parsed.explicitTw, true);
    assert.equal(ensure.normalizeInstallDir(parsed.installDir), path.resolve(fakeInstall));
    assert.throws(() => ensure.parseArgs(['--huifu']), /不支持 --huifu/);
    assert.throws(() => ensure.parseArgs(['--install-dir=']), /不能为空/);
    assert.throws(() => ensure.parseArgs(['--brand-title=unknown']), /未识别的 --brand-title/);

    // 3. Registry UTF-16LE + negative/quoted icon index cleanup
    const regOut = [
        'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ag',
        `    DisplayIcon    REG_SZ    "${path.join(fakeInstall, 'Antigravity.exe')}",-1`
    ].join('\r\n');
    const detected = ensure.detectInstallDir(null, (cmd, args) => {
        assert.equal(cmd, 'cmd');
        assert.deepEqual(args.slice(0, 3), ['/d', '/u', '/c']);
        return regOut;
    });
    assert.equal(detected, path.resolve(fakeInstall));

    // 4. isRunning guards against tasklist / PowerShell failures and elevated empty ExecutablePath
    assert.equal(ensure.isRunning(fakeInstall, () => 'INFO: No tasks are running.\r\n'), false);
    assert.throws(() => ensure.isRunning(fakeInstall, (cmd) => {
        if (cmd === 'tasklist') return 'Antigravity.exe               1234 Console';
        throw new Error('WMI timeout');
    }), /无法查询进程路径/);
    assert.throws(() => ensure.isRunning(fakeInstall, (cmd) => {
        if (cmd === 'tasklist') return 'Antigravity.exe               1234 Console';
        return '__EMPTY_PATH__\r\n';
    }), /无法读取其可执行路径/);
    assert.equal(ensure.isRunning(fakeInstall, (cmd) => {
        if (cmd === 'tasklist') return 'Antigravity.exe               1234 Console';
        return path.join(root, 'OtherInstall', 'Antigravity.exe') + '\r\n';
    }), false);
    assert.equal(ensure.isRunning(fakeInstall, (cmd) => {
        if (cmd === 'tasklist') return 'Antigravity.exe               1234 Console';
        return path.join(fakeInstall, 'Antigravity.exe') + '\r\n';
    }), true);

    // 5. Non-win32 returns non-zero exit code
    assert.equal(ensure.main(['--fix'], { platform: 'linux' }), 1);

    // 6. --fix failure must abort launch and return non-zero; prefs are persisted & inherited
    const fakeAppData = path.join(root, 'AppData');
    const prevAppData = process.env.APPDATA;
    const prevXdg = process.env.XDG_CONFIG_HOME;
    process.env.APPDATA = fakeAppData;
    process.env.XDG_CONFIG_HOME = fakeAppData;
    t.after(() => {
        process.env.APPDATA = prevAppData;
        process.env.XDG_CONFIG_HOME = prevXdg;
    });

    ensure.saveLocalizationPref(fakeInstall, { useTw: true, brandTitle: 'hidden' });
    let launchCalled = false;
    let capturedEngineArgs = null;
    const code = ensure.main(['--fix', '--launch', `--install-dir=${fakeInstall}`], {
        platform: 'win32',
        execFileSync: () => 'INFO: No tasks.\r\n',
        spawnSync: (_exe, args) => {
            capturedEngineArgs = args;
            return { status: 1 };
        },
        spawn: () => {
            launchCalled = true;
            return { unref() {} };
        }
    });
    assert.equal(code, 1);
    assert.equal(launchCalled, false);
    assert.ok(capturedEngineArgs.includes('--tw'));
    assert.ok(capturedEngineArgs.includes('--brand-title'));
    assert.ok(capturedEngineArgs.includes('hidden'));
    assert.ok(capturedEngineArgs.includes('--no-kill'));
});

test('Windows batch launchers use pure 7-bit ASCII with CRLF and no chcp to stay immune to CP936/CP950/CP65001 mojibake', () => {
    const repoRoot = path.resolve(__dirname, '..');
    const batFiles = [
        '双击安装中文汉化.bat',
        '双击安装繁体中文.bat',
        '双击卸载还原官方英文.bat',
        '启动Antigravity(自动检查汉化).bat'
    ];
    for (const file of batFiles) {
        const buf = fs.readFileSync(path.join(repoRoot, file));
        for (let i = 0; i < buf.length; i++) {
            assert.ok(buf[i] <= 0x7f, `${file} contains non-ASCII byte 0x${buf[i].toString(16)} at offset ${i}`);
            if (buf[i] === 0x0a) {
                assert.equal(buf[i - 1], 0x0d, `${file} contains bare LF without CR at offset ${i}`);
            }
        }
        const text = buf.toString('ascii');
        assert.equal(/\bchcp\b/i.test(text), false, `${file} must not call chcp`);
    }
});

test('interactive brand prompt resolves choices in SC/TC and skips prompting when --brand-title is explicit', async t => {
    const repoRoot = path.resolve(__dirname, '..');
    const { PassThrough } = require('stream');
    const engine = require(path.join(repoRoot, 'localization_engine.js'));
    assert.equal(engine.resolveBrandTitleChoice('1'), 'english');
    assert.equal(engine.resolveBrandTitleChoice('2'), 'hidden');
    assert.equal(engine.resolveBrandTitleChoice('3'), 'translated');
    assert.equal(engine.resolveBrandTitleChoice(''), 'english');

    const logsSc = [];
    const inSc = new PassThrough();
    const outSc = new PassThrough();
    const pSc = engine.promptBrandTitleMode(false, {
        input: inSc,
        output: outSc,
        log: (line) => logsSc.push(line)
    });
    inSc.end('2\n');
    assert.equal(await pSc, 'hidden');
    assert.ok(logsSc.some(l => l.includes('请选择左上角品牌显示方式')));

    const logsTw = [];
    const inTw = new PassThrough();
    const outTw = new PassThrough();
    const pTw = engine.promptBrandTitleMode(true, {
        input: inTw,
        output: outTw,
        log: (line) => logsTw.push(line)
    });
    inTw.end();
    assert.equal(await pTw, 'english');
    assert.ok(logsTw.some(l => l.includes('請選擇左上角品牌顯示方式')));

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-interactive-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const fakeInstall = path.join(root, 'Antigravity');
    const fakeRes = path.join(fakeInstall, 'resources');
    fs.mkdirSync(fakeRes, { recursive: true });
    writeArchive(path.join(fakeRes, 'app.asar'), { 'dist/preload.js': { body: '// original' } });

    const fakeAppData = path.join(root, 'AppData');
    const resInteractive = childProcess.spawnSync(
        process.execPath,
        [path.join(repoRoot, 'localization_engine.js'), '--interactive', `--install-dir=${fakeInstall}`, '--no-kill'],
        {
            cwd: repoRoot,
            input: '2\n',
            encoding: 'utf8',
            env: { ...process.env, APPDATA: fakeAppData, XDG_CONFIG_HOME: fakeAppData }
        }
    );
    assert.equal(resInteractive.status, 0, resInteractive.stderr || resInteractive.stdout);
    assert.ok(resInteractive.stdout.includes('请选择左上角品牌显示方式'));
    assert.ok(resInteractive.stdout.includes('注入完成！'));
    const prefPath = path.join(fakeAppData, 'Antigravity', 'localization-prefs.json');
    const installKey = path.resolve(fakeInstall).toLowerCase();
    assert.equal(JSON.parse(fs.readFileSync(prefPath, 'utf8'))[installKey].brandTitle, 'hidden');

    const resExplicit = childProcess.spawnSync(
        process.execPath,
        [path.join(repoRoot, 'localization_engine.js'), '--interactive', '--brand-title=translated', `--install-dir=${fakeInstall}`, '--no-kill'],
        {
            cwd: repoRoot,
            input: '',
            encoding: 'utf8',
            env: { ...process.env, APPDATA: fakeAppData, XDG_CONFIG_HOME: fakeAppData }
        }
    );
    assert.equal(resExplicit.status, 0, resExplicit.stderr || resExplicit.stdout);
    assert.equal(resExplicit.stdout.includes('请选择左上角品牌显示方式'), false);
    assert.equal(JSON.parse(fs.readFileSync(prefPath, 'utf8'))[installKey].brandTitle, 'translated');
});
