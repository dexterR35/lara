<div align="center">
  <img src="public/lara-icon.svg" alt="Lara logo" width="96" height="96">
  <h1>Lara</h1>
  <p><strong>A private, browser-only Lottie image asset studio.</strong></p>
</div>

Lara opens Lottie JSON files, previews animations, replaces embedded images individually or in batches, and exports rebuilt animations—without a server or Python.

## Run locally

```bash
npm install
npm run dev
```

Create a production build with `npm run build`. The generated `dist/` directory is a static frontend that can be hosted anywhere.

## Workflow

1. Open or drop a Lottie `.json` file.
2. Select an image asset and replace it, or load a folder for batch matching.
3. Preview the result and use the playback controls.
4. Download the rebuilt JSON or a ZIP with the JSON, assets, and manifest.

Batch filenames should equal the asset ID or begin with `assetId_`. Extracted-style names such as `image_0_512x512.png` match automatically.

## Session behavior

The workspace uses `sessionStorage`. It survives refreshes in the same tab, but is cleared when the tab/browser session ends or **Reset** is pressed. Files never leave the browser. Because session storage is quota-limited, export very large embedded animations before refreshing.

## Stack

- Vite + React (JavaScript)
- Lightweight native hash views with reusable layout/outlet structure
- Tailwind CSS with semantic component classes through `@apply`
- `lottie-web` preview
- JSZip client-side packaging
