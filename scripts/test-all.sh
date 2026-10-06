#!/usr/bin/env bash
# Runs the backend (pytest) and frontend (Vitest) unit suites.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
py="$root/backend/.venv/Scripts/python"
[ -x "$py" ] || [ -x "$py.exe" ] || py="$root/backend/.venv/bin/python"
(cd "$root/backend" && "$py" -m pytest -q)
(cd "$root/frontend" && npx vitest run)
