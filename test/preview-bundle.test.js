const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');

test('preview bundle contains Three.js and its local loader and controls', async () => {
    const build = await esbuild.build({
        entryPoints: ['src/webview/preview.js'],
        bundle: true,
        treeShaking: false,
        format: 'esm',
        platform: 'browser',
        target: 'es2020',
        write: false,
        metafile: true
    });
    const inputs = Object.keys(build.metafile.inputs);
    assert.ok(inputs.some(name => name.endsWith('three.module.js')));
    assert.ok(inputs.some(name => name.endsWith('GLTFLoader.js')));
    assert.ok(inputs.some(name => name.endsWith('OrbitControls.js')));
    assert.ok(build.outputFiles[0].contents.length > 0);
});
