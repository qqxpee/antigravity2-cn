const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');

const { generateJs } = require('../localization_engine');

function createRuntime() {
    const metrics = { textContentReads: 0, stringIncludes: 0 };
    const observers = new Set();

    class FakeNode {
        constructor(nodeType) {
            this.nodeType = nodeType;
            this.parentNode = null;
            this.parentElement = null;
            this.childNodes = [];
        }

        appendChild(child) {
            child.parentNode = this;
            child.parentElement = this.nodeType === 1 ? this : this.parentElement;
            this.childNodes.push(child);
            return child;
        }
    }

    class FakeText extends FakeNode {
        constructor(value) {
            super(3);
            this._nodeValue = value;
        }

        get nodeValue() {
            return this._nodeValue;
        }

        set nodeValue(value) {
            this._nodeValue = value;
        }

        get textContent() {
            metrics.textContentReads += 1;
            return this._nodeValue;
        }
    }

    class FakeElement extends FakeNode {
        constructor(tagName = 'div') {
            super(1);
            this.tagName = tagName.toUpperCase();
            this.attributes = new Map();
            this.shadowRoot = null;
            this.isContentEditable = false;
            this.classList = {
                add: () => {},
                contains: () => false
            };
        }

        get textContent() {
            metrics.textContentReads += 1;
            return this.childNodes.map(child => child.textContent || '').join('');
        }

        setAttribute(name, value) {
            this.attributes.set(name, String(value));
        }

        getAttribute(name) {
            return this.attributes.get(name) || null;
        }

        closest() {
            return null;
        }

        attachShadow() {
            this.shadowRoot = new FakeElement('shadow-root');
            return this.shadowRoot;
        }
    }

    class FakeMutationObserver {
        constructor(callback) {
            this.callback = callback;
            observers.add(this);
        }

        observe() {}

        emit(records) {
            this.callback(records);
        }
    }

    const body = new FakeElement('body');
    const loadListeners = [];
    const timeoutCallbacks = [];
    const workCallbacks = [];
    const document = {
        body,
        documentElement: body,
        readyState: 'complete',
        addEventListener() {}
    };
    const window = {
        addEventListener(type, callback) {
            if (type === 'load') loadListeners.push(callback);
        }
    };

    const context = vm.createContext({
        document,
        window,
        Element: FakeElement,
        Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 },
        MutationObserver: FakeMutationObserver,
        setTimeout(callback, delay) {
            if (delay === 0) workCallbacks.push(callback);
            else timeoutCallbacks.push(callback);
        },
        metrics,
        console
    });
    vm.runInContext(`
        const originalStringIncludes = String.prototype.includes;
        String.prototype.includes = function(search, position) {
            metrics.stringIncludes += 1;
            return originalStringIncludes.call(this, search, position);
        };
    `, context);
    const initialize = () => vm.runInContext(generateJs(), context);

    return {
        body,
        createElement: tag => new FakeElement(tag),
        createText: value => new FakeText(value),
        metrics,
        initialize,
        startAgain() {
            for (const callback of loadListeners) callback();
            for (const callback of timeoutCallbacks) callback();
        },
        emitMutations(records) {
            for (const observer of observers) observer.emit(records);
        },
        flushWork() {
            while (workCallbacks.length) {
                const callbacks = workCallbacks.splice(0, workCallbacks.length);
                for (const callback of callbacks) callback();
            }
        },
        pendingWorkCount: () => workCallbacks.length,
        observerCount: () => observers.size
    };
}

test('translates a split project summary across nested text nodes', () => {
    const runtime = createRuntime();
    const container = runtime.createElement('div');
    container.appendChild(runtime.createText('Demo '));
    container.appendChild(runtime.createElement('span')).appendChild(runtime.createText('including '));
    container.appendChild(runtime.createText('2 active conversations.'));

    runtime.body.appendChild(container);
    runtime.initialize();

    assert.equal(
        runtime.body.childNodes[0].textContent,
        'Demo（包含 2 个活跃会话）。'
    );
});

test('does not rescan the page when delayed startup hooks run again', () => {
    const runtime = createRuntime();
    const noiseRoot = runtime.createElement('section');
    for (let i = 0; i < 80; i += 1) {
        const row = runtime.createElement('div');
        row.appendChild(runtime.createText('Open Folder'));
        noiseRoot.appendChild(row);
    }
    runtime.body.appendChild(noiseRoot);

    runtime.initialize();
    const readsAfterInitialScan = runtime.metrics.textContentReads;
    runtime.startAgain();

    assert.equal(runtime.metrics.textContentReads, readsAfterInitialScan);
});

test('processes added nodes without recursively rescanning the existing page', () => {
    const runtime = createRuntime();
    const noiseRoot = runtime.createElement('section');
    for (let i = 0; i < 80; i += 1) {
        const row = runtime.createElement('div');
        row.appendChild(runtime.createText('Open Folder'));
        noiseRoot.appendChild(row);
    }
    runtime.body.appendChild(noiseRoot);
    runtime.initialize();
    runtime.metrics.textContentReads = 0;

    const addedNode = runtime.createElement('div');
    addedNode.appendChild(runtime.createText('Open Folder'));
    noiseRoot.appendChild(addedNode);
    runtime.emitMutations([{
        type: 'childList',
        target: noiseRoot,
        addedNodes: [addedNode]
    }]);

    assert.ok(runtime.metrics.textContentReads < 100);
});

test('defers project-list row translation until after the render batch', () => {
    const runtime = createRuntime();
    runtime.initialize();

    const projectList = runtime.createElement('section');
    runtime.body.appendChild(projectList);
    const projectRows = [];
    for (let i = 0; i < 100; i += 1) {
        const projectRow = runtime.createElement('div');
        projectRow.appendChild(runtime.createText('Open Folder'));
        projectList.appendChild(projectRow);
        projectRows.push(projectRow);
    }

    runtime.emitMutations([{
        type: 'childList',
        target: projectList,
        addedNodes: projectRows
    }]);

    assert.ok(projectRows.every(row => row.textContent === 'Open Folder'));
    assert.equal(runtime.pendingWorkCount(), 1);

    runtime.flushWork();
    assert.ok(projectRows.every(row => row.textContent === '打开文件夹'));
});

test('translates a dynamically inserted split project summary', () => {
    const runtime = createRuntime();
    runtime.initialize();

    const container = runtime.createElement('div');
    container.appendChild(runtime.createText('Demo '));
    container.appendChild(runtime.createElement('span')).appendChild(runtime.createText('including '));
    container.appendChild(runtime.createText('2 active conversations.'));
    runtime.body.appendChild(container);
    runtime.emitMutations([{
        type: 'childList',
        target: runtime.body,
        addedNodes: [container]
    }]);
    runtime.flushWork();

    assert.equal(container.textContent, 'Demo（包含 2 个活跃会话）。');
});

test('translates a summary inside a large dynamically inserted subtree', () => {
    const runtime = createRuntime();
    runtime.initialize();

    const modal = runtime.createElement('section');
    for (let i = 0; i < 80; i += 1) {
        modal.appendChild(runtime.createText('unrelated modal content '));
    }
    const summary = runtime.createElement('div');
    summary.appendChild(runtime.createText('永久删除该项目及其所有会话记录。 '));
    summary.appendChild(runtime.createText('DSCodex'));
    summary.appendChild(runtime.createText(' including '));
    summary.appendChild(runtime.createText('3 active conversations.'));
    modal.appendChild(summary);
    runtime.body.appendChild(modal);

    runtime.emitMutations([{
        type: 'childList',
        target: runtime.body,
        addedNodes: [modal]
    }]);
    runtime.flushWork();

    assert.equal(
        summary.textContent,
        '永久删除该项目及其所有会话记录。 DSCodex（包含 3 个活跃会话）。'
    );
});

test('finds the dynamic summary container when only the count node is inserted', () => {
    const runtime = createRuntime();
    runtime.initialize();

    const container = runtime.createElement('div');
    container.appendChild(runtime.createText('Demo '));
    container.appendChild(runtime.createText('including '));
    runtime.body.appendChild(container);

    const countNode = runtime.createElement('span');
    countNode.appendChild(runtime.createText('2 active conversations.'));
    container.appendChild(countNode);
    runtime.emitMutations([{
        type: 'childList',
        target: container,
        addedNodes: [countNode]
    }]);
    runtime.flushWork();

    assert.equal(container.textContent, 'Demo（包含 2 个活跃会话）。');
});

test('translates the dynamic summary inside the delete-project description', () => {
    const runtime = createRuntime();
    const container = runtime.createElement('div');
    container.appendChild(runtime.createText('永久删除该项目及其所有会话记录。 '));
    container.appendChild(runtime.createText('DSCodex'));
    container.appendChild(runtime.createText(' including '));
    container.appendChild(runtime.createText('3 active conversations.'));
    runtime.body.appendChild(container);
    runtime.initialize();

    assert.equal(
        container.textContent,
        '永久删除该项目及其所有会话记录。 DSCodex（包含 3 个活跃会话）。'
    );
});

test('translates the dynamic summary when it is surrounded by other container text', () => {
    const runtime = createRuntime();
    const container = runtime.createElement('div');
    container.appendChild(runtime.createText('永久删除该项目及其所有会话记录。 '));
    container.appendChild(runtime.createText('DSCodex'));
    container.appendChild(runtime.createText(' including '));
    container.appendChild(runtime.createText('3 active conversations.'));
    container.appendChild(runtime.createText('（此项目将从列表中移除）'));
    runtime.body.appendChild(container);
    runtime.initialize();

    assert.equal(
        container.textContent,
        '永久删除该项目及其所有会话记录。 DSCodex（包含 3 个活跃会话）。（此项目将从列表中移除）'
    );
});

test('does not linearly scan every long dictionary entry for ordinary text updates', () => {
    const runtime = createRuntime();
    const text = runtime.createText('ordinary text that is not translatable');
    runtime.body.appendChild(text);
    runtime.initialize();
    runtime.metrics.stringIncludes = 0;

    runtime.emitMutations([{
        type: 'characterData',
        target: text
    }]);
    runtime.flushWork();

    assert.ok(runtime.metrics.stringIncludes < 100);
});
