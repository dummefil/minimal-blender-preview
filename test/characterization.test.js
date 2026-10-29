const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
const { createRequire } = Module;

// Exercise the existing host boundary without starting VS Code or Blender.
const entry = path.resolve(__dirname, '../src/extension.js');
const source = fs.readFileSync(entry, 'utf8');
const hostRequire = createRequire(entry);
const overrides = {};
const vscode = {
    workspace: { getConfiguration: () => ({ get: (name, fallback) => overrides[name] ?? fallback }), getWorkspaceFolder: () => undefined },
    window: { showSaveDialog: async () => undefined },
    Uri: { file: fsPath => ({ fsPath }) }
};
const context = {
    require: name => name === 'vscode' ? vscode : hostRequire(name),
    buildExportScript: hostRequire('./blender-export-script').buildExportScript,
    module: { exports: {} },
    process,
    console,
    setTimeout,
    clearTimeout
};
const originalLoad = Module._load;
try {
    Module._load = function (name, ...args) {
        return name === 'vscode' ? vscode : originalLoad.call(this, name, ...args);
    };
    vm.runInNewContext(`${source}\nmodule.exports.characterization = { buildViewerHtml, buildErrorHtml, buildExportScript, getSettings, cleanupCache, convertBlendToGlb, handleWebviewMessage };`, context, { filename: entry });
    context.runProcess = hostRequire('./blender-process').runProcess;
} finally {
    Module._load = originalLoad;
}
const { buildViewerHtml, buildErrorHtml, buildExportScript, getSettings, cleanupCache, convertBlendToGlb, handleWebviewMessage } = context.module.exports.characterization;
const { runProcess } = context;

test('Blender process reports its output and non-zero exits', async () => {
    const result = await runProcess(process.execPath, ['-e', 'process.stdout.write("exported")'], 5000);
    assert.equal(result.stdout, 'exported');
    await assert.rejects(runProcess(process.execPath, ['-e', 'process.stderr.write("broken"); process.exit(2)'], 5000), /code 2[\s\S]*broken/);
});

test('cancelled LOD export reports cancellation back to the webview', async () => {
    const messages = [];
    const record = { document: { uri: { fsPath: path.resolve('model.blend') } }, panel: { webview: { postMessage: message => messages.push(message) } }, disposed: false };
    await handleWebviewMessage(record, { type: 'exportLod', level: 1 });
    assert.equal(messages.length, 1);
    assert.equal(messages[0].type, 'exportLodDone');
    assert.equal(messages[0].level, 1);
    assert.equal(messages[0].exported, false);
});

test('cache cleanup removes expired files but preserves the active preview', async () => {
    const directory = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'blend-cache-test-'));
    try {
        const expired = path.join(directory, 'old.glb');
        const active = path.join(directory, 'active.glb');
        fs.writeFileSync(expired, 'old');
        fs.writeFileSync(active, 'active');
        const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
        fs.utimesSync(expired, old, old);
        fs.utimesSync(active, old, old);
        await cleanupCache({ cacheDirectory: directory, cacheMaxAgeHours: 1, cacheMaxSizeMB: 1 }, new Set([active]));
        assert.equal(fs.existsSync(expired), false);
        assert.equal(fs.existsSync(active), true);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('a cached preview is reused without starting Blender', async () => {
    const directory = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'blend-preview-test-'));
    try {
        const sourcePath = path.join(directory, 'model.blend');
        fs.writeFileSync(sourcePath, 'source');
        overrides.cacheDirectory = directory;
        const stat = fs.statSync(sourcePath);
        const fingerprint = JSON.stringify({ sourcePath, modified: stat.mtimeMs, size: stat.size, exportApplyModifiers: true, exportMaterials: true, exportAnimations: true, exportCameras: false, exportLights: false });
        const key = require('node:crypto').createHash('sha1').update(fingerprint).digest('hex').slice(0, 20);
        const outputPath = path.join(directory, `${key}.glb`);
        fs.writeFileSync(outputPath, 'cached');
        const result = await convertBlendToGlb({ fsPath: sourcePath });
        assert.equal(result.outputPath, outputPath);
        assert.equal(result.fromCache, true);
    } finally {
        delete overrides.cacheDirectory;
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('default settings preserve the safe Blender export policy', () => {
    const settings = getSettings();
    assert.equal(settings.allowBlenderAutoExec, false);
    assert.equal(settings.exportAnimations, true);
    assert.equal(settings.blenderTimeoutSeconds, 120);
    assert.equal(settings.cacheMaxAgeHours, 24);
    assert.ok(path.isAbsolute(settings.cacheDirectory));
});

test('preview page carries the model URL, settings and restrictive content policy', () => {
    const webview = { cspSource: 'vscode-resource:', asWebviewUri: () => ({ toString: () => 'vscode-resource:/model.glb' }) };
    const html = buildViewerHtml(webview, {}, { cameraFov: 150, showGrid: false, wireframe: true, background: 'theme' }, true, { script: 'preview.js', style: 'preview.css' });
    assert.match(html, /vscode-resource:\/model\.glb/);
    assert.match(html, /default-src 'none'/);
    assert.match(html, /"cameraFov":120/);
    assert.match(html, /\bcache\b/);
});

test('preview loads Three.js locally without reaching a CDN', () => {
    const webview = { cspSource: 'vscode-resource:', asWebviewUri: uri => ({ toString: () => `vscode-resource:/${uri}` }) };
    const html = buildViewerHtml(webview, 'model.glb', { cameraFov: 45 }, false, { script: 'preview.js', style: 'preview.css' });
    assert.ok(html.includes('vscode-resource:/preview.js'));
    assert.ok(!html.includes('cdn.jsdelivr.net'));
});

test('preview loads its renderer and styles as separate local assets', () => {
    const webview = { cspSource: 'vscode-resource:', asWebviewUri: uri => ({ toString: () => `vscode-resource:/${uri}` }) };
    const html = buildViewerHtml(webview, 'model.glb', { cameraFov: 45 }, false, { script: 'preview.js', style: 'preview.css' });
    assert.ok(html.includes('vscode-resource:/preview.js'));
    assert.ok(html.includes('vscode-resource:/preview.css'));
    assert.ok(!html.includes('function animate()'));
});

test('preview settings cannot inject markup into the webview', () => {
    const webview = { cspSource: 'vscode-resource:', asWebviewUri: uri => ({ toString: () => `vscode-resource:/${uri}` }) };
    const html = buildViewerHtml(webview, 'model.glb', { cameraFov: 45, background: '</script><script>alert(1)</script>' }, false, { script: 'preview.js', style: 'preview.css' });
    assert.ok(!html.includes('</script><script>alert(1)'));
    assert.ok(html.includes('\\u003c/script>'));
});

test('error page escapes messages before embedding them in HTML', () => {
    const html = buildErrorHtml({ message: '<script>"x" & \'y\'</script>' });
    assert.match(html, /&lt;script&gt;&quot;x&quot; &amp; &#039;y&#039;&lt;\/script&gt;/);
});

test('Blender script preserves output escaping, export options and selected LOD', () => {
    const script = buildExportScript('C:\\model "one".glb', {
        exportApplyModifiers: true, exportAnimations: false, exportCameras: false,
        exportLights: true, exportMaterials: false
    }, 2);
    assert.match(script, /output_path = "C:\/model \\"one\\"\.glb"/);
    assert.match(script, /lod_level = 2/);
    assert.match(script, /"export_apply": True/);
    assert.match(script, /"export_animations": False/);
    assert.match(script, /"export_lights": True/);
    assert.match(script, /"export_materials": "NONE"/);
    assert.match(script, /requested\["use_selection"\] = True/);
});
