const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');

const engineSource = fs.readFileSync(path.join(__dirname, '..', 'localization_engine.js'), 'utf8');
assert.match(engineSource, /\bmain\(\);\s*$/);
const noMain = engineSource.replace(/\bmain\(\);\s*$/, '');
const signature = '/* --- ANTIGRAVITY CHINESE LOCALIZATION START --- */';

// Small real ASAR fixtures, with no npm dependency or executable app assets.
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
            const file = path.join(destination + '.unpacked', ...parts);
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, body);
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

function sandbox(t, { localized = false, backup = true, packFailure = false, dropUnpacked = false, backupRenameFailure = false } = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'antigravity-installer-test-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const inside = value => {
        const resolved = path.resolve(String(value));
        assert.ok(resolved.startsWith(root + path.sep), `Write escaped sandbox: ${resolved}`);
        return resolved;
    };
    const resources = path.join(root, 'install', 'resources');
    const archive = path.join(resources, 'app.asar');
    const backupPath = archive + '.bak';
    const entries = {
        'dist/preload.js': { body: '// original preload' },
        'package.json': { body: '{"version":"2.28.2"}' },
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
            if (key === 'renameSync' && backupRenameFailure && to === backupPath) throw new Error('Injected backup rename failure');
            return target[key](from, to, ...args);
        };
        return target[key];
    } });
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
            if (['path', 'crypto'].includes(name)) return require(name);
            throw new Error(`Unexpected module: ${name}`);
        },
        process: { platform: 'win32', argv: [], env: { APPDATA: root }, execPath: process.execPath },
        __dirname: root, Buffer, console: { log: (...args) => logs.push(args.join(' ')), warn: (...args) => logs.push(args.join(' ')), error: (...args) => logs.push(args.join(' ')) },
    });
    vm.runInContext(noMain, context);
    context.generateJs = () => `${signature}\n// test injection`;
    context.runCommandSync = command => {
        const match = command.match(/\b(extract|pack) "([^"]+)" "([^"]+)"/);
        assert.ok(match, command);
        const [, operation, from, to] = match;
        inside(from); inside(to);
        if (operation === 'extract') {
            for (const [name, file] of context.readAsarLayout(from).files) {
                const output = path.join(to, ...name.split('/'));
                fs.mkdirSync(path.dirname(output), { recursive: true });
                fs.writeFileSync(output, file.unpacked ? fs.readFileSync(path.join(from + '.unpacked', ...name.split('/'))) : file.body);
            }
        } else {
            // The output must be a candidate, never the live app.
            assert.notEqual(to, archive);
            assert.deepEqual(fs.readFileSync(archive), originalLive);
            assert.match(command, /--unpack-dir "node_modules"/);
            if (packFailure) {
                fs.writeFileSync(to, 'PARTIAL CANDIDATE');
                return { success: false, stdout: '', stderr: 'Injected pack failure after truncation' };
            }
            const candidateEntries = {};
            for (const [name, entry] of Object.entries(entries)) candidateEntries[name] = { body: fs.readFileSync(path.join(from, ...name.split('/'))), unpacked: dropUnpacked ? false : entry.unpacked };
            writeArchive(to, candidateEntries, dropUnpacked ? [] : ['node_modules/mcp']);
        }
        return { success: true, stdout: '', stderr: '' };
    };
    return { root, context, resources, archive, backupPath, originalLive, originalBackup, logs };
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
    const beforeExternal = fs.readFileSync(external);
    assert.equal(s.context.install20(s.resources), true);
    assert.deepEqual(fs.readFileSync(s.backupPath), s.originalLive);
    assert.deepEqual(fs.readFileSync(external), beforeExternal);
    assert.equal(s.context.readAsarLayout(s.archive).files.get('node_modules/mcp/index.js').unpacked, true);
    assert.equal(s.context.restore20(s.resources), true);
    assert.deepEqual(fs.readFileSync(s.archive), s.originalLive);
    assert.deepEqual(fs.readFileSync(s.backupPath), s.originalLive);
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

test('proxy installation refuses to overwrite any existing file', t => {
    const s = sandbox(t);
    const install = path.dirname(s.resources);
    const proxy = path.join(s.root, 'proxy_config');
    fs.mkdirSync(proxy);
    fs.writeFileSync(path.join(proxy, 'version.dll'), 'requested proxy');
    fs.writeFileSync(path.join(install, 'version.dll'), 'existing unrelated proxy');
    s.context.injectProxyIfNeeded(install);
    assert.equal(fs.readFileSync(path.join(install, 'version.dll'), 'utf8'), 'existing unrelated proxy');
});

test('347 individually unpacked files collapse to one directory despite a long install path', t => {
    const s = sandbox(t);
    const entries = { 'dist/preload.js': { body: '// packed preload' }, 'node_modules/packed/index.js': { body: '// packed dependency' } };
    for (let i = 0; i < 347; i++) {
        entries[`node_modules/chrome-devtools-mcp/build/features/group-${i % 17}/feature-${i}.js`] = { body: `// file ${i}`, unpacked: true };
    }
    // Deliberately omit directory flags, as in the official desktop archive.
    const fixture = path.join(s.root, 'many-unpacked.asar');
    writeArchive(fixture, entries);
    const layout = s.context.readAsarLayout(fixture);
    assert.deepEqual(Array.from(layout.unpackDirs), ['node_modules/chrome-devtools-mcp']);
    assert.deepEqual(Array.from(layout.unpackFiles), []);
    const longPath = path.join(s.root, 'very-long-install-directory-'.repeat(7), 'extracted');
    const args = s.context.asarUnpackArguments(layout, longPath);
    assert.equal(args, ' --unpack-dir "node_modules/chrome-devtools-mcp"');
    assert.ok(args.length < 100);
    assert.equal([...layout.files.values()].filter(file => file.unpacked).length, 347);
});

test('mixed directories retain packed leaves and only promote wholly unpacked children', t => {
    const s = sandbox(t);
    const fixture = path.join(s.root, 'mixed.asar');
    writeArchive(fixture, {
        'dist/preload.js': { body: '// packed preload' },
        'vendor/mixed/packed.js': { body: '// packed' },
        'vendor/mixed/loose.node': { body: '// unpacked sibling', unpacked: true },
        'vendor/mixed/native/a.node': { body: '// unpacked A', unpacked: true },
        'vendor/mixed/native/nested/b.node': { body: '// unpacked B', unpacked: true },
        'vendor/second/index.js': { body: '// unpacked C', unpacked: true },
    });
    const layout = s.context.readAsarLayout(fixture);
    assert.deepEqual(Array.from(layout.unpackDirs), ['vendor/mixed/native', 'vendor/second']);
    assert.deepEqual(Array.from(layout.unpackFiles), ['vendor/mixed/loose.node']);
    assert.equal(layout.files.get('vendor/mixed/packed.js').unpacked, false);
    const args = s.context.asarUnpackArguments(layout, path.join(s.root, 'extracted'));
    assert.match(args, /--unpack-dir "\{vendor\/mixed\/native,vendor\/second\}"/);
    assert.match(args, /--unpack "[^"]*\/vendor\/mixed\/loose\.node"/);
});
