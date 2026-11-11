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
     ornaments, a tree, snowflakes, a bow...; the lights, a star and a
     candle twinkle) and writes them to clipart/garland.json, in the
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
# ----------------------- #
# | Lights that twinkle | #
# ----------------------- #
# Animated (SVG's own animation, so they twinkle on any screen): a bulb
# brightens and dims, each color at its own pace, so a row of them never
# blinks all at once. A border made only of bulbs is strung on a wire
# around the calendar (web/src/board/Month.tsx).
def twinkle(dur, begin, low=0.35):
    return (f'<animate attributeName="opacity" values="1;{low};1" dur="{dur}s" begin="{begin}s" '
            f'repeatCount="indefinite"/>')


def tw_bulb(x, y, color, dur, begin, k=1.0):
    """A bulb hanging from (x, y), glowing and twinkling."""
    return (
        f'<g transform="translate({f(x)} {f(y)}) scale({f(k)})">'
        f'<ellipse cx="0" cy="11" rx="8" ry="10" fill="{color}" opacity=".22">{twinkle(dur, begin, 0)}</ellipse>'
        '<rect x="-2.6" y="-1" width="5.2" height="5" rx="1" fill="#3A3A36"/>'
        f'<g>{twinkle(dur, begin)}'
        f'<ellipse cx="0" cy="11" rx="5" ry="7.6" fill="{color}"/>'
        '<ellipse cx="-1.6" cy="8.4" rx="1.4" ry="2.8" fill="#fff" opacity=".6"/></g>'
        "</g>"
    )


BULB_PACE = {"red": (1.9, -0.2), "gold": (2.3, -1.1), "green": (1.7, -0.7), "blue": (2.1, -1.5), "pink": (2.5, -0.4)}
BULB_COLOR = {"red": RED, "gold": GOLD, "green": GREEN, "blue": BLUE, "pink": PINK}


def border_bulb(name):
    dur, begin = BULB_PACE[name]
    return tw_bulb(15, 6, BULB_COLOR[name], dur, begin, 1.25), 30, 36


def garland_lights_twinkle():
    at, path = swag(dip=60, top=8)
    body = f'<path d="{path}" fill="none" stroke="#2E4A2E" stroke-width="2.4"/>'
    n = 15
    names = list(BULB_PACE)
    for i in range(1, n):
        x, y, _ = at(i / n)
        dur, begin = BULB_PACE[names[i % 5]]
        body += tw_bulb(x, y, BULB_COLOR[names[i % 5]], dur, begin - i * 0.13)
    return body, 240, 80


def string_lights_twinkle():
    body = '<path d="M0 8 Q30 14 60 8 T120 8 T180 8 T240 8" fill="none" stroke="#2E4A2E" stroke-width="2.4"/>'
    names = list(BULB_PACE)
    for i in range(12):
        dur, begin = BULB_PACE[names[i % 5]]
        body += tw_bulb(10 + i * 20, 8 + (3 if i % 2 else 0), BULB_COLOR[names[i % 5]], dur, begin - i * 0.17)
    return body, 240, 40


def star_points(cx, cy, r1, r2, n=5, rot=-90):
    pts = []
    for i in range(n * 2):
        r = r1 if i % 2 == 0 else r2
        a = math.radians(rot + i * 180 / n)
        pts.append(f"{f(cx + math.cos(a) * r)},{f(cy + math.sin(a) * r)}")
    return " ".join(pts)


def star_twinkle():
    body = (f'<polygon points="{star_points(40, 41, 30, 13)}" fill="{GOLD}" stroke="{DGOLD}" stroke-width="2" stroke-linejoin="round"/>'
            f'<polygon points="{star_points(40, 41, 30, 13)}" fill="#FFF3B8" opacity="0">'
            '<animate attributeName="opacity" values="0;.7;0" dur="2.2s" repeatCount="indefinite"/></polygon>')
    for x, y, b in [(14, 12, -0.3), (68, 18, -1.2), (66, 66, -0.8)]:
        body += (f'<path d="M{x} {y - 6} L{x + 1.5} {y - 1.5} L{x + 6} {y} L{x + 1.5} {y + 1.5} L{x} {y + 6} '
                 f'L{x - 1.5} {y + 1.5} L{x - 6} {y} L{x - 1.5} {y - 1.5}Z" fill="#fff">{twinkle(1.6, b, 0)}</path>')
    return body, 80, 80


# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
# --------------------- #
# | More for December | #
# --------------------- #
def tree():
    body = (f'<rect x="34" y="78" width="12" height="14" fill="#7A4E2A"/>'
            f'<path d="M40 8 L66 46 L56 46 L74 80 L6 80 L24 46 L14 46 Z" fill="{MGREEN}" stroke="{DGREEN}" stroke-width="2" stroke-linejoin="round"/>'
            f'<path d="M22 60 Q40 68 60 56 M18 74 Q42 82 66 70" stroke="{GOLD}" stroke-width="2" fill="none"/>')
    for x, y, c in [(32, 40, RED), (48, 50, BLUE), (30, 64, GOLD), (52, 70, RED), (42, 60, PINK), (22, 76, BLUE), (60, 78, GOLD)]:
        body += f'<circle cx="{x}" cy="{y}" r="3.2" fill="{c}"/>'
    body += f'<polygon points="{star_points(40, 10, 9, 4)}" fill="{GOLD}" stroke="{DGOLD}" stroke-width="1"/>'
    return body, 80, 94


def gold_star():
    return (f'<polygon points="{star_points(40, 42, 34, 15)}" fill="{GOLD}" stroke="{DGOLD}" stroke-width="2.5" stroke-linejoin="round"/>'
            f'<polygon points="{star_points(40, 42, 18, 8)}" fill="#FFE9A0" opacity=".6"/>'), 80, 80


def snowflake(kind):
    arms = ""
    for i in range(6):
        a = i * 60
        if kind == 1:
            arm = "M0 0 L0 -32 M0 -14 L-8 -22 M0 -14 L8 -22 M0 -24 L-6 -30 M0 -24 L6 -30"
        elif kind == 2:
            arm = "M0 0 L0 -32 M0 -20 L-10 -26 M0 -20 L10 -26 M0 -10 L-6 -14 M0 -10 L6 -14"
        else:
            arm = "M0 0 L0 -30 M-6 -18 L0 -24 L6 -18 M-4 -28 L0 -33 L4 -28"
        arms += f'<path d="{arm}" transform="translate(40 40) rotate({a})"/>'
    return (f'<g fill="none" stroke="#DDEEFF" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">{arms}</g>'
            f'<circle cx="40" cy="40" r="4" fill="#DDEEFF"/>'), 80, 80


def poinsettia():
    body = ""
    for i in range(8):
        body += (f'<path d="M0 0 C6 -10 4 -24 0 -32 C-4 -24 -6 -10 0 0Z" fill="{"#C62828" if i % 2 else RED}" stroke="{DRED}" '
                 f'stroke-width="1" transform="translate(40 40) rotate({i * 45 + 22})"/>')
    for i in range(3):
        body += (f'<path d="M0 0 C5 -8 3 -18 0 -24 C-3 -18 -5 -8 0 0Z" fill="{MGREEN}" stroke="{DGREEN}" stroke-width="1" '
                 f'transform="translate(40 40) rotate({i * 120 + 70})" opacity=".9"/>')
    for x, y in [(37, 38), (43, 37), (40, 43), (36, 43), (44, 43)]:
        body += f'<circle cx="{x}" cy="{y}" r="2.4" fill="{GOLD}" stroke="{DGOLD}" stroke-width=".6"/>'
    return body, 80, 80


def santa_hat():
    return (f'<path d="M12 62 C14 30 34 10 58 18 C70 22 74 38 70 48 L64 46 C64 36 58 30 50 32 C42 34 40 48 44 62 Z" '
            f'fill="{RED}" stroke="{DRED}" stroke-width="2"/>'
            f'<rect x="6" y="58" width="56" height="16" rx="8" fill="{WHITE}" stroke="#c9c4b4" stroke-width="1.5"/>'
            f'<circle cx="68" cy="52" r="8" fill="{WHITE}" stroke="#c9c4b4" stroke-width="1.5"/>'), 80, 80


def mittens():
    def m(x, c, flip):
        d = "M0 0 L0 -26 C0 -40 26 -40 26 -24 L26 0 Z"
        th = "M0 -16 C-10 -16 -12 -6 -4 -4"
        sx = -1 if flip else 1
        return (f'<g transform="translate({x} 70) scale({sx} 1)">'
                f'<path d="{d}" fill="{c}" stroke="#5a1a1a" stroke-width="1.5"/>'
                f'<path d="{th}" fill="none" stroke="#5a1a1a" stroke-width="1.5"/>'
                f'<path d="M0 -24 C-12 -24 -14 -10 -4 -8 L0 -8 Z" fill="{c}" stroke="#5a1a1a" stroke-width="1.5"/>'
                f'<rect x="-1" y="0" width="28" height="9" rx="3" fill="{WHITE}" stroke="#c9c4b4" stroke-width="1"/>'
                f'<path d="M6 -22 l4 4 l4 -4 l4 4" stroke="#fff" stroke-width="1.6" fill="none"/></g>')
    body = m(16, RED, False) + m(70, GREEN, True)
    body += f'<path d="M30 46 C40 30 48 30 56 46" stroke="{GOLD}" stroke-width="1.6" fill="none"/>'
    return body, 86, 84


def cocoa():
    return (f'<path d="M26 22 C22 14 30 10 26 4 M38 22 C34 14 42 10 38 4" stroke="#E8E2D6" stroke-width="2.2" fill="none" stroke-linecap="round"/>'
            f'<path d="M12 26 L58 26 L54 72 C53 76 50 78 46 78 L24 78 C20 78 17 76 16 72 Z" fill="{RED}" stroke="{DRED}" stroke-width="2"/>'
            f'<path d="M57 34 C70 34 70 54 55 56" fill="none" stroke="{DRED}" stroke-width="5"/>'
            f'<ellipse cx="35" cy="27" rx="22" ry="5" fill="#6B3E22"/>'
            f'<circle cx="28" cy="25" r="4" fill="#fff"/><circle cx="37" cy="23" r="4" fill="#fff"/><circle cx="44" cy="26" r="3.5" fill="#fff"/>'
            f'<path d="M20 48 L50 48 M22 58 L48 58" stroke="#fff" stroke-width="3" stroke-dasharray="4 4"/>'), 74, 82


def jingle_bells():
    def bell(x, y, a):
        return (f'<g transform="translate({x} {y}) rotate({a})">'
                f'<path d="M-14 12 C-14 -4 -10 -14 0 -14 C10 -14 14 -4 14 12 Z" fill="{GOLD}" stroke="{DGOLD}" stroke-width="2"/>'
                f'<rect x="-16" y="10" width="32" height="5" rx="2.5" fill="{DGOLD}"/>'
                f'<circle cx="0" cy="17" r="4" fill="{DGOLD}"/><ellipse cx="-5" cy="-3" rx="2.4" ry="5" fill="#fff" opacity=".5"/></g>')
    return bell(28, 46, 18) + bell(52, 46, -18) + bow_at(40, 22, 0.55), 80, 74


def snowman():
    return (f'<circle cx="40" cy="70" r="20" fill="{WHITE}" stroke="#c9c4b4" stroke-width="2"/>'
            f'<circle cx="40" cy="38" r="14" fill="{WHITE}" stroke="#c9c4b4" stroke-width="2"/>'
            f'<rect x="28" y="10" width="24" height="16" fill="#2a2a2a"/><rect x="22" y="24" width="36" height="4" fill="#2a2a2a"/>'
            f'<rect x="28" y="20" width="24" height="3" fill="{RED}"/>'
            f'<circle cx="35" cy="35" r="1.8" fill="#2a2a2a"/><circle cx="45" cy="35" r="1.8" fill="#2a2a2a"/>'
            f'<path d="M40 39 L52 42 L40 42 Z" fill="#F08A2C"/>'
            f'<path d="M28 50 Q40 56 52 50 L52 56 L46 66 L42 56 Q40 56 28 54 Z" fill="{RED}"/>'
            f'<circle cx="40" cy="64" r="2" fill="#2a2a2a"/><circle cx="40" cy="74" r="2" fill="#2a2a2a"/>'
            f'<path d="M21 62 L6 52 M10 55 L6 60 M59 62 L74 52 M70 55 L74 60" stroke="#7A4E2A" stroke-width="2.4" stroke-linecap="round"/>'), 80, 92


def reindeer():
    a = "#7A4E2A"
    return (f'<path d="M26 22 C18 12 20 4 24 2 M24 12 L14 8 M30 24 C26 12 32 6 34 4" stroke="{a}" stroke-width="3" fill="none" stroke-linecap="round"/>'
            f'<path d="M54 22 C62 12 60 4 56 2 M56 12 L66 8 M50 24 C54 12 48 6 46 4" stroke="{a}" stroke-width="3" fill="none" stroke-linecap="round"/>'
            f'<ellipse cx="18" cy="34" rx="8" ry="4" fill="#A0693A" transform="rotate(-25 18 34)"/>'
            f'<ellipse cx="62" cy="34" rx="8" ry="4" fill="#A0693A" transform="rotate(25 62 34)"/>'
            f'<path d="M24 32 C24 18 56 18 56 32 C56 48 50 66 40 66 C30 66 24 48 24 32Z" fill="#A0693A" stroke="#7A4E2A" stroke-width="2"/>'
            f'<circle cx="33" cy="36" r="3" fill="#2a2a2a"/><circle cx="47" cy="36" r="3" fill="#2a2a2a"/>'
            f'<circle cx="40" cy="62" r="7" fill="{RED}"/><circle cx="38" cy="60" r="2" fill="#fff" opacity=".6"/>'), 80, 72


def gift_tag():
    return (f'<path d="M20 10 L70 10 L70 50 L20 50 L6 30 Z" fill="#F4E6C8" stroke="#B89A62" stroke-width="2" stroke-linejoin="round"/>'
            f'<circle cx="18" cy="30" r="3.5" fill="#1d1d1c" stroke="#B89A62" stroke-width="1.5"/>'
            f'<path d="M15 30 C8 30 2 38 2 46" stroke="{RED}" stroke-width="2" fill="none"/>'
            f'<path d="M30 22 L62 22 M30 30 L58 30 M30 38 L50 38" stroke="#B89A62" stroke-width="1.6" stroke-dasharray="3 3"/>'), 76, 56


def candle():
    return (f'<ellipse cx="30" cy="12" rx="5" ry="9" fill="{GOLD}">{twinkle(1.3, -0.4, 0.75)}</ellipse>'
            f'<ellipse cx="30" cy="15" rx="2.4" ry="5" fill="#fff" opacity=".8"/>'
            f'<line x1="30" y1="20" x2="30" y2="26" stroke="#3a3a3a" stroke-width="1.6"/>'
            f'<rect x="20" y="26" width="20" height="44" rx="3" fill="{RED}" stroke="{DRED}" stroke-width="2"/>'
            f'<path d="M24 26 L24 34 Q26 38 28 34 L28 26" fill="#fff" opacity=".35"/>'
            + leaf(16, 74, 200, 1.0) + leaf(44, 74, -20, 1.0) + berries(30, 72, 3, 3)), 60, 84


def sugar_cookie():
    return (f'<polygon points="{star_points(40, 42, 34, 17)}" fill="#E2B074" stroke="#B9773F" stroke-width="2" stroke-linejoin="round"/>'
            f'<polygon points="{star_points(40, 42, 26, 12)}" fill="{WHITE}" opacity=".9"/>'
            f'<circle cx="40" cy="42" r="3" fill="{RED}"/><circle cx="32" cy="34" r="2" fill="{GREEN}"/><circle cx="48" cy="34" r="2" fill="{BLUE}"/>'
            f'<circle cx="34" cy="52" r="2" fill="{PINK}"/><circle cx="47" cy="51" r="2" fill="{GOLD}"/>'), 80, 80


def pine_sprig():
    rng = random.Random(5)
    body = '<path d="M8 64 Q40 44 74 16" stroke="#6b4a2a" stroke-width="2.4" fill="none"/>'
    for i in range(16):
        t = i / 15
        x, y = 8 + 66 * t, 64 - 48 * t + 8 * math.sin(t * math.pi)
        body += tuft(x, y, rng, 0.8)
    body += f'<ellipse cx="30" cy="66" rx="7" ry="10" fill="#8A5A2B" stroke="#5e3a1a" stroke-width="1.5" transform="rotate(-20 30 66)"/>'
    body += f'<path d="M25 60 l9 3 M24 66 l10 3 M26 72 l8 2" stroke="#5e3a1a" stroke-width="1.2"/>'
    return body, 80, 80


def ornament_striped():
    body, w, h = ornament(PINK, "#a8366c", "pink")
    body += (f'<path d="M10 52 Q30 46 50 52" stroke="{WHITE}" stroke-width="4" fill="none"/>'
             f'<path d="M12 62 Q30 70 48 62" stroke="{WHITE}" stroke-width="4" fill="none"/>')
    return body, w, h


def north_pole():
    return (f'<rect x="36" y="20" width="8" height="66" fill="{WHITE}" stroke="#c9c4b4" stroke-width="1"/>'
            + "".join(f'<path d="M36 {24 + i * 12} L44 {30 + i * 12} L44 {34 + i * 12} L36 {28 + i * 12} Z" fill="{RED}"/>' for i in range(5))
            + f'<circle cx="40" cy="16" r="6" fill="{GOLD}"/>'
            f'<path d="M44 30 L76 26 L80 34 L76 42 L44 40 Z" fill="#8A5A2B" stroke="#5e3a1a" stroke-width="1.5"/>'
            f'<path d="M50 32 h20 M50 37 h16" stroke="#F4E6C8" stroke-width="2"/>'), 82, 90


TWINKLE = {
    "bulb-red": lambda: border_bulb("red"),
    "bulb-gold": lambda: border_bulb("gold"),
    "bulb-green": lambda: border_bulb("green"),
    "bulb-blue": lambda: border_bulb("blue"),
    "bulb-pink": lambda: border_bulb("pink"),
    "garland-lights-twinkle": garland_lights_twinkle,
    "string-lights-twinkle": string_lights_twinkle,
    "star-twinkle": star_twinkle,
    "candle": candle,
}
MORE = {
    "christmas-tree": tree,
    "star": gold_star,
    "snowflake-1": lambda: snowflake(1),
    "snowflake-2": lambda: snowflake(2),
    "snowflake-3": lambda: snowflake(3),
    "poinsettia": poinsettia,
    "santa-hat": santa_hat,
    "mittens": mittens,
    "hot-cocoa": cocoa,
    "jingle-bells": jingle_bells,
    "snowman": snowman,
    "reindeer": reindeer,
    "gift-tag": gift_tag,
    "sugar-cookie": sugar_cookie,
    "pine-sprig": pine_sprig,
    "ornament-striped": ornament_striped,
    "north-pole": north_pole,
}


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
    for name, draw in {**PICTURES, **TWINKLE, **MORE}.items():
        body, w, h = draw()
        icons[name] = {"body": body, "width": w, "height": h}
    with open(OUT, "w") as fh:
        json.dump({"prefix": "cp", "icons": icons, "width": 100, "height": 100}, fh, separators=(",", ":"))
    print(f"{len(icons)} pictures -> {OUT}")


if __name__ == "__main__":
    main()
