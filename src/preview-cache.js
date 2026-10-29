// Owns cache directory creation and eviction; callers identify files to retain.
const fs = require('fs');
const path = require('path');

function ensureDirectory(directory) {
    fs.mkdirSync(
        directory,
        {
            recursive: true
        }
    );
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

module.exports = { ensureDirectory, cleanupCache };
