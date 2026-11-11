const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const repositoryRoot = path.resolve(__dirname, '../..');
const enginePath = path.join(repositoryRoot, 'localization_engine.js');

function loadEngine({ argv = [] } = {}) {
    const source = fs.readFileSync(enginePath, 'utf8');
    if (!/\bmain\(\);\s*$/.test(source)) {
        throw new Error('The engine entry point changed; refusing to evaluate its installer.');
    }
    const inertChildProcess = new Proxy({}, {
        get() {
            return () => { throw new Error('Runtime generation must not launch a subprocess.'); };
        },
    });
    const context = vm.createContext({
        __dirname: repositoryRoot,
        __filename: enginePath,
        Buffer,
        console: { ...console },
        process: {
            argv: [process.execPath, enginePath, ...argv],
            platform: process.platform,
            env: { ...process.env },
            execPath: process.execPath,
            exit() { throw new Error('Runtime generation must not exit the test process.'); },
        },
        require(moduleName) {
            if (moduleName === 'child_process' || moduleName === 'node:child_process') {
                return inertChildProcess;
            }
            if (moduleName === './src/asar_patcher' || moduleName === './src/main_patches') {
                return require(path.resolve(repositoryRoot, moduleName));
            }
            if (!['fs', 'path', 'os', 'crypto'].includes(moduleName)) {
                throw new Error(`Unexpected dependency while generating runtime: ${moduleName}`);
            }
            return require(moduleName);
        },
    });
    vm.runInContext(source.replace(/\bmain\(\);\s*$/, ''), context, {
        filename: enginePath,
        timeout: 5000,
    });
    return context;
}

function loadRuntime({ traditional = false, brandTitle = 'english' } = {}) {
    const argv = ['--brand-title', brandTitle];
    if (traditional) argv.push('--tw');
    return loadEngine({ argv }).generateJs();
}

function createDom(html, options = {}) {
    return new JSDOM(html, {
        url: 'https://example.invalid/',
        runScripts: 'outside-only',
        pretendToBeVisual: true,
        ...options,
    });
}

module.exports = { loadEngine, loadRuntime, createDom };
