// Runs Blender as a child process and manages its temporary export files.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { CONFIG_SECTION } = require('./settings');
const { ensureDirectory } = require('./preview-cache');
const { buildExportScript } = require('./blender-export-script');

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

module.exports = { runBlenderExport, runProcess };
