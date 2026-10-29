// Owns LOD selection and export requests for one viewer.
export function createLods({ getRoot, updateStats }) {
/*
 * LOD objects follow the Unity-style
 * name suffix: Name_LOD0, Name_LOD1, ...
 */
const LOD_PATTERN =
    /LOD[-_. ]?([0-9]+)$/i;

let lodLevels = [];

let activeLod = null;

const lodItems =
    new Map();

const lodExportButtons =
    new Map();

/*
 * Missing outside a VS Code webview;
 * export buttons are left out then.
 */
const vscodeApi =
    typeof acquireVsCodeApi ===
    'function'
        ? acquireVsCodeApi()
        : null;


window.addEventListener(
    'message',
    event => {
        const message =
            event.data;

        if (
            message?.type !==
            'exportLodDone'
        ) {
            return;
        }

        const button =
            lodExportButtons.get(
                message.level
            );

        if (button) {
            button.disabled =
                false;

            button.textContent =
                'Export';
        }
    }
);


const lodsButton =
    document
        .getElementById(
            'lods-button'
        );


const lodsPanel =
    document
        .getElementById(
            'lods'
        );


const lodList =
    document
        .getElementById(
            'lod-list'
        );


function countTriangles(
    object
) {
    let triangles = 0;

    object.traverse(
        child => {
            const geometry =
                child.isMesh &&
                child.geometry;

            if (!geometry) {
                return;
            }

            triangles +=
                (
                    geometry.index
                        ?.count ??
                    geometry.attributes
                        .position
                        ?.count ??
                    0
                ) /
                3;
        }
    );

    return triangles;
}


function collectLods(
    object,
    levels
) {
    const match =
        LOD_PATTERN.exec(
            object.name || ''
        );

    if (
        match &&
        object !== getRoot()
    ) {
        const level =
            Number(
                match[1]
            );

        if (
            !levels.has(
                level
            )
        ) {
            levels.set(
                level,
                []
            );
        }

        levels
            .get(
                level
            )
            .push(
                object
            );

        return;
    }

    for (
        const child
        of object.children
    ) {
        collectLods(
            child,
            levels
        );
    }
}


function setActiveLod(
    level
) {
    activeLod =
        level;

    for (
        const entry
        of lodLevels
    ) {
        for (
            const object
            of entry.objects
        ) {
            object.visible =
                entry.level ===
                level;
        }

        lodItems
            .get(
                entry.level
            )
            ?.classList
            .toggle(
                'active',
                entry.level ===
                    level
            );
    }

    updateStats();
}


function setupLods() {
    const levels =
        new Map();

    collectLods(
        getRoot(),
        levels
    );

    lodLevels =
        [
            ...levels.entries()
        ]
            .sort(
                (a, b) =>
                    a[0] -
                    b[0]
            )
            .map(
                ([
                    level,
                    objects
                ]) => ({
                    level,
                    objects
                })
            );

    lodItems.clear();

    lodList.textContent =
        '';

    if (
        lodLevels.length <
        2
    ) {
        lodsButton.title =
            lodLevels.length ===
            1
                ? 'Only one LOD in this file'
                : 'No LODs in this file';

        return;
    }

    for (
        const entry
        of lodLevels
    ) {
        const element =
            document
                .createElement(
                    'div'
                );

        element.className =
            'panel-item';

        const name =
            document
                .createElement(
                    'span'
                );

        name.className =
            'panel-item__name';

        name.textContent =
            'LOD' +
            entry.level;

        const triangles =
            document
                .createElement(
                    'span'
                );

        triangles.className =
            'panel-item__meta';

        triangles.textContent =
            Math.round(
                entry.objects
                    .reduce(
                        (
                            total,
                            object
                        ) =>
                            total +
                            countTriangles(
                                object
                            ),
                        0
                    )
            )
                .toLocaleString() +
            ' tris';

        element.append(
            name,
            triangles
        );

        if (vscodeApi) {
            const exportButton =
                document
                    .createElement(
                        'button'
                    );

            exportButton.type =
                'button';

            exportButton.className =
                'lod-export';

            exportButton.textContent =
                'Export';

            exportButton.title =
                'Export LOD' +
                entry.level +
                ' to .glb';

            exportButton.addEventListener(
                'click',
                event => {
                    event.stopPropagation();

                    exportButton.disabled =
                        true;

                    exportButton.textContent =
                        'Exporting…';

                    vscodeApi.postMessage({
                        type:
                            'exportLod',

                        level:
                            entry.level
                    });
                }
            );

            lodExportButtons.set(
                entry.level,
                exportButton
            );

            element.append(
                exportButton
            );
        }

        element.addEventListener(
            'click',
            () => {
                setActiveLod(
                    entry.level
                );
            }
        );

        lodItems.set(
            entry.level,
            element
        );

        lodList
            .appendChild(
                element
            );
    }

    lodsButton.disabled =
        false;

    lodsButton.title =
        '';

    lodsButton.textContent =
        'LOD (' +
        lodLevels.length +
        ')';

    lodsButton
        .classList
        .add(
            'active'
        );

    lodsPanel
        .classList
        .remove(
            'hidden'
        );

    setActiveLod(
        lodLevels[0]
            .level
    );
}


lodsButton
    .addEventListener(
        'click',
        () => {
            const visible =
                lodsPanel
                    .classList
                    .toggle(
                        'hidden'
                    ) ===
                false;

            lodsButton
                .classList
                .toggle(
                    'active',
                    visible
                );
        }
    );



return { setup: setupLods };
}
