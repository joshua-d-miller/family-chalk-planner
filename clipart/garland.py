#!/usr/bin/env python3
"""
===============================================================================
 Family Chalk Planner | Clipart | garland.py
===============================================================================
 Version:   0.16.0
 Author:    Joshua D. Miller, Claude
 Updated:   2026-11-10

 Purpose:
     Draws the board's own Christmas pictures (garlands, lights, a wreath,
     ornaments, a bow...) and writes them to clipart/garland.json, in the
     same format as the other picture sets (Iconify JSON), so Stamps shows
     them as the "Garland & trims" style. Drawn for the board and free for
     anyone to use (CC0).

     python3 clipart/garland.py      (after changing a drawing)

     The garlands are long and thin (240 wide), for along the top or the
     bottom of the calendar; everything else is a small picture.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.16.0    2026-11-10   joshua    New file.
                        claude
===============================================================================
"""

import json
import math
import os
import random

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "garland.json")

RED, DRED = "#D7342F", "#9E1F1C"
GOLD, DGOLD = "#F2C14E", "#C99528"
GREEN, MGREEN, DGREEN = "#3C8D40", "#2E7D32", "#1B5E20"
BLUE, PINK, WHITE = "#2F7FD6", "#E35D9C", "#FAFAF5"
BULBS = [RED, GOLD, GREEN, BLUE, PINK]


def f(v):
    """A number, short."""
    return f"{v:.1f}".rstrip("0").rstrip(".")


# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
# ------------------------- #
# | The swag of a garland | #
# ------------------------- #
# Two swags across 240: each a curve from one hook to the next, dipping in
# the middle. at(t) is a point along the whole garland (t 0 to 1) and the
# way it's heading there.
def swag(dip=50, top=10, width=240, loops=2):
    seg = width / loops

    def at(t):
        i = min(loops - 1, int(t * loops))
        u = t * loops - i
        x0, x2 = i * seg, (i + 1) * seg
        x1, y1 = (x0 + x2) / 2, top + dip
        x = (1 - u) ** 2 * x0 + 2 * (1 - u) * u * x1 + u * u * x2
        y = (1 - u) ** 2 * top + 2 * (1 - u) * u * y1 + u * u * top
        dx = 2 * (1 - u) * (x1 - x0) + 2 * u * (x2 - x1)
        dy = 2 * (1 - u) * (y1 - top) + 2 * u * (top - y1)
        return x, y, math.atan2(dy, dx)

    path = " ".join(
        f"M{f(i * seg)} {f(top)} Q{f(i * seg + seg / 2)} {f(top + dip)} {f((i + 1) * seg)} {f(top)}"
        for i in range(loops)
    )
    return at, path


def bulb(x, y, color):
    return (
        f'<rect x="{f(x - 2.4)}" y="{f(y - 1)}" width="4.8" height="4.5" rx="1" fill="#3A3A36"/>'
        f'<ellipse cx="{f(x)}" cy="{f(y + 9.5)}" rx="4.6" ry="7" fill="{color}"/>'
        f'<ellipse cx="{f(x - 1.5)}" cy="{f(y + 7)}" rx="1.3" ry="2.6" fill="#fff" opacity=".55"/>'
    )


def ball(x, y, r, color, dark):
    """An ornament hanging from (x, y)."""
    return (
        f'<line x1="{f(x)}" y1="{f(y)}" x2="{f(x)}" y2="{f(y + 4)}" stroke="#8a7a52" stroke-width="1"/>'
        f'<rect x="{f(x - r * 0.35)}" y="{f(y + 3)}" width="{f(r * 0.7)}" height="{f(r * 0.35)}" rx="1" fill="{DGOLD}"/>'
        f'<circle cx="{f(x)}" cy="{f(y + 3 + r * 0.3 + r)}" r="{f(r)}" fill="{color}" stroke="{dark}" stroke-width="1"/>'
        f'<ellipse cx="{f(x - r * 0.35)}" cy="{f(y + 3 + r * 0.3 + r * 0.6)}" rx="{f(r * 0.25)}" ry="{f(r * 0.4)}" fill="#fff" opacity=".5"/>'
    )


def leaf(x, y, ang, size=1.0, color=MGREEN, edge=DGREEN):
    """A holly leaf, its stem at (x, y), pointing at ang (degrees)."""
    d = ("M0 0 C3 -5 6 -3 8 -7 C10 -3 13 -5 15 -8 C16 -4 19 -3 22 -4 C21 0 21 0 22 4 "
         "C19 3 16 4 15 8 C13 5 10 3 8 7 C6 3 3 5 0 0Z")
    return (f'<path d="{d}" fill="{color}" stroke="{edge}" stroke-width="1" '
            f'transform="translate({f(x)} {f(y)}) rotate({f(ang)}) scale({f(size)})"/>')


def berries(x, y, n=3, r=2.6):
    out = ""
    for k in range(n):
        a = k * 2 * math.pi / n + 0.6
        out += f'<circle cx="{f(x + math.cos(a) * r)}" cy="{f(y + math.sin(a) * r)}" r="{f(r)}" fill="{RED}" stroke="{DRED}" stroke-width=".8"/>'
    return out


def tuft(x, y, rng, scale=1.0):
    """A bunch of pine needles."""
    out = ""
    for _ in range(3):
        a = rng.uniform(0, 180)
        c = rng.choice([DGREEN, MGREEN, GREEN, "#24692A"])
        out += (f'<ellipse cx="{f(x + rng.uniform(-3, 3))}" cy="{f(y + rng.uniform(-3, 3))}" '
                f'rx="{f(9 * scale)}" ry="{f(3.6 * scale)}" fill="{c}" transform="rotate({f(a)} {f(x)} {f(y)})"/>')
    return out


# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
# ------------ #
# | Garlands | #
# ------------ #
def garland_lights():
    at, path = swag(dip=60, top=8)
    body = f'<path d="{path}" fill="none" stroke="#2E4A2E" stroke-width="2.4"/>'
    n = 15
    for i in range(1, n):
        x, y, _ = at(i / n)
        body += bulb(x, y, BULBS[i % len(BULBS)])
    return body, 240, 76


def lights_straight():
    body = '<path d="M0 8 Q30 14 60 8 T120 8 T180 8 T240 8" fill="none" stroke="#2E4A2E" stroke-width="2.4"/>'
    for i in range(12):
        x = 10 + i * 20
        y = 8 + (3 if i % 2 else 0)
        body += bulb(x, y, BULBS[i % len(BULBS)])
    return body, 240, 34


def garland_pine():
    rng = random.Random(7)
    at, _ = swag(dip=56, top=14)
    body = ""
    steps = 70
    for i in range(steps + 1):
        x, y, _ = at(i / steps)
        body += tuft(x, y, rng)
    for i in range(1, 8):
        x, y, _ = at(i / 8)
        body += berries(x, y + 2)
    for t, c, d in [(0.25, RED, DRED), (0.75, GOLD, DGOLD), (0.5, BLUE, "#1d5aa0")]:
        x, y, _ = at(t)
        body += ball(x, y + 3, 7, c, d)
    return body, 240, 92


def garland_holly():
    at, path = swag(dip=54, top=14)
    body = f'<path d="{path}" fill="none" stroke="#5b4a2a" stroke-width="1.6"/>'
    n = 18
    for i in range(n + 1):
        x, y, a = at(i / n)
        deg = math.degrees(a)
        body += leaf(x, y, deg + (-55 if i % 2 else 55), 0.9, MGREEN if i % 3 else GREEN)
    for i in range(1, n, 2):
        x, y, _ = at(i / n)
        body += berries(x, y)
    return body, 240, 76


def garland_tinsel():
    rng = random.Random(3)
    at, path = swag(dip=52, top=12)
    body = f'<path d="{path}" fill="none" stroke="{DGOLD}" stroke-width="3"/>'
    for i in range(320):
        x, y, _ = at(i / 319)
        a = rng.uniform(0, 2 * math.pi)
        r = rng.uniform(4, 9)
        c = rng.choice([GOLD, DGOLD, "#FFE9A0", "#E8B83A"])
        body += (f'<line x1="{f(x)}" y1="{f(y)}" x2="{f(x + math.cos(a) * r)}" y2="{f(y + math.sin(a) * r)}" '
                 f'stroke="{c}" stroke-width="1.3" stroke-linecap="round"/>')
    return body, 240, 72


def garland_beads():
    at, path = swag(dip=54, top=10)
    body = f'<path d="{path}" fill="none" stroke="#9b8b6b" stroke-width="1"/>'
    n = 40
    for i in range(n + 1):
        x, y, _ = at(i / n)
        c, e = (RED, DRED) if i % 2 else (WHITE, "#c9c4b4")
        body += f'<circle cx="{f(x)}" cy="{f(y)}" r="3.4" fill="{c}" stroke="{e}" stroke-width=".8"/>'
    for t, c, d in [(0.25, GOLD, DGOLD), (0.75, GOLD, DGOLD)]:
        x, y, _ = at(t)
        body += ball(x, y + 2, 8, c, d)
    return body, 240, 80


def garland_bunting():
    def at(t):
        x = t * 240
        y = 8 + 4 * 28 * t * (1 - t)
        return x, y

    body = '<path d="M0 8 Q120 64 240 8" fill="none" stroke="#6b5a3a" stroke-width="1.6"/>'
    n = 10
    colors = [(RED, DRED), (GREEN, DGREEN), (WHITE, "#c9c4b4")]
    for i in range(n):
        x1, y1 = at((i + 0.08) / n)
        x2, y2 = at((i + 0.92) / n)
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2 + 24
        c, e = colors[i % 3]
        body += f'<path d="M{f(x1)} {f(y1)} L{f(x2)} {f(y2)} L{f(mx)} {f(my)}Z" fill="{c}" stroke="{e}" stroke-width="1"/>'
        if i % 3 != 2:
            body += f'<circle cx="{f(mx)}" cy="{f((y1 + y2) / 2 + 9)}" r="2" fill="#fff" opacity=".8"/>'
    return body, 240, 64


def garland_candy():
    _, path = swag(dip=52, top=14)
    body = (f'<path d="{path}" fill="none" stroke="#d9d4c4" stroke-width="10" stroke-linecap="round"/>'
            f'<path d="{path}" fill="none" stroke="{WHITE}" stroke-width="8" stroke-linecap="round"/>'
            f'<path d="{path}" fill="none" stroke="{RED}" stroke-width="8" stroke-dasharray="7 7"/>')
    for x in (14, 120, 226):
        body += bow_at(x, 14, 0.45)
    return body, 240, 64


# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
# ------------------ #
# | Small pictures | #
# ------------------ #
def bow_at(x, y, k=1.0):
    return (
        f'<g transform="translate({f(x)} {f(y)}) scale({f(k)})">'
        f'<path d="M0 0 C-10 -16 -32 -14 -30 0 C-32 14 -10 16 0 0Z" fill="{RED}" stroke="{DRED}" stroke-width="1.6"/>'
        f'<path d="M0 0 C10 -16 32 -14 30 0 C32 14 10 16 0 0Z" fill="{RED}" stroke="{DRED}" stroke-width="1.6"/>'
        f'<path d="M-3 2 L-14 30 L-8 27 L-4 33 Z" fill="{RED}" stroke="{DRED}" stroke-width="1.4"/>'
        f'<path d="M3 2 L14 30 L8 27 L4 33 Z" fill="{RED}" stroke="{DRED}" stroke-width="1.4"/>'
        f'<circle cx="0" cy="0" r="6" fill="{DRED}"/>'
        "</g>"
    )


def wreath():
    rng = random.Random(11)
    body = ""
    for i in range(48):
        a = i / 48 * 2 * math.pi
        r = 32 + rng.uniform(-3, 3)
        body += tuft(50 + math.cos(a) * r, 48 + math.sin(a) * r, rng, 1.25)
    for i in range(8):
        a = i / 8 * 2 * math.pi + 0.3
        body += berries(50 + math.cos(a) * 34, 48 + math.sin(a) * 34, 3, 2.8)
    body += bow_at(50, 80, 0.62)
    return body, 100, 104


def holly_sprig():
    body = leaf(40, 34, 200, 1.5) + leaf(40, 34, -20, 1.5, GREEN) + leaf(40, 34, 95, 1.3, MGREEN)
    body += berries(40, 32, 3, 4)
    return body, 80, 70


def ornament(color, dark, name):
    body = ball(30, 6, 22, color, dark)
    body += f'<path d="M30 6 C24 -2 36 -2 30 6" fill="none" stroke="#8a7a52" stroke-width="1.6"/>'
    body += f'<path d="M10 52 Q30 60 50 52" fill="none" stroke="#fff" stroke-width="2.4" opacity=".55"/>'
    return body, 60, 82


def bow():
    return bow_at(40, 26, 1.15), 80, 70


def stocking():
    d = "M14 18 L46 18 L46 58 C46 72 34 80 20 80 L8 80 C0 80 0 66 8 64 L22 60 L14 56 Z"
    body = (f'<path d="{d}" fill="{RED}" stroke="{DRED}" stroke-width="2"/>'
            f'<rect x="10" y="6" width="40" height="15" rx="6" fill="{WHITE}" stroke="#c9c4b4" stroke-width="1.5"/>'
            f'<circle cx="28" cy="44" r="3" fill="{GOLD}"/><circle cx="36" cy="54" r="2.5" fill="{WHITE}"/>'
            f'<circle cx="22" cy="68" r="2.5" fill="{GOLD}"/>')
    return body, 60, 86


def candy_cane():
    d = "M16 86 L16 26 C16 4 46 4 46 24"
    body = (f'<path d="{d}" fill="none" stroke="#d9d4c4" stroke-width="13" stroke-linecap="round"/>'
            f'<path d="{d}" fill="none" stroke="{WHITE}" stroke-width="11" stroke-linecap="round"/>'
            f'<path d="{d}" fill="none" stroke="{RED}" stroke-width="11" stroke-dasharray="7 7"/>')
    return body, 62, 96


def mistletoe():
    body = (f'<path d="M40 4 L40 22" stroke="{DRED}" stroke-width="2"/>'
            + bow_at(40, 10, 0.4)
            + f'<path d="M40 22 L24 44 M40 22 L56 44 M40 22 L40 50" stroke="#6f8f4a" stroke-width="2" fill="none"/>')
    for x, y, a in [(24, 44, 200), (24, 44, 250), (56, 44, -20), (56, 44, -70), (40, 50, 110), (40, 50, 70)]:
        body += (f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="12" ry="5" fill="#8DB65A" stroke="#5e8a37" stroke-width="1" '
                 f'transform="rotate({a} {x} {y}) translate(10 0)"/>')
    for x, y in [(36, 30), (44, 31), (40, 36), (30, 40), (50, 41)]:
        body += f'<circle cx="{x}" cy="{y}" r="3.2" fill="{WHITE}" stroke="#c9c4b4" stroke-width=".8"/>'
    return body, 80, 72


def present():
    body = (f'<rect x="8" y="26" width="54" height="40" rx="3" fill="{RED}" stroke="{DRED}" stroke-width="2"/>'
            f'<rect x="4" y="18" width="62" height="12" rx="3" fill="{RED}" stroke="{DRED}" stroke-width="2"/>'
            f'<rect x="30" y="18" width="10" height="48" fill="{GOLD}"/>'
            f'<path d="M35 18 C22 2 12 10 22 16 Z M35 18 C48 2 58 10 48 16 Z" fill="{GOLD}" stroke="{DGOLD}" stroke-width="1.5"/>')
    return body, 70, 70


def gingerbread():
    c, e = "#B9773F", "#8A5328"
    body = (f'<circle cx="30" cy="16" r="12" fill="{c}" stroke="{e}" stroke-width="1.5"/>'
            f'<path d="M14 30 L46 30 L56 44 L50 48 L42 40 L42 56 L50 74 L41 76 L30 60 L19 76 L10 74 L18 56 L18 40 L10 48 L4 44 Z" '
            f'fill="{c}" stroke="{e}" stroke-width="1.5" stroke-linejoin="round"/>'
            f'<circle cx="26" cy="14" r="1.6" fill="#3a2a1a"/><circle cx="34" cy="14" r="1.6" fill="#3a2a1a"/>'
            f'<path d="M25 20 Q30 24 35 20" stroke="#fff" stroke-width="1.6" fill="none"/>'
            f'<circle cx="30" cy="38" r="2" fill="{RED}"/><circle cx="30" cy="46" r="2" fill="{GREEN}"/>'
            f'<path d="M8 44 l4 -3 M52 44 l-4 -3 M14 72 l4 -2 M46 72 l-4 -2" stroke="#fff" stroke-width="1.6"/>')
    return body, 60, 80


# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
# ------------------ #
# | Writing it out | #
# ------------------ #
PICTURES = {
    "garland-lights": garland_lights,
    "garland-pine": garland_pine,
    "garland-holly": garland_holly,
    "garland-tinsel": garland_tinsel,
    "garland-beads": garland_beads,
    "garland-bunting": garland_bunting,
    "garland-candy-cane": garland_candy,
    "string-lights": lights_straight,
    "wreath": wreath,
    "holly": holly_sprig,
    "ornament-red": lambda: ornament(RED, DRED, "red"),
    "ornament-gold": lambda: ornament(GOLD, DGOLD, "gold"),
    "ornament-blue": lambda: ornament(BLUE, "#1d5aa0", "blue"),
    "bow": bow,
    "stocking": stocking,
    "candy-cane": candy_cane,
    "mistletoe": mistletoe,
    "present": present,
    "gingerbread-man": gingerbread,
}


def main():
    icons = {}
    for name, draw in PICTURES.items():
        body, w, h = draw()
        icons[name] = {"body": body, "width": w, "height": h}
    with open(OUT, "w") as fh:
        json.dump({"prefix": "cp", "icons": icons, "width": 100, "height": 100}, fh, separators=(",", ":"))
    print(f"{len(icons)} pictures -> {OUT}")


if __name__ == "__main__":
    main()
