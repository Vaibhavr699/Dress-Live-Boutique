#!/usr/bin/env bash
# Fetch the MediaPipe Pose Landmarker (lite) model used by the FastAPI
# pose helpers. Idempotent — skips the download if the file already
# exists. Override the destination with POSE_LANDMARKER_MODEL_PATH.
#
# The lite model (~5.5MB) is plenty for our 256-px torso-keypoint
# pipeline. For tighter accuracy on full-body validation, swap the URL
# to pose_landmarker_full.task and bump POSE_LANDMARKER_MODEL_PATH.

set -euo pipefail

URL="https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"
DEST="${POSE_LANDMARKER_MODEL_PATH:-$(dirname "$0")/../models/pose_landmarker_lite.task}"

mkdir -p "$(dirname "$DEST")"

if [[ -f "$DEST" ]]; then
  echo "[pose-model] already present at $DEST"
  exit 0
fi

echo "[pose-model] downloading → $DEST"
curl -sSL --fail -o "$DEST" "$URL"
echo "[pose-model] done: $(du -h "$DEST" | cut -f1)"
