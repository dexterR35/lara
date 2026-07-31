#!/usr/bin/env python3
"""Desktop GUI for extracting, replacing, previewing, and rebuilding Lottie assets."""

from __future__ import annotations

import base64
import copy
import json
import mimetypes
import sys
import tempfile
from pathlib import Path
from typing import Optional

try:
    from PySide6.QtCore import QEvent, QTemporaryDir, QTimer, Qt, QUrl
    from PySide6.QtGui import QColor, QDragEnterEvent, QDropEvent, QFont, QIcon, QPainter, QPalette, QPixmap
    from PySide6.QtWidgets import (
        QApplication,
        QFileDialog,
        QFrame,
        QHBoxLayout,
        QHeaderView,
        QLabel,
        QLineEdit,
        QMainWindow,
        QMessageBox,
        QPushButton,
        QSlider,
        QSplitter,
        QTableWidget,
        QTableWidgetItem,
        QVBoxLayout,
        QWidget,
    )
    from PySide6.QtWebEngineWidgets import QWebEngineView
except ImportError as exc:  # pragma: no cover - friendly startup error
    print(
        "Lara needs PySide6. Install it with:\n\n"
        "  python -m pip install -e .[gui]\n\n"
        "Then run: python lara.py",
        file=sys.stderr,
    )
    raise SystemExit(1) from exc

from extract_lottie_images import collect_refs, extract_images, mime_to_ext


APP_DIR = Path(__file__).resolve().parent
LOTTIE_JS = APP_DIR / "lottie.min.js"
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"}


def make_lara_icon() -> QIcon:
    """Create the minimal Lara 'L' icon without an external image file."""
    pixmap = QPixmap(128, 128)
    pixmap.fill(Qt.GlobalColor.transparent)
    painter = QPainter(pixmap)
    painter.setRenderHint(QPainter.RenderHint.Antialiasing)
    painter.setPen(Qt.PenStyle.NoPen)
    painter.setBrush(QColor("#f2f2f2"))
    painter.drawRoundedRect(4, 4, 120, 120, 26, 26)
    painter.setPen(QColor("#111111"))
    font = QFont("Sans Serif", 70, QFont.Weight.DemiBold)
    font.setLetterSpacing(QFont.SpacingType.AbsoluteSpacing, -2)
    painter.setFont(font)
    painter.drawText(pixmap.rect(), Qt.AlignmentFlag.AlignCenter, "L")
    painter.end()
    return QIcon(pixmap)


def image_assets(data: dict) -> list[dict]:
    assets = data.get("assets")
    if not isinstance(assets, list):
        raise ValueError("This is not a valid Lottie file: 'assets' must be a list.")
    return [asset for asset in assets if isinstance(asset, dict) and "layers" not in asset and asset.get("p")]


def refs_by_asset(data: dict) -> dict[str, list[str]]:
    refs: dict[str, list[str]] = {}
    collect_refs(data.get("layers") or [], refs)
    for asset in data.get("assets") or []:
        if isinstance(asset, dict) and isinstance(asset.get("layers"), list):
            collect_refs(asset["layers"], refs)
    return refs


def decode_embedded(payload: str) -> Optional[bytes]:
    if not payload.startswith("data:image"):
        return None
    _, comma, encoded = payload.partition(",")
    if not comma:
        return None
    try:
        return base64.b64decode(encoded)
    except (ValueError, base64.binascii.Error):
        return None


def expected_filename(asset: dict) -> str:
    payload = str(asset.get("p", ""))
    if payload.startswith("data:image"):
        header = payload.partition(",")[0]
        ext = mime_to_ext(header)
        return f"{asset.get('id', 'image')}_{asset.get('w', 'x')}x{asset.get('h', 'x')}.{ext}"
    return Path(payload).name


def file_data_url(path: Path) -> str:
    mime = mimetypes.guess_type(path.name)[0]
    if not mime or not mime.startswith("image/"):
        mime = "image/png"
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{encoded}"


class DropWebView(QWebEngineView):
    def __init__(self, owner: "LottieWindow") -> None:
        super().__init__()
        self.owner = owner
        self.setAcceptDrops(True)

    def dragEnterEvent(self, event: QDragEnterEvent) -> None:
        if any(url.toLocalFile().lower().endswith(".json") for url in event.mimeData().urls()):
            event.acceptProposedAction()
        else:
            super().dragEnterEvent(event)

    def dropEvent(self, event: QDropEvent) -> None:
        files = [Path(url.toLocalFile()) for url in event.mimeData().urls()]
        json_file = next((path for path in files if path.suffix.lower() == ".json"), None)
        if json_file:
            self.owner.load_lottie(json_file)
            event.acceptProposedAction()
        else:
            super().dropEvent(event)


class LottieWindow(QMainWindow):
    def __init__(self) -> None:
        super().__init__()
        self.source_path: Optional[Path] = None
        self.source_data: Optional[dict] = None
        self.assets: list[dict] = []
        self.replacements: dict[str, Path] = {}
        temp_template = str(Path(tempfile.gettempdir()) / "lara-XXXXXX")
        self.temp_dir = QTemporaryDir(temp_template)
        self.scrubbing = False
        self.preview_load_serial = 0
        self._build_ui()
        self._apply_style()
        self._show_empty_preview()

        self.timer = QTimer(self)
        self.timer.setInterval(150)
        self.timer.timeout.connect(self._poll_frame)
        self.timer.start()

    def _build_ui(self) -> None:
        self.setWindowTitle("Lara")
        self.setWindowIcon(make_lara_icon())
        self.resize(1240, 820)
        self.setMinimumSize(940, 620)
        self.setAcceptDrops(True)

        root = QWidget()
        root_layout = QVBoxLayout(root)
        root_layout.setContentsMargins(0, 0, 0, 0)

        header = QFrame()
        header.setObjectName("header")
        header_layout = QHBoxLayout(header)
        header_layout.setContentsMargins(20, 12, 20, 12)
        logo = QLabel()
        logo.setObjectName("logo")
        logo.setFixedSize(36, 36)
        logo.setPixmap(make_lara_icon().pixmap(36, 36))
        logo.setScaledContents(True)
        header_layout.addWidget(logo)
        header_layout.addStretch()
        self.open_button = QPushButton("Open JSON")
        self.open_button.clicked.connect(self.choose_lottie)
        header_layout.addWidget(self.open_button)
        root_layout.addWidget(header)

        splitter = QSplitter(Qt.Orientation.Horizontal)
        splitter.setChildrenCollapsible(False)

        left = QWidget()
        left.setMinimumWidth(350)
        left.setMaximumWidth(460)
        left_layout = QVBoxLayout(left)
        left_layout.setContentsMargins(20, 18, 14, 18)
        left_layout.setSpacing(10)

        self.file_label = QLabel("No animation loaded")
        self.file_label.setObjectName("fileName")
        self.file_label.setWordWrap(True)
        self.meta_label = QLabel("Open or drop a Lottie .json file to begin.")
        self.meta_label.setObjectName("muted")
        left_layout.addWidget(self.file_label)
        left_layout.addWidget(self.meta_label)

        workflow = QHBoxLayout()
        self.extract_button = QPushButton("Extract")
        self.folder_button = QPushButton("Load folder")
        self.extract_button.clicked.connect(self.extract_assets)
        self.folder_button.clicked.connect(self.load_replacement_folder)
        workflow.addWidget(self.extract_button)
        workflow.addWidget(self.folder_button)
        left_layout.addLayout(workflow)

        self.table = QTableWidget(0, 4)
        self.table.setHorizontalHeaderLabels(["Preview", "Asset", "Size", "Status"])
        self.table.verticalHeader().setVisible(False)
        self.table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.table.setSelectionMode(QTableWidget.SelectionMode.SingleSelection)
        self.table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.table.setShowGrid(False)
        self.table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        self.table.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        self.table.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeMode.ResizeToContents)
        self.table.horizontalHeader().setSectionResizeMode(3, QHeaderView.ResizeMode.ResizeToContents)
        self.table.doubleClicked.connect(self.replace_selected)
        left_layout.addWidget(self.table, 1)

        replace_row = QHBoxLayout()
        self.replace_button = QPushButton("Replace")
        self.clear_button = QPushButton("Reset")
        self.replace_button.clicked.connect(self.replace_selected)
        self.clear_button.clicked.connect(self.reset_app)
        replace_row.addWidget(self.replace_button)
        replace_row.addWidget(self.clear_button)
        left_layout.addLayout(replace_row)

        output_label = QLabel("OUTPUT")
        output_label.setObjectName("smallLabel")
        self.output_name = QLineEdit("rebuilt-animation.json")
        left_layout.addWidget(output_label)
        left_layout.addWidget(self.output_name)

        self.build_button = QPushButton("Build JSON")
        self.build_button.setObjectName("build")
        self.build_button.clicked.connect(self.build_json)
        left_layout.addWidget(self.build_button)

        right = QWidget()
        right_layout = QVBoxLayout(right)
        right_layout.setContentsMargins(14, 18, 20, 18)
        preview_header = QHBoxLayout()
        preview_title = QLabel("Preview")
        preview_title.setObjectName("sectionTitle")
        self.preview_status = QLabel("Waiting for a file")
        self.preview_status.setObjectName("muted")
        preview_header.addWidget(preview_title)
        preview_header.addStretch()
        preview_header.addWidget(self.preview_status)
        right_layout.addLayout(preview_header)

        self.web = DropWebView(self)
        self.web.setObjectName("preview")
        self.web.page().setBackgroundColor(QColor("#161616"))
        self.web.loadFinished.connect(self._preview_loaded)
        right_layout.addWidget(self.web, 1)

        controls = QHBoxLayout()
        self.restart_button = QPushButton("↺")
        self.play_button = QPushButton("Pause")
        self.refresh_button = QPushButton("Refresh")
        self.restart_button.setFixedWidth(44)
        self.play_button.setFixedWidth(78)
        self.restart_button.clicked.connect(lambda: self._js("window.restartAnim && window.restartAnim()"))
        self.play_button.clicked.connect(self.toggle_play)
        self.refresh_button.clicked.connect(self.refresh_preview)
        self.slider = QSlider(Qt.Orientation.Horizontal)
        self.slider.setRange(0, 1000)
        self.slider.sliderPressed.connect(lambda: setattr(self, "scrubbing", True))
        self.slider.sliderReleased.connect(self._seek)
        self.frame_label = QLabel("0 / 0")
        self.frame_label.setMinimumWidth(88)
        controls.addWidget(self.restart_button)
        controls.addWidget(self.play_button)
        controls.addWidget(self.slider, 1)
        controls.addWidget(self.frame_label)
        controls.addWidget(self.refresh_button)
        right_layout.addLayout(controls)

        splitter.addWidget(left)
        splitter.addWidget(right)
        splitter.setSizes([390, 850])
        root_layout.addWidget(splitter, 1)
        self.setCentralWidget(root)
        self._set_enabled(False)

    def _apply_style(self) -> None:
        self.setStyleSheet("""
            * { font-family: Inter, Segoe UI, sans-serif; font-size: 13px; }
            QMainWindow, QWidget { background: #111111; color: #ededed; }
            #header { background: #111111; border-bottom: 1px solid #292929; }
            #muted { color: #828282; }
            #fileName { font-size: 17px; font-weight: 600; }
            #sectionTitle { font-size: 14px; font-weight: 600; }
            #smallLabel { color: #777777; font-size: 10px; font-weight: 700; }
            QPushButton { background: #1c1c1c; border: 1px solid #333333; border-radius: 5px;
                          padding: 7px 10px; color: #ededed; }
            QPushButton:hover { background: #252525; border-color: #4a4a4a; }
            QPushButton:pressed { background: #181818; }
            QPushButton:disabled { color: #555555; background: #171717; border-color: #242424; }
            QPushButton#build { background: #d94141; border-color: #d94141; color: #ffffff; font-weight: 650; padding: 10px; }
            QPushButton#build:hover { background: #e34b4b; border-color: #e34b4b; }
            QPushButton#build:pressed { background: #bd3434; border-color: #bd3434; }
            QLineEdit { background: #171717; border: 1px solid #303030; border-radius: 5px; padding: 8px; }
            QLineEdit:focus { border-color: #555555; }
            QTableWidget { background: #141414; border: 1px solid #292929; border-radius: 6px;
                           selection-background-color: #303030; alternate-background-color: #171717; }
            QHeaderView::section { background: #191919; color: #777777; border: 0; padding: 7px; }
            QTableWidget::item { border-bottom: 1px solid #242424; padding: 4px; }
            QSlider::groove:horizontal { height: 3px; background: #333333; border-radius: 2px; }
            QSlider::sub-page:horizontal { background: #888888; border-radius: 2px; }
            QSlider::handle:horizontal { background: white; width: 14px; margin: -5px 0; border-radius: 7px; }
            QWebEngineView#preview { background: #161616; border: 1px solid #292929; border-radius: 6px; }
            QSplitter::handle { background: #292929; width: 1px; }
        """)

    def _set_enabled(self, enabled: bool) -> None:
        for widget in (
            self.extract_button, self.folder_button, self.replace_button, self.clear_button,
            self.build_button, self.output_name, self.restart_button, self.play_button,
            self.refresh_button, self.slider,
        ):
            widget.setEnabled(enabled)

    def dragEnterEvent(self, event: QDragEnterEvent) -> None:
        if any(url.toLocalFile().lower().endswith(".json") for url in event.mimeData().urls()):
            event.acceptProposedAction()

    def dropEvent(self, event: QDropEvent) -> None:
        for url in event.mimeData().urls():
            path = Path(url.toLocalFile())
            if path.suffix.lower() == ".json":
                self.load_lottie(path)
                event.acceptProposedAction()
                return

    def choose_lottie(self) -> None:
        filename, _ = QFileDialog.getOpenFileName(self, "Open Lottie JSON", "", "Lottie JSON (*.json)")
        if filename:
            self.load_lottie(Path(filename))

    def load_lottie(self, path: Path) -> None:
        try:
            data = json.loads(path.read_text(encoding="utf-8-sig"))
            if not isinstance(data, dict) or not all(key in data for key in ("layers", "w", "h")):
                raise ValueError("The selected JSON does not look like a Lottie animation.")
            assets = image_assets(data)
        except (OSError, json.JSONDecodeError, ValueError) as exc:
            QMessageBox.critical(self, "Could not open Lottie", str(exc))
            return

        self.source_path = path.resolve()
        self.source_data = data
        self.assets = assets
        self.replacements.clear()
        self.file_label.setText(path.name)
        fps = float(data.get("fr") or 0)
        duration = ((float(data.get("op") or 0) - float(data.get("ip") or 0)) / fps) if fps else 0
        self.meta_label.setText(
            f"{data.get('w')} × {data.get('h')}  •  {fps:g} fps  •  {duration:.2f} sec  •  {len(assets)} image assets"
        )
        self.output_name.setText(f"{path.stem}-rebuilt.json")
        self._populate_table()
        self._set_enabled(True)
        self.refresh_preview()

    def _populate_table(self) -> None:
        self.table.setRowCount(len(self.assets))
        refs = refs_by_asset(self.source_data or {})
        for row, asset in enumerate(self.assets):
            self.table.setRowHeight(row, 62)
            raw = decode_embedded(str(asset.get("p", "")))
            if raw is None and self.source_path:
                external = self.source_path.parent / str(asset.get("u", "")) / str(asset.get("p", ""))
                raw = external.read_bytes() if external.is_file() else None
            thumb = QLabel()
            thumb.setAlignment(Qt.AlignmentFlag.AlignCenter)
            if raw:
                pixmap = QPixmap()
                pixmap.loadFromData(raw)
                thumb.setPixmap(pixmap.scaled(48, 48, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation))
            self.table.setCellWidget(row, 0, thumb)
            asset_id = str(asset.get("id", "image"))
            used = ", ".join(refs.get(asset_id, [])) or expected_filename(asset)
            item = QTableWidgetItem(f"{asset_id}\n{used}")
            item.setData(Qt.ItemDataRole.UserRole, asset_id)
            self.table.setItem(row, 1, item)
            self.table.setItem(row, 2, QTableWidgetItem(f"{asset.get('w', '?')}×{asset.get('h', '?')}"))
            self.table.setItem(row, 3, QTableWidgetItem("Original"))
        if self.assets:
            self.table.selectRow(0)

    def _asset_row(self, asset_id: str) -> int:
        for row in range(self.table.rowCount()):
            if self.table.item(row, 1).data(Qt.ItemDataRole.UserRole) == asset_id:
                return row
        return -1

    def _set_replacement(self, asset_id: str, path: Path) -> None:
        self.replacements[asset_id] = path
        row = self._asset_row(asset_id)
        if row < 0:
            return
        pixmap = QPixmap(str(path))
        if not pixmap.isNull():
            label = self.table.cellWidget(row, 0)
            label.setPixmap(pixmap.scaled(48, 48, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation))
        status = QTableWidgetItem("Edited ✓")
        status.setForeground(QColor("#55d6a4"))
        self.table.setItem(row, 3, status)

    def extract_assets(self) -> None:
        if not self.source_data or not self.source_path:
            return
        parent = QFileDialog.getExistingDirectory(self, "Choose where to create the assets folder", str(self.source_path.parent))
        if not parent:
            return
        out_dir = Path(parent) / f"{self.source_path.stem}-assets"
        try:
            manifest, skipped, _ = extract_images(self.source_data, out_dir)
            (out_dir / "manifest.json").write_text(
                json.dumps({"source": str(self.source_path), "images": manifest, "skipped": skipped}, indent=2),
                encoding="utf-8",
            )
        except (OSError, ValueError, base64.binascii.Error) as exc:
            QMessageBox.critical(self, "Extraction failed", str(exc))
            return
        QMessageBox.information(
            self,
            "Assets extracted",
            f"Extracted {len(manifest)} image(s) to:\n{out_dir}\n\nEdit them in Photoshop, keep the filenames, then load this folder.",
        )

    def load_replacement_folder(self) -> None:
        if not self.assets:
            return
        start = str(self.source_path.parent if self.source_path else APP_DIR)
        folder = QFileDialog.getExistingDirectory(self, "Choose edited assets folder", start)
        if not folder:
            return
        files = [p for p in Path(folder).rglob("*") if p.is_file() and p.suffix.lower() in IMAGE_SUFFIXES]
        by_name = {p.name.lower(): p for p in files}
        matched = 0
        for asset in self.assets:
            asset_id = str(asset.get("id", ""))
            candidate = by_name.get(expected_filename(asset).lower())
            if candidate is None:
                candidate = next((p for p in files if p.stem == asset_id or p.stem.startswith(asset_id + "_")), None)
            if candidate:
                self._set_replacement(asset_id, candidate)
                matched += 1
        self.preview_status.setText(f"{matched} edited asset(s) ready")
        if matched:
            self.refresh_preview()
        else:
            QMessageBox.warning(self, "No matching images", "No files matched the asset IDs or extracted filenames.")

    def replace_selected(self, _index=None) -> None:
        row = self.table.currentRow()
        if row < 0:
            return
        asset_id = str(self.table.item(row, 1).data(Qt.ItemDataRole.UserRole))
        filename, _ = QFileDialog.getOpenFileName(
            self, f"Replace {asset_id}", "", "Images (*.png *.jpg *.jpeg *.webp *.gif *.svg)"
        )
        if filename:
            self._set_replacement(asset_id, Path(filename))
            self.refresh_preview()

    def reset_app(self) -> None:
        """Return the application to a clean session for another JSON file."""
        self._js("window.anim && window.anim.destroy()")
        self.source_path = None
        self.source_data = None
        self.assets.clear()
        self.replacements.clear()
        self.table.clearContents()
        self.table.setRowCount(0)
        self.file_label.setText("No animation loaded")
        self.meta_label.setText("Open or drop a Lottie .json file to begin.")
        self.output_name.setText("rebuilt-animation.json")
        self.preview_status.setText("Waiting for a file")
        self.slider.setValue(0)
        self.frame_label.setText("0 / 0")
        self.play_button.setText("Pause")
        self._set_enabled(False)
        self._show_empty_preview()

    def merged_data(self) -> dict:
        if not self.source_data:
            raise ValueError("No Lottie animation is loaded.")
        result = copy.deepcopy(self.source_data)
        for asset in result.get("assets") or []:
            asset_id = str(asset.get("id", ""))
            replacement = self.replacements.get(asset_id)
            if replacement:
                asset["p"] = file_data_url(replacement)
                asset["u"] = ""
                asset["e"] = 1
        return result

    def build_json(self) -> None:
        if not self.source_data or not self.source_path:
            return
        suggested = self.source_path.with_name(self.output_name.text().strip() or f"{self.source_path.stem}-rebuilt.json")
        filename, _ = QFileDialog.getSaveFileName(self, "Save rebuilt Lottie", str(suggested), "Lottie JSON (*.json)")
        if not filename:
            return
        if not filename.lower().endswith(".json"):
            filename += ".json"
        try:
            Path(filename).write_text(json.dumps(self.merged_data(), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        except OSError as exc:
            QMessageBox.critical(self, "Build failed", str(exc))
            return
        QMessageBox.information(
            self,
            "Lottie built successfully",
            f"Saved the self-contained animation with {len(self.replacements)} replaced asset(s):\n{filename}",
        )

    def refresh_preview(self) -> None:
        if not self.source_data:
            return
        if not LOTTIE_JS.is_file():
            self.preview_status.setText("Preview engine missing")
            QMessageBox.critical(self, "Preview unavailable", f"Missing file: {LOTTIE_JS}")
            return
        try:
            animation_json = json.dumps(self.merged_data(), ensure_ascii=False).replace("</", "<\\/")
            engine = LOTTIE_JS.read_text(encoding="utf-8")
            html = self._preview_html(engine, animation_json)
            if not self.temp_dir.isValid():
                raise OSError("Could not create the temporary preview folder.")
            html_path = (Path(self.temp_dir.path()) / "preview.html").resolve()
            html_path.write_text(html, encoding="utf-8")
            self.web.setUpdatesEnabled(False)
            self.preview_load_serial += 1
            preview_url = QUrl.fromLocalFile(str(html_path))
            preview_url.setQuery(f"v={self.preview_load_serial}")
            self.web.setUrl(preview_url)
            self.preview_status.setText(
                f"Previewing {len(self.replacements)} edited asset(s)" if self.replacements else "Previewing original"
            )
            self.play_button.setText("Pause")
        except (OSError, ValueError) as exc:
            QMessageBox.critical(self, "Preview failed", str(exc))

    @staticmethod
    def _preview_html(engine: str, animation_json: str) -> str:
        return f"""<!doctype html><html><head><meta charset=\"utf-8\"><style>
html,body,#stage{{width:100%;height:100%;margin:0;overflow:hidden}}
body{{background:#161616}}
#stage svg{{max-width:100%;max-height:100%}}
</style></head><body><div id=\"stage\"></div><script>{engine}</script><script>
const data={animation_json};
window.anim=lottie.loadAnimation({{container:document.getElementById('stage'),renderer:'svg',loop:true,autoplay:true,animationData:data}});
window.restartAnim=()=>{{anim.goToAndPlay(0,true)}};
window.toggleAnim=()=>{{if(anim.isPaused){{anim.play();return true}}anim.pause();return false}};
window.seekAnim=(ratio)=>{{anim.goToAndStop(ratio*anim.totalFrames,true)}};
window.frameInfo=()=>({{frame:anim.currentFrame||0,total:anim.totalFrames||0,paused:anim.isPaused}});
</script></body></html>"""

    def _show_empty_preview(self) -> None:
        self.web.setUpdatesEnabled(False)
        self.web.setHtml("""<html><style>body{margin:0;background:#161616;color:#777;font:14px Segoe UI;display:grid;place-items:center;text-align:center}.icon{font-size:34px;margin-bottom:10px;color:#555}</style><body><div><div class=icon>◇</div>Drop Lottie JSON here</div></body></html>""")

    def _preview_loaded(self, ok: bool) -> None:
        self.web.setUpdatesEnabled(True)
        self.web.update()
        if self.source_data and not ok:
            self.preview_status.setText("Preview could not be loaded")

    def _js(self, code: str, callback=None) -> None:
        self.web.page().runJavaScript(code, callback or (lambda _value: None))

    def toggle_play(self) -> None:
        def changed(playing) -> None:
            self.play_button.setText("Pause" if playing else "Play")
        self._js("window.toggleAnim ? window.toggleAnim() : null", changed)

    def _seek(self) -> None:
        ratio = self.slider.value() / 1000
        self._js(f"window.seekAnim && window.seekAnim({ratio})")
        self.scrubbing = False

    def _poll_frame(self) -> None:
        if not self.source_data:
            return

        def update(info) -> None:
            if not isinstance(info, dict):
                return
            frame = float(info.get("frame") or 0)
            total = float(info.get("total") or 0)
            self.frame_label.setText(f"{int(frame)} / {int(total)}")
            if total and not self.scrubbing:
                self.slider.setValue(round(1000 * frame / total))
            self.play_button.setText("Play" if info.get("paused") else "Pause")

        self._js("window.frameInfo ? window.frameInfo() : null", update)


def main() -> int:
    app = QApplication(sys.argv)
    app.setApplicationName("Lara")
    app.setApplicationDisplayName("Lara")
    app.setWindowIcon(make_lara_icon())
    app.setStyle("Fusion")
    palette = app.palette()
    palette.setColor(QPalette.ColorRole.Window, QColor("#101218"))
    palette.setColor(QPalette.ColorRole.WindowText, QColor("#eceef5"))
    app.setPalette(palette)
    window = LottieWindow()
    window.show()
    if len(sys.argv) > 1:
        candidate = Path(sys.argv[1])
        if candidate.is_file():
            QTimer.singleShot(0, lambda: window.load_lottie(candidate))
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
