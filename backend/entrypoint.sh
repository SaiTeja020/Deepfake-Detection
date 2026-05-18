#!/bin/sh
set -e

VENV_PYTHON="/app/.venv/bin/python"

# Ensure the venv exists (sanity check)
if [ ! -x "${VENV_PYTHON}" ]; then
  echo "Error: Virtual environment not found at ${VENV_PYTHON}"
  exit 1
fi

echo "Backend starting up..."

exec "$@"
