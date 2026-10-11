#!/usr/bin/env bash
# setup-face.sh - optional face finder for photo framing (OpenCV YuNet).
# Creates a Python venv in <app>/face/venv (~220 MB) and downloads the checksum-verified
# model (~230 KB). Safe to re-run. Usage: setup-face.sh [APP_DIR]
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
APP_DIR="${1:-/opt/family-chalk-planner}"
D="$APP_DIR/face"
MODEL_URL=https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx
MODEL_SHA=8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4
mkdir -p "$D"

if ! python3 -c 'import venv, ensurepip' 2>/dev/null; then
  apt-get update -qq && apt-get install -y -qq python3 python3-venv >/dev/null
fi
[ -x "$D/venv/bin/python" ] || python3 -m venv "$D/venv"
"$D/venv/bin/pip" install -q --no-cache-dir --disable-pip-version-check -r "$D/requirements.txt"

if ! echo "$MODEL_SHA  $D/yunet.onnx" | sha256sum -c --status 2>/dev/null; then
  curl -fsSL -o "$D/yunet.onnx.part" "$MODEL_URL"
  echo "$MODEL_SHA  $D/yunet.onnx.part" | sha256sum -c --status || { echo "Face model checksum mismatch - not installed" >&2; rm -f "$D/yunet.onnx.part"; exit 1; }
  mv "$D/yunet.onnx.part" "$D/yunet.onnx"
fi
"$D/venv/bin/python" -c 'import cv2; assert hasattr(cv2, "FaceDetectorYN"); print("Face finder ready: OpenCV", cv2.__version__)'
