// VS Code adapter: owns editor lifetimes, preview requests and webview messages.
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { runBlenderExport } = require('./blender-process');
const { handleWebviewMessage } = require('./lod-export');
const { createPreviewConverter } = require('./preview-conversion');
const { ensureDirectory, cleanupCache } = require('./preview-cache');
const { buildLoadingHtml, buildErrorHtml, buildViewerHtml } = require('./preview-page');

const { CONFIG_SECTION, getSettings } = require('./settings');
const VIEW_TYPE = 'minimalBlenderViewer.blendViewer';

/** @type {Set<{document: BlendDocument, panel: import('vscode').WebviewPanel, runtimeDirectory: import('vscode').Uri, disposed: boolean, generation: number, reloadTimer: NodeJS.Timeout|null, stopWatching: Function|null}>} */
const openPanels = new Set();

const createPreview = createPreviewConverter({
    prepareCache: ensureDirectory,
    inspectSource: fs.statSync,
    cachePath: path.join,
    hashFingerprint: value => crypto.createHash('sha1').update(value).digest('hex'),
    fileExists: fs.existsSync,
    touch: fs.utimesSync,
    exportBlend: runBlenderExport,
    cleanupCache
});

class BlendDocument {
    constructor(uri) {
        this.uri = uri;
    }

    dispose() {}
}

async function convertBlendToGlb(fileUri) {
    return createPreview(fileUri.fsPath, getSettings(fileUri));
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
            record.runtimeDirectory,

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

                result.fromCache,

                {
                    script: vscode.Uri.joinPath(record.runtimeDirectory, 'preview.js'),
                    style: vscode.Uri.joinPath(record.runtimeDirectory, 'preview.css')
                }
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
    constructor(runtimeDirectory) {
        this.runtimeDirectory = runtimeDirectory;
    }

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
            runtimeDirectory: this.runtimeDirectory,

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

                new BlendViewerProvider(vscode.Uri.joinPath(context.extensionUri, 'dist')),

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

    if (
        context.extensionMode === vscode.ExtensionMode.Development &&
        process.env.MINIMAL_BLENDER_PREVIEW_FOCUS === '1'
    ) {
        await vscode.commands.executeCommand('workbench.action.closeSidebar');
        await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
        await vscode.commands.executeCommand('workbench.action.closePanel');
    }

    if (
        context.extensionMode === vscode.ExtensionMode.Development &&
        process.env.MINIMAL_BLENDER_PREVIEW_AUTO_RELOAD === '1'
    ) {
        const devReload = require('../.vscode/dev-reload');
        devReload.start(context);
        await devReload.restore(context);
    }
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
