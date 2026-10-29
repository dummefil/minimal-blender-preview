const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const userDirectory = path.join(root, '.vscode-test', 'dev-user-data', 'User');
const defaults = {
    'minimalBlenderViewer.allowBlenderAutoExec': false,
    'breadcrumbs.showEditorType': false,
    'workbench.startupEditor': 'none',
    'workbench.welcomePage.experimentalOnboarding': false,
    'window.titleBarStyle': 'native',
    'window.customTitleBarVisibility': 'never',
    'window.menuBarVisibility': 'hidden',
    'window.commandCenter': false,
    'window.title': ' ',
    'workbench.layoutControl.enabled': false,
    'workbench.editor.editorActionsLocation': 'hidden'
};

fs.mkdirSync(userDirectory, { recursive: true });

function createIfMissing(destination, contents) {
    try {
        fs.writeFileSync(destination, contents, { flag: 'wx' });
    } catch (error) {
        if (error.code !== 'EEXIST') throw error;
    }
}

createIfMissing(
    path.join(userDirectory, 'settings.json'),
    JSON.stringify(defaults, null, 2) + '\n'
);
createIfMissing(
    path.join(userDirectory, 'keybindings.json'),
    fs.readFileSync(path.join(__dirname, 'preview-keybindings.json'))
);
