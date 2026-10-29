import { AnimationMixer } from 'three';

// Owns animation actions and their controls for one viewer.
export function createAnimations({ getRoot, playIcon: PLAY_ICON, stopIcon: STOP_ICON }) {
let mixer = null;

let clips = [];

const clipItems =
    new Map();

const animsButton =
    document
        .getElementById(
            'anims'
        );


const animationsPanel =
    document
        .getElementById(
            'animations'
        );


const animationList =
    document
        .getElementById(
            'animation-list'
        );


function setClipPlaying(
    clip,
    playing
) {
    if (!mixer) {
        return;
    }

    const action =
        mixer.clipAction(
            clip
        );

    if (playing) {
        if (
            !action.isRunning()
        ) {
            action
                .reset()
                .play();
        }
    } else {
        action.stop();
    }

    const item =
        clipItems.get(
            clip
        );

    if (item) {
        item.element
            .classList
            .toggle(
                'active',
                playing
            );

        item.icon.textContent =
            playing
                ? STOP_ICON
                : PLAY_ICON;

        item.icon.className =
            playing
                ? 'icon icon--stop'
                : 'icon icon--play';
    }
}


function isClipPlaying(
    clip
) {
    return Boolean(
        mixer &&
        mixer
            .clipAction(
                clip
            )
            .isRunning()
    );
}


function setAllClipsPlaying(
    playing
) {
    for (
        const clip
        of clips
    ) {
        setClipPlaying(
            clip,
            playing
        );
    }
}


function setupAnimations(
    animations
) {
    clips =
        animations ||
        [];

    clipItems.clear();

    animationList.textContent =
        '';

    document
        .getElementById(
            'animation-count'
        )
        .textContent =
            'Animations: ' +
            clips.length
                .toLocaleString();

    if (
        clips.length ===
        0
    ) {
        return;
    }

    mixer =
        new AnimationMixer(
            getRoot()
        );

    clips.forEach(
        (
            clip,
            index
        ) => {
            const element =
                document
                    .createElement(
                        'div'
                    );

            element.className =
                'panel-item';

            const icon =
                document
                    .createElement(
                        'span'
                    );

            icon.className =
                'icon icon--play';

            icon.textContent =
                PLAY_ICON;

            const name =
                document
                    .createElement(
                        'span'
                    );

            name.className =
                'panel-item__name';

            name.textContent =
                clip.name ||
                'Animation ' +
                (index + 1);

            name.title =
                name.textContent;

            const duration =
                document
                    .createElement(
                        'span'
                    );

            duration.className =
                'panel-item__meta';

            duration.textContent =
                clip.duration
                    .toFixed(2) +
                's';

            element.append(
                icon,
                name,
                duration
            );

            element.addEventListener(
                'click',
                () => {
                    setClipPlaying(
                        clip,
                        !isClipPlaying(
                            clip
                        )
                    );
                }
            );

            clipItems.set(
                clip,
                {
                    element,
                    icon
                }
            );

            animationList
                .appendChild(
                    element
                );
        }
    );

    animsButton.textContent =
        'Animations (' +
        clips.length +
        ')';

    animsButton
        .classList
        .remove(
            'hidden'
        );

    animsButton
        .classList
        .add(
            'active'
        );

    animationsPanel
        .classList
        .remove(
            'hidden'
        );

    setClipPlaying(
        clips[0],
        true
    );
}


animsButton
    .addEventListener(
        'click',
        () => {
            const visible =
                animationsPanel
                    .classList
                    .toggle(
                        'hidden'
                    ) ===
                false;

            animsButton
                .classList
                .toggle(
                    'active',
                    visible
                );
        }
    );


document
    .getElementById(
        'play-all'
    )
    .addEventListener(
        'click',
        () => {
            setAllClipsPlaying(
                true
            );
        }
    );


document
    .getElementById(
        'stop-all'
    )
    .addEventListener(
        'click',
        () => {
            setAllClipsPlaying(
                false
            );
        }
    );



return { setup: setupAnimations, update: delta => mixer?.update(delta) };
}
