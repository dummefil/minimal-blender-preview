const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

const CONFIG_SECTION = 'minimalBlenderViewer';
const VIEW_TYPE = 'minimalBlenderViewer.blendViewer';

const THREE_VERSION = '0.164.1';

const PLAY_ICON =
    '\u25B6\uFE0E';

const STOP_ICON =
    '\u25A0';

const openPanels = new Set();

class BlendDocument {
    constructor(uri) {
        this.uri = uri;
    }

    dispose() {}
}

function getConfig(name, fallback) {
    return vscode.workspace
        .getConfiguration(CONFIG_SECTION)
        .get(name, fallback);
}

function expandVariables(value, fileUri) {
    if (typeof value !== 'string' || !value) {
        return value;
    }

    const filePath = fileUri?.fsPath || '';

    const fileDirname = filePath
        ? path.dirname(filePath)
        : '';

    const fileBasename = filePath
        ? path.basename(filePath)
        : '';

    const fileExtension = filePath
        ? path.extname(filePath)
        : '';

    const fileBasenameNoExtension =
        fileBasename && fileExtension
            ? fileBasename.slice(
                0,
                fileBasename.length - fileExtension.length
            )
            : fileBasename;

    let workspaceFolder = '';

    if (fileUri) {
        workspaceFolder =
            vscode.workspace
                .getWorkspaceFolder(fileUri)
                ?.uri
                .fsPath || '';
    }

    if (!workspaceFolder) {
        workspaceFolder =
            vscode.workspace.workspaceFolders?.[0]
                ?.uri
                .fsPath || '';
    }

    const replacements = {
        '${workspaceFolder}': workspaceFolder,

        '${workspaceFolderBasename}':
            workspaceFolder
                ? path.basename(workspaceFolder)
                : '',

        '${file}': filePath,

        '${fileDirname}': fileDirname,

        '${fileBasename}': fileBasename,

        '${fileBasenameNoExtension}':
            fileBasenameNoExtension,

        '${userHome}': os.homedir(),

        '${tmpdir}': os.tmpdir()
    };

    let result = value;

    for (const [
        variable,
        replacement
    ] of Object.entries(replacements)) {
        result = result
            .split(variable)
            .join(replacement);
    }

    result = result.replace(
        /\$\{env:([^}]+)\}/g,
        (_, name) => process.env[name] || ''
    );

    return result;
}

function getSettings(fileUri) {
    const cacheDirectory = expandVariables(
        getConfig(
            'cacheDirectory',
            '${tmpdir}/minimal-blender-preview'
        ),
        fileUri
    );

    return {
        blenderPath: expandVariables(
            getConfig(
                'blenderPath',
                ''
            ),
            fileUri
        ),

        cacheDirectory,

        cacheMaxAgeHours: Number(
            getConfig(
                'cacheMaxAgeHours',
                24
            )
        ),

        cacheMaxSizeMB: Number(
            getConfig(
                'cacheMaxSizeMB',
                500
            )
        ),

        blenderTimeoutSeconds: Number(
            getConfig(
                'blenderTimeoutSeconds',
                120
            )
        ),

        autoReload: Boolean(
            getConfig(
                'autoReload',
                true
            )
        ),

        allowBlenderAutoExec: Boolean(
            getConfig(
                'allowBlenderAutoExec',
                false
            )
        ),

        exportApplyModifiers: Boolean(
            getConfig(
                'exportApplyModifiers',
                true
            )
        ),

        exportMaterials: Boolean(
            getConfig(
                'exportMaterials',
                true
            )
        ),

        exportAnimations: Boolean(
            getConfig(
                'exportAnimations',
                true
            )
        ),

        exportCameras: Boolean(
            getConfig(
                'exportCameras',
                false
            )
        ),

        exportLights: Boolean(
            getConfig(
                'exportLights',
                false
            )
        ),

        showGrid: Boolean(
            getConfig(
                'showGrid',
                true
            )
        ),

        wireframe: Boolean(
            getConfig(
                'wireframe',
                false
            )
        ),

        background: String(
            getConfig(
                'background',
                'theme'
            )
        ),

        cameraFov: Number(
            getConfig(
                'cameraFov',
                45
            )
        )
    };
}

function ensureDirectory(directory) {
    fs.mkdirSync(
        directory,
        {
            recursive: true
        }
    );
}

function createHash(value) {
    return crypto
        .createHash('sha1')
        .update(value)
        .digest('hex');
}

function isPathLike(value) {
    return (
        value.includes('/') ||
        value.includes('\\') ||
        /^[A-Za-z]:/.test(value)
    );
}

function findBlender(settings) {
    if (settings.blenderPath) {
        if (!isPathLike(settings.blenderPath)) {
            return settings.blenderPath;
        }

        if (fs.existsSync(settings.blenderPath)) {
            return settings.blenderPath;
        }

        throw new Error(
            `Blender not found:\n${settings.blenderPath}`
        );
    }

    if (process.env.BLENDER_PATH) {
        const blenderPath =
            expandVariables(
                process.env.BLENDER_PATH
            );

        if (
            !isPathLike(blenderPath) ||
            fs.existsSync(blenderPath)
        ) {
            return blenderPath;
        }
    }

    const candidates = [];

    if (process.platform === 'win32') {
        const programFiles =
            process.env.ProgramFiles ||
            'C:\\Program Files';

        const foundationDirectory =
            path.join(
                programFiles,
                'Blender Foundation'
            );

        if (
            fs.existsSync(
                foundationDirectory
            )
        ) {
            try {
                const versions =
                    fs.readdirSync(
                        foundationDirectory,
                        {
                            withFileTypes: true
                        }
                    )
                        .filter(
                            entry =>
                                entry.isDirectory() &&
                                /^Blender/i.test(
                                    entry.name
                                )
                        )
                        .map(
                            entry =>
                                entry.name
                        )
                        .sort(
                            (a, b) =>
                                b.localeCompare(
                                    a,
                                    undefined,
                                    {
                                        numeric: true
                                    }
                                )
                        );

                for (
                    const version
                    of versions
                ) {
                    candidates.push(
                        path.join(
                            foundationDirectory,
                            version,
                            'blender.exe'
                        )
                    );
                }
            } catch {}
        }

        candidates.push(
            'blender.exe'
        );
    } else if (
        process.platform === 'darwin'
    ) {
        candidates.push(
            '/Applications/Blender.app/Contents/MacOS/Blender'
        );

        candidates.push(
            'blender'
        );
    } else {
        candidates.push(
            '/usr/bin/blender'
        );

        candidates.push(
            '/snap/bin/blender'
        );

        candidates.push(
            'blender'
        );
    }

    for (
        const candidate
        of candidates
    ) {
        if (
            !isPathLike(candidate) ||
            fs.existsSync(candidate)
        ) {
            return candidate;
        }
    }

    return 'blender';
}

function runProcess(
    command,
    args,
    timeoutMs
) {
    return new Promise(
        (resolve, reject) => {
            let stdout = '';
            let stderr = '';

            let finished = false;

            const child = spawn(
                command,
                args,
                {
                    windowsHide: true,
                    shell: false
                }
            );

            const trimOutput = value => {
                const maxLength = 30000;

                if (
                    value.length >
                    maxLength
                ) {
                    return value.slice(
                        value.length -
                        maxLength
                    );
                }

                return value;
            };

            child.stdout.on(
                'data',
                data => {
                    stdout =
                        trimOutput(
                            stdout +
                            data.toString()
                        );
                }
            );

            child.stderr.on(
                'data',
                data => {
                    stderr =
                        trimOutput(
                            stderr +
                            data.toString()
                        );
                }
            );

            const timer = setTimeout(
                () => {
                    if (finished) {
                        return;
                    }

                    finished = true;

                    try {
                        child.kill();
                    } catch {}

                    reject(
                        new Error(
                            `Blender timed out after ${
                                Math.round(
                                    timeoutMs /
                                    1000
                                )
                            } seconds.\n\n${
                                stderr ||
                                stdout
                            }`
                        )
                    );
                },
                timeoutMs
            );

            child.on(
                'error',
                error => {
                    if (finished) {
                        return;
                    }

                    finished = true;

                    clearTimeout(
                        timer
                    );

                    reject(
                        new Error(
                            `Failed to start Blender:\n` +
                            `${error.message}\n\n` +
                            `Set "${CONFIG_SECTION}.blenderPath" ` +
                            `in VS Code settings if Blender is not in PATH.`
                        )
                    );
                }
            );

            child.on(
                'close',
                code => {
                    if (finished) {
                        return;
                    }

                    finished = true;

                    clearTimeout(
                        timer
                    );

                    if (code === 0) {
                        resolve({
                            stdout,
                            stderr
                        });

                        return;
                    }

                    reject(
                        new Error(
                            `Blender exited with code ${code}.\n\n` +
                            `${stderr || stdout}`
                        )
                    );
                }
            );
        }
    );
}

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

async function cleanupCache(
    settings,
    keepFiles = new Set()
) {
    const directory =
        settings.cacheDirectory;

    if (
        !directory ||
        !fs.existsSync(directory)
    ) {
        return;
    }

    const maxAgeMilliseconds =
        Math.max(
            0,
            settings.cacheMaxAgeHours
        ) *
        60 *
        60 *
        1000;

    const maxBytes =
        Math.max(
            1,
            settings.cacheMaxSizeMB
        ) *
        1024 *
        1024;

    const now = Date.now();

    let files = [];

    try {
        for (
            const name
            of fs.readdirSync(
                directory
            )
        ) {
            const filePath =
                path.join(
                    directory,
                    name
                );

            try {
                const stat =
                    fs.statSync(
                        filePath
                    );

                if (
                    !stat.isFile()
                ) {
                    continue;
                }

                files.push({
                    path: filePath,
                    mtimeMs:
                        stat.mtimeMs,
                    size:
                        stat.size
                });
            } catch {}
        }
    } catch {
        return;
    }

    if (
        maxAgeMilliseconds >
        0
    ) {
        for (
            const file
            of files
        ) {
            if (
                keepFiles.has(
                    file.path
                )
            ) {
                continue;
            }

            if (
                now -
                file.mtimeMs >
                maxAgeMilliseconds
            ) {
                try {
                    fs.unlinkSync(
                        file.path
                    );
                } catch {}
            }
        }
    }

    files =
        files.filter(
            file => {
                try {
                    return fs.existsSync(
                        file.path
                    );
                } catch {
                    return false;
                }
            }
        );

    let totalSize =
        files.reduce(
            (
                total,
                file
            ) =>
                total +
                file.size,
            0
        );

    if (
        totalSize <=
        maxBytes
    ) {
        return;
    }

    files.sort(
        (a, b) =>
            a.mtimeMs -
            b.mtimeMs
    );

    for (
        const file
        of files
    ) {
        if (
            totalSize <=
            maxBytes
        ) {
            break;
        }

        if (
            keepFiles.has(
                file.path
            )
        ) {
            continue;
        }

        try {
            fs.unlinkSync(
                file.path
            );

            totalSize -=
                file.size;
        } catch {}
    }
}

async function convertBlendToGlb(
    fileUri
) {
    const sourcePath =
        fileUri.fsPath;

    const settings =
        getSettings(
            fileUri
        );

    ensureDirectory(
        settings.cacheDirectory
    );

    const stat =
        fs.statSync(
            sourcePath
        );

    const fingerprint =
        JSON.stringify({
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
        createHash(
            fingerprint
        )
            .slice(
                0,
                20
            );

    const outputPath =
        path.join(
            settings.cacheDirectory,
            `${cacheKey}.glb`
        );

    if (
        fs.existsSync(
            outputPath
        )
    ) {
        try {
            const now =
                new Date();

            fs.utimesSync(
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

    await runBlenderExport(
        sourcePath,
        outputPath,
        settings,
        cacheKey
    );

    if (
        !fs.existsSync(
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
            outputPath
        ])
    );

    return {
        outputPath,
        settings,
        fromCache: false
    };
}

/*
 * Runs Blender on the source file with the
 * glTF export script. Temporary files are
 * named after scratchName in the cache
 * directory and removed afterwards.
 */
async function runBlenderExport(
    sourcePath,
    outputPath,
    settings,
    scratchName,
    lodLevel = null
) {
    ensureDirectory(
        settings.cacheDirectory
    );

    let inputPath =
        sourcePath;

    let temporaryBlendPath =
        null;

    if (
        sourcePath
            .toLowerCase()
            .endsWith('.blend1')
    ) {
        temporaryBlendPath =
            path.join(
                settings.cacheDirectory,
                `${scratchName}.source.blend`
            );

        fs.copyFileSync(
            sourcePath,
            temporaryBlendPath
        );

        inputPath =
            temporaryBlendPath;
    }

    const pythonScriptPath =
        path.join(
            settings.cacheDirectory,
            `${scratchName}.export.py`
        );

    fs.writeFileSync(
        pythonScriptPath,
        buildExportScript(
            outputPath,
            settings,
            lodLevel
        ),
        'utf8'
    );

    const blender =
        findBlender(
            settings
        );

    const args = [];

    if (
        !settings
            .allowBlenderAutoExec
    ) {
        args.push(
            '--disable-autoexec'
        );
    }

    args.push(
        '--background',
        inputPath,
        '--python',
        pythonScriptPath
    );

    try {
        await runProcess(
            blender,
            args,
            Math.max(
                5,
                settings
                    .blenderTimeoutSeconds
            ) *
                1000
        );
    } finally {
        try {
            fs.unlinkSync(
                pythonScriptPath
            );
        } catch {}

        if (
            temporaryBlendPath
        ) {
            try {
                fs.unlinkSync(
                    temporaryBlendPath
                );
            } catch {}
        }
    }
}

async function exportLod(
    record,
    level
) {
    const sourceUri =
        record.document.uri;

    const sourcePath =
        sourceUri.fsPath;

    const baseName =
        path
            .basename(
                sourcePath
            )
            .replace(
                /\.blend1?$/i,
                ''
            )
            .replace(
                /[-_. ]?LOD[-_. ]?[0-9]+$/i,
                ''
            );

    const target =
        await vscode.window
            .showSaveDialog({
                defaultUri:
                    vscode.Uri.file(
                        path.join(
                            path.dirname(
                                sourcePath
                            ),
                            `${baseName}_LOD${level}.glb`
                        )
                    ),

                filters: {
                    'glTF Binary': [
                        'glb'
                    ]
                },

                saveLabel:
                    `Export LOD${level}`
            });

    if (!target) {
        return false;
    }

    const settings =
        getSettings(
            sourceUri
        );

    const outputPath =
        target.fsPath;

    const scratchName =
        'lod-export-' +
        createHash(
            sourcePath +
            Date.now()
        )
            .slice(
                0,
                12
            );

    try {
        fs.unlinkSync(
            outputPath
        );
    } catch {}

    await vscode.window
        .withProgress(
            {
                location:
                    vscode.ProgressLocation
                        .Notification,

                title:
                    `Exporting LOD${level} with Blender…`
            },
            () =>
                runBlenderExport(
                    sourcePath,
                    outputPath,
                    settings,
                    scratchName,
                    level
                )
        );

    if (
        !fs.existsSync(
            outputPath
        )
    ) {
        throw new Error(
            'Blender finished successfully, but no GLB was written.'
        );
    }

    vscode.window
        .showInformationMessage(
            `Exported LOD${level} to ${path.basename(outputPath)}.`
        );

    return true;
}

async function handleWebviewMessage(
    record,
    message
) {
    if (
        message?.type !==
            'exportLod' ||
        !Number.isInteger(
            message.level
        )
    ) {
        return;
    }

    let exported =
        false;

    try {
        exported =
            await exportLod(
                record,
                message.level
            );
    } catch (error) {
        vscode.window
            .showErrorMessage(
                `LOD${message.level} export failed: ${
                    (
                        error?.message ||
                        String(error)
                    ).slice(
                        0,
                        500
                    )
                }`
            );
    }

    if (
        !record.disposed
    ) {
        record.panel.webview
            .postMessage({
                type:
                    'exportLodDone',

                level:
                    message.level,

                exported
            });
    }
}

function escapeHtml(value) {
    return String(value)
        .replaceAll(
            '&',
            '&amp;'
        )
        .replaceAll(
            '<',
            '&lt;'
        )
        .replaceAll(
            '>',
            '&gt;'
        )
        .replaceAll(
            '"',
            '&quot;'
        )
        .replaceAll(
            "'",
            '&#039;'
        );
}

function buildLoadingHtml() {
    return `
<!DOCTYPE html>

<html>

<body style="
    margin:0;
    height:100vh;

    display:flex;
    align-items:center;
    justify-content:center;

    background:
        var(--vscode-editor-background);

    color:
        var(--vscode-descriptionForeground);

    font-family:
        var(--vscode-font-family);
">

    Converting Blender file to GLB…

</body>

</html>
`;
}

function buildErrorHtml(error) {
    return `
<!DOCTYPE html>

<html>

<body style="
    margin:0;
    padding:24px;

    background:
        var(--vscode-editor-background);

    color:
        var(--vscode-errorForeground);

    font-family:
        var(--vscode-font-family);

    white-space:pre-wrap;
">

${escapeHtml(
    error?.stack ||
    error?.message ||
    String(error)
)}

</body>

</html>
`;
}

function buildViewerHtml(
    webview,
    glbUri,
    settings,
    fromCache
) {
    const modelSource =
        webview
            .asWebviewUri(
                glbUri
            )
            .toString();

    const cspSource =
        webview.cspSource;

    const fov =
        Math.min(
            120,
            Math.max(
                10,
                settings.cameraFov ||
                45
            )
        );

    return `
<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<meta
    http-equiv="Content-Security-Policy"
    content="
        default-src 'none';

        script-src
            'unsafe-inline'
            https://cdn.jsdelivr.net;

        style-src
            'unsafe-inline';

        img-src
            ${cspSource}
            data:
            blob:;

        connect-src
            ${cspSource}
            https://cdn.jsdelivr.net
            data:
            blob:;

        worker-src
            blob:;

        font-src
            ${cspSource}
            data:;
    "
>

<meta
    name="viewport"
    content="
        width=device-width,
        initial-scale=1
    "
>

<script type="importmap">
{
    "imports": {
        "three":
            "https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/build/three.module.js",

        "three/addons/":
            "https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/examples/jsm/"
    }
}
</script>

<style>

* {
    box-sizing: border-box;
}

html,
body {
    margin: 0;

    width: 100%;
    height: 100%;

    overflow: hidden;

    background:
        var(--vscode-editor-background);

    color:
        var(--vscode-editor-foreground);

    font-family:
        var(--vscode-font-family);
}

#app {
    width: 100%;
    height: 100%;

    display: flex;

    flex-direction:
        column;
}

#toolbar,
#status {
    flex: none;

    display: flex;

    align-items:
        center;

    gap: 8px;

    padding:
        5px 10px;

    background:
        var(
            --vscode-sideBar-background,
            var(
                --vscode-editor-background
            )
        );
}

#toolbar {
    min-height:
        36px;

    border-bottom:
        1px solid
        var(
            --vscode-panel-border,
            rgba(
                128,
                128,
                128,
                .3
            )
        );
}

#status {
    min-height:
        26px;

    border-top:
        1px solid
        var(
            --vscode-panel-border,
            rgba(
                128,
                128,
                128,
                .3
            )
        );

    color:
        var(
            --vscode-descriptionForeground
        );

    font-size:
        11px;
}

button {
    min-height:
        26px;

    padding:
        0 9px;

    color:
        var(
            --vscode-button-secondaryForeground,
            var(
                --vscode-editor-foreground
            )
        );

    background:
        var(
            --vscode-button-secondaryBackground,
            transparent
        );

    border:
        1px solid
        var(
            --vscode-panel-border,
            rgba(
                128,
                128,
                128,
                .3
            )
        );

    border-radius:
        4px;

    cursor:
        pointer;
}

button:hover {
    background:
        var(
            --vscode-button-secondaryHoverBackground,
            rgba(
                128,
                128,
                128,
                .15
            )
        );
}

button.active {
    border-color:
        var(
            --vscode-focusBorder
        );
}

#viewport {
    position:
        relative;

    flex:
        1;

    min-height:
        0;
}

canvas {
    display:
        block;

    width:
        100%;

    height:
        100%;
}

#loading,
#error {
    position:
        absolute;

    inset:
        0;

    display:
        flex;

    align-items:
        center;

    justify-content:
        center;

    padding:
        24px;

    background:
        var(
            --vscode-editor-background
        );

    text-align:
        center;
}

#error {
    display:
        none;

    color:
        var(
            --vscode-errorForeground
        );

    white-space:
        pre-wrap;
}

.spacer {
    margin-left:
        auto;
}

.hidden {
    display:
        none !important;
}

button:disabled {
    opacity:
        .5;

    cursor:
        default;

    background:
        var(
            --vscode-button-secondaryBackground,
            transparent
        );
}

#panels {
    position:
        absolute;

    top:
        10px;

    right:
        10px;

    width:
        260px;

    max-height:
        calc(100% - 20px);

    display:
        flex;

    flex-direction:
        column;

    gap: 8px;

    pointer-events:
        none;
}

.panel {
    min-height:
        0;

    display:
        flex;

    flex-direction:
        column;

    pointer-events:
        auto;

    background:
        var(
            --vscode-editorWidget-background,
            var(
                --vscode-sideBar-background,
                var(
                    --vscode-editor-background
                )
            )
        );

    border:
        1px solid
        var(
            --vscode-editorWidget-border,
            var(
                --vscode-panel-border,
                rgba(
                    128,
                    128,
                    128,
                    .3
                )
            )
        );

    border-radius:
        4px;

    box-shadow:
        0 2px 8px
        var(
            --vscode-widget-shadow,
            rgba(
                0,
                0,
                0,
                .35
            )
        );

    font-size:
        12px;
}

.panel-header {
    flex: none;

    display:
        flex;

    align-items:
        center;

    gap: 6px;

    padding:
        6px 8px;

    border-bottom:
        1px solid
        var(
            --vscode-panel-border,
            rgba(
                128,
                128,
                128,
                .3
            )
        );
}

.panel-header__title {
    margin-right:
        auto;

    font-weight:
        600;
}

.panel-header button {
    min-height:
        22px;

    padding:
        0 6px;

    display:
        inline-flex;

    align-items:
        center;

    gap: 4px;

    font-size:
        11px;
}

.panel-list {
    overflow-y:
        auto;

    padding:
        4px 0;
}

.panel-item {
    display:
        flex;

    align-items:
        center;

    gap: 8px;

    padding:
        4px 8px;

    cursor:
        pointer;

    user-select:
        none;
}

.panel-item:hover {
    background:
        var(
            --vscode-list-hoverBackground,
            rgba(
                128,
                128,
                128,
                .15
            )
        );
}

.panel-item.active {
    color:
        var(
            --vscode-list-activeSelectionForeground,
            inherit
        );

    background:
        var(
            --vscode-list-inactiveSelectionBackground,
            rgba(
                128,
                128,
                128,
                .25
            )
        );
}

.panel-item__name {
    flex: 1;

    min-width:
        0;

    overflow:
        hidden;

    text-overflow:
        ellipsis;

    white-space:
        nowrap;
}

.panel-item__meta {
    color:
        var(
            --vscode-descriptionForeground
        );
}

.panel-item .icon,
.panel-header .icon {
    flex: none;

    width:
        16px;

    text-align:
        center;

    line-height:
        1;
}

.icon--play {
    color:
        var(
            --vscode-testing-iconPassed,
            #3fb950
        );
}

.icon--stop {
    color:
        var(
            --vscode-testing-iconFailed,
            #f85149
        );
}

.texture-item {
    flex-wrap:
        wrap;
}

.texture-thumb {
    flex: none;

    width:
        32px;

    height:
        32px;

    border:
        1px solid
        var(
            --vscode-panel-border,
            rgba(
                128,
                128,
                128,
                .3
            )
        );

    border-radius:
        2px;
}

.texture-info {
    flex: 1;

    min-width:
        0;

    display:
        flex;

    flex-direction:
        column;

    gap: 2px;
}

.texture-info__row {
    display:
        flex;

    gap: 8px;
}

.texture-usage {
    color:
        var(
            --vscode-descriptionForeground
        );

    font-size:
        11px;

    overflow-wrap:
        anywhere;
}

.texture-preview {
    width:
        100%;

    border:
        1px solid
        var(
            --vscode-panel-border,
            rgba(
                128,
                128,
                128,
                .3
            )
        );

    border-radius:
        2px;
}

.lod-export {
    flex: none;

    min-height:
        20px;

    padding:
        0 6px;

    font-size:
        11px;
}

</style>

</head>

<body>

<div id="app">

    <div id="toolbar">

        <button
            id="fit"
            type="button"
        >
            Fit
        </button>

        <button
            id="wire"
            type="button"
        >
            Wireframe
        </button>

        <button
            id="grid"
            type="button"
        >
            Grid
        </button>

        <button
            id="anims"
            type="button"
            class="hidden"
        >
            Animations
        </button>

        <button
            id="lods-button"
            type="button"
            title="No LODs in this file"
            disabled
        >
            LOD
        </button>

        <button
            id="textures-button"
            type="button"
            title="No textures in this file"
            disabled
        >
            Textures
        </button>

        <span class="spacer">

            ${
                fromCache
                    ? 'cache'
                    : 'fresh export'
            }

        </span>

    </div>

    <div id="viewport">

        <canvas
            id="canvas"
        ></canvas>

        <div id="loading">
            Loading preview…
        </div>

        <div id="error">
        </div>

        <div id="panels">

        <div
            id="lods"
            class="panel hidden"
        >

            <div class="panel-header">

                <span class="panel-header__title">
                    Level of detail
                </span>

            </div>

            <div
                id="lod-list"
                class="panel-list"
            >
            </div>

        </div>

        <div
            id="animations"
            class="panel hidden"
        >

            <div class="panel-header">

                <span class="panel-header__title">
                    Animations
                </span>

                <button
                    id="play-all"
                    type="button"
                >
                    <span class="icon icon--play">${PLAY_ICON}</span>
                    Play All
                </button>

                <button
                    id="stop-all"
                    type="button"
                >
                    <span class="icon icon--stop">${STOP_ICON}</span>
                    Stop All
                </button>

            </div>

            <div
                id="animation-list"
                class="panel-list"
            >
            </div>

        </div>

        <div
            id="textures"
            class="panel hidden"
        >

            <div class="panel-header">

                <span class="panel-header__title">
                    Textures
                </span>

            </div>

            <div
                id="texture-list"
                class="panel-list"
            >
            </div>

        </div>

        </div>

    </div>

    <div id="status">

        <span id="meshes">
            Meshes: -
        </span>

        <span id="vertices">
            Vertices: -
        </span>

        <span id="triangles">
            Triangles: -
        </span>

        <span id="materials">
            Materials: -
        </span>

        <span id="animation-count">
            Animations: -
        </span>

        <span id="texture-count">
            Textures: -
        </span>

    </div>

</div>

<script type="module">

import * as THREE
from 'three';

import {
    GLTFLoader
}
from 'three/addons/loaders/GLTFLoader.js';

import {
    OrbitControls
}
from 'three/addons/controls/OrbitControls.js';


const MODEL_SRC =
    ${JSON.stringify(
        modelSource
    )};


const INITIAL_GRID =
    ${
        settings.showGrid
            ? 'true'
            : 'false'
    };


const INITIAL_WIREFRAME =
    ${
        settings.wireframe
            ? 'true'
            : 'false'
    };


const BACKGROUND =
    ${JSON.stringify(
        settings.background
    )};


const CAMERA_FOV =
    ${fov};


const PLAY_ICON =
    ${JSON.stringify(
        PLAY_ICON
    )};


const STOP_ICON =
    ${JSON.stringify(
        STOP_ICON
    )};


const canvas =
    document
        .getElementById(
            'canvas'
        );


const viewport =
    document
        .getElementById(
            'viewport'
        );


const loading =
    document
        .getElementById(
            'loading'
        );


const errorBox =
    document
        .getElementById(
            'error'
        );


const wireButton =
    document
        .getElementById(
            'wire'
        );


const gridButton =
    document
        .getElementById(
            'grid'
        );


const renderer =
    new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false
    });


renderer.setPixelRatio(
    Math.min(
        window.devicePixelRatio ||
        1,
        2
    )
);


renderer.outputColorSpace =
    THREE.SRGBColorSpace;


renderer.toneMapping =
    THREE.ACESFilmicToneMapping;


renderer.toneMappingExposure =
    1;


const scene =
    new THREE.Scene();


function resolveBackground() {
    if (
        BACKGROUND &&
        BACKGROUND !==
            'theme'
    ) {
        try {
            return new THREE.Color(
                BACKGROUND
            );
        } catch {}
    }

    const cssColor =
        getComputedStyle(
            document.body
        )
            .getPropertyValue(
                '--vscode-editor-background'
            )
            .trim();

    try {
        return new THREE.Color(
            cssColor ||
            '#1e1e1e'
        );
    } catch {
        return new THREE.Color(
            '#1e1e1e'
        );
    }
}


scene.background =
    resolveBackground();


const camera =
    new THREE.PerspectiveCamera(
        CAMERA_FOV,
        1,
        0.01,
        100000
    );


camera.position.set(
    4,
    3,
    6
);


const controls =
    new OrbitControls(
        camera,
        canvas
    );


controls.enableDamping =
    true;


controls.dampingFactor =
    0.08;


controls.screenSpacePanning =
    true;


scene.add(
    new THREE.HemisphereLight(
        0xffffff,
        0x444444,
        2
    )
);


const keyLight =
    new THREE.DirectionalLight(
        0xffffff,
        2.5
    );


keyLight.position.set(
    5,
    10,
    7
);


scene.add(
    keyLight
);


let root = null;

let grid = null;

let wireframe =
    INITIAL_WIREFRAME;

let gridVisible =
    INITIAL_GRID;

let mixer = null;

let clips = [];

const clipItems =
    new Map();

const clock =
    new THREE.Clock();


const animsButton =
    document
        .getElementById(
            'anims'
        );


const animationsPanel =
    document
        .getElementById(
            'animations'
        );


const animationList =
    document
        .getElementById(
            'animation-list'
        );


function setClipPlaying(
    clip,
    playing
) {
    if (!mixer) {
        return;
    }

    const action =
        mixer.clipAction(
            clip
        );

    if (playing) {
        if (
            !action.isRunning()
        ) {
            action
                .reset()
                .play();
        }
    } else {
        action.stop();
    }

    const item =
        clipItems.get(
            clip
        );

    if (item) {
        item.element
            .classList
            .toggle(
                'active',
                playing
            );

        item.icon.textContent =
            playing
                ? STOP_ICON
                : PLAY_ICON;

        item.icon.className =
            playing
                ? 'icon icon--stop'
                : 'icon icon--play';
    }
}


function isClipPlaying(
    clip
) {
    return Boolean(
        mixer &&
        mixer
            .clipAction(
                clip
            )
            .isRunning()
    );
}


function setAllClipsPlaying(
    playing
) {
    for (
        const clip
        of clips
    ) {
        setClipPlaying(
            clip,
            playing
        );
    }
}


function setupAnimations(
    animations
) {
    clips =
        animations ||
        [];

    clipItems.clear();

    animationList.textContent =
        '';

    document
        .getElementById(
            'animation-count'
        )
        .textContent =
            'Animations: ' +
            clips.length
                .toLocaleString();

    if (
        clips.length ===
        0
    ) {
        return;
    }

    mixer =
        new THREE.AnimationMixer(
            root
        );

    clips.forEach(
        (
            clip,
            index
        ) => {
            const element =
                document
                    .createElement(
                        'div'
                    );

            element.className =
                'panel-item';

            const icon =
                document
                    .createElement(
                        'span'
                    );

            icon.className =
                'icon icon--play';

            icon.textContent =
                PLAY_ICON;

            const name =
                document
                    .createElement(
                        'span'
                    );

            name.className =
                'panel-item__name';

            name.textContent =
                clip.name ||
                'Animation ' +
                (index + 1);

            name.title =
                name.textContent;

            const duration =
                document
                    .createElement(
                        'span'
                    );

            duration.className =
                'panel-item__meta';

            duration.textContent =
                clip.duration
                    .toFixed(2) +
                's';

            element.append(
                icon,
                name,
                duration
            );

            element.addEventListener(
                'click',
                () => {
                    setClipPlaying(
                        clip,
                        !isClipPlaying(
                            clip
                        )
                    );
                }
            );

            clipItems.set(
                clip,
                {
                    element,
                    icon
                }
            );

            animationList
                .appendChild(
                    element
                );
        }
    );

    animsButton.textContent =
        'Animations (' +
        clips.length +
        ')';

    animsButton
        .classList
        .remove(
            'hidden'
        );

    animsButton
        .classList
        .add(
            'active'
        );

    animationsPanel
        .classList
        .remove(
            'hidden'
        );

    setClipPlaying(
        clips[0],
        true
    );
}


animsButton
    .addEventListener(
        'click',
        () => {
            const visible =
                animationsPanel
                    .classList
                    .toggle(
                        'hidden'
                    ) ===
                false;

            animsButton
                .classList
                .toggle(
                    'active',
                    visible
                );
        }
    );


document
    .getElementById(
        'play-all'
    )
    .addEventListener(
        'click',
        () => {
            setAllClipsPlaying(
                true
            );
        }
    );


document
    .getElementById(
        'stop-all'
    )
    .addEventListener(
        'click',
        () => {
            setAllClipsPlaying(
                false
            );
        }
    );


/*
 * LOD objects follow the Unity-style
 * name suffix: Name_LOD0, Name_LOD1, ...
 */
const LOD_PATTERN =
    /LOD[-_. ]?([0-9]+)$/i;

let lodLevels = [];

let activeLod = null;

const lodItems =
    new Map();

const lodExportButtons =
    new Map();

/*
 * Missing outside a VS Code webview;
 * export buttons are left out then.
 */
const vscodeApi =
    typeof acquireVsCodeApi ===
    'function'
        ? acquireVsCodeApi()
        : null;


window.addEventListener(
    'message',
    event => {
        const message =
            event.data;

        if (
            message?.type !==
            'exportLodDone'
        ) {
            return;
        }

        const button =
            lodExportButtons.get(
                message.level
            );

        if (button) {
            button.disabled =
                false;

            button.textContent =
                'Export';
        }
    }
);


const lodsButton =
    document
        .getElementById(
            'lods-button'
        );


const lodsPanel =
    document
        .getElementById(
            'lods'
        );


const lodList =
    document
        .getElementById(
            'lod-list'
        );


function countTriangles(
    object
) {
    let triangles = 0;

    object.traverse(
        child => {
            const geometry =
                child.isMesh &&
                child.geometry;

            if (!geometry) {
                return;
            }

            triangles +=
                (
                    geometry.index
                        ?.count ??
                    geometry.attributes
                        .position
                        ?.count ??
                    0
                ) /
                3;
        }
    );

    return triangles;
}


function collectLods(
    object,
    levels
) {
    const match =
        LOD_PATTERN.exec(
            object.name || ''
        );

    if (
        match &&
        object !== root
    ) {
        const level =
            Number(
                match[1]
            );

        if (
            !levels.has(
                level
            )
        ) {
            levels.set(
                level,
                []
            );
        }

        levels
            .get(
                level
            )
            .push(
                object
            );

        return;
    }

    for (
        const child
        of object.children
    ) {
        collectLods(
            child,
            levels
        );
    }
}


function setActiveLod(
    level
) {
    activeLod =
        level;

    for (
        const entry
        of lodLevels
    ) {
        for (
            const object
            of entry.objects
        ) {
            object.visible =
                entry.level ===
                level;
        }

        lodItems
            .get(
                entry.level
            )
            ?.classList
            .toggle(
                'active',
                entry.level ===
                    level
            );
    }

    updateStats();
}


function setupLods() {
    const levels =
        new Map();

    collectLods(
        root,
        levels
    );

    lodLevels =
        [
            ...levels.entries()
        ]
            .sort(
                (a, b) =>
                    a[0] -
                    b[0]
            )
            .map(
                ([
                    level,
                    objects
                ]) => ({
                    level,
                    objects
                })
            );

    lodItems.clear();

    lodList.textContent =
        '';

    if (
        lodLevels.length <
        2
    ) {
        lodsButton.title =
            lodLevels.length ===
            1
                ? 'Only one LOD in this file'
                : 'No LODs in this file';

        return;
    }

    for (
        const entry
        of lodLevels
    ) {
        const element =
            document
                .createElement(
                    'div'
                );

        element.className =
            'panel-item';

        const name =
            document
                .createElement(
                    'span'
                );

        name.className =
            'panel-item__name';

        name.textContent =
            'LOD' +
            entry.level;

        const triangles =
            document
                .createElement(
                    'span'
                );

        triangles.className =
            'panel-item__meta';

        triangles.textContent =
            Math.round(
                entry.objects
                    .reduce(
                        (
                            total,
                            object
                        ) =>
                            total +
                            countTriangles(
                                object
                            ),
                        0
                    )
            )
                .toLocaleString() +
            ' tris';

        element.append(
            name,
            triangles
        );

        if (vscodeApi) {
            const exportButton =
                document
                    .createElement(
                        'button'
                    );

            exportButton.type =
                'button';

            exportButton.className =
                'lod-export';

            exportButton.textContent =
                'Export';

            exportButton.title =
                'Export LOD' +
                entry.level +
                ' to .glb';

            exportButton.addEventListener(
                'click',
                event => {
                    event.stopPropagation();

                    exportButton.disabled =
                        true;

                    exportButton.textContent =
                        'Exporting…';

                    vscodeApi.postMessage({
                        type:
                            'exportLod',

                        level:
                            entry.level
                    });
                }
            );

            lodExportButtons.set(
                entry.level,
                exportButton
            );

            element.append(
                exportButton
            );
        }

        element.addEventListener(
            'click',
            () => {
                setActiveLod(
                    entry.level
                );
            }
        );

        lodItems.set(
            entry.level,
            element
        );

        lodList
            .appendChild(
                element
            );
    }

    lodsButton.disabled =
        false;

    lodsButton.title =
        '';

    lodsButton.textContent =
        'LOD (' +
        lodLevels.length +
        ')';

    lodsButton
        .classList
        .add(
            'active'
        );

    lodsPanel
        .classList
        .remove(
            'hidden'
        );

    setActiveLod(
        lodLevels[0]
            .level
    );
}


lodsButton
    .addEventListener(
        'click',
        () => {
            const visible =
                lodsPanel
                    .classList
                    .toggle(
                        'hidden'
                    ) ===
                false;

            lodsButton
                .classList
                .toggle(
                    'active',
                    visible
                );
        }
    );


const TEXTURE_SLOTS = {
    map: 'Base color',
    normalMap: 'Normal',
    roughnessMap: 'Roughness',
    metalnessMap: 'Metalness',
    aoMap: 'Occlusion',
    emissiveMap: 'Emissive',
    alphaMap: 'Alpha',
    bumpMap: 'Bump',
    displacementMap: 'Displacement',
    lightMap: 'Light',
    clearcoatMap: 'Clearcoat',
    clearcoatRoughnessMap: 'Clearcoat roughness',
    clearcoatNormalMap: 'Clearcoat normal',
    sheenColorMap: 'Sheen color',
    sheenRoughnessMap: 'Sheen roughness',
    transmissionMap: 'Transmission',
    thicknessMap: 'Thickness',
    specularIntensityMap: 'Specular',
    specularColorMap: 'Specular color',
    iridescenceMap: 'Iridescence',
    iridescenceThicknessMap: 'Iridescence thickness',
    anisotropyMap: 'Anisotropy'
};


const texturesButton =
    document
        .getElementById(
            'textures-button'
        );


const texturesPanel =
    document
        .getElementById(
            'textures'
        );


const textureList =
    document
        .getElementById(
            'texture-list'
        );


/*
 * One entry per image: glTF can reference
 * the same image from several texture
 * objects (e.g. metallic-roughness feeds
 * both the roughness and metalness slots).
 */
function collectTextures() {
    const textures =
        new Map();

    root.traverse(
        object => {
            if (
                !object.isMesh ||
                !object.material
            ) {
                return;
            }

            const materials =
                Array.isArray(
                    object.material
                )
                    ? object.material
                    : [
                        object.material
                    ];

            for (
                const material
                of materials
            ) {
                if (!material) {
                    continue;
                }

                for (
                    const [
                        slot,
                        label
                    ]
                    of Object.entries(
                        TEXTURE_SLOTS
                    )
                ) {
                    const texture =
                        material[
                            slot
                        ];

                    if (
                        !texture?.isTexture
                    ) {
                        continue;
                    }

                    const key =
                        texture.source
                            ?.uuid ||
                        texture.uuid;

                    if (
                        !textures.has(
                            key
                        )
                    ) {
                        textures.set(
                            key,
                            {
                                texture,
                                usage:
                                    new Map()
                            }
                        );
                    }

                    const usage =
                        textures
                            .get(
                                key
                            )
                            .usage;

                    const materialName =
                        material.name ||
                        'Unnamed material';

                    if (
                        !usage.has(
                            materialName
                        )
                    ) {
                        usage.set(
                            materialName,
                            new Set()
                        );
                    }

                    usage
                        .get(
                            materialName
                        )
                        .add(
                            label
                        );
                }
            }
        }
    );

    return [
        ...textures.values()
    ];
}


function drawTexture(
    texture,
    canvas,
    maxSize
) {
    const image =
        texture.image;

    if (
        !image?.width ||
        !image?.height
    ) {
        return false;
    }

    const scale =
        Math.min(
            1,
            maxSize /
            Math.max(
                image.width,
                image.height
            )
        );

    canvas.width =
        Math.max(
            1,
            Math.round(
                image.width *
                scale
            )
        );

    canvas.height =
        Math.max(
            1,
            Math.round(
                image.height *
                scale
            )
        );

    try {
        canvas
            .getContext(
                '2d'
            )
            .drawImage(
                image,
                0,
                0,
                canvas.width,
                canvas.height
            );
    } catch {
        return false;
    }

    return true;
}


function setupTextures() {
    const textures =
        collectTextures();

    textureList.textContent =
        '';

    document
        .getElementById(
            'texture-count'
        )
        .textContent =
            'Textures: ' +
            textures.length
                .toLocaleString();

    if (
        textures.length ===
        0
    ) {
        return;
    }

    textures.forEach(
        (
            entry,
            index
        ) => {
            const texture =
                entry.texture;

            const image =
                texture.image;

            const element =
                document
                    .createElement(
                        'div'
                    );

            element.className =
                'panel-item texture-item';

            const thumb =
                document
                    .createElement(
                        'canvas'
                    );

            thumb.className =
                'texture-thumb';

            drawTexture(
                texture,
                thumb,
                64
            );

            const info =
                document
                    .createElement(
                        'div'
                    );

            info.className =
                'texture-info';

            const row =
                document
                    .createElement(
                        'div'
                    );

            row.className =
                'texture-info__row';

            const name =
                document
                    .createElement(
                        'span'
                    );

            name.className =
                'panel-item__name';

            name.textContent =
                texture.name ||
                'Texture ' +
                (index + 1);

            name.title =
                name.textContent;

            const resolution =
                document
                    .createElement(
                        'span'
                    );

            resolution.className =
                'panel-item__meta';

            resolution.textContent =
                image?.width
                    ? image.width +
                      '×' +
                      image.height
                    : '?';

            row.append(
                name,
                resolution
            );

            const usage =
                document
                    .createElement(
                        'span'
                    );

            usage.className =
                'texture-usage';

            usage.textContent =
                [
                    ...entry.usage
                        .entries()
                ]
                    .map(
                        ([
                            materialName,
                            slots
                        ]) =>
                            materialName +
                            ' (' +
                            [
                                ...slots
                            ].join(
                                ', '
                            ) +
                            ')'
                    )
                    .join(
                        ', '
                    );

            info.append(
                row,
                usage
            );

            element.append(
                thumb,
                info
            );

            let preview =
                null;

            element.addEventListener(
                'click',
                () => {
                    if (preview) {
                        preview.remove();

                        preview =
                            null;

                        element
                            .classList
                            .remove(
                                'active'
                            );

                        return;
                    }

                    preview =
                        document
                            .createElement(
                                'canvas'
                            );

                    preview.className =
                        'texture-preview';

                    if (
                        drawTexture(
                            texture,
                            preview,
                            512
                        )
                    ) {
                        element
                            .appendChild(
                                preview
                            );

                        element
                            .classList
                            .add(
                                'active'
                            );
                    } else {
                        preview =
                            null;
                    }
                }
            );

            textureList
                .appendChild(
                    element
                );
        }
    );

    texturesButton.disabled =
        false;

    texturesButton.title =
        '';

    texturesButton.textContent =
        'Textures (' +
        textures.length +
        ')';
}


texturesButton
    .addEventListener(
        'click',
        () => {
            const visible =
                texturesPanel
                    .classList
                    .toggle(
                        'hidden'
                    ) ===
                false;

            texturesButton
                .classList
                .toggle(
                    'active',
                    visible
                );
        }
    );


function setWireframe(
    enabled
) {
    wireframe =
        enabled;

    wireButton
        .classList
        .toggle(
            'active',
            enabled
        );

    if (!root) {
        return;
    }

    root.traverse(
        object => {
            if (
                !object.isMesh ||
                !object.material
            ) {
                return;
            }

            const materials =
                Array.isArray(
                    object.material
                )
                    ? object.material
                    : [
                        object.material
                    ];

            for (
                const material
                of materials
            ) {
                if (!material) {
                    continue;
                }

                material.wireframe =
                    enabled;

                material.needsUpdate =
                    true;
            }
        }
    );
}


function createGrid(box) {
    if (grid) {
        scene.remove(
            grid
        );

        grid.geometry
            ?.dispose?.();

        const materials =
            Array.isArray(
                grid.material
            )
                ? grid.material
                : [
                    grid.material
                ];

        for (
            const material
            of materials
        ) {
            material
                ?.dispose?.();
        }
    }

    const size =
        box.getSize(
            new THREE.Vector3()
        );

    const maxDimension =
        Math.max(
            size.x,
            size.y,
            size.z,
            1
        );

    const gridSize =
        Math.pow(
            10,
            Math.ceil(
                Math.log10(
                    maxDimension *
                    2
                )
            )
        );

    grid =
        new THREE.GridHelper(
            gridSize,
            20,
            0x777777,
            0x444444
        );

    grid.visible =
        gridVisible;

    scene.add(
        grid
    );
}


function fitModel() {
    if (!root) {
        return;
    }

    const box =
        new THREE.Box3()
            .setFromObject(
                root
            );

    if (
        box.isEmpty()
    ) {
        return;
    }

    const center =
        box.getCenter(
            new THREE.Vector3()
        );

    const size =
        box.getSize(
            new THREE.Vector3()
        );

    const maxDimension =
        Math.max(
            size.x,
            size.y,
            size.z,
            0.001
        );

    const distance =
        (
            maxDimension *
            0.5
        ) /
        Math.tan(
            THREE.MathUtils
                .degToRad(
                    camera.fov *
                    0.5
                )
        );

    const direction =
        new THREE.Vector3(
            1,
            0.65,
            1
        )
            .normalize();

    camera.position.copy(
        center
            .clone()
            .add(
                direction
                    .multiplyScalar(
                        distance *
                        1.6
                    )
            )
    );

    camera.near =
        Math.max(
            maxDimension /
            10000,
            0.001
        );

    camera.far =
        Math.max(
            maxDimension *
            1000,
            1000
        );

    camera
        .updateProjectionMatrix();

    controls.target.copy(
        center
    );

    controls.update();

    createGrid(
        box
    );
}


function updateStats() {
    let meshCount = 0;

    let vertexCount = 0;

    let triangleCount = 0;

    const materials =
        new Set();


    root.traverseVisible(
        object => {
            if (
                !object.isMesh ||
                !object.geometry
            ) {
                return;
            }

            meshCount++;

            const geometry =
                object.geometry;

            const positions =
                geometry.attributes
                    ?.position;

            if (positions) {
                vertexCount +=
                    positions.count;
            }

            if (
                geometry.index
            ) {
                triangleCount +=
                    geometry.index
                        .count /
                    3;
            } else if (
                positions
            ) {
                triangleCount +=
                    positions.count /
                    3;
            }

            const list =
                Array.isArray(
                    object.material
                )
                    ? object.material
                    : [
                        object.material
                    ];

            for (
                const material
                of list
            ) {
                if (
                    material?.uuid
                ) {
                    materials.add(
                        material.uuid
                    );
                }
            }
        }
    );


    document
        .getElementById(
            'meshes'
        )
        .textContent =
            'Meshes: ' +
            meshCount
                .toLocaleString();


    document
        .getElementById(
            'vertices'
        )
        .textContent =
            'Vertices: ' +
            Math.round(
                vertexCount
            )
                .toLocaleString();


    document
        .getElementById(
            'triangles'
        )
        .textContent =
            'Triangles: ' +
            Math.round(
                triangleCount
            )
                .toLocaleString();


    document
        .getElementById(
            'materials'
        )
        .textContent =
            'Materials: ' +
            materials.size
                .toLocaleString();
}


document
    .getElementById(
        'fit'
    )
    .addEventListener(
        'click',
        fitModel
    );


wireButton
    .addEventListener(
        'click',
        () => {
            setWireframe(
                !wireframe
            );
        }
    );


gridButton
    .addEventListener(
        'click',
        () => {
            gridVisible =
                !gridVisible;

            gridButton
                .classList
                .toggle(
                    'active',
                    gridVisible
                );

            if (grid) {
                grid.visible =
                    gridVisible;
            }
        }
    );


gridButton
    .classList
    .toggle(
        'active',
        gridVisible
    );


wireButton
    .classList
    .toggle(
        'active',
        wireframe
    );


const loader =
    new GLTFLoader();


loader.load(
    MODEL_SRC,

    gltf => {
        root =
            gltf.scene;

        scene.add(
            root
        );

        setupLods();

        setupTextures();

        updateStats();

        setWireframe(
            wireframe
        );

        fitModel();

        setupAnimations(
            gltf.animations
        );

        loading.style.display =
            'none';
    },

    undefined,

    error => {
        loading.style.display =
            'none';

        errorBox.style.display =
            'flex';

        errorBox.textContent =
            error?.message ||
            String(error);
    }
);


function resize() {
    const rect =
        viewport
            .getBoundingClientRect();

    const width =
        Math.max(
            1,
            rect.width
        );

    const height =
        Math.max(
            1,
            rect.height
        );

    renderer.setSize(
        width,
        height,
        false
    );

    camera.aspect =
        width /
        height;

    camera
        .updateProjectionMatrix();
}


const resizeObserver =
    new ResizeObserver(
        resize
    );


resizeObserver.observe(
    viewport
);


resize();


function animate() {
    const delta =
        clock.getDelta();

    mixer?.update(
        delta
    );

    controls.update();

    renderer.render(
        scene,
        camera
    );

    requestAnimationFrame(
        animate
    );
}


animate();

</script>

</body>

</html>
`;
}

async function renderPreview(
    record
) {
    if (
        record.disposed
    ) {
        return;
    }

    const generation =
        ++record.generation;

    const {
        panel,
        document
    } = record;

    try {
        panel.webview.html =
            buildLoadingHtml();

        const result =
            await convertBlendToGlb(
                document.uri
            );

        if (
            record.disposed ||
            generation !==
                record.generation
        ) {
            return;
        }

        const cacheUri =
            vscode.Uri.file(
                result.settings
                    .cacheDirectory
            );

        const sourceDirectory =
            vscode.Uri.file(
                path.dirname(
                    document.uri
                        .fsPath
                )
            );

        const roots = [
            cacheUri,
            sourceDirectory,

            ...(
                vscode.workspace
                    .workspaceFolders ||
                []
            ).map(
                folder =>
                    folder.uri
            )
        ];

        panel.webview.options = {
            enableScripts: true,
            localResourceRoots:
                roots
        };

        panel.webview.html =
            buildViewerHtml(
                panel.webview,

                vscode.Uri.file(
                    result.outputPath
                ),

                result.settings,

                result.fromCache
            );
    } catch (error) {
        if (
            record.disposed ||
            generation !==
                record.generation
        ) {
            return;
        }

        panel.webview.html =
            buildErrorHtml(
                error
            );
    }
}

function setupAutoReload(
    record
) {
    const filePath =
        record.document
            .uri
            .fsPath;

    const listener = (
        current,
        previous
    ) => {
        if (
            record.disposed
        ) {
            return;
        }

        if (
            !getSettings(
                record.document.uri
            ).autoReload
        ) {
            return;
        }

        if (
            current.mtimeMs ===
                previous.mtimeMs &&
            current.size ===
                previous.size
        ) {
            return;
        }

        clearTimeout(
            record.reloadTimer
        );

        record.reloadTimer =
            setTimeout(
                () => {
                    renderPreview(
                        record
                    );
                },
                700
            );
    };

    fs.watchFile(
        filePath,
        {
            interval: 800
        },
        listener
    );

    record.stopWatching =
        () => {
            fs.unwatchFile(
                filePath,
                listener
            );
        };
}

class BlendViewerProvider {
    openCustomDocument(uri) {
        return new BlendDocument(
            uri
        );
    }

    async resolveCustomEditor(
        document,
        panel
    ) {
        const record = {
            document,
            panel,

            disposed:
                false,

            generation:
                0,

            reloadTimer:
                null,

            stopWatching:
                null
        };

        openPanels.add(
            record
        );

        setupAutoReload(
            record
        );

        const messageListener =
            panel.webview
                .onDidReceiveMessage(
                    message =>
                        handleWebviewMessage(
                            record,
                            message
                        )
                );

        panel.onDidDispose(
            () => {
                messageListener.dispose();

                record.disposed =
                    true;

                record.generation++;

                clearTimeout(
                    record.reloadTimer
                );

                try {
                    record
                        .stopWatching?.();
                } catch {}

                openPanels.delete(
                    record
                );
            }
        );

        await renderPreview(
            record
        );
    }
}

async function activate(
    context
) {
    const firstWorkspace =
        vscode.workspace
            .workspaceFolders?.[0]
            ?.uri;

    const settings =
        getSettings(
            firstWorkspace
        );

    ensureDirectory(
        settings.cacheDirectory
    );

    cleanupCache(
        settings
    ).catch(
        () => {}
    );

    context.subscriptions.push(
        vscode.window
            .registerCustomEditorProvider(
                VIEW_TYPE,

                new BlendViewerProvider(),

                {
                    supportsMultipleEditorsPerDocument:
                        false,

                    webviewOptions: {
                        retainContextWhenHidden:
                            false
                    }
                }
            ),

        vscode.workspace
            .onDidChangeConfiguration(
                event => {
                    if (
                        !event
                            .affectsConfiguration(
                                CONFIG_SECTION
                            )
                    ) {
                        return;
                    }

                    for (
                        const record
                        of openPanels
                    ) {
                        renderPreview(
                            record
                        );
                    }
                }
            )
    );
}

function deactivate() {
    for (
        const record
        of openPanels
    ) {
        record.disposed =
            true;

        record.generation++;

        clearTimeout(
            record.reloadTimer
        );

        try {
            record
                .stopWatching?.();
        } catch {}
    }

    openPanels.clear();
}

module.exports = {
    activate,
    deactivate
};
