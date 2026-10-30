
import * as THREE
from 'three';

import {
    GLTFLoader
}
from 'three/examples/jsm/loaders/GLTFLoader.js';

import {
    OrbitControls
}
from 'three/examples/jsm/controls/OrbitControls.js';

import { createAnimations } from './animations.js';
import { createLods } from './lods.js';
import { createTextures } from './textures.js';


const config = window.BLENDER_PREVIEW_CONFIG;
const MODEL_SRC = config.modelUrl;
const INITIAL_GRID = config.showGrid;
const INITIAL_WIREFRAME = config.wireframe;
const BACKGROUND = config.background;
const CAMERA_FOV = config.cameraFov;
const PLAY_ICON = config.playIcon;
const STOP_ICON = config.stopIcon;

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

const clock = new THREE.Clock();

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


const animations = createAnimations({ getRoot: () => root, playIcon: PLAY_ICON, stopIcon: STOP_ICON });
const lods = createLods({ getRoot: () => root, updateStats });
const textures = createTextures({ getRoot: () => root });

const progress = document.getElementById('preview-progress');
function setProgress(text, busy = false) {
    progress.textContent = text;
    progress.classList.toggle('busy', busy);
}
if (config.progressive) setProgress('Preparing textures…', true);

window.addEventListener('message', event => {
    const message = event.data;
    if (message?.generation !== config.generation) return;
    if (message.type === 'finalPreviewError') {
        setProgress('Texture preparation failed: ' + message.message);
        return;
    }
    if (message.type !== 'finalPreview') return;
    setProgress('Loading textures…', true);
    loader.load(message.url, gltf => {
        if (!root) {
            installInitialModel(gltf);
            errorBox.style.display = 'none';
            setProgress('');
            return;
        }
        const currentMeshes = [];
        const finalMeshes = [];
        root.traverse(object => { if (object.isMesh) currentMeshes.push(object); });
        gltf.scene.traverse(object => { if (object.isMesh) finalMeshes.push(object); });
        if (currentMeshes.length !== finalMeshes.length ||
            currentMeshes.some((mesh, index) => mesh.name !== finalMeshes[index].name)) {
            setProgress('Texture update failed: model changed.');
            return;
        }
        const oldMaterials = new Set();
        const unusedGeometry = new Set();
        currentMeshes.forEach((mesh, index) => {
            for (const material of (Array.isArray(mesh.material) ? mesh.material : [mesh.material])) {
                if (material) oldMaterials.add(material);
            }
            mesh.material = finalMeshes[index].material;
            unusedGeometry.add(finalMeshes[index].geometry);
        });
        const oldTextures = new Set();
        for (const material of oldMaterials) {
            for (const value of Object.values(material)) if (value?.isTexture) oldTextures.add(value);
            material.dispose();
        }
        for (const texture of oldTextures) texture.dispose();
        for (const geometry of unusedGeometry) geometry?.dispose();
        setWireframe(wireframe);
        textures.setup();
        updateStats();
        setProgress('');
    }, undefined, error => setProgress('Texture loading failed: ' + (error?.message || String(error))));
});

const loader =
    new GLTFLoader();

function installInitialModel(gltf) {
    root = gltf.scene;
    scene.add(root);
    lods.setup();
    textures.setup();
    updateStats();
    setWireframe(wireframe);
    fitModel();
    animations.setup(gltf.animations);
    loading.style.display = 'none';
}

loader.load(
    MODEL_SRC,

    gltf => {
        installInitialModel(gltf);
        if (config.progressive) lods.postMessage({ type: 'previewReady', generation: config.generation });
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
        if (config.progressive) lods.postMessage({ type: 'previewReady', generation: config.generation });
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

    animations.update(delta);

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
