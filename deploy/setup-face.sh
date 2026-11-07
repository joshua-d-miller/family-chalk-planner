#!/usr/bin/env bash
: <<'HEADER'
===============================================================================
 Family Chalk Planner | Deploy | setup-face.sh
===============================================================================
 Version:   0.1.0
 Author:    Joshua D. Miller, Claude
 Updated:   2026-10-11

 Purpose:
     Installs the optional face finder for photo framing (OpenCV YuNet): a
     Python venv in <app>/face/venv (about 220 MB) and the
     checksum-verified model (about 230 KB). Safe to run again.

     setup-face.sh [APP_DIR]
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.1.0     2026-10-11   joshua    Standalone service, installer, updater,
                        claude    tests.
===============================================================================
HEADER

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
