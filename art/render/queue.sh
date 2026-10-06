#!/usr/bin/env bash
# Render scenes sequentially at low priority: ./queue.sh hero track_embedded team:sumo ...
cd "$(dirname "$0")"
mkdir -p logs
for job in "$@"; do
  scene="${job%%:*}"; arg=""
  [[ "$job" == *:* ]] && arg="${job#*:}"
  start=$(date +%s)
  nice -n 12 /opt/render-venv/bin/python "scenes/$scene.py" -- final $arg > "logs/${job//:/_}.log" 2>&1
  code=$?
  echo "$(date +%T) $job done in $(( $(date +%s) - start ))s (exit $code)" >> logs/queue.log
done
