// Handles webview export requests at the VS Code and Blender boundaries.
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getSettings } = require('./settings');
const { runBlenderExport } = require('./blender-process');

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

    if (
        path.extname(outputPath)
            .toLowerCase() !== '.glb'
    ) {
        throw new Error(
            'Choose a .glb output file.'
        );
    }

    const scratchName =
        'lod-export-' +
        crypto.randomUUID();

    const temporaryOutputPath =
        path.join(
            path.dirname(outputPath),
            `.${scratchName}.glb`
        );

    try {
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
                        temporaryOutputPath,
                        settings,
                        scratchName,
                        level
                    )
            );

        if (
            !fs.existsSync(
                temporaryOutputPath
            )
        ) {
            throw new Error(
                'Blender finished successfully, but no GLB was written.'
            );
        }

        fs.renameSync(
            temporaryOutputPath,
            outputPath
        );
    } finally {
        fs.rmSync(
            temporaryOutputPath,
            { force: true }
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

module.exports = { handleWebviewMessage };
