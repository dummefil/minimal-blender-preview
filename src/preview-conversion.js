/**
 * @typedef {object} PreviewPorts
 * @property {Function} prepareCache
 * @property {Function} inspectSource
 * @property {Function} cachePath
 * @property {Function} hashFingerprint
 * @property {Function} fileExists
 * @property {Function} touch
 * @property {Function} exportBlend
 * @property {Function} cleanupCache
 */
/** @param {PreviewPorts} ports */
function createPreviewConverter(ports) {
const { prepareCache, inspectSource, cachePath, hashFingerprint, fileExists, touch, exportBlend, cleanupCache } = ports;
return async function convertBlendToGlb(
    sourcePath,
    settings,
    onQuickPreview
) {

    prepareCache(
        settings.cacheDirectory
    );

    const stat =
        inspectSource(
            sourcePath
        );

    const fingerprint =
        JSON.stringify({
            exportVersion: 2,
            sourcePath,
            modified:
                stat.mtimeMs,
            size:
                stat.size,

            exportApplyModifiers:
                settings.exportApplyModifiers,

            exportMaterials:
                settings.exportMaterials,

            exportAnimations:
                settings.exportAnimations,

            exportCameras:
                settings.exportCameras,

            exportLights:
                settings.exportLights
        });

    const cacheKey =
        hashFingerprint(
            fingerprint
        )
            .slice(
                0,
                20
            );

    const outputPath =
        cachePath(
            settings.cacheDirectory,
            `${cacheKey}.glb`
        );

    if (
        fileExists(
            outputPath
        )
    ) {
        try {
            const now =
                new Date();

            touch(
                outputPath,
                now,
                now
            );
        } catch {}

        return {
            outputPath,
            settings,
            fromCache: true
        };
    }

    await exportBlend(
        sourcePath,
        outputPath,
        settings,
        cacheKey,
        null,
        onQuickPreview && settings.exportMaterials
            ? outputPath => onQuickPreview({ outputPath, settings, fromCache: false })
            : undefined
    );

    if (
        !fileExists(
            outputPath
        )
    ) {
        throw new Error(
            'Blender finished successfully, but no GLB preview was created.'
        );
    }

    await cleanupCache(
        settings,
        new Set([
            outputPath,
            ...(onQuickPreview && settings.exportMaterials
                ? [cachePath(settings.cacheDirectory, `${cacheKey}.quick.glb`)]
                : [])
        ])
    );

    return {
        outputPath,
        settings,
        fromCache: false
    };
};
}

module.exports = { createPreviewConverter };
