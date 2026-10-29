// Owns the texture inventory and texture panel for one viewer.
export function createTextures({ getRoot }) {
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

    getRoot().traverse(
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



return { setup: setupTextures };
}
