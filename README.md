# Minimal Blender Viewer

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

## Animations

Blender actions are exported as animation clips (disable with **Export Animations**). When a file contains animations, an **Animations** panel lists every clip and the first one starts playing: click a clip to play or stop it, or use **Play All** / **Stop All**. Several clips can play at the same time.

## Levels of detail

Objects named with a Unity-style LOD suffix (`Name_LOD0`, `Name_LOD1`, …) are treated as levels of detail. When a file has two or more levels, the **LOD** button opens a panel that lists each level with its triangle count; click a level to show it and hide the others. LOD0 is shown first. With no LODs or a single one, the button is disabled.

Each level has an **Export** button that saves that level as a `.glb` file. You choose where to save it; the default is `<file>_LOD<n>.glb` next to the `.blend`. Blender exports the file with the same settings as the preview, leaving out the objects of the other levels, so the rig, animations and objects without a LOD suffix are included.

## Textures

The **Textures** button opens a panel that lists every image used by the model's materials, with a thumbnail, its resolution, and each material that uses it along with the slot (base color, normal, roughness, emissive, …). An image shared by several slots or materials is listed once. Click a texture to show a larger preview. Files without textures show the button disabled.

If a file opens in another editor, right-click its editor tab, select **Reopen Editor With...**, and choose **Blender Preview**.
