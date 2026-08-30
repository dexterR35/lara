<div align="center">
  <img src="public/lara-icon.svg" alt="Lara logo" width="96" height="96">
  <h1>Lara</h1>
  <p><strong>A private, browser-only Lottie image asset studio.</strong></p>
</div>

Lara opens Lottie JSON and dotLottie files, extracts embedded images, inventories font references, previews animations, replaces images individually or in batches, and exports rebuilt animations-without a server.

## Run locally

```bash
npm install
npm run dev
```

Create a production build with `npm run build`. The generated `dist/` directory is a static frontend that can be hosted anywhere.

## Workflow

1. Open or drop a Lottie `.json` or `.lottie` file up to 50 MB (dotLottie archives may expand to at most 100 MB).
2. Select an embedded image to download it, replace it, or load a folder for batch matching. Replacements may be PNG, JPG, WebP, or GIF, up to 10 MB, 8192 px per side, and 40 megapixels.
3. Preview the result and use the playback controls.
4. Download the rebuilt JSON or an asset ZIP with images, image metadata, and font references.

Batch filenames should equal the asset ID or begin with `assetId_`. Extracted-style names such as `image_0_512x512.png` match automatically.

## Session behavior

The workspace uses a versioned, debounced `sessionStorage` cache. It survives refreshes in the same tab, but is cleared when the tab/browser session ends or **Reset** is pressed. If a project exceeds the browser quota, Lara removes the older cached copy instead of restoring stale edits and clearly marks the workspace as **Memory only**. Export memory-only projects before refreshing.

## Security boundaries

- Lottie JSON is schema-checked, size-limited, and stripped of prototype-pollution keys before rendering.
- Preview uses the expression-free Lottie player and blocks remote image/font loads. External image references remain in rebuilt JSON and can be replaced locally.
- Image contents, MIME type, extension, byte size, and dimensions are verified. SVG is intentionally rejected because it can contain scripts and external resources.
- Export filenames are path-safe and de-duplicated. A restrictive Content Security Policy is included in the built page; production hosts should also send the security headers shown in `vite.config.js`.

## Stack

- Vite + React (JavaScript)
- Lightweight native hash views with reusable layout/outlet structure
- Tailwind CSS with semantic component classes through `@apply`
- `lottie-web` preview
- JSZip client-side packaging
