const test = require('node:test');
const assert = require('node:assert/strict');
const { createPreviewConverter } = require('../src/preview-conversion');

test('a cache miss exports once and retains the generated preview', async () => {
    const exports = [];
    let retained;
    let exists = false;
    const convert = createPreviewConverter({
        prepareCache() {},
        inspectSource: () => ({ mtimeMs: 1, size: 2 }),
        hashFingerprint: () => 'cache-key',
        cachePath: (directory, name) => `${directory}/${name}`,
        fileExists: () => exists,
        touch() {},
        exportBlend: async (source, output) => { exports.push({ source, output }); exists = true; },
        cleanupCache: async (_settings, keep) => { retained = [...keep]; }
    });
    const result = await convert('/source.blend', { cacheDirectory: '/cache' });
    assert.equal(result.fromCache, false);
    assert.equal(result.outputPath, '/cache/cache-key.glb');
    assert.deepEqual(exports, [{ source: '/source.blend', output: '/cache/cache-key.glb' }]);
    assert.deepEqual(retained, ['/cache/cache-key.glb']);
});

test('a successful Blender exit without an output file reports an error', async () => {
    const convert = createPreviewConverter({
        prepareCache() {}, inspectSource: () => ({ mtimeMs: 1, size: 2 }),
        hashFingerprint: () => 'key', cachePath: (directory, name) => `${directory}/${name}`,
        fileExists: () => false, touch() {}, exportBlend: async () => {}, cleanupCache: async () => {}
    });
    await assert.rejects(convert('/source.blend', { cacheDirectory: '/cache' }), /no GLB preview was created/);
});

test('a quick preview is delivered before the final export finishes', async () => {
    const files = new Set();
    const events = [];
    const convert = createPreviewConverter({
        prepareCache() {}, inspectSource: () => ({ mtimeMs: 1, size: 2 }),
        hashFingerprint: () => 'key', cachePath: (directory, name) => `${directory}/${name}`,
        fileExists: file => files.has(file), touch() {}, cleanupCache: async () => {},
        exportBlend: async (_source, output, _settings, _key, _lod, progress) => {
            files.add('/cache/key.quick.glb');
            progress('/cache/key.quick.glb');
            events.push('baking');
            files.add(output);
        }
    });
    const result = await convert('/source.blend', { cacheDirectory: '/cache', exportMaterials: true }, quick => events.push(quick.outputPath));
    events.push(result.outputPath);
    assert.deepEqual(events, ['/cache/key.quick.glb', 'baking', '/cache/key.glb']);
});
