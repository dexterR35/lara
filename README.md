<div align="center">
  <img src="assets/lara-icon.svg" alt="Lara logo" width="112" height="112">

  <h1>Lara</h1>

  <p><strong>Extract, edit, preview, and rebuild image assets inside Lottie animations.</strong></p>

  <p>
    <img src="https://img.shields.io/badge/Windows-supported-D94141?style=flat-square&amp;logo=windows&amp;logoColor=white" alt="Windows supported">
    <img src="https://img.shields.io/badge/macOS-supported-D94141?style=flat-square&amp;logo=apple&amp;logoColor=white" alt="macOS supported">
    <img src="https://img.shields.io/badge/Linux-supported-D94141?style=flat-square&amp;logo=linux&amp;logoColor=white" alt="Linux supported">
    <img src="https://img.shields.io/badge/Python-3.9%2B-303030?style=flat-square&amp;logo=python&amp;logoColor=white" alt="Python 3.9 or newer">
  </p>
</div>

Lara is a cross-platform desktop app for replacing embedded images in a Lottie JSON file without changing the animation's timing, layers, masks, or effects. It includes a live preview, playback controls, and a self-contained JSON export.

## Features

- Open a Lottie JSON file or drag it into the app.
- Preview the animation and scrub through its timeline.
- Extract every embedded image to an editable folder.
- Reload a folder of edited assets or replace one image at a time.
- Refresh the preview before exporting.
- Build a new Lottie JSON with the edited images embedded.
- Keep the source animation untouched.

## Requirements

- Python 3.9 or newer
- An internet connection during the first launch
- On Linux, Python's `venv` module (usually provided by `python3-venv`)

Lara creates a private `.venv` inside the project folder and installs PySide6 there. It does not modify your system Python.

## Quick start

Download or clone this repository, then use the launcher for your operating system.

### Windows

Double-click **`lara.cmd`**, or run it from Command Prompt:

```bat
lara.cmd
```

If Python is missing, install it from [python.org](https://www.python.org/downloads/) and enable **Add Python to PATH** during setup.

### macOS

Double-click **`Lara.command`**. If macOS does not allow it to run yet, open Terminal in the Lara folder and use:

```bash
chmod +x Lara.command lara
./Lara.command
```

### Linux

Open a terminal in the Lara folder and run:

```bash
chmod +x lara
./lara
```

On Ubuntu or Debian, install `venv` first if your Python installation does not include it:

```bash
sudo apt update
sudo apt install python3-venv
```

The first launch can take a few minutes while Lara creates its environment and installs the GUI dependencies. Later launches reuse that environment and open immediately.

## Editing a Lottie animation

1. Select **Open JSON**, or drop a Lottie `.json` file into the preview.
2. Select **Extract** and choose a destination for the asset folder.
3. Edit the extracted images while keeping their filenames and canvas sizes.
4. Select **Load folder** and choose the folder containing the edited images.
5. Select **Refresh** to inspect the updated animation.
6. Choose an output filename and select **Build JSON**.

Double-click an asset row, or use **Replace**, to change a single image. Use **Reset** to unload the current animation and start again.

## Project files

| File | Purpose |
| --- | --- |
| `lara.py` | The desktop application and user interface. |
| `run_lara.py` | Creates the private environment, installs dependencies, and starts the app. |
| `lara`, `lara.cmd`, `Lara.command` | Linux, Windows, and macOS launchers. |
| `lottie_assets.py` | Internal image extraction helpers used by the desktop app. |

Most users should start Lara through their operating-system launcher rather than running the Python files directly.

## Troubleshooting

- **Lara cannot find Python:** install Python 3.9 or newer, then start the launcher again.
- **Linux reports missing `venv` or `pip`:** install your distribution's `python3-venv` package.
- **First-time setup was interrupted:** remove the local `.venv` folder and relaunch Lara.
- **An edited image is not detected:** preserve the extracted filename; Lara matches replacements by Lottie asset ID and filename.

The exported JSON embeds the replacement images, so it does not need a separate asset folder for playback.
