const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { buildExportScript } = require('../src/blender-export-script');

test('Blender preview export preserves a mixed material color', { skip: !process.env.BLENDER_TEST_PATH }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blend-material-test-'));
    const run = (...args) => {
        const result = spawnSync(process.env.BLENDER_TEST_PATH, args, { encoding: 'utf8', timeout: 120000 });
        assert.equal(result.status, 0, result.stderr + result.stdout);
        return result.stdout;
    };
    try {
        const fixture = path.join(dir, 'fixture.py');
        const blend = path.join(dir, 'fixture.blend');
        const glb = path.join(dir, 'preview.glb');
        fs.writeFileSync(fixture, `import bpy
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.mesh.primitive_plane_add()
mat = bpy.data.materials.new('Mixed')
mat.use_nodes = True
bpy.context.object.data.materials.append(mat)
nodes = mat.node_tree.nodes
shader = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
mix = nodes.new('ShaderNodeMixRGB')
mix.blend_type = 'MULTIPLY'
mix.inputs[0].default_value = 1
mix.inputs[1].default_value = (0.8, 0.8, 0.8, 1)
mix.inputs[2].default_value = (0.2, 0.5, 0.1, 1)
mat.node_tree.links.new(mix.outputs[0], shader.inputs['Base Color'])
bpy.ops.wm.save_as_mainfile(filepath=${JSON.stringify(blend.replace(/\\/g, '/'))})
`);
        run('-b', '--factory-startup', '--python-exit-code', '1', '-P', fixture);
        const exporter = path.join(dir, 'export.py');
        fs.writeFileSync(exporter, buildExportScript(glb, { exportApplyModifiers: true, exportMaterials: true, exportAnimations: false, exportCameras: false, exportLights: false }));
        run('--disable-autoexec', '-b', blend, '--python-exit-code', '1', '-P', exporter);
        const inspect = path.join(dir, 'inspect.py');
        fs.writeFileSync(inspect, `import bpy, json
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=${JSON.stringify(glb.replace(/\\/g, '/'))})
mat = next(o for o in bpy.context.scene.objects if o.type == 'MESH').data.materials[0]
shader = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
image = shader.inputs['Base Color'].links[0].from_node.image
x = image.size[0] // 2; y = image.size[1] // 2
i = (y * image.size[0] + x) * 4
print('BAKED_PIXEL=' + json.dumps(list(image.pixels[i:i+3])))
`);
        const output = run('-b', '--factory-startup', '--python-exit-code', '1', '-P', inspect);
        const pixel = JSON.parse(output.match(/BAKED_PIXEL=(\[[^\n]+\])/)[1]);
        for (const [index, expected] of [0.436, 0.665, 0.313].entries()) {
            assert.ok(Math.abs(pixel[index] - expected) < 0.025, `unexpected baked color: ${pixel}`);
        }
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
