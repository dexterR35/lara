# Lara


It lets you:

- Open and preview a Lottie JSON file.
- Extract its embedded images.

- Load the edited image folder.
- Preview the updated animation.
- Build a new, self-contained Lottie JSON file.

keeps the original animation timing, layers, masks, and effects.

## Install and open Lara

- Python 3.9 or newer
- Internet access during the first launch

Download or clone the Lara folder, then use the launcher for your operating system below.

The first time you open Lara, it automatically creates a private `.venv` folder and installs the required packages. When installation finishes, Lara opens automatically. This can take a few minutes and requires an internet connection.

After Lara is installed, use the same launcher whenever you want to open it. Lara skips installation on later launches. It does not modify your system Python, and you do not need to open or run `run_lara.py` yourself.

## Linux

Open a terminal in the Lara folder and run:

```bash
chmod +x lara
./lara
```

## Windows

Double-click `lara.cmd`. The first launch installs the required packages and then opens Lara.

```text
lara.cmd
```

If Windows asks which Python to use, install Python from [python.org](https://www.python.org/downloads/) and enable **Add Python to PATH** during installation.

## macOS

Double-click `Lara.command`. The first launch installs the required packages and then opens Lara.

```text
Lara.command
```

Or open Terminal in the Lara folder and run:

```bash
chmod +x Lara.command lara
./lara
```

## How to use Lara

1. Click **Open JSON** or drop a Lottie JSON into the preview.
2. Click **Extract** and choose where to create the assets folder.
3. Edit the extracted images. Keep their filenames and canvas sizes.
4. Click **Load folder** and choose the folder containing the edited images.
5. Click **Refresh** to preview the changes.
6. Click **Build JSON** and choose where to save the finished animation.

Use **Replace** to replace one selected image. Use **Reset** to unload everything and start with another JSON file.

## Notes

- Each animation may have a different filename and different image assets.
- Lara matches edited images using their Lottie asset IDs and extracted filenames.
- The built JSON embeds the edited images, so no separate assets folder is required for playback.
- To reinstall the environment, delete the `.venv` folder and start Lara again.
