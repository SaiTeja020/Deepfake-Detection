#!/bin/sh
set -e

REQ_FILE="/app/requirements.txt"
REQ_HASH_FILE="/app/.venv/.requirements.sha256"
VENV_PYTHON="/app/.venv/bin/python"

# A persisted Docker volume can leave a partial/broken .venv directory.
# Validate the interpreter path and recreate the venv when needed.
if [ ! -x "${VENV_PYTHON}" ]; then
  if [ -d "/app/.venv" ]; then
    uv venv --clear /app/.venv
  else
    uv venv /app/.venv
  fi
fi

CURRENT_HASH="$(python -c "import hashlib, pathlib; print(hashlib.sha256(pathlib.Path('${REQ_FILE}').read_bytes()).hexdigest())")"
SAVED_HASH=""
if [ -f "${REQ_HASH_FILE}" ]; then
  SAVED_HASH="$(cat "${REQ_HASH_FILE}")"
fi

if [ "${CURRENT_HASH}" != "${SAVED_HASH}" ]; then
  uv pip install --python "${VENV_PYTHON}" -r "${REQ_FILE}" --extra-index-url https://download.pytorch.org/whl/cpu
  printf "%s" "${CURRENT_HASH}" > "${REQ_HASH_FILE}"
fi

exec "$@"
