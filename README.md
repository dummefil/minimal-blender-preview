# Minimal Blender Viewer

[![Download on VS Code Marketplace](https://img.shields.io/badge/Download-VS%20Code%20Marketplace-0078D4?style=for-the-badge&logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=dummefil.minimal-blender-preview)

Preview Blender `.blend` and `.blend1` files directly in Visual Studio Code.

## Requirements

- Visual Studio Code 1.85.0 or newer.
- Blender installed on your computer. Blender is used to generate the 3D preview and is not included with this extension.

## Setup

1. Install Blender if it is not already installed.
2. Open a `.blend` file in VS Code.
3. The extension attempts to find Blender automatically. If Blender is not found, open VS Code Settings (`Ctrl+,` on Windows/Linux or `Cmd+,` on macOS), search for **Minimal Blender Viewer**, and set **Blender Path** to the Blender executable.
4. Reopen the `.blend` file after changing the path.

You can also set the path in your VS Code `settings.json`. For example, on Windows:

```json
{
  "minimalBlenderViewer.blenderPath": "C:\\Program Files\\Blender Foundation\\Blender 4.5\\blender.exe"
}
```

Replace this example with the actual path to your installed Blender executable. The version in the example is not a minimum version requirement.

Typical executable paths:

- **Windows:** `C:\Program Files\Blender Foundation\Blender <version>\blender.exe`
- **macOS:** `/Applications/Blender.app/Contents/MacOS/Blender`
- **Linux:** `/usr/bin/blender` (the location depends on how Blender was installed).

Leave **Blender Path** empty to use automatic detection.

## Settings

Open VS Code Settings and search for **Minimal Blender Viewer** to configure the Blender path, preview cache, export options, grid, and wireframe display.

The extension hides VS Code's editor type selector in breadcrumbs by default, including for other editors. Set `"breadcrumbs.showEditorType": true` in VS Code settings to show it again.

## Animations

Blender actions are exported as animation clips (disable with **Export Animations**). When a file contains animations, an **Animations** panel lists every clip and the first one starts playing: click a clip to play or stop it, or use **Play All** / **Stop All**. Several clips can play at the same time.

## Levels of detail

Objects named with a Unity-style LOD suffix (`Name_LOD0`, `Name_LOD1`, …) are treated as levels of detail. When a file has two or more levels, the **LOD** button opens a panel that lists each level with its triangle count; click a level to show it and hide the others. LOD0 is shown first. With no LODs or a single one, the button is disabled.

Each level has an **Export** button that saves it as a `.glb` file. The export keeps the rig, animations and objects without a LOD suffix, and excludes the other levels. An existing destination is replaced only after the export succeeds.

## Textures

The **Textures** button opens a panel that lists every image used by the model's materials, with a thumbnail, its resolution, and each material that uses it along with the slot (base color, normal, roughness, emissive, …). An image shared by several slots or materials is listed once. Click a texture to show a larger preview. Files without textures show the button disabled.

If a file opens in another editor, right-click its editor tab, select **Reopen Editor With...**, and choose **Blender Preview**.

## Development

Open this repository folder in VS Code, select **Run Blender Preview** in **Run and Debug**, and press **F5**. The task opens an isolated Extension Development Host and attaches the debugger. Its settings and installed extensions are kept separately under `.vscode-test/`. Close the preview window after stopping debugging before starting another session.

On the first run, the preview profile is created with a minimal window and the standard VS Code shortcuts disabled. Existing profile settings and keybindings are preserved on later runs. The supplied shortcut list was generated from VS Code on Windows; additional shortcuts may exist on other versions or platforms.

The development window opens `samples/suzanne.blend`, a sample with two LODs, two animations and a packed texture. You can open your own `.blend` file as well. If Blender is not detected, set **Minimal Blender Viewer: Blender Path** in the development window's settings.

Saving a host-side JavaScript file or a viewer file in `src/webview/` automatically restarts the extension host and reopens the preview in the same window; viewer changes are rebuilt first. Preview state such as the selected LOD and camera position resets. If a change has a syntax error, the current version stays running and VS Code shows the error. Changes to `package.json` require restarting F5. No VSIX installation is needed for this workflow.

Run `npm test` for the host-side behavior checks.

## Publishing

Releases are published directly to the VS Code Marketplace by GitHub Actions using trusted publishing. Create and push a tag in the form `vX.Y.Z` that matches the version in `package.json` and points to a commit on `main`. The workflow checks and builds the extension before publishing; it does not upload release artifacts to GitHub.

The Marketplace publisher must have a trusted publishing policy for repository owner `dummefil`, repository `minimal-blender-preview`, and workflow `publish.yml`.
