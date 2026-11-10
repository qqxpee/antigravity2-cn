const fs = require('fs');
const crypto = require('crypto');

const BLOCK_SIZE = 4 * 1024 * 1024;

function computeIntegrity(buf) {
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    const blocks = [];
    if (buf.length === 0) {
        blocks.push(crypto.createHash('sha256').update(Buffer.alloc(0)).digest('hex'));
    } else {
        for (let i = 0; i < buf.length; i += BLOCK_SIZE) {
            blocks.push(crypto.createHash('sha256').update(buf.subarray(i, i + BLOCK_SIZE)).digest('hex'));
        }
    }
    return {
        algorithm: 'SHA256',
        hash,
        blockSize: BLOCK_SIZE,
        blocks
    };
}

function readAsarLayout(archivePath) {
    const data = fs.readFileSync(archivePath);
    if (data.length < 16 || data.readUInt32LE(0) !== 4) throw new Error('Invalid ASAR header');
    const headerSize = data.readUInt32LE(4);
    const jsonSize = data.readUInt32LE(12);
    if (headerSize < 8 || jsonSize > headerSize - 8 || 8 + headerSize > data.length) {
        throw new Error('Truncated ASAR header');
    }
    const header = JSON.parse(data.subarray(16, 16 + jsonSize).toString('utf8'));
    const files = new Map();
    function visit(node, prefix, inheritedUnpacked) {
        if (!node.files || typeof node.files !== 'object') throw new Error('Invalid ASAR directory');
        for (const [name, entry] of Object.entries(node.files)) {
            if (!name || name === '.' || name === '..' || /[\\/]/.test(name)) throw new Error('Unsafe ASAR path');
            const relative = prefix ? `${prefix}/${name}` : name;
            const unpacked = Boolean(inheritedUnpacked || entry.unpacked);
            if (entry.files) {
                visit(entry, relative, unpacked);
            } else if (entry.link !== undefined) {
                files.set(relative, { link: entry.link, unpacked });
            } else {
                if (!Number.isSafeInteger(entry.size) || entry.size < 0) throw new Error('Invalid ASAR file size');
                let body;
                if (!unpacked) {
                    const offset = Number(entry.offset);
                    if (!/^\d+$/.test(String(entry.offset)) || !Number.isSafeInteger(offset) || offset + entry.size > data.length - 8 - headerSize) {
                        throw new Error(`Invalid ASAR file offset: ${relative}`);
                    }
                    body = data.subarray(8 + headerSize + offset, 8 + headerSize + offset + entry.size);
                }
                files.set(relative, { size: entry.size, unpacked, body });
            }
        }
    }
    visit(header, '', false);
    return { files };
}

function patchAsarArchive(sourceAsarPath, destAsarPath, modifierMap) {
    const data = fs.readFileSync(sourceAsarPath);
    if (data.length < 16 || data.readUInt32LE(0) !== 4) {
        throw new Error('Invalid ASAR header');
    }
    const headerSize = data.readUInt32LE(4);
    const jsonSize = data.readUInt32LE(12);
    if (headerSize < 8 || jsonSize > headerSize - 8 || 8 + headerSize > data.length) {
        throw new Error('Truncated ASAR header');
    }
    const payloadStart = 8 + headerSize;
    const header = JSON.parse(data.subarray(16, 16 + jsonSize).toString('utf8'));

    const bodyChunks = [];
    let currentOffset = 0;
    const modifiedFiles = new Map();

    function processNode(node, prefix, inheritedUnpacked) {
        if (!node.files || typeof node.files !== 'object') {
            throw new Error('Invalid ASAR directory');
        }
        for (const [name, entry] of Object.entries(node.files)) {
            if (!name || name === '.' || name === '..' || /[\\/]/.test(name)) {
                throw new Error('Unsafe ASAR path');
            }
            const relPath = prefix ? `${prefix}/${name}` : name;
            const unpacked = Boolean(inheritedUnpacked || entry.unpacked);
            if (entry.files) {
                processNode(entry, relPath, unpacked);
            } else if (entry.link !== undefined) {
                continue;
            } else {
                if (!Number.isSafeInteger(entry.size) || entry.size < 0) {
                    throw new Error('Invalid ASAR file size');
                }
                if (unpacked) {
                    continue;
                }
                const origOffset = Number(entry.offset);
                if (!/^\d+$/.test(String(entry.offset)) || !Number.isSafeInteger(origOffset) || origOffset + entry.size > data.length - payloadStart) {
                    throw new Error(`Invalid ASAR file offset: ${relPath}`);
                }
                let fileBuf = data.subarray(payloadStart + origOffset, payloadStart + origOffset + entry.size);
                if (modifierMap.has(relPath)) {
                    const origText = fileBuf.toString('utf8');
                    const newText = modifierMap.get(relPath)(origText);
                    fileBuf = Buffer.from(newText, 'utf8');
                    entry.size = fileBuf.length;
                    entry.integrity = computeIntegrity(fileBuf);
                    modifiedFiles.set(relPath, fileBuf);
                }
                entry.offset = String(currentOffset);
                bodyChunks.push(fileBuf);
                currentOffset += fileBuf.length;
            }
        }
    }

    processNode(header, '', false);

    const newJsonBuf = Buffer.from(JSON.stringify(header), 'utf8');
    const newJsonSize = newJsonBuf.length;
    const alignedJsonSize = Math.ceil(newJsonSize / 4) * 4;
    const newHeaderSize2 = 4 + alignedJsonSize;
    const newHeaderSize = 4 + newHeaderSize2;

    const headerPre = Buffer.alloc(16 + alignedJsonSize);
    headerPre.writeUInt32LE(4, 0);
    headerPre.writeUInt32LE(newHeaderSize, 4);
    headerPre.writeUInt32LE(newHeaderSize2, 8);
    headerPre.writeUInt32LE(newJsonSize, 12);
    newJsonBuf.copy(headerPre, 16);

    const outBuf = Buffer.concat([headerPre, ...bodyChunks]);
    fs.writeFileSync(destAsarPath, outBuf);
    return modifiedFiles;
}

function validateAsarCandidate(sourcePath, candidatePath, signatureStart) {
    const before = readAsarLayout(sourcePath);
    const after = readAsarLayout(candidatePath);
    const allowed = new Set(['dist/preload.js', 'dist/menu.js', 'dist/tray.js', 'dist/loadingOverlay.js', 'dist/updater.js']);
    if (before.files.size !== after.files.size) throw new Error('ASAR file list changed');
    for (const [name, original] of before.files) {
        const candidate = after.files.get(name);
        if (!candidate || original.unpacked !== candidate.unpacked || original.link !== candidate.link) {
            throw new Error(`ASAR layout changed: ${name}`);
        }
        if (original.link !== undefined || original.unpacked) continue;
        const originalBody = original.body;
        const candidateBody = candidate.body;
        if (candidateBody.length !== candidate.size || originalBody.length !== original.size) throw new Error(`ASAR file truncated: ${name}`);
        if (!allowed.has(name) && !originalBody.equals(candidateBody)) throw new Error(`Unexpected file change: ${name}`);
    }
    const preload = after.files.get('dist/preload.js');
    if (!preload || !preload.body || !preload.body.includes(Buffer.from(signatureStart))) throw new Error('Missing localization payload');
}

module.exports = {
    readAsarLayout,
    patchAsarArchive,
    validateAsarCandidate
};
