#!/usr/bin/env python3
"""
===============================================================================
 Family Chalk Planner | Clipart | doodles.py
===============================================================================
 Version:   1.3.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-28
 Updated:   2026-11-28

 Purpose:
     Draws the board's chalk doodles (flowers, a bee, hearts, stars, a sun,
     swirls, leaves; a hand-drawn circle, a squiggle and sparkles for big
     days; frames, ribbon banners and corners) and writes them to
     clipart/doodles.json, in the same format as the other picture sets
     (Iconify JSON), so Pictures shows them as the "Doodles" pack. Every
     line wobbles a little and goes over itself once more, lighter, the way
     chalk does; the shapes are colored in softly. Drawn for the board (not
     traced from anyone's) and free for anyone to use (CC0).

     python3 clipart/doodles.py      (after changing a drawing)
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.3.0     2026-11-28   joshua    New file.
                        claude
===============================================================================
"""

import json
import math
import os
import random

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "doodles.json")

WHITE, PINK, YELLOW, BLUE = "#EDEAE0", "#F6B3CB", "#F2D479", "#9CC9E6"
GREEN, ORANGE, PURPLE, RED = "#A9D8A0", "#E8A35C", "#B49CE0", "#E8837B"


def f(v):
    """A number, short."""
    return f"{v:.1f}".rstrip("0").rstrip(".")


# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
# ----------------- #
# | A chalk line  | #
# ----------------- #
# A line through points, a little wobbly (the same every time: seeded by
# its name), smoothed into curves; drawn twice, the second pass lighter and
# a touch off, as chalk goes over itself.
def smooth(pts, closed):
    """Catmull-Rom through the points, as SVG curves (round again to the start when closed)."""
    n = len(pts)
    at = (lambda i: pts[i % n]) if closed else (lambda i: pts[max(0, min(n - 1, i))])
    d = f"M{f(pts[0][0])} {f(pts[0][1])}"
    for i in range(n if closed else n - 1):
        p0, p1, p2, p3 = at(i - 1), at(i), at(i + 1), at(i + 2)
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f"C{f(c1[0])} {f(c1[1])} {f(c2[0])} {f(c2[1])} {f(p2[0])} {f(p2[1])}"
    return d + ("Z" if closed else "")


class Pic:
    def __init__(self, name, w=100, h=100):
        self.rng = random.Random(name)
        self.w, self.h = w, h
        self.fills, self.lines = [], []

    def wob(self, pts, amt):
        return [(x + self.rng.uniform(-amt, amt), y + self.rng.uniform(-amt, amt)) for x, y in pts]

    def line(self, pts, color=WHITE, width=3.2, closed=False, wobble=0.9, fill=None):
        a = self.wob(pts, wobble)
        if fill:
            self.fills.append(f'<path d="{smooth(a, closed)}" fill="{fill}" opacity=".42"/>')
        self.lines.append(
            f'<path d="{smooth(a, closed)}" fill="none" stroke="{color}" stroke-width="{f(width)}" '
            f'stroke-linecap="round" stroke-linejoin="round"/>'
        )
        b = self.wob([(x + 0.7, y - 0.5) for x, y in pts], wobble * 1.3)
        self.lines.append(
            f'<path d="{smooth(b, closed)}" fill="none" stroke="{color}" stroke-width="{f(width * 0.5)}" '
            f'stroke-linecap="round" opacity=".55"/>'
        )

    def dot(self, x, y, r, color=WHITE):
        self.lines.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{color}"/>')

    def out(self):
        return "".join(self.fills + self.lines), self.w, self.h


# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
# ---------- #
# | Shapes | #
# ---------- #
def dense(pts, step=16):
    """More points along long straight stretches, so the curve through them stays straight."""
    out = []
    for a, b in zip(pts, pts[1:] + pts[:1]):
        k = max(1, int(math.hypot(b[0] - a[0], b[1] - a[1]) / step))
        out += [(a[0] + (b[0] - a[0]) * i / k, a[1] + (b[1] - a[1]) * i / k) for i in range(k)]
    return out


def ring(cx, cy, rx, ry=None, n=28, turn=1.0, start=0.0):
    ry = ry if ry is not None else rx
    return [
        (cx + rx * math.cos(start + turn * 2 * math.pi * k / n), cy + ry * math.sin(start + turn * 2 * math.pi * k / n))
        for k in range(n + (1 if turn != 1 else 0))
    ]


def heart_pts(cx, cy, s, n=30):
    pts = []
    for k in range(n):
        t = 2 * math.pi * k / n
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((cx + x * s, cy - y * s))
    return pts


def star_pts(cx, cy, r, inner=0.45, points=5, tilt=-math.pi / 2):
    pts = []
    for k in range(points * 2):
        rr = r if k % 2 == 0 else r * inner
        a = tilt + k * math.pi / points
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    return pts


def sparkle_pts(cx, cy, r, n=24):
    """A four-pointed twinkle, its sides curved in."""
    pts = []
    for k in range(n):
        t = 2 * math.pi * k / n
        pts.append((cx + r * math.cos(t) ** 3, cy + r * math.sin(t) ** 3))
    return pts


def leaf_pts(x0, y0, x1, y1, fat=0.35, n=14):
    """An almond leaf from its stem (x0, y0) to its tip."""
    L = math.hypot(x1 - x0, y1 - y0)
    a = math.atan2(y1 - y0, x1 - x0)
    side = []
    for k in range(n + 1):
        u = k / n
        side.append((u * L, math.sin(math.pi * u) * L * fat * (1 - 0.3 * u)))
    pts = side + [(x, -y) for x, y in reversed(side[1:-1])]
    return [(x0 + x * math.cos(a) - y * math.sin(a), y0 + x * math.sin(a) + y * math.cos(a)) for x, y in pts]


def petal(p, cx, cy, ang, length, width, color, fill):
    tip = (cx + math.cos(ang) * length, cy + math.sin(ang) * length)
    p.line(leaf_pts(cx, cy, tip[0], tip[1], width), color, 2.6, True, 0.5, fill)


# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
# -------------- #
# | The doodles | #
# -------------- #
def daisy():
    p = Pic("daisy")
    for k in range(8):
        petal(p, 50, 50, k * math.pi / 4 + 0.2, 40, 0.3, WHITE, WHITE)
    p.line(ring(50, 50, 11), YELLOW, 3, True, 0.6, YELLOW)
    return p.out()


def flower():
    p = Pic("flower")
    p.line([(50, 58), (52, 72), (49, 96)], GREEN, 3)
    petal(p, 51, 80, -0.5, 18, 0.35, GREEN, GREEN)
    for k in range(5):
        a = -math.pi / 2 + k * 2 * math.pi / 5
        cx, cy = 50 + math.cos(a) * 15, 36 + math.sin(a) * 15
        p.line(ring(cx, cy, 13), PINK, 2.8, True, 0.7, PINK)
    p.line(ring(50, 36, 8), YELLOW, 3, True, 0.5, YELLOW)
    return p.out()


def tulip():
    p = Pic("tulip")
    p.line([(50, 52), (49, 75), (51, 97)], GREEN, 3)
    petal(p, 50, 88, -2.3, 26, 0.3, GREEN, GREEN)
    petal(p, 50, 80, -0.7, 22, 0.3, GREEN, GREEN)
    cup = [(30, 18), (36, 34), (42, 22), (50, 36), (58, 22), (64, 34), (70, 18), (72, 36), (64, 50), (50, 55), (36, 50), (28, 36)]
    p.line(cup, RED, 3, True, 0.6, RED)
    return p.out()


def bee():
    p = Pic("bee")
    p.line(ring(38, 30, 14, 18, start=0.4), WHITE, 2.4, True, 0.5, BLUE)
    p.line(ring(60, 28, 12, 16, start=-0.4), WHITE, 2.4, True, 0.5, BLUE)
    p.line(ring(50, 60, 27, 18), YELLOW, 3.2, True, 0.6, YELLOW)
    for x in (42, 54):
        p.line([(x, 44), (x + 3, 60), (x, 76)], "#3A3A36", 4.5, False, 0.4)
    p.line([(77, 60), (90, 61)], YELLOW, 2.6)
    p.dot(30, 56, 2.6, "#3A3A36")
    p.line([(26, 46), (20, 34)], WHITE, 1.8)
    p.line([(31, 44), (30, 32)], WHITE, 1.8)
    return p.out()


def heart():
    p = Pic("heart")
    p.line(heart_pts(50, 52, 2.6), PINK, 3.4, True, 0.8, PINK)
    return p.out()


def hearts():
    p = Pic("hearts")
    p.line(heart_pts(38, 56, 1.9), PINK, 3, True, 0.7, PINK)
    p.line(heart_pts(72, 34, 1.2), RED, 2.6, True, 0.5, RED)
    p.line(heart_pts(76, 74, 0.8), PURPLE, 2.2, True, 0.4, PURPLE)
    return p.out()


def star():
    p = Pic("star")
    p.line(star_pts(50, 53, 44), YELLOW, 3.2, True, 0.8, YELLOW)
    return p.out()


def sparkles():
    p = Pic("sparkles")
    p.line(sparkle_pts(42, 52, 32), YELLOW, 3, True, 0.4, YELLOW)
    p.line(sparkle_pts(78, 22, 15), WHITE, 2.4, True, 0.3)
    p.line(sparkle_pts(80, 80, 10), WHITE, 2.2, True, 0.3)
    p.dot(16, 18, 2.6)
    p.dot(90, 52, 2)
    return p.out()


def stars():
    p = Pic("stars")
    p.line(star_pts(36, 60, 30), YELLOW, 3, True, 0.6, YELLOW)
    p.line(star_pts(78, 26, 16, tilt=-1.3), WHITE, 2.4, True, 0.4)
    p.line(star_pts(82, 78, 10, tilt=-1.8), PINK, 2.2, True, 0.3, PINK)
    for x, y in ((12, 20), (58, 10), (94, 50), (60, 92)):
        p.dot(x, y, 2.2)
    return p.out()


def sun():
    p = Pic("sun")
    p.line(ring(50, 50, 22), YELLOW, 3.2, True, 0.7, YELLOW)
    for k in range(10):
        a = k * math.pi / 5 + 0.15
        p.line([(50 + math.cos(a) * 30, 50 + math.sin(a) * 30), (50 + math.cos(a) * 44, 50 + math.sin(a) * 44)], ORANGE, 3)
    return p.out()


def cloud():
    p = Pic("cloud")
    pts = []
    for k in range(36):
        t = 2 * math.pi * k / 36
        bump = 1 + (0.2 * abs(math.sin(2.5 * t)) if math.sin(t) < 0.2 else 0)  # bumpy on top, flat below
        pts.append((50 + 40 * bump * math.cos(t), 56 + 24 * bump * min(math.sin(t), 0.75) / (1 if math.sin(t) < 0 else 1)))
    p.line(pts, WHITE, 3, True, 0.5, BLUE)
    return p.out()


def swirl():
    p = Pic("swirl")
    pts = [(50 + (2 + 5.5 * t) * math.cos(t), 50 + (2 + 5.5 * t) * math.sin(t)) for t in [k * 0.25 for k in range(30)]]
    p.line(pts, PURPLE, 3.2, False, 0.4)
    return p.out()


def leaf():
    p = Pic("leaf")
    p.line(leaf_pts(18, 84, 84, 16, 0.32), GREEN, 3, True, 0.6, GREEN)
    p.line([(12, 90), (34, 66), (60, 40), (80, 20)], GREEN, 2.2, False, 0.5)
    for u in (0.35, 0.55, 0.72):
        x, y = 18 + 66 * u, 84 - 68 * u
        p.line([(x, y), (x - 10, y - 12)], GREEN, 1.6)
        p.line([(x, y), (x + 12, y + 8)], GREEN, 1.6)
    return p.out()


def fall_leaf():
    p = Pic("fall-leaf")
    pts = star_pts(50, 46, 40, inner=0.55, points=5, tilt=-math.pi / 2)
    p.line(pts, ORANGE, 3, True, 1.2, ORANGE)
    p.line([(50, 46), (50, 96)], ORANGE, 2.6)
    return p.out()


def vine():
    p = Pic("vine", 240, 60)
    stem = [(x, 30 + 10 * math.sin(x / 22)) for x in range(4, 240, 8)]
    p.line(stem, GREEN, 2.8, False, 0.6)
    for k, x in enumerate(range(20, 230, 26)):
        y = 30 + 10 * math.sin(x / 22)
        s = -1 if k % 2 else 1
        p.line(leaf_pts(x, y, x + 12, y - 16 * s, 0.35), GREEN, 2, True, 0.4, GREEN)
    return p.out()


# a circle round a day, a squiggle under an event, an arrow to it
def circle():
    p = Pic("circle")
    p.line(ring(50, 50, 44, 34, n=34, turn=1.12, start=2.6), PINK, 3.4, False, 1.1)
    return p.out()


def squiggle():
    p = Pic("squiggle", 240, 40)
    pts = [(x, 20 + 9 * math.sin(x / 9) * (0.6 + 0.4 * math.sin(x / 60))) for x in range(6, 236, 3)]
    p.line(pts, YELLOW, 3.2, False, 0.5)
    return p.out()


def underline():
    p = Pic("underline", 240, 30)
    p.line([(8, 18), (80, 14), (160, 16), (232, 11)], WHITE, 3.4, False, 1)
    p.line([(30, 24), (120, 21), (200, 22)], WHITE, 2.4, False, 1)
    return p.out()


def arrow():
    p = Pic("arrow")
    p.line([(10, 84), (30, 50), (58, 30), (86, 22)], WHITE, 3.2, False, 0.8)
    p.line([(70, 10), (88, 22), (74, 38)], WHITE, 3.2, False, 0.6)
    return p.out()


# frames (around an event that spans days: stretch it to fit), banners and corners
def frame(name, w):
    p = Pic(name, w, 60)
    r = 14
    pts = []
    for cx, cy, a0 in ((w - 8 - r, 8 + r, -90), (w - 8 - r, 52 - r, 0), (8 + r, 52 - r, 90), (8 + r, 8 + r, 180)):
        for k in range(5):
            a = math.radians(a0 + 90 * k / 4)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    p.line(dense(pts), WHITE, 3, True, 0.7)
    for cx, cy in ((8, 8), (w - 8, 8), (8, 52), (w - 8, 52)):
        p.line(ring(cx, cy, 5, n=10), PINK, 2.2, True, 0.3, PINK)
    return p.out()


def banner(name, w, color):
    p = Pic(name, w, 70)
    m = 34  # where the ribbon's ends fold back
    p.line([(4, 22), (m, 22), (m - 8, 37), (m, 52), (4, 52), (14, 37)], color, 2.6, True, 0.6, color)
    p.line([(w - 4, 22), (w - m, 22), (w - m + 8, 37), (w - m, 52), (w - 4, 52), (w - 14, 37)], color, 2.6, True, 0.6, color)
    top = [(m - 10 + (w - 2 * m + 20) * k / 12, 12 + 5 * math.sin(math.pi * k / 12)) for k in range(13)]
    bottom = [(x, y + 34) for x, y in reversed(top)]
    p.line(top + bottom, color, 3, True, 0.6, color)
    return p.out()


def corner_curl():
    p = Pic("corner-curl")
    p.line([(6, 94), (6, 30), (14, 12), (30, 6), (94, 6)], WHITE, 3, False, 0.6)
    pts = [(28 + (1 + 2.6 * t) * math.cos(t + 3.4), 28 + (1 + 2.6 * t) * math.sin(t + 3.4)) for t in [k * 0.3 for k in range(26)]]
    p.line(list(reversed(pts)), PURPLE, 2.8, False, 0.3)
    for x, y in ((48, 14), (14, 48)):
        p.line(heart_pts(x, y, 0.45), PINK, 1.8, True, 0.2, PINK)
    return p.out()


def corner_flowers():
    p = Pic("corner-flowers")
    p.line([(4, 96), (8, 60), (20, 30), (44, 12), (96, 6)], GREEN, 2.6, False, 0.6)
    for x, y, a in ((10, 64, 2.6), (22, 30, -2.2), (60, 9, -1.2)):
        petal(p, x, y, a, 14, 0.35, GREEN, GREEN)
    for cx, cy, c in ((18, 18, PINK), (46, 26, YELLOW), (26, 46, BLUE)):
        for k in range(5):
            a = k * 2 * math.pi / 5
            p.line(ring(cx + 5 * math.cos(a), cy + 5 * math.sin(a), 4.6, n=10), c, 1.8, True, 0.3, c)
        p.dot(cx, cy, 2.2, WHITE)
    return p.out()


def corner_leaves():
    p = Pic("corner-leaves")
    p.line([(4, 96), (10, 50), (30, 20), (60, 8), (96, 4)], "#8a6a42", 2.6, False, 0.6)
    for (x0, y0, x1, y1), c in (((10, 50, 30, 34), ORANGE), ((30, 20, 46, 32), RED), ((60, 8, 70, 24), YELLOW), ((8, 76, 24, 70), RED)):
        p.line(leaf_pts(x0, y0, x1, y1, 0.4), c, 2, True, 0.4, c)
    return p.out()


def corner_snow():
    p = Pic("corner-snow")
    p.line([(6, 94), (6, 6), (94, 6)], BLUE, 2.6, False, 0.6)
    for cx, cy, r in ((26, 26, 14), (58, 18, 7), (18, 60, 7)):
        for k in range(3):
            a = k * math.pi / 3
            p.line([(cx - r * math.cos(a), cy - r * math.sin(a)), (cx + r * math.cos(a), cy + r * math.sin(a))], WHITE, 2)
    for x, y in ((44, 40), (76, 14), (14, 82), (36, 56)):
        p.dot(x, y, 1.8)
    return p.out()


def corner_hearts():
    p = Pic("corner-hearts")
    p.line([(6, 94), (8, 40), (20, 18), (44, 8), (94, 6)], PINK, 2.6, False, 0.6)
    p.line(heart_pts(26, 28, 0.9), RED, 2.4, True, 0.4, RED)
    p.line(heart_pts(56, 18, 0.5), PINK, 2, True, 0.3, PINK)
    p.line(heart_pts(16, 60, 0.5), PINK, 2, True, 0.3, PINK)
    return p.out()


PICTURES = {
    "daisy": daisy,
    "flower": flower,
    "tulip": tulip,
    "bee": bee,
    "heart": heart,
    "hearts": hearts,
    "star": star,
    "stars": stars,
    "sparkles": sparkles,
    "sun": sun,
    "cloud": cloud,
    "swirl": swirl,
    "leaf": leaf,
    "fall-leaf": fall_leaf,
    "vine": vine,
    "circle": circle,
    "squiggle": squiggle,
    "underline": underline,
    "arrow": arrow,
    "frame": lambda: frame("frame", 240),
    "frame-long": lambda: frame("frame-long", 480),
    "banner-pink": lambda: banner("banner-pink", 240, PINK),
    "banner-blue": lambda: banner("banner-blue", 240, BLUE),
    "banner-yellow": lambda: banner("banner-yellow", 240, YELLOW),
    "corner-curl": corner_curl,
    "corner-flowers": corner_flowers,
    "corner-leaves": corner_leaves,
    "corner-snow": corner_snow,
    "corner-hearts": corner_hearts,
}

# the words each is found by in Pictures' search (its name is found anyway)
TAGS = {
    "daisy": "flower spring doodle",
    "flower": "spring doodle",
    "tulip": "flower spring doodle",
    "bee": "bug insect spring summer doodle",
    "heart": "love valentine doodle",
    "hearts": "love valentine doodle",
    "star": "big day doodle",
    "stars": "big day doodle",
    "sparkles": "twinkle shine big day doodle",
    "sun": "summer weather doodle",
    "cloud": "weather doodle",
    "swirl": "curl doodle",
    "leaf": "plant spring doodle",
    "fall-leaf": "autumn maple doodle",
    "vine": "leaves border doodle",
    "circle": "ring around day doodle",
    "squiggle": "underline wave doodle",
    "underline": "line doodle",
    "arrow": "point doodle",
    "frame": "border box event doodle",
    "frame-long": "border box event doodle",
    "banner-pink": "ribbon title doodle",
    "banner-blue": "ribbon title doodle",
    "banner-yellow": "ribbon title doodle",
    "corner-curl": "border doodle",
    "corner-flowers": "border spring doodle",
    "corner-leaves": "border fall autumn doodle",
    "corner-snow": "border winter snowflake doodle",
    "corner-hearts": "border love valentine doodle",
}


def main():
    icons = {}
    for name, draw in PICTURES.items():
        body, w, h = draw()
        icons[name] = {"body": body, "width": w, "height": h}
    with open(OUT, "w") as fh:
        json.dump({"prefix": "dd", "icons": icons, "tags": TAGS, "width": 100, "height": 100}, fh, separators=(",", ":"))
    print(f"{len(icons)} pictures -> {OUT}")


if __name__ == "__main__":
    main()
