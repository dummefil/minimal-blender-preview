// Reads VS Code configuration and expands paths at the host boundary.
const vscode = require('vscode');
const path = require('path');
const os = require('os');

const CONFIG_SECTION = 'minimalBlenderViewer';

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

/**
 * @typedef {object} PreviewSettings
 * @property {string} blenderPath Executable name or absolute path.
 * @property {string} cacheDirectory Directory for generated previews and scratch files.
 * @property {number} cacheMaxAgeHours Maximum cache age; zero disables age eviction.
 * @property {number} cacheMaxSizeMB Maximum total cache size.
 * @property {number} blenderTimeoutSeconds Maximum time for a Blender process.
 * @property {boolean} autoReload Reload when the source file changes.
 * @property {boolean} allowBlenderAutoExec Allow scripts embedded in the input file.
 * @property {boolean} exportApplyModifiers
 * @property {boolean} exportMaterials
 * @property {boolean} exportAnimations
 * @property {boolean} exportCameras
 * @property {boolean} exportLights
 * @property {boolean} showGrid
 * @property {boolean} wireframe
 * @property {string} background
 * @property {number} cameraFov
 */
/** @returns {PreviewSettings} */
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

module.exports = { CONFIG_SECTION, getSettings };
