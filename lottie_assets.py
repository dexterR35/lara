"""Lottie image-asset helpers used by the Lara desktop application."""

from __future__ import annotations

import base64
import re
from pathlib import Path


def collect_refs(layers: list, refs: dict[str, list[str]]) -> None:
    """Collect the layer names that reference each asset ID."""
    for layer in layers:
        ref_id = layer.get("refId")
        if ref_id:
            refs.setdefault(ref_id, []).append(layer.get("nm") or "")


def mime_to_ext(header: str) -> str:
    """Return a suitable filename extension for an image data URL header."""
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
    """Extract embedded images and return manifest, skipped, and filename data."""
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
            if isinstance(payload, str) and payload and not payload.startswith("data:"):
                id_to_filename[asset_id] = payload
            reason = "external/non-embedded asset" if payload else "no image payload"
            skipped.append({"id": asset_id, "reason": reason, "p": payload or None})
            continue

        header, _, encoded = payload.partition(",")
        if not encoded:
            skipped.append({"id": asset_id, "reason": "empty base64 payload"})
            continue

        extension = mime_to_ext(header)
        width = asset.get("w", "x")
        height = asset.get("h", "x")
        filename = f"{asset_id}_{width}x{height}.{extension}"
        raw = base64.b64decode(encoded)
        (out_dir / filename).write_bytes(raw)
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

    return manifest, skipped, id_to_filename
