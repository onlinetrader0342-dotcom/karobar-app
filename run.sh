#!/bin/bash
# Karobar server chalao: bash ~/workspace/karobar-app/run.sh
cd "$(dirname "$0")/backend"
exec ../.venv/bin/uvicorn app:app --host 0.0.0.0 --port 8777
