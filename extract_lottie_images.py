#!/usr/bin/env python3
"""Extract images (and optionally animation) from a Lottie JSON file.

Cross-platform CLI (macOS / Windows / Linux):

  python extract_lottie_images.py giftbox.json
  ./extract-lottie-images giftbox.json
  extract-lottie-images.cmd giftbox.json

  # also write animation.json (motion + external image refs)
  python extract_lottie_images.py giftbox.json --anim

  # render frames / GIF (needs: pip install pillow playwright && playwright install chromium)
  python extract_lottie_images.py giftbox.json --anim --frames
  python extract_lottie_images.py giftbox.json --anim --gif
"""

from __future__ import annotations

import argparse
import base64
import copy
import json
import re
import sys
from pathlib import Path


def collect_refs(layers: list, refs: dict[str, list[str]]) -> None:
    for layer in layers:
        ref_id = layer.get("refId")
        if ref_id:
            refs.setdefault(ref_id, []).append(layer.get("nm") or "")


def mime_to_ext(header: str) -> str:
    header = header.lower()
    if "image/png" in header:
        return "png"
    if "image/jpeg" in header or "image/jpg" in header:
        return "jpg"
    if "image/webp" in header:
        return "webp"
    if "image/gif" in header:
        return "gif"
    if "image/svg" in header:
        return "svg"
    match = re.search(r"image/([a-z0-9.+-]+)", header)
    return match.group(1).split("+")[0] if match else "bin"


def extract_images(data: dict, out_dir: Path) -> tuple[list[dict], list[dict], dict[str, str]]:
    """Extract embedded images. Returns (manifest, skipped, id_to_filename)."""
    assets = data.get("assets") or []
    if not isinstance(assets, list):
        raise ValueError("Invalid Lottie JSON: 'assets' is missing or not a list")

    refs: dict[str, list[str]] = {}
    collect_refs(data.get("layers") or [], refs)
    for asset in assets:
        if isinstance(asset.get("layers"), list):
            collect_refs(asset["layers"], refs)

    out_dir.mkdir(parents=True, exist_ok=True)
    manifest: list[dict] = []
    skipped: list[dict] = []
    id_to_filename: dict[str, str] = {}

    for asset in assets:
        asset_id = asset.get("id", "unknown")
        payload = asset.get("p", "")

        if isinstance(asset.get("layers"), list):
            skipped.append({"id": asset_id, "reason": "precomp (not an image)"})
            continue

        if not isinstance(payload, str) or not payload.startswith("data:image"):
            # Keep external filename mapping if already a normal file name
            if isinstance(payload, str) and payload and not payload.startswith("data:"):
                id_to_filename[asset_id] = payload
            reason = "external/non-embedded asset" if payload else "no image payload"
            skipped.append({"id": asset_id, "reason": reason, "p": payload or None})
            continue

        header, _, b64 = payload.partition(",")
        if not b64:
            skipped.append({"id": asset_id, "reason": "empty base64 payload"})
            continue

        ext = mime_to_ext(header)
        width = asset.get("w", "x")
        height = asset.get("h", "x")
        filename = f"{asset_id}_{width}x{height}.{ext}"
        file_path = out_dir / filename
        raw = base64.b64decode(b64)
        file_path.write_bytes(raw)
        id_to_filename[asset_id] = filename

        used_by = sorted({name for name in refs.get(asset_id, []) if name})
        manifest.append(
            {
                "id": asset_id,
                "file": filename,
                "w": asset.get("w"),
                "h": asset.get("h"),
                "bytes": len(raw),
                "used_by": used_by,
            }
        )
        used = ", ".join(used_by) if used_by else "(no layer name)"
        print(f"  {filename:32} {len(raw):7} B  <- {used}")

    return manifest, skipped, id_to_filename


def write_animation_json(data: dict, out_dir: Path, id_to_filename: dict[str, str]) -> Path:
    """Write Lottie JSON where embedded images become external file refs."""
    anim = copy.deepcopy(data)
    for asset in anim.get("assets") or []:
        asset_id = asset.get("id")
        if asset_id in id_to_filename and not isinstance(asset.get("layers"), list):
            asset["u"] = ""
            asset["p"] = id_to_filename[asset_id]
            asset["e"] = 0
    path = out_dir / "animation.json"
    path.write_text(json.dumps(anim, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return path


def render_frames_and_gif(
    source_data: dict,
    out_dir: Path,
    *,
    write_frames: bool,
    write_gif: bool,
    every: int,
    scale: float,
) -> None:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise RuntimeError(
            "Rendering needs playwright. Install with:\n"
            "  pip install pillow playwright\n"
            "  playwright install chromium"
        ) from exc

    if write_gif:
        try:
            from PIL import Image
        except ImportError as exc:
            raise RuntimeError(
                "GIF export needs Pillow. Install with:\n  pip install pillow playwright"
            ) from exc

    width = int(source_data.get("w") or 600)
    height = int(source_data.get("h") or 1024)
    view_w = max(1, int(width * scale))
    view_h = max(1, int(height * scale))
    fps = float(source_data.get("fr") or 25)
    every = max(1, every)

    anim_json = json.dumps(source_data, ensure_ascii=False)
    html = f"""<!doctype html>
<html><head><meta charset="utf-8">
<style>
  html,body {{ margin:0; background:#000; }}
  #c {{ width:{view_w}px; height:{view_h}px; }}
</style>
</head><body>
<div id="c"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie.min.js"></script>
<script>
  const anim = lottie.loadAnimation({{
    container: document.getElementById('c'),
    renderer: 'canvas',
    loop: false,
    autoplay: false,
    animationData: {anim_json}
  }});
  window.__anim = anim;
  window.__ready = false;
  anim.addEventListener('DOMLoaded', () => {{ window.__ready = true; }});
</script>
</body></html>"""

    frames_dir = out_dir / "frames"
    if write_frames:
        frames_dir.mkdir(parents=True, exist_ok=True)

    captured: list[Path] = []
    print("\nRendering animation with Chromium...")

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(
            viewport={"width": view_w, "height": view_h},
            device_scale_factor=1,
        )
        page.set_content(html, wait_until="networkidle")
        page.wait_for_function("window.__ready === true", timeout=60000)
        total = int(page.evaluate("Math.floor(window.__anim.totalFrames)"))
        print(f"  total frames: {total}, capture every: {every}, size: {view_w}x{view_h}")

        for i in range(0, total, every):
            page.evaluate("(i) => window.__anim.goToAndStop(i, true)", i)
            # small settle for canvas paint
            page.wait_for_timeout(16)
            tmp = out_dir / f".frame_{i:04d}.png"
            page.locator("#c").screenshot(path=str(tmp), omit_background=False)
            if write_frames:
                dest = frames_dir / f"frame_{i:04d}.png"
                tmp.replace(dest)
                captured.append(dest)
            else:
                captured.append(tmp)
            if i % (every * 10) == 0 or i + every >= total:
                print(f"  captured frame {i}/{total - 1}")

        browser.close()

    if write_gif and captured:
        gif_path = out_dir / "animation.gif"
        images = [Image.open(path).convert("RGBA") for path in captured]
        duration_ms = max(1, int(round(1000 * every / fps)))
        images[0].save(
            gif_path,
            save_all=True,
            append_images=images[1:],
            duration=duration_ms,
            loop=0,
            disposal=2,
            optimize=False,
        )
        for img in images:
            img.close()
        print(f"  GIF: {gif_path} ({len(captured)} frames, {duration_ms}ms/frame)")

    if not write_frames:
        for path in captured:
            path.unlink(missing_ok=True)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="extract-lottie-images",
        description="Extract Lottie images and optionally animation (JSON / frames / GIF)",
    )
    parser.add_argument("json", type=Path, help="Path to Lottie .json file")
    parser.add_argument(
        "-o",
        "--out",
        type=Path,
        default=None,
        help="Output folder (default: <json-stem>-assets)",
    )
    parser.add_argument(
        "--anim",
        action="store_true",
        help="Also write animation.json (same motion, images as external files)",
    )
    parser.add_argument(
        "--frames",
        action="store_true",
        help="Render PNG frame sequence into out/frames/ (needs playwright)",
    )
    parser.add_argument(
        "--gif",
        action="store_true",
        help="Render animation.gif (needs playwright + pillow)",
    )
    parser.add_argument(
        "--every",
        type=int,
        default=2,
        help="Capture every Nth frame for --frames/--gif (default: 2)",
    )
    parser.add_argument(
        "--scale",
        type=float,
        default=0.5,
        help="Render scale for --frames/--gif (default: 0.5)",
    )
    args = parser.parse_args(argv)

    json_path = args.json.expanduser().resolve()
    if not json_path.is_file():
        print(f"File not found: {json_path}", file=sys.stderr)
        return 1

    out_dir = args.out
    if out_dir is None:
        out_dir = json_path.with_name(f"{json_path.stem}-assets")
    else:
        out_dir = out_dir.expanduser().resolve()

    try:
        data = json.loads(json_path.read_text(encoding="utf-8"))
        manifest, skipped, id_to_filename = extract_images(data, out_dir)

        (out_dir / "manifest.json").write_text(
            json.dumps(
                {"source": str(json_path), "images": manifest, "skipped": skipped},
                indent=2,
            ),
            encoding="utf-8",
        )

        print(f"\nSource: {json_path}")
        print(f"Output: {out_dir}")
        print(f"Extracted: {len(manifest)} image(s)")
        if skipped:
            print(f"Skipped:   {len(skipped)}")
            for item in skipped:
                print(f"  - {item['id']}: {item['reason']}")

        if args.anim:
            anim_path = write_animation_json(data, out_dir, id_to_filename)
            fr = data.get("fr")
            ip = data.get("ip", 0)
            op = data.get("op", 0)
            dur = ((op - ip) / fr) if fr else None
            print(f"Animation JSON: {anim_path}")
            if dur is not None:
                print(f"  {data.get('w')}x{data.get('h')} @ {fr}fps, ~{dur:.2f}s")

        if args.frames or args.gif:
            render_frames_and_gif(
                data,
                out_dir,
                write_frames=args.frames,
                write_gif=args.gif,
                every=args.every,
                scale=args.scale,
            )

    except (json.JSONDecodeError, ValueError, OSError, RuntimeError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
