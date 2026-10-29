// Creates the Python program passed to Blender; it performs no I/O itself.
/*
 * lodLevel limits the export to one level
 * of detail: objects with a different
 * _LOD<n> suffix (and their children) are
 * left out, everything else is kept.
 */
function buildExportScript(
    outputPath,
    settings,
    lodLevel = null
) {
    const safeOutputPath =
        JSON.stringify(
            outputPath.replace(
                /\\/g,
                '/'
            )
        );

    return `
import bpy
import re
import traceback

output_path = ${safeOutputPath}

lod_level = ${
    Number.isInteger(
        lodLevel
    )
        ? lodLevel
        : 'None'
}

requested = {
    "filepath": output_path,
    "export_format": "GLB",
    "export_apply": ${
        settings.exportApplyModifiers
            ? 'True'
            : 'False'
    },
    "export_animations": ${
        settings.exportAnimations
            ? 'True'
            : 'False'
    },
    "export_animation_mode": "ACTIONS",
    "export_cameras": ${
        settings.exportCameras
            ? 'True'
            : 'False'
    },
    "export_lights": ${
        settings.exportLights
            ? 'True'
            : 'False'
    },
    "export_materials": "${
        settings.exportMaterials
            ? 'EXPORT'
            : 'NONE'
    }"
}


def other_lod(obj):
    while obj is not None:
        match = re.search(
            r"LOD[-_. ]?([0-9]+)$",
            obj.name,
            re.IGNORECASE
        )

        if match:
            return int(match.group(1)) != lod_level

        obj = obj.parent

    return False


if lod_level is not None:
    keep = [
        obj
        for obj in bpy.context.view_layer.objects
        if not other_lod(obj)
    ]

    for obj in bpy.context.view_layer.objects:
        obj.select_set(False)

    for obj in keep:
        obj.hide_set(False)
        obj.hide_viewport = False
        obj.select_set(True)

    requested["use_selection"] = True

    print(
        "[MinimalBlenderViewer] LOD",
        lod_level,
        "objects:",
        [obj.name for obj in keep]
    )

try:
    properties = {
        property.identifier
        for property in
        bpy.ops.export_scene.gltf
            .get_rna_type()
            .properties
    }

    kwargs = {
        key: value
        for key, value
        in requested.items()
        if key in properties
    }

    print(
        "[MinimalBlenderViewer] Export args:",
        kwargs
    )

    result = bpy.ops.export_scene.gltf(
        **kwargs
    )

    print(
        "[MinimalBlenderViewer] Export result:",
        result
    )

except Exception:
    traceback.print_exc()
    raise
`;
}

module.exports = { buildExportScript };
