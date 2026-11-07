#!/usr/bin/env python3
"""
===============================================================================
 Family Chalk Planner | Face finder | facefocus.py
===============================================================================
 Version:   0.1.0
 Author:    Joshua D. Miller, Claude
 Updated:   2026-10-11

 Purpose:
     Finds the faces in a photo so the board can frame people: the
     polaroids beside the month name zoom in on them, and the slideshow
     keeps them in view and puts its clock where it covers no one. Uses
     OpenCV's YuNet detector (installed by deploy/setup-face.sh).

     facefocus.py MODEL.onnx PHOTO [PHOTO ...]

     Prints one JSON line per photo: {"file", "w", "h", "faces": [[x, y,
     w, h, score], ...]}, with the face boxes as fractions of the image (0
     to 1).
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.1.0     2026-10-11   joshua    Standalone service, installer, updater,
                        claude    tests.
===============================================================================
"""

import json
import sys

import cv2

MAX_SIDE = 1024      # detect on a smaller copy; plenty for faces and fast on the N100
MIN_SCORE = 0.75


def faces_in(det, path):
    img = cv2.imread(path, cv2.IMREAD_COLOR)   # applies EXIF rotation, like the browser does
    if img is None:
        return {"file": path, "error": "unreadable"}
    h, w = img.shape[:2]
    s = min(1.0, MAX_SIDE / max(w, h))
    small = cv2.resize(img, (max(1, round(w * s)), max(1, round(h * s))), interpolation=cv2.INTER_AREA) if s < 1 else img
    sh, sw = small.shape[:2]
    det.setInputSize((sw, sh))
    _, found = det.detect(small)
    faces = []
    for f in (found if found is not None else []):
        x, y, fw, fh, score = float(f[0]), float(f[1]), float(f[2]), float(f[3]), float(f[-1])
        if score < MIN_SCORE or fw < 12 or fh < 12:
            continue
        faces.append([round(max(0, x) / sw, 4), round(max(0, y) / sh, 4), round(fw / sw, 4), round(fh / sh, 4), round(score, 3)])
    return {"file": path, "w": w, "h": h, "faces": faces}


def main():
    if len(sys.argv) < 3:
        print(__doc__, file=sys.stderr)
        sys.exit(2)
    det = cv2.FaceDetectorYN.create(sys.argv[1], "", (320, 320), MIN_SCORE, 0.3, 5000)
    for path in sys.argv[2:]:
        try:
            print(json.dumps(faces_in(det, path)), flush=True)
        except Exception as e:  # one bad photo shouldn't stop the rest
            print(json.dumps({"file": path, "error": str(e)}), flush=True)


if __name__ == "__main__":
    main()
