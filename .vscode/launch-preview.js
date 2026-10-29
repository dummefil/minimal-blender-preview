const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const root = path.resolve(__dirname, '..');
const executable = process.argv[2];
const port = 9330;

function inspectorAvailable() {
    return new Promise(resolve => {
        const request = http.get(`http://127.0.0.1:${port}/json/list`, response => {
            response.resume();
            resolve(response.statusCode === 200);
        });
        request.on('error', () => resolve(false));
        request.setTimeout(500, () => request.destroy());
    });
}

async function start() {
    if (!executable) throw new Error('VS Code executable path was not provided.');
    if (await inspectorAvailable()) throw new Error(`Debug port ${port} is already in use; close the other preview first.`);
    const environment = { ...process.env, MINIMAL_BLENDER_PREVIEW_FOCUS: '1', MINIMAL_BLENDER_PREVIEW_AUTO_RELOAD: '1' };
    delete environment.ELECTRON_RUN_AS_NODE;
    const child = spawn(executable, [
        '--new-window', '--skip-welcome', '--skip-release-notes',
        `--extensionDevelopmentPath=${root}`,
        `--user-data-dir=${path.join(root, '.vscode-test', 'dev-user-data')}`,
        `--extensions-dir=${path.join(root, '.vscode-test', 'dev-extensions')}`,
        `--inspect-extensions=${port}`,
        path.join(root, 'samples', 'preview.code-workspace'),
        path.join(root, 'samples', 'suzanne.blend')
    ], { env: environment, detached: true, stdio: 'ignore' });
    child.on('error', error => { console.error(`Failed to start VS Code: ${error.message}`); process.exitCode = 1; });
    child.unref();
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        if (await inspectorAvailable()) return;
        if (process.exitCode) return;
        await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error('Extension Host debugger did not start. Close other preview windows and try F5 again.');
}

start().catch(error => { console.error(error.message); process.exitCode = 1; });
