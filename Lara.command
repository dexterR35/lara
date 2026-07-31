#!/usr/bin/env bash
# Double-click launcher for macOS.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$SCRIPT_DIR/lara" "$@"
