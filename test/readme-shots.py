#!/usr/bin/env python3
"""
===============================================================================
 Family Chalk Planner | Tests | readme-shots.py
===============================================================================
 Version:   0.17.1
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-14
 Updated:   2026-11-14

 Purpose:
     Copies the README's screenshots (taken by
     test/e2e/readme-shots.spec.ts into test-results/readme) into
     docs/images: the wall and the family screen as they are, and the four
     backgrounds side by side.

     pip install pillow
     python3 test/readme-shots.py
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.17.1    2026-11-14   joshua    New file.
                        claude
===============================================================================
"""

import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "test-results", "readme")
OUT = os.path.join(ROOT, "docs", "images")

for name in ("wall", "tablet"):
    Image.open(os.path.join(SRC, name + ".png")).convert("RGB").save(os.path.join(OUT, name + ".jpg"), quality=85)

sheet = Image.new("RGB", (1610, 910), (255, 255, 255))
for i, s in enumerate(("green", "cork", "kraft", "white")):
    im = Image.open(os.path.join(SRC, "bg-" + s + ".png")).convert("RGB").resize((800, 450), Image.LANCZOS)
    sheet.paste(im, ((i % 2) * 810, (i // 2) * 460))
sheet.save(os.path.join(OUT, "backgrounds.jpg"), quality=85)
print("docs/images: wall.jpg, tablet.jpg, backgrounds.jpg")
