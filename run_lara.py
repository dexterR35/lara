#!/usr/bin/env python3
"""Create the local virtual environment when needed, then launch the GUI."""

from __future__ import annotations

import hashlib
import os
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
import venv
from pathlib import Path
from typing import Optional


PROJECT_DIR = Path(__file__).resolve().parent
VENV_DIR = PROJECT_DIR / ".venv"
PYPROJECT = PROJECT_DIR / "pyproject.toml"
READY_FILE = VENV_DIR / ".lottie-studio-ready"


class SetupError(RuntimeError):
    """A recoverable local Python setup problem."""


def venv_python() -> Path:
    if os.name == "nt":
        return VENV_DIR / "Scripts" / "python.exe"
    return VENV_DIR / "bin" / "python"


def dependency_signature() -> str:
    return hashlib.sha256(PYPROJECT.read_bytes()).hexdigest()


def create_environment() -> None:
    print("Lara — first-time setup", flush=True)
    print(f"Creating virtual environment: {VENV_DIR}", flush=True)
    venv.EnvBuilder(with_pip=True).create(VENV_DIR)


def pip_is_available(python: Path) -> bool:
    result = subprocess.run(
        [str(python), "-m", "pip", "--version"],
        cwd=PROJECT_DIR,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return result.returncode == 0


def ensure_pip(python: Path) -> None:
    """Repair an interrupted/minimal venv before trying to install packages."""
    if pip_is_available(python):
        return

    print("The virtual environment has no pip; attempting repair…", flush=True)
    result = subprocess.run(
        [str(python), "-m", "ensurepip", "--upgrade"],
        cwd=PROJECT_DIR,
        check=False,
    )
    if result.returncode == 0 and pip_is_available(python):
        return

    print("Downloading pip into the private environment (no administrator access needed)…", flush=True)
    bootstrap_path: Optional[Path] = None
    try:
        with tempfile.NamedTemporaryFile(prefix="lottie-get-pip-", suffix=".py", delete=False) as temporary:
            bootstrap_path = Path(temporary.name)
            with urllib.request.urlopen("https://bootstrap.pypa.io/get-pip.py", timeout=60) as response:
                temporary.write(response.read())
        installed_pip = subprocess.run(
            [str(python), str(bootstrap_path), "--disable-pip-version-check"],
            cwd=PROJECT_DIR,
            check=False,
        )
        if installed_pip.returncode == 0 and pip_is_available(python):
            return
    except (OSError, urllib.error.URLError):
        pass
    finally:
        if bootstrap_path is not None:
            bootstrap_path.unlink(missing_ok=True)

    if sys.platform.startswith("linux"):
        raise SetupError(
            "This Python installation does not include venv/pip support.\n\n"
            "On Ubuntu or Debian, run:\n"
            "  sudo apt update\n"
            "  sudo apt install python3-venv\n\n"
            "Then start Lara again."
        )
    raise SetupError(
        "This Python installation does not include ensurepip. "
        "Install a complete Python distribution from https://www.python.org/downloads/ and try again."
    )


def install_dependencies(python: Path, signature: str) -> None:
    print("Installing the desktop GUI dependencies. This can take a few minutes the first time…", flush=True)
    subprocess.check_call(
        [str(python), "-m", "pip", "install", "--disable-pip-version-check", "-e", ".[gui]"],
        cwd=PROJECT_DIR,
    )
    READY_FILE.write_text(signature + "\n", encoding="utf-8")


def main() -> int:
    signature = dependency_signature()
    python = venv_python()

    if not python.is_file():
        create_environment()

    ensure_pip(python)

    installed_signature = ""
    if READY_FILE.is_file():
        installed_signature = READY_FILE.read_text(encoding="utf-8").strip()

    if installed_signature != signature:
        install_dependencies(python, signature)

    app = PROJECT_DIR / "lara.py"
    command = [str(python), str(app), *sys.argv[1:]]
    print("Starting Lara…", flush=True)
    return subprocess.call(command, cwd=PROJECT_DIR)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, SetupError, subprocess.CalledProcessError) as exc:
        print(f"\nSetup failed: {exc}", file=sys.stderr)
        if os.name == "nt":
            input("Press Enter to close…")
        raise SystemExit(1)
