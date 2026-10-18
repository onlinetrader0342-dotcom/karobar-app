#!/bin/bash
# Karobar server restart (safe: apni command line ko match nahi karta)
pkill -f "uvicorn app:app" 2>/dev/null
sleep 2
cd "$(dirname "$0")/backend"
exec ../.venv/bin/uvicorn app:app --host 0.0.0.0 --port 8777
