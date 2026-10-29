const fs = require('fs');
const path = require('path');
const vm = require('vm');
const vscode = require('vscode');
const { execFile } = require('child_process');

const pendingKey = 'minimalBlenderPreview.developmentReloadPending';
const viewType = 'minimalBlenderViewer.blendViewer';

function start(context) {
    const sourceDirectory = path.join(context.extensionPath, 'src');
    let timer;
    let rebuildRequired = false;
    let pendingHostSource = null;
    let generation = 0;
    let buildQueue = Promise.resolve();
    const schedule = (source, needsBuild) => {
        rebuildRequired ||= needsBuild;
        if (!needsBuild) pendingHostSource = source;
        const current = ++generation;
        clearTimeout(timer);
        timer = setTimeout(async () => {
            try {
                if (pendingHostSource) {
                    new vm.Script(fs.readFileSync(pendingHostSource, 'utf8'), { filename: pendingHostSource });
                    pendingHostSource = null;
                }
                if (rebuildRequired) {
                    rebuildRequired = false;
                    buildQueue = buildQueue.catch(() => {}).then(() => new Promise((resolve, reject) => {
                        execFile(process.execPath, [path.join(context.extensionPath, 'node_modules', 'esbuild', 'bin', 'esbuild'),
                            'src/webview/preview.js', 'src/webview/preview.css', '--bundle', '--tree-shaking=false',
                            '--format=esm', '--platform=browser', '--target=es2020', '--outdir=dist'],
                        { cwd: context.extensionPath }, error => error ? reject(error) : resolve());
                    }));
                }
                await buildQueue;
                if (current !== generation) return;
                await context.workspaceState.update(pendingKey, true);
                console.log('[Blender Preview] Source changed; restarting extension host.');
                await vscode.commands.executeCommand('workbench.action.restartExtensionHost');
            } catch (error) {
                vscode.window.showErrorMessage(`Blender Preview auto reload: ${error.message}`);
            }
        }, 500);
    };
    const hostWatcher = fs.watch(sourceDirectory, (_event, filename) => {
        const name = filename ? filename.toString() : 'extension.js';
        if (!name.toLowerCase().endsWith('.js')) return;
        schedule(path.join(sourceDirectory, name), false);
    });
    const webviewWatcher = fs.watch(path.join(sourceDirectory, 'webview'), (_event, filename) => {
        if (filename && !/\.(js|css)$/i.test(filename.toString())) return;
        schedule(null, true);
    });
    context.subscriptions.push({
        dispose() {
            clearTimeout(timer);
            generation++;
            hostWatcher.close();
            webviewWatcher.close();
        }
    });
}

async function restore(context) {
    if (!context.workspaceState.get(pendingKey)) return;
    await context.workspaceState.update(pendingKey, undefined);
    setTimeout(async () => {
        try {
            const tabs = vscode.window.tabGroups.all.flatMap(group => group.tabs)
                .filter(tab => tab.input instanceof vscode.TabInputCustom && tab.input.viewType === viewType);
            const resources = tabs.map(tab => ({ uri: tab.input.uri, column: tab.group.viewColumn }));
            if (tabs.length) await vscode.window.tabGroups.close(tabs);
            for (const resource of resources) {
                await vscode.commands.executeCommand('vscode.openWith', resource.uri, viewType, {
                    viewColumn: resource.column,
                    preview: false
                });
            }
            console.log(`[Blender Preview] Reopened ${resources.length} preview(s) after restart.`);
        } catch (error) {
            vscode.window.showErrorMessage(`Blender Preview auto reload: ${error.message}`);
        }
    }, 0);
}

module.exports = { start, restore };
