const fs = require('fs');
const path = require('path');
const vm = require('vm');
const vscode = require('vscode');

const pendingKey = 'minimalBlenderPreview.developmentReloadPending';
const viewType = 'minimalBlenderViewer.blendViewer';

function start(context) {
    const source = path.join(context.extensionPath, 'src', 'extension.js');
    let timer;
    const watcher = fs.watch(path.dirname(source), (_event, filename) => {
        if (filename && filename.toString().toLowerCase() !== path.basename(source).toLowerCase()) return;
        clearTimeout(timer);
        timer = setTimeout(async () => {
            try {
                new vm.Script(fs.readFileSync(source, 'utf8'), { filename: source });
                await context.workspaceState.update(pendingKey, true);
                console.log('[Blender Preview] Source changed; restarting extension host.');
                await vscode.commands.executeCommand('workbench.action.restartExtensionHost');
            } catch (error) {
                vscode.window.showErrorMessage(`Blender Preview auto reload: ${error.message}`);
            }
        }, 500);
    });
    context.subscriptions.push({
        dispose() {
            clearTimeout(timer);
            watcher.close();
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
