const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { readAsarLayout, patchAsarArchive, validateAsarCandidate } = require('../src/asar_patcher');

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
