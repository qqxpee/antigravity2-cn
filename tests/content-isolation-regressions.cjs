const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createDom, loadRuntime } = require('./helpers/runtime-loader.cjs');

const settle = () => new Promise(resolve => setTimeout(resolve, 35));

async function fixture(t, html, beforeInject) {
    const dom = createDom(html);
    t.after(() => dom.window.close());
    beforeInject?.(dom.window);
    dom.window.eval(loadRuntime());
    await settle();
    return dom.window;
}

test('File Viewer isolation survives translating its accessible name', async t => {
    const w = await fixture(t, '<div aria-label="File Viewer"><span id="file">Settings</span></div><button id="ui">Settings</button>');
    assert.equal(w.document.querySelector('#file').textContent, 'Settings');
    assert.equal(w.document.querySelector('#ui').textContent, '设置');
    const file = w.document.querySelector('#file');
    file.textContent = 'Knowledge';
    await settle();
    assert.equal(file.textContent, 'Knowledge', 'subsequent mutations inside the file viewer must stay isolated');
});

test('textarea initial value and defaultValue are preserved while unfocused', async t => {
    const w = await fixture(t, '<textarea id="draft">Settings</textarea><button>Settings</button>');
    const draft = w.document.querySelector('#draft');
    assert.equal(draft.value, 'Settings');
    assert.equal(draft.defaultValue, 'Settings');
    assert.equal(draft.textContent, 'Settings');
    assert.equal(w.document.querySelector('button').textContent, '设置');
});

test('textarea dirty value and focused value survive initial and subsequent translation', async t => {
    const w = await fixture(t, '<textarea id="draft">Settings</textarea>', window => {
        const draft = window.document.querySelector('#draft');
        draft.value = 'Knowledge';
        draft.focus();
    });
    const draft = w.document.querySelector('#draft');
    assert.equal(draft.value, 'Knowledge');
    assert.equal(draft.defaultValue, 'Settings');
    draft.blur();
    draft.defaultValue = 'New Conversation';
    await settle();
    assert.equal(draft.value, 'Knowledge', 'changing the default must not overwrite the dirty draft');
    assert.equal(draft.defaultValue, 'New Conversation');
});

test('input values and contenteditable drafts remain unmodified', async t => {
    const w = await fixture(t, '<input id="input" value="Settings"><div contenteditable="true" id="editable">Knowledge</div><div contenteditable="plaintext-only" id="plain">Settings</div>');
    const input = w.document.querySelector('#input');
    assert.equal(input.value, 'Settings');
    assert.equal(input.defaultValue, 'Settings');
    assert.equal(w.document.querySelector('#editable').textContent, 'Knowledge');
    assert.equal(w.document.querySelector('#plain').textContent, 'Settings');
    input.value = 'Knowledge';
    w.document.querySelector('#editable').textContent = 'New Conversation';
    await settle();
    assert.equal(input.value, 'Knowledge');
    assert.equal(input.defaultValue, 'Settings');
    assert.equal(w.document.querySelector('#editable').textContent, 'New Conversation');
});

test('user messages, AI responses, code and URI-marked previews remain isolated', async t => {
    const w = await fixture(t, `
      <div data-testid="user-input-step"><div data-quotable="true" id="user">Settings</div></div>
      <div data-testid="planner-response-text" id="ai">Knowledge</div>
      <pre id="pre">Settings</pre><code id="code">Knowledge</code>
      <div data-file-uri="file:///example.txt" id="file">New Conversation</div>
      <div data-uri="file:///example.txt" id="uri">Settings</div>
      <div translate="no" id="no">Knowledge</div>
      <div id="absolute">C:\\Settings\\New Conversation</div>
      <div id="url">file:///Settings/Knowledge</div>
      <button id="ui">Settings</button>
    `);
    for (const [id, expected] of [
        ['user', 'Settings'], ['ai', 'Knowledge'], ['pre', 'Settings'], ['code', 'Knowledge'],
        ['file', 'New Conversation'], ['uri', 'Settings'], ['no', 'Knowledge'],
        ['absolute', 'C:\\Settings\\New Conversation'], ['url', 'file:///Settings/Knowledge'],
    ]) {
        assert.equal(w.document.getElementById(id).textContent, expected, id);
    }
    assert.equal(w.document.querySelector('#ui').textContent, '设置');
});

test('protected shadow hosts keep initial and dynamic descendants untouched', async t => {
    let shadow;
    const w = await fixture(t, '<div id="host" data-file-uri="file:///example.txt"></div>', window => {
        shadow = window.document.querySelector('#host').attachShadow({ mode: 'open' });
        shadow.innerHTML = '<span id="inside">Settings</span>';
    });
    assert.equal(shadow.querySelector('#inside').textContent, 'Settings');
    shadow.querySelector('#inside').textContent = 'Knowledge';
    const added = w.document.createElement('span');
    added.textContent = 'New Conversation';
    shadow.appendChild(added);
    await settle();
    assert.equal(shadow.querySelector('#inside').textContent, 'Knowledge');
    assert.equal(added.textContent, 'New Conversation');
});

test('native select preserves implicit and explicit option values and selection', async t => {
    const w = await fixture(t, '<form><select name="choice" id="pick"><option>Settings</option><option value="stable-id" selected>Knowledge</option></select></form>');
    const pick = w.document.querySelector('#pick');
    assert.equal(pick.options[0].value, 'Settings', 'an implicit value must not become a translated label');
    assert.equal(pick.options[1].value, 'stable-id');
    assert.equal(pick.options[1].defaultSelected, true);
    assert.equal(pick.selectedIndex, 1);
    assert.equal(pick.value, 'stable-id');
    assert.equal(new w.FormData(w.document.querySelector('form')).get('choice'), 'stable-id');
});

test('dynamic native option updates preserve form submission values', async t => {
    const w = await fixture(t, '<form><select name="choice" id="pick"><option>Settings</option></select></form>');
    const pick = w.document.querySelector('#pick');
    pick.options[0].textContent = 'Knowledge';
    await settle();
    assert.equal(pick.options[0].value, 'Knowledge');
    assert.equal(new w.FormData(w.document.querySelector('form')).get('choice'), 'Knowledge');
    const added = w.document.createElement('option');
    added.textContent = 'New Conversation';
    pick.appendChild(added);
    pick.selectedIndex = 1;
    await settle();
    assert.equal(added.value, 'New Conversation');
    assert.equal(new w.FormData(w.document.querySelector('form')).get('choice'), 'New Conversation');
});

test('input and textarea placeholders and titles are translated while values remain untouched', async t => {
    const w = await fixture(t, '<input id="search" placeholder="Search tasks..." title="Search tasks..." value="Settings"><textarea id="draft" placeholder="Search conversations...">Settings</textarea>');
    const search = w.document.querySelector('#search');
    const draft = w.document.querySelector('#draft');
    assert.equal(search.getAttribute('placeholder'), '搜索任务...');
    assert.equal(search.getAttribute('title'), '搜索任务...');
    assert.equal(search.value, 'Settings');
    assert.equal(draft.getAttribute('placeholder'), '搜索会话...');
    assert.equal(draft.value, 'Settings');
});

test('dynamic permission prompt titles from the reported screens are translated', async t => {
    const titles = [
        ['probe', 'Allow probe local environment?', '是否允许探测本地环境？'],
        ['written', 'Allow verify written file?', '是否允许验证已写入的文件？'],
        ['recycle', 'Allow verify recycle and network?', '是否允许验证回收站及网络？'],
        ['reachability', 'Allow network reachability check?', '是否允许检查网络连通性？'],
    ];
    const w = await fixture(t, titles.map(([id]) => `<h2 id="${id}"></h2>`).join(''), window => {
        for (const [id, source] of titles) window.document.getElementById(id).textContent = source;
        const label = window.document.createElement('button');
        label.id = 'aria-title';
        label.setAttribute('aria-label', titles[3][1]);
        window.document.body.appendChild(label);
    });
    for (const [id, , expected] of titles) {
        assert.equal(w.document.getElementById(id).textContent, expected, id);
    }
    assert.equal(w.document.getElementById('aria-title').getAttribute('aria-label'), titles[3][2]);
});

test('dynamic always-allow choices translate around commands without changing command payloads', async t => {
    const examples = [
        {
            id: 'conversation',
            payload: `'$p="$HOME\\.gemini\\GEMINI.md"; $b=[IO.File]::ReadAllBytes($p); "bytes=$($b.Length)"'`,
            scope: ' in this conversation',
            expectedPrefix: '是，且在此会话中始终允许运行 ',
        },
        {
            id: 'project',
            payload: `"PS=\u0024(\u0024PSVersionTable.PSVersion); Get-Content \"\u0024HOME\\.gemini\\config.json\""`,
            scope: ' in this project',
            expectedPrefix: '是，且在此项目中始终允许运行 ',
        },
        {
            id: 'unscoped',
            payload: `'$d="$HOME\\.gemini\\antigravity\\scratch"; New-Item -ItemType Directory -Force $d; Remove-Item $f'`,
            scope: '',
            expectedPrefix: '是，且始终允许运行 ',
        },
        {
            id: 'network',
            payload: `foreach($u in 'https://api.github.com','https://www.google.com'){ try { $r=Invoke-WebRequest $u -TimeoutSec 10 } catch { $_.Exception.Message } }`,
            scope: '',
            expectedPrefix: '是，且始终允许运行 ',
        },
    ];
    const w = await fixture(t, examples.map(({ id }) => `<button id="${id}"></button>`).join(''), window => {
        for (const { id, payload, scope } of examples) {
            window.document.getElementById(id).textContent = `Yes, and always allow ${payload}${scope}`;
        }
        const aria = window.document.createElement('button');
        aria.id = 'aria-command';
        aria.setAttribute('aria-label', `Yes, and always allow ${examples[0].payload}${examples[0].scope}`);
        window.document.body.appendChild(aria);
    });
    for (const { id, payload, expectedPrefix } of examples) {
        const translated = w.document.getElementById(id).textContent;
        assert.equal(translated, expectedPrefix + payload, `${id} command payload and scope must remain intact`);
    }
    const ariaLabel = w.document.getElementById('aria-command').getAttribute('aria-label');
    assert.equal(ariaLabel, examples[0].expectedPrefix + examples[0].payload);
});

test('static always-allow choices retain their dictionary translations', async t => {
    const w = await fixture(t, '<button id="project">Yes, and always allow in this project</button><button id="conversation">Yes, and always allow in this conversation</button>');
    assert.equal(w.document.getElementById('project').textContent, '是，且在此项目中始终允许');
    assert.equal(w.document.getElementById('conversation').textContent, '是，且在此会话中始终允许');
});

test('dynamic permission prompts keep Traditional Chinese translations', async t => {
    const dom = createDom('<h2 id="title">Allow verify written file?</h2><button id="choice"></button>');
    t.after(() => dom.window.close());
    dom.window.document.getElementById('choice').textContent = 'Yes, and always allow "$HOME\\.gemini\\GEMINI.md" in this conversation';
    dom.window.eval(loadRuntime({ traditional: true }));
    await settle();
    assert.equal(dom.window.document.getElementById('title').textContent, '是否允許驗證已寫入的檔案？');
    assert.equal(dom.window.document.getElementById('choice').textContent, '是，且在此對話中一律允許執行 "$HOME\\.gemini\\GEMINI.md"');
});

test('permission title and command translations do not alter protected editor content', async t => {
    const w = await fixture(t, '<h2 id="title">Allow network reachability check?</h2><pre id="code">Yes, and always allow \'command\'</pre><div contenteditable="true" id="editor">Allow verify written file?</div>');
    assert.equal(w.document.getElementById('title').textContent, '是否允许检查网络连通性？');
    assert.equal(w.document.getElementById('code').textContent, "Yes, and always allow 'command'");
    assert.equal(w.document.getElementById('editor').textContent, 'Allow verify written file?');
});
