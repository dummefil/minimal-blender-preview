def needs_color_bake(material):
    if not material or not material.use_nodes:
        return False
    for node in material.node_tree.nodes:
        if node.type != 'BSDF_PRINCIPLED':
            continue
        color = node.inputs.get('Base Color')
        if color and color.is_linked and color.links[0].from_node.type == 'MIX_RGB':
            return True
    return False


def bake_preview_materials():
    # Blender's glTF exporter does not preserve legacy MixRGB shader graphs.
    # Bake only affected objects, in this disposable background Blender process.
    scene = bpy.context.scene
    objects = [obj for obj in bpy.context.view_layer.objects if obj.type == 'MESH'
               and obj.visible_get()
               and any(needs_color_bake(slot.material) for slot in obj.material_slots)]
    if not objects:
        return

    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 1
    scene.render.bake.margin = 8
    scene.render.bake.use_clear = True

    for obj in objects:
        if not obj.data.uv_layers.active:
            print('[MinimalBlenderViewer] Cannot bake without UVs:', obj.name)
            continue
        if obj.data.users > 1:
            obj.data = obj.data.copy()
        targets = []
        for slot in obj.material_slots:
            material = slot.material
            if not material or not material.use_nodes:
                continue
            slot.material = material.copy()
            material = slot.material
            nodes = material.node_tree.nodes
            target = nodes.new('ShaderNodeTexImage')
            if needs_color_bake(material):
                sizes = [max(node.image.size) for node in nodes
                         if node.type == 'TEX_IMAGE' and node.image and node.image.size[0]]
                size = min(2048, max([512] + sizes))
                target.image = bpy.data.images.new(material.name + '_preview_color', size, size, alpha=True)
                shader = next(node for node in nodes if node.type == 'BSDF_PRINCIPLED'
                              and node.inputs['Base Color'].is_linked
                              and node.inputs['Base Color'].links[0].from_node.type == 'MIX_RGB')
                output = next((node for node in nodes if node.type == 'OUTPUT_MATERIAL' and node.is_active_output), None)
                if not output or not output.inputs['Surface'].is_linked:
                    nodes.remove(target)
                    continue
                original_surface = output.inputs['Surface'].links[0].from_socket
                original_color = shader.inputs['Base Color'].links[0].from_socket
                emission = nodes.new('ShaderNodeEmission')
                material.node_tree.links.new(original_color, emission.inputs['Color'])
                material.node_tree.links.new(emission.outputs[0], output.inputs['Surface'])
                targets.append((material, target, shader, output, original_surface, emission))
            else:
                target.image = bpy.data.images.new(material.name + '_preview_unused', 1, 1)
            nodes.active = target

        if not targets:
            continue
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        result = bpy.ops.object.bake(type='EMIT')
        if result != {'FINISHED'}:
            raise RuntimeError('Material baking failed for ' + obj.name)
        for material, target, shader, output, original_surface, emission in targets:
            links = material.node_tree.links
            links.new(original_surface, output.inputs['Surface'])
            links.new(target.outputs['Color'], shader.inputs['Base Color'])
            material.node_tree.nodes.remove(emission)
            target.image.pack()
        print('[MinimalBlenderViewer] Baked preview colors:', obj.name)
