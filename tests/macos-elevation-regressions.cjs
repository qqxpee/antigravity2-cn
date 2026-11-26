const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const repo = path.join(__dirname, '..');
const launchers = ['双击安装中文汉化.command', '双击安装繁体中文.command', '双击卸载还原官方英文.command'];
const SYSTEM_PATH = '/usr/bin:/bin:/usr/sbin:/sbin';

// macOS 双击脚本提权时不把用户的完整 PATH 交给 root：排在前面的可写目录里若有同名程序，会以 root 身份运行
test('macOS launchers elevate with absolute sudo, env and bash, and hand root only the system directories (first) plus the Node.js directory', { skip: process.platform === 'win32' || (typeof process.getuid === 'function' && process.getuid() === 0) }, t => {
    for (const file of launchers) {
        const text = fs.readFileSync(path.join(repo, file), 'utf8');
        assert.doesNotMatch(text, /PATH=\$PATH/, `${file} 不得把用户的 PATH 交给 root`);
        // 查找 node 的版本管理器目录只在用户阶段加入 PATH
        assert.match(text, /if \[ "\$EUID" -ne 0 \]; then\n {4}REAL_USER=/, `${file} 的 PATH 补充段落须只在用户阶段运行`);
        const code = text.split('\n').filter(line => !/^\s*(#|echo\b)/.test(line));
        for (const line of code) {
            assert.doesNotMatch(line, /(^|[\s;&|(])sudo\s/, `${file} 以名称调用 sudo：${line.trim()}`);
        }
        const elevations = code.filter(line => /^\s*exec \/usr\/bin\/sudo\b/.test(line));
        assert.equal(elevations.length, 1, `${file} 应只有一处提权`);
        assert.match(elevations[0], /^\s*exec \/usr\/bin\/sudo \/usr\/bin\/env "PATH=\$ROOT_PATH" .* \/bin\/bash "\$SCRIPT_PATH" "\$@"$/, file);
        assert.match(elevations[0], /"HTTPS_PROXY=\$HTTPS_PROXY"/, `${file} 仍须传递代理变量`);
    }
    // 行为：复制脚本，把 /usr/bin/sudo 换成打印参数的假 sudo；用户 PATH 最前面的可写目录不得出现在交给 root 的 PATH
    const shim = fs.mkdtempSync(path.join(os.tmpdir(), 'ag2cn-sudo-'));
    t.after(() => fs.rmSync(shim, { recursive: true, force: true }));
    const fakeSudo = path.join(shim, 'sudo');
    fs.writeFileSync(fakeSudo, '#!/bin/sh\nprintf "%s\\n" "$@"\n', { mode: 0o755 });
    for (const file of launchers) {
        const copy = path.join(shim, file);
        fs.writeFileSync(copy, fs.readFileSync(path.join(repo, file), 'utf8').split('/usr/bin/sudo').join(fakeSudo), { mode: 0o755 });
        const run = spawnSync('/bin/bash', [copy], {
            encoding: 'utf8', input: '', timeout: 20000,
            env: { ...process.env, PATH: shim + path.delimiter + process.env.PATH }
        });
        const args = run.stdout.split('\n');
        const pathArg = args.find(a => a.startsWith('PATH='));
        assert.ok(pathArg, `${file} 没有以 sudo env PATH=… 提权：${run.stdout}${run.stderr}`);
        assert.equal(args[args.indexOf(pathArg) - 1], '/usr/bin/env', `${file} 没有以 /usr/bin/env 设置 PATH`);
        const dirs = pathArg.slice('PATH='.length).split(':');
        assert.deepEqual(dirs.slice(0, 4), SYSTEM_PATH.split(':'), file);
        assert.equal(dirs.includes(shim), false, file);
        assert.ok(dirs.length <= 5, `${file} 只能另加 node 所在目录：${pathArg}`);
        const sudoUser = args.findIndex(a => a.startsWith('SUDO_USER='));
        assert.equal(args[sudoUser + 1], '/bin/bash', file);
    }
});

// root 阶段（含直接以 root 启动）：传入的 PATH 只用来查找 node，dirname 等外部程序一律从系统目录运行；
// PATH 重建为系统目录在前、只另加 node 所在目录
test('macOS launchers rebuild PATH in the root phase from the system directories plus the Node.js directory only', { skip: process.platform === 'win32' }, t => {
    const shim = fs.mkdtempSync(path.join(os.tmpdir(), 'ag2cn-rootphase-'));
    t.after(() => fs.rmSync(shim, { recursive: true, force: true }));
    const marker = path.join(shim, 'dirname-ran');
    fs.writeFileSync(path.join(shim, 'dirname'), `#!/bin/sh\ntouch "${marker}"\n/usr/bin/dirname "$@"\n`, { mode: 0o755 });
    for (const file of launchers) {
        const text = fs.readFileSync(path.join(repo, file), 'utf8');
        const sanitize = text.split('\n').find(line => line.startsWith('if [ "$EUID" -eq 0 ]; then'));
        assert.ok(sanitize, `${file} 缺少以 root 启动时的 PATH 清理`);
        const start = text.indexOf('ROOT_NODE="$(');
        assert.ok(start > 0 && text.includes('export PATH="/usr/bin:/bin:/usr/sbin:/sbin${ROOT_NODE'), `${file} 缺少 root 阶段的 PATH 重建`);
        const fakeNodeDir = fs.mkdtempSync(path.join(shim, 'node-'));
        fs.writeFileSync(path.join(fakeNodeDir, 'node'), '#!/bin/sh\n', { mode: 0o755 });
        const probe = spawnSync('/bin/bash', ['-c', `${sanitize.replace('"$EUID"', '0')}\n${text.slice(start).split('\n').slice(0, 7).join('\n')}\necho "$PATH"`], {
            encoding: 'utf8', timeout: 20000,
            env: { ...process.env, PATH: [shim, fakeNodeDir, '/usr/bin', '/bin'].join(path.delimiter) }
        });
        assert.equal(probe.stdout.trim(), `${SYSTEM_PATH}:${fakeNodeDir}`, `${file}: ${probe.stderr}`);
        assert.equal(fs.existsSync(marker), false, `${file} 以 root 运行了传入 PATH 里的 dirname`);
    }
});

test('macOS launchers started directly as root replace PATH before running any command', { skip: process.platform === 'win32' }, t => {
    const shim = fs.mkdtempSync(path.join(os.tmpdir(), 'ag2cn-rootpath-'));
    t.after(() => fs.rmSync(shim, { recursive: true, force: true }));
    const marker = path.join(shim, 'ran');
    for (const tool of ['dirname', 'basename', 'awk', 'sed', 'sort', 'cut', 'dscl']) {
        fs.writeFileSync(path.join(shim, tool), `#!/bin/sh\ntouch "${marker}"\n`, { mode: 0o755 });
    }
    for (const file of launchers) {
        const lines = fs.readFileSync(path.join(repo, file), 'utf8').split('\n');
        const at = lines.findIndex(line => line.startsWith('if [ "$EUID" -eq 0 ]; then'));
        assert.ok(at > 0, `${file} 缺少以 root 启动时的 PATH 清理`);
        // 清理 PATH 之前只能有 shebang 与注释
        for (const line of lines.slice(0, at)) {
            assert.match(line, /^(#.*|\s*)$/, `${file} 在清理 PATH 前运行了：${line}`);
        }
        const probe = spawnSync('/bin/bash', ['-c', `${lines[at].replace('"$EUID"', '0')}\necho "$PATH"\ndirname /a/b >/dev/null`], {
            encoding: 'utf8', timeout: 20000, env: { ...process.env, PATH: [shim, '/usr/bin', '/bin'].join(path.delimiter) }
        });
        assert.equal(probe.stdout.split('\n')[0], SYSTEM_PATH, `${file}: ${probe.stderr}`);
        assert.equal(fs.existsSync(marker), false, `${file} 以 root 运行了传入 PATH 里的程序`);
    }
});
