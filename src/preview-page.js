// Generates webview documents; browser rendering runs outside the extension host.
const PLAY_ICON =
    '\u25B6\uFE0E';

const STOP_ICON =
    '\u25A0';

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
    fromCache,
    assets
) {
    const modelSource =
        webview
            .asWebviewUri(
                glbUri
            )
            .toString();

    const cspSource =
        webview.cspSource;

    const scriptSource = webview.asWebviewUri(assets.script).toString();
    const styleSource = webview.asWebviewUri(assets.style).toString();

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
            ${cspSource};

        style-src
            'unsafe-inline'
            ${cspSource};

        img-src
            ${cspSource}
            data:
            blob:;

        connect-src
            ${cspSource}
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



<link rel="stylesheet" href="${escapeHtml(styleSource)}">

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

<script>window.BLENDER_PREVIEW_CONFIG = ${JSON.stringify({
    modelUrl: modelSource,
    showGrid: Boolean(settings.showGrid),
    wireframe: Boolean(settings.wireframe),
    background: settings.background,
    cameraFov: fov,
    playIcon: PLAY_ICON,
    stopIcon: STOP_ICON
}).replace(/</g, '\\u003c')};</script>
<script type="module" src="${escapeHtml(scriptSource)}"></script>

</body>

</html>
`;
}

module.exports = { buildLoadingHtml, buildErrorHtml, buildViewerHtml };
