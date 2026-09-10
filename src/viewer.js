const THREEPIPE_VERSION = '0.5.1';
const BLEND_VERSION = '0.1.0';

const THREEPIPE_CDN =
    `https://unpkg.com/threepipe@${THREEPIPE_VERSION}/dist/index.js`;

const BLEND_CDN =
    `https://unpkg.com/@threepipe/plugin-blend-importer@${BLEND_VERSION}/dist/index.js`;

function buildBlendPage(webview, fileUri) {
    const src = webview.asWebviewUri(fileUri).toString();

    return `
<!DOCTYPE html>

<html>
<head>
<meta charset="UTF-8">

<meta
    http-equiv="Content-Security-Policy"
    content="
        default-src 'none';
        script-src 'unsafe-inline' https://unpkg.com;
        style-src 'unsafe-inline';
        img-src ${webview.cspSource} https: data: blob:;
        connect-src ${webview.cspSource} https: data: blob:;
        worker-src blob:;
    "
>

<meta
    name="viewport"
    content="width=device-width, initial-scale=1"
>

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

    background: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);

    font-family: var(--vscode-font-family);
}

#app {
    width: 100%;
    height: 100%;

    display: flex;
    flex-direction: column;
}

#toolbar {
    height: 36px;

    display: flex;
    align-items: center;

    gap: 8px;

    padding: 4px 10px;

    border-bottom:
        1px solid
        var(--vscode-panel-border);
}

button {
    color:
        var(--vscode-button-secondaryForeground);

    background:
        var(--vscode-button-secondaryBackground);

    border: none;

    padding: 5px 10px;

    cursor: pointer;
}

button:hover {
    background:
        var(--vscode-button-secondaryHoverBackground);
}

button.active {
    outline:
        1px solid
        var(--vscode-focusBorder);
}

#viewport {
    flex: 1;

    min-height: 0;

    position: relative;
}

canvas {
    width: 100%;
    height: 100%;

    display: block;
}

#loading,
#error {
    position: absolute;

    inset: 0;

    display: flex;
    align-items: center;
    justify-content: center;

    background:
        var(--vscode-editor-background);
}

#error {
    display: none;

    color:
        var(--vscode-errorForeground);
}

#status {
    height: 26px;

    display: flex;
    align-items: center;

    gap: 16px;

    padding: 0 10px;

    border-top:
        1px solid
        var(--vscode-panel-border);

    color:
        var(--vscode-descriptionForeground);

    font-size: 11px;
}

</style>
</head>

<body>

<div id="app">

    <div id="toolbar">

        <button id="fit">
            Fit
        </button>

        <button id="wire">
            Wireframe
        </button>

        <span>
            BLEND
        </span>

    </div>

    <div id="viewport">

        <canvas id="canvas"></canvas>

        <div id="loading">
            Loading .blend...
        </div>

        <div id="error"></div>

    </div>

    <div id="status">

        <span id="meshes">
            Meshes: -
        </span>

        <span id="vertices">
            Vertices: -
        </span>

        <span id="materials">
            Materials: -
        </span>

    </div>

</div>

<script>

(() => {

    const MODEL_SRC =
        ${JSON.stringify(src)};

    const THREEPIPE_URL =
        ${JSON.stringify(THREEPIPE_CDN)};

    const BLEND_URL =
        ${JSON.stringify(BLEND_CDN)};

    const canvas =
        document.getElementById('canvas');

    const loading =
        document.getElementById('loading');

    const error =
        document.getElementById('error');

    let viewer = null;

    let wireframe = false;


    function fail(message) {

        loading.style.display = 'none';

        error.style.display = 'flex';

        error.textContent = message;

    }


    function loadScript(url) {

        return new Promise(
            (resolve, reject) => {

                const script =
                    document.createElement('script');

                script.src = url;

                script.onload =
                    resolve;

                script.onerror =
                    () => reject(
                        new Error(
                            'Failed loading ' + url
                        )
                    );

                document.head
                    .appendChild(script);

            }
        );

    }


    function updateStats(model) {

        let meshes = 0;

        let vertices = 0;

        const materials =
            new Set();


        model.traverse(
            object => {

                if (!object.isMesh) {
                    return;
                }


                meshes++;


                const position =
                    object.geometry
                        ?.attributes
                        ?.position;


                if (position) {

                    vertices +=
                        position.count;

                }


                const list =
                    Array.isArray(
                        object.material
                    )
                        ? object.material
                        : [object.material];


                for (
                    const material
                    of list
                ) {

                    if (material?.uuid) {

                        materials.add(
                            material.uuid
                        );

                    }

                }

            }
        );


        document
            .getElementById('meshes')
            .textContent =
                'Meshes: ' + meshes;


        document
            .getElementById('vertices')
            .textContent =
                'Vertices: ' + vertices;


        document
            .getElementById('materials')
            .textContent =
                'Materials: '
                + materials.size;

    }


    async function start() {

        try {

            await loadScript(
                THREEPIPE_URL
            );


            const tp =
                window.threepipe
                || window.THREEPIPE;


            if (!tp?.ThreeViewer) {

                throw new Error(
                    'ThreeViewer not found'
                );

            }


            await loadScript(
                BLEND_URL
            );


            const blend =
                window[
                    '@threepipe/plugin-blend-importer'
                ];


            if (!blend?.BlendLoadPlugin) {

                throw new Error(
                    'BlendLoadPlugin not found'
                );

            }


            viewer =
                new tp.ThreeViewer({

                    canvas,

                    msaa: true,

                    rgbm: false,

                    tonemap: true

                });


            viewer.addPluginSync(
                new blend.BlendLoadPlugin()
            );


            const model =
                await viewer.load(
                    MODEL_SRC,
                    {
                        autoCenter: true,
                        autoScale: true
                    }
                );


            loading.style.display =
                'none';


            updateStats(model);


            viewer
                .setEnvironmentMap(
                    'https://samples.threepipe.org/minimal/venice_sunset_1k.hdr',
                    {
                        setBackground: false
                    }
                )
                .catch(() => {});


        } catch (e) {

            fail(
                e?.message
                || String(e)
            );

        }

    }


    document
        .getElementById('fit')
        .addEventListener(
            'click',
            () => {

                if (
                    viewer
                    ?.scene
                    ?.modelRoot
                ) {

                    viewer.fitView(
                        viewer.scene.modelRoot
                    );

                }

            }
        );


    document
        .getElementById('wire')
        .addEventListener(
            'click',
            function () {

                wireframe =
                    !wireframe;


                this.classList.toggle(
                    'active',
                    wireframe
                );


                viewer
                    ?.scene
                    ?.traverse(
                        object => {

                            if (
                                !object.isMesh
                                || !object.material
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

                                material.wireframe =
                                    wireframe;

                            }

                        }
                    );

            }
        );


    start();

})();

</script>

</body>
</html>
`;

}

module.exports = {
    buildBlendPage
};