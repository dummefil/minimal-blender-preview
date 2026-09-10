import * as THREE from 'three';

import {
    GLTFLoader
} from 'three/examples/jsm/loaders/GLTFLoader.js';

import {
    OrbitControls
} from 'three/examples/jsm/controls/OrbitControls.js';


const config = window.BLENDER_PREVIEW_CONFIG || {};


const MODEL_SRC =
    config.modelUrl || '';


const INITIAL_GRID =
    config.showGrid ?? true;


const INITIAL_WIREFRAME =
    config.wireframe ?? false;


const BACKGROUND =
    config.background ?? 'theme';


const CAMERA_FOV =
    Math.min(
        120,
        Math.max(
            10,
            Number(
                config.cameraFov ?? 45
            )
        )
    );


const canvas =
    document.getElementById(
        'canvas'
    );


const viewport =
    document.getElementById(
        'viewport'
    );


const loading =
    document.getElementById(
        'loading'
    );


const errorBox =
    document.getElementById(
        'error'
    );


const fitButton =
    document.getElementById(
        'fit'
    );


const wireButton =
    document.getElementById(
        'wire'
    );


const gridButton =
    document.getElementById(
        'grid'
    );


const meshesElement =
    document.getElementById(
        'meshes'
    );


const verticesElement =
    document.getElementById(
        'vertices'
    );


const trianglesElement =
    document.getElementById(
        'triangles'
    );


const materialsElement =
    document.getElementById(
        'materials'
    );


let root = null;

let grid = null;

let wireframe =
    INITIAL_WIREFRAME;

let gridVisible =
    INITIAL_GRID;

let animationFrame =
    null;


function showError(
    message
) {
    if (loading) {
        loading.style.display =
            'none';
    }

    if (errorBox) {
        errorBox.style.display =
            'flex';

        errorBox.textContent =
            message;
    }
}


function hideLoading() {
    if (loading) {
        loading.style.display =
            'none';
    }
}


if (!canvas) {
    throw new Error(
        'Canvas element #canvas was not found.'
    );
}


if (!viewport) {
    throw new Error(
        'Viewport element #viewport was not found.'
    );
}


const renderer =
    new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false
    });


renderer.setPixelRatio(
    Math.min(
        window.devicePixelRatio || 1,
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


function resolveBackgroundColor() {
    if (
        BACKGROUND &&
        BACKGROUND !== 'theme'
    ) {
        try {
            return new THREE.Color(
                BACKGROUND
            );
        } catch {
            // Fall back to VS Code theme.
        }
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
    resolveBackgroundColor();


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


controls.enablePan =
    true;


controls.enableZoom =
    true;


controls.enableRotate =
    true;


controls.minDistance =
    0.001;


controls.maxDistance =
    100000;


const hemisphereLight =
    new THREE.HemisphereLight(
        0xffffff,
        0x444444,
        2
    );


scene.add(
    hemisphereLight
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


const fillLight =
    new THREE.DirectionalLight(
        0xffffff,
        1
    );


fillLight.position.set(
    -5,
    4,
    -4
);


scene.add(
    fillLight
);


function getModelBounds() {
    if (!root) {
        return null;
    }


    const box =
        new THREE.Box3()
            .setFromObject(
                root
            );


    if (
        box.isEmpty()
    ) {
        return null;
    }


    return box;
}


function disposeGrid() {
    if (!grid) {
        return;
    }


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


    grid =
        null;
}


function createGrid(
    box
) {
    disposeGrid();


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


    let gridSize =
        Math.pow(
            10,
            Math.ceil(
                Math.log10(
                    maxDimension *
                    2
                )
            )
        );


    if (
        !Number.isFinite(
            gridSize
        ) ||
        gridSize <= 0
    ) {
        gridSize =
            10;
    }


    grid =
        new THREE.GridHelper(
            gridSize,
            20,
            0x777777,
            0x444444
        );


    /*
     * glTF uses Y-up.
     *
     * Put the grid at the lowest point
     * of the rendered model instead of
     * blindly using world Y = 0.
     */
    grid.position.y =
        box.min.y -
        maxDimension *
        0.001;


    grid.visible =
        gridVisible;


    scene.add(
        grid
    );
}


function fitModel() {
    const box =
        getModelBounds();


    if (!box) {
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


    const fovRadians =
        THREE.MathUtils.degToRad(
            camera.fov
        );


    const distance =
        (
            maxDimension *
            0.5
        ) /
        Math.tan(
            fovRadians *
            0.5
        );


    /*
     * Default isometric-ish viewing
     * direction.
     */
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


    camera.updateProjectionMatrix();


    controls.target.copy(
        center
    );


    controls.update();


    createGrid(
        box
    );
}


function setWireframe(
    enabled
) {
    wireframe =
        enabled;


    if (wireButton) {
        wireButton
            .classList
            .toggle(
                'active',
                enabled
            );
    }


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


function setGridVisible(
    enabled
) {
    gridVisible =
        enabled;


    if (gridButton) {
        gridButton
            .classList
            .toggle(
                'active',
                enabled
            );
    }


    if (grid) {
        grid.visible =
            enabled;
    }
}


function updateStats() {
    if (!root) {
        return;
    }


    let meshCount =
        0;


    let vertexCount =
        0;


    let triangleCount =
        0;


    const materials =
        new Set();


    root.traverse(
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


            const positionAttribute =
                geometry.attributes
                    ?.position;


            if (
                positionAttribute
            ) {
                vertexCount +=
                    positionAttribute
                        .count;
            }


            if (
                geometry.index
            ) {
                triangleCount +=
                    geometry.index
                        .count /
                    3;
            } else if (
                positionAttribute
            ) {
                triangleCount +=
                    positionAttribute
                        .count /
                    3;
            }


            const materialList =
                Array.isArray(
                    object.material
                )
                    ? object.material
                    : [
                        object.material
                    ];


            for (
                const material
                of materialList
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


    if (meshesElement) {
        meshesElement.textContent =
            'Meshes: ' +
            meshCount
                .toLocaleString();
    }


    if (verticesElement) {
        verticesElement.textContent =
            'Vertices: ' +
            Math.round(
                vertexCount
            )
                .toLocaleString();
    }


    if (trianglesElement) {
        trianglesElement.textContent =
            'Triangles: ' +
            Math.round(
                triangleCount
            )
                .toLocaleString();
    }


    if (materialsElement) {
        materialsElement.textContent =
            'Materials: ' +
            materials.size
                .toLocaleString();
    }
}


function resize() {
    const rect =
        viewport
            .getBoundingClientRect();


    const width =
        Math.max(
            1,
            Math.floor(
                rect.width
            )
        );


    const height =
        Math.max(
            1,
            Math.floor(
                rect.height
            )
        );


    renderer.setSize(
        width,
        height,
        false
    );


    camera.aspect =
        width /
        height;


    camera.updateProjectionMatrix();
}


function animate() {
    controls.update();


    renderer.render(
        scene,
        camera
    );


    animationFrame =
        requestAnimationFrame(
            animate
        );
}


function disposeMaterial(
    material
) {
    if (!material) {
        return;
    }


    /*
     * Dispose textures referenced by
     * the imported material.
     */
    for (
        const value
        of Object.values(
            material
        )
    ) {
        if (
            value &&
            value.isTexture
        ) {
            value.dispose();
        }
    }


    material.dispose?.();
}


function disposeObject(
    object
) {
    object.traverse(
        child => {
            child.geometry
                ?.dispose?.();


            if (
                Array.isArray(
                    child.material
                )
            ) {
                for (
                    const material
                    of child.material
                ) {
                    disposeMaterial(
                        material
                    );
                }
            } else {
                disposeMaterial(
                    child.material
                );
            }
        }
    );
}


if (fitButton) {
    fitButton.addEventListener(
        'click',
        () => {
            fitModel();
        }
    );
}


if (wireButton) {
    wireButton.addEventListener(
        'click',
        () => {
            setWireframe(
                !wireframe
            );
        }
    );
}


if (gridButton) {
    gridButton.addEventListener(
        'click',
        () => {
            setGridVisible(
                !gridVisible
            );
        }
    );
}


setGridVisible(
    gridVisible
);


setWireframe(
    wireframe
);


const resizeObserver =
    new ResizeObserver(
        () => {
            resize();
        }
    );


resizeObserver.observe(
    viewport
);


resize();


async function loadModel() {
    if (!MODEL_SRC) {
        showError(
            'No model URL was provided by the extension.'
        );

        return;
    }


    const loader =
        new GLTFLoader();


    try {
        const gltf =
            await loader.loadAsync(
                MODEL_SRC
            );


        root =
            gltf.scene;


        if (!root) {
            throw new Error(
                'GLB does not contain a scene.'
            );
        }


        scene.add(
            root
        );


        updateStats();


        setWireframe(
            wireframe
        );


        fitModel();


        hideLoading();
    } catch (error) {
        console.error(
            '[Minimal Blender Viewer]',
            error
        );


        showError(
            error?.message ||
            String(error)
        );
    }
}


window.addEventListener(
    'beforeunload',
    () => {
        if (
            animationFrame !==
            null
        ) {
            cancelAnimationFrame(
                animationFrame
            );
        }


        resizeObserver.disconnect();


        controls.dispose();


        disposeGrid();


        if (root) {
            scene.remove(
                root
            );


            disposeObject(
                root
            );


            root =
                null;
        }


        renderer.dispose();
    }
);


animate();


loadModel();