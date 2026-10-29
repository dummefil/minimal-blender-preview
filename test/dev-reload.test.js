const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('saving a host module restarts the extension host and schedules preview restoration', async () => {
    const root = path.resolve(__dirname, '..');
    const filename = path.join(root, '.vscode/dev-reload.js');
    const source = fs.readFileSync(filename, 'utf8');
    const watchers = new Map();
    let scheduled;
    const commands = [];
    const updates = [];
    const vscode = { commands: { executeCommand: async command => commands.push(command) } };
    const fileSystem = { ...fs, watch: (directory, callback) => { watchers.set(directory, callback); return { close() {} }; } };
    const sandbox = {
        require: name => name === 'fs' ? fileSystem : name === 'vscode' ? vscode : require(name),
        module: { exports: {} }, console,
        setTimeout: callback => { scheduled = callback; }, clearTimeout() {}
    };
    vm.runInNewContext(source, sandbox, { filename });
    sandbox.module.exports.start({
        extensionPath: root,
        subscriptions: [],
        workspaceState: { update: async (...args) => updates.push(args) }
    });

    watchers.get(path.join(root, 'src'))('change', 'settings.js');
    assert.equal(typeof scheduled, 'function');
    await scheduled();
    assert.equal(updates[0][1], true);
    assert.deepEqual(commands, ['workbench.action.restartExtensionHost']);
});

test('saving viewer code rebuilds its assets before restarting the extension host', async () => {
    const root = path.resolve(__dirname, '..');
    const filename = path.join(root, '.vscode/dev-reload.js');
    const source = fs.readFileSync(filename, 'utf8');
    const watchers = new Map();
    let scheduled;
    const calls = [];
    const fileSystem = { ...fs, watch: (directory, callback) => { watchers.set(directory, callback); return { close() {} }; } };
    const childProcess = { execFile: (_exe, args, _options, callback) => { calls.push(args); callback(null); } };
    const vscode = { commands: { executeCommand: async command => calls.push(command) } };
    const sandbox = {
        require: name => name === 'fs' ? fileSystem : name === 'child_process' ? childProcess : name === 'vscode' ? vscode : require(name),
        module: { exports: {} }, console, process,
        setTimeout: callback => { scheduled = callback; }, clearTimeout() {}
    };
    vm.runInNewContext(source, sandbox, { filename });
    sandbox.module.exports.start({ extensionPath: root, subscriptions: [], workspaceState: { update: async () => {} } });
    watchers.get(path.join(root, 'src', 'webview'))('change', 'preview.js');
    await scheduled();
    assert.ok(Array.isArray(calls[0]));
    assert.equal(calls[1], 'workbench.action.restartExtensionHost');
});
