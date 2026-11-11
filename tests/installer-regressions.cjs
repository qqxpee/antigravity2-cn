const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { readAsarLayout, patchAsarArchive, validateAsarCandidate } = require('../src/asar_patcher');

const repoRoot = path.join(__dirname, '..');
const engineSource = fs.readFileSync(path.join(repoRoot, 'localization_engine.js'), 'utf8');
const asarPatcherSource = fs.readFileSync(path.join(repoRoot, 'src', 'asar_patcher.js'), 'utf8');
const mainPatches = require(path.join(repoRoot, 'src', 'main_patches.js'));
assert.match(engineSource, /\bmain\(\);\s*$/);
const noMain = engineSource.replace(/\bmain\(\);\s*$/, '');
const signature = '/* --- ANTIGRAVITY CHINESE LOCALIZATION START --- */';

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

function sandbox(t, { platform = 'win32', localized = false, backup = true, packFailure = false, dropUnpacked = false, backupRenameFailure = false } = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'antigravity-installer-test-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const inside = value => {
        const resolved = path.resolve(String(value));
        assert.ok(resolved.startsWith(root + path.sep), `Write escaped sandbox: ${resolved}`);
        return resolved;
    };
    const resources = platform === 'darwin'
        ? path.join(root, 'Antigravity.app', 'Contents', 'Resources')
        : path.join(root, 'install', 'resources');
    const archive = path.join(resources, 'app.asar');
    const backupPath = archive + '.bak';
    const entries = {
        'dist/preload.js': { body: '// original preload' },
        'dist/menu.js': { body: 'const menu = { items: [] };\nelectron_1.Menu.setApplicationMenu(menu);' },
        'dist/tray.js': { body: 'function createTray(actions) { tray.setContextMenu(contextMenu); }\nfunction insertTrayMenuItem(menu, options) {}' },
        'dist/updater.js': { body: 'MenuUpdateStep["CheckForUpdates"] = "Check for Updates";\nMenuUpdateStep["RestartToUpdate"] = "Restart to Update";' },
        'package.json': { body: '{"version":"2.31.0"}' },
        'node_modules/mcp/index.js': { body: '// external MCP', unpacked: true },
    };
    writeArchive(archive, entries, ['node_modules/mcp']);
    if (backup) fs.copyFileSync(archive, backupPath);
    if (localized) writeArchive(archive, { ...entries, 'dist/preload.js': { body: `// previous version\n${signature}` } }, ['node_modules/mcp']);
    const originalLive = fs.readFileSync(archive);
    const originalBackup = backup ? fs.readFileSync(backupPath) : undefined;
    const logs = [];
    const safeFs = new Proxy(fs, { get(target, key) {
        if (['writeFileSync', 'mkdirSync', 'mkdtempSync', 'rmSync', 'unlinkSync'].includes(key)) return (p, ...args) => target[key](inside(p), ...args);
        if (['copyFileSync', 'cpSync', 'renameSync'].includes(key)) return (from, to, ...args) => {
            inside(from); inside(to);
            if ((key === 'renameSync' || key === 'copyFileSync') && backupRenameFailure && to === backupPath) {
                throw new Error('Injected backup rename failure');
            }
            return target[key](from, to, ...args);
        };
        return target[key];
    } });

    const patcherModule = { exports: {} };
    vm.runInNewContext(asarPatcherSource, {
        module: patcherModule,
        exports: patcherModule.exports,
        Buffer,
        require(name) {
            if (name === 'fs') return safeFs;
            if (name === 'crypto') return require('node:crypto');
            throw new Error(`Unexpected patcher module: ${name}`);
        },
    });
    const realPatcher = patcherModule.exports;
    const hookedPatcher = {
        ...realPatcher,
        patchAsarArchive(src, dest, modifierMap) {
            assert.notEqual(dest, archive);
            assert.deepEqual(fs.readFileSync(archive), originalLive);
            if (packFailure) {
                safeFs.writeFileSync(dest, 'PARTIAL CANDIDATE');
                throw new Error('Injected pack failure after truncation');
            }
            if (dropUnpacked) {
                const candidateEntries = {};
                for (const [name, entry] of Object.entries(entries)) {
                    let body = entry.body;
                    if (modifierMap.has(name)) body = modifierMap.get(name)(String(body));
                    candidateEntries[name] = { body, unpacked: false };
                }
                writeArchive(dest, candidateEntries, []);
                return new Map([['dist/preload.js', Buffer.from(candidateEntries['dist/preload.js'].body)]]);
            }
            return realPatcher.patchAsarArchive(src, dest, modifierMap);
        },
    };

    const context = vm.createContext({
        require(name) {
            if (name === 'fs') return safeFs;
            if (name === 'os') return { homedir: () => root, tmpdir: () => root };
            if (name === 'child_process') return {
                execSync() { throw new Error('No shell commands are allowed in tests'); },
                execFileSync(executable, args) {
                    assert.equal(args[0], '--check');
                    inside(args[1]);
                    new vm.Script(fs.readFileSync(args[1], 'utf8'));
                },
            };
            if (name === './src/asar_patcher') return hookedPatcher;
            if (name === './src/main_patches') return mainPatches;
            if (['path', 'crypto'].includes(name)) return require(name);
            throw new Error(`Unexpected module: ${name}`);
        },
        process: { platform, argv: [], env: { APPDATA: root, HOME: root, PATH: process.env.PATH || '' }, execPath: process.execPath },
        __dirname: root, Buffer, console: { log: (...args) => logs.push(args.join(' ')), warn: (...args) => logs.push(args.join(' ')), error: (...args) => logs.push(args.join(' ')) },
    });
    vm.runInContext(noMain, context);
    context.generateJs = () => `${signature}\n// test injection`;
    const signChecks = [];
    context.runCommandSync = command => {
        signChecks.push({ command, entriesInResources: fs.readdirSync(resources) });
        return { success: true, stdout: '', stderr: '' };
    };
    return { root, context, resources, archive, backupPath, originalLive, originalBackup, logs, signChecks, realPatcher };
}

test('failed packaging preserves live app and existing backup', t => {
    const s = sandbox(t, { packFailure: true });
    assert.equal(s.context.install20(s.resources), false);
    assert.deepEqual(fs.readFileSync(s.archive), s.originalLive);
    assert.deepEqual(fs.readFileSync(s.backupPath), s.originalBackup);
});

test('failed reinstall does not first overwrite the localized app with its backup', t => {
    const s = sandbox(t, { localized: true, packFailure: true });
    assert.equal(s.context.install20(s.resources), false);
    assert.deepEqual(fs.readFileSync(s.archive), s.originalLive);
    assert.deepEqual(fs.readFileSync(s.backupPath), s.originalBackup);
});

test('failed first install does not leave a new backup behind', t => {
    const s = sandbox(t, { backup: false, packFailure: true });
    assert.equal(s.context.install20(s.resources), false);
    assert.deepEqual(fs.readFileSync(s.archive), s.originalLive);
    assert.equal(fs.existsSync(s.backupPath), false);
});

test('candidate with lost unpacked flags is rejected before commit', t => {
    const s = sandbox(t, { dropUnpacked: true });
    assert.equal(s.context.install20(s.resources), false);
    assert.deepEqual(fs.readFileSync(s.archive), s.originalLive);
    assert.deepEqual(fs.readFileSync(s.backupPath), s.originalBackup);
});

test('successful install preserves external files and creates restorable original backup', t => {
    const s = sandbox(t, { backup: false });
    const external = path.join(s.archive + '.unpacked', 'node_modules', 'mcp', 'index.js');
    fs.mkdirSync(path.dirname(external), { recursive: true });
    fs.writeFileSync(external, '// external MCP');
    const beforeExternal = fs.readFileSync(external);
    assert.equal(s.context.install20(s.resources), true);
    assert.deepEqual(fs.readFileSync(s.backupPath), s.originalLive);
    assert.deepEqual(fs.readFileSync(external), beforeExternal);
    assert.equal(s.realPatcher.readAsarLayout(s.archive).files.get('node_modules/mcp/index.js').unpacked, true);
    assert.equal(s.context.restore20(s.resources), true);
    assert.deepEqual(fs.readFileSync(s.archive), s.originalLive);
    assert.deepEqual(fs.readFileSync(s.backupPath), s.originalLive);
});

test('macOS removes temporary build directory before running codesign so sealed resources stay valid', t => {
    const s = sandbox(t, { platform: 'darwin', backup: false });
    assert.equal(s.context.install20(s.resources), true);
    const codesignCall = s.signChecks.find(c => c.command.includes('codesign'));
    assert.ok(codesignCall, 'Expected codesign to run on darwin');
    assert.equal(
        codesignCall.entriesInResources.some(name => name.startsWith('.antigravity-localize-')),
        false,
        `Temporary build directory must be deleted before codesign, saw: ${codesignCall.entriesInResources.join(', ')}`
    );
});

test('backup promotion failure rolls back the app without altering existing backup', t => {
    const s = sandbox(t, { backupRenameFailure: true });
    assert.equal(s.context.install20(s.resources), false);
    assert.deepEqual(fs.readFileSync(s.archive), s.originalLive);
    assert.deepEqual(fs.readFileSync(s.backupPath), s.originalBackup);
});

test('uninstall leaves unrelated and subsequently modified proxy files intact', t => {
    const s = sandbox(t);
    const install = path.dirname(s.resources);
    const names = ['version.dll', 'dbghelp.dll', 'config.json'];
    names.forEach(name => fs.writeFileSync(path.join(install, name), `user file ${name}`));
    s.context.restoreProxyIfNeeded(install);
    names.forEach(name => assert.equal(fs.readFileSync(path.join(install, name), 'utf8'), `user file ${name}`));
    assert.ok(s.logs.some(line => line.includes('已保留代理文件')));
});

test('proxy installation syncs and updates files from proxy_config', t => {
    const s = sandbox(t);
    const install = path.dirname(s.resources);
    const proxy = path.join(s.root, 'proxy_config');
    fs.mkdirSync(proxy);
    fs.writeFileSync(path.join(proxy, 'version.dll'), 'requested proxy');
    fs.writeFileSync(path.join(install, 'version.dll'), 'existing unrelated proxy');
    s.context.injectProxyIfNeeded(install);
    assert.equal(fs.readFileSync(path.join(install, 'version.dll'), 'utf8'), 'requested proxy');
});
