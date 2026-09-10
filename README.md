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

If a file opens in another editor, right-click its editor tab, select **Reopen Editor With...**, and choose **Blender Preview**.
