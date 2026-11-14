#!/usr/bin/env python3
"""
===============================================================================
 Family Chalk Planner | Clipart | openclipart.py
===============================================================================
 Version:   0.17.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-14
 Updated:   2026-11-14

 Purpose:
     Writes clipart/openclipart.json.gz: the best of the Openclipart
     collection (public domain, CC0), ready for the board. Openclipart's own
     site wants an account; its older collection is still shipped by Debian
     and Ubuntu as the package openclipart-svg, sorted into folders by
     subject, about 8,000 pictures of mixed age and quality. This keeps the
     ones that suit a family board and look right on it:

       - only the everyday folders (animals, food, holidays, people, plants,
         sports, vehicles, weather...), not computer icons, flowcharts,
         maps, logos, road signs or weapons
       - nothing grown-up, scary or violent (by its title, words and file)
       - no photos inside, no words drawn in, nothing broken or empty
       - not mostly black (it would vanish on the board)
       - cleaned (editor leftovers gone, numbers shortened) and cropped to
         the picture itself, so it isn't a speck in the middle of a page

     Each picture keeps its title and its author's words (dessert, food), so
     search finds it. The result is in the same form as the other picture
     sets (Iconify JSON), with an extra "tags" list.

     apt-get download openclipart-svg   (or any Debian mirror)
     ar x openclipart-svg_*.deb && mkdir x && tar xf data.tar.xz -C x
     pip install scour            (and rsvg-convert: librsvg2-bin)
     python3 clipart/openclipart.py x/usr/share/openclipart/svg
     python3 clipart/openclipart.py x/usr/share/openclipart/svg --sheet /tmp/s

 Returns:
     clipart/openclipart.json.gz   { prefix, icons: { name: { body, left,
                                     top, width, height } }, tags: { name:
                                     "words" } }
     --sheet DIR                   contact sheets of what was kept (to look
                                   over by eye), on the board's color

 Known limitations:
     The collection is from 2005-2010: some pictures look their age. Words
     are the authors' own, in English (a few in other languages).
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.17.0    2026-11-14   joshua    New file.
                        claude
===============================================================================
"""

import gzip
import io
import json
import os
import re
import subprocess
import sys
import unicodedata
import xml.etree.ElementTree as ET
from concurrent.futures import ProcessPoolExecutor

from PIL import Image
from scour import scour

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "openclipart.json.gz")
BOARD = (43, 47, 46)  # the board's slate, for the contact sheets

# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
### -------------------- ###
### | Folders to keep | ###
### -------------------- ###
### Folder (and everything under it) -> the word it adds to each picture. ###
### Anything not listed is left out (computer icons, shapes, maps...).    ###
KEEP = {
    "animals": "animal",
    "buildings/homes": "house",
    "buildings/furniture": "furniture",
    "buildings": "building",
    "containers": "",
    "decorations": "decoration",
    "education": "school",
    "electronics/bulb": "",
    "food": "food",
    "office": "office",
    "people/clothing": "clothes",
    "people/smilies": "face",
    "people/stickmen": "",
    "people": "person",
    "plants": "plant",
    "recreation/holiday": "holiday",
    "recreation/party": "party",
    "recreation/music": "music",
    "recreation/art": "art",
    "recreation/sports": "sport",
    "recreation/games": "game",
    "recreation/toys": "toy",
    "recreation": "",
    "science/astronomy": "space",
    "signs_and_symbols/weather": "weather",
    "signs_and_symbols/awards": "award",
    "signs_and_symbols/clocks": "clock",
    "signs_and_symbols/money": "money",
    "tools/toys": "toy",
    "tools": "tool",
    "transportation/vehicles": "vehicle",
    "transportation/boating": "boat",
    "transportation": "",
    "geography/astronomy": "space",
}
SKIP = (
    "tools/weapons",
    "recreation/religion",
    "people/bodypart",
    "transportation/roadsigns",
    "transportation/aiga-symbols",
    "recreation/games/cards",
    "unsorted",
)

# ------------------------------------------------- #
# | Not for a family board (whole words, any case) | #
# ------------------------------------------------- #
BAD = set(
    """
    sex sexy nude naked strip stripper bikini lingerie underwear bra panties pantyhose collant thong topless
    breast breasts butt boob boobs erotic pinup lust babe playboy
    gun guns pistol rifle shotgun revolver weapon weapons sword swords knife knives dagger bomb bombs
    grenade bullet bullets missile rocketlauncher army military soldier soldiers war cannon
    blood bloody skull skulls skeleton bones corpse dead death zombie ghoul devil demon satan
    hell coffin grave tombstone gravestone cemetery horror scary monster vampire noose hanging
    drug drugs cigarette cigar smoking smoke marijuana cannabis weed syringe beer wine whisky whiskey
    vodka alcohol cocktail martini drunk booze liquor pub birra vino sigaretta pistola fucile
    nazi swastika terror terrorist police jail prison handcuffs cop crime criminal
    hate fight fighting punch violence blood angry rage
    church cross jesus christ crucifix bible god allah buddha religion religious
    flag flags logo map
    """.split()
)

# real people, road signs and anatomy figures, by title
NOT_CLIPART = re.compile(r"martin luther|portrait|road ?sign|segnale|einstein|president|celebrity|silhouette|"
                         r"nosmoke|bad guy|pimp|chav", re.I)
# words that came with the pictures but don't describe them
JUNK = set("""hash unsorted signs symbols and the architetto francesco rollandin openclipart http www bcostea
    icon icons svg shape symbol menu misc other stuff new nice style ecd eca dfb fadcc brisgee""".split())

# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
### ------------------------ ###
### | A picture's own words | ###
### ------------------------ ###
NS = {
    "dc": "http://purl.org/dc/elements/1.1/",
    "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "cc": "http://creativecommons.org/ns#",
    "cc2": "http://web.resource.org/cc/",
}


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def words_of(raw):
    """Its title and keywords, from the RDF the authors filled in."""
    title, keys = "", []
    m = re.search(rb"<dc:title>([^<]{1,120})</dc:title>", raw)
    if m:
        title = m.group(1).decode("utf8", "ignore").strip()
    sub = re.search(rb"<dc:subject>(.*?)</dc:subject>", raw, re.S)
    if sub:
        keys = [k.decode("utf8", "ignore").strip().lower() for k in re.findall(rb"<rdf:li>([^<]{1,60})</rdf:li>", sub.group(1))]
    return title, keys


def name_from_file(fn):
    """muffin_jean_victor_balin_.svg -> muffin (the author's name trimmed off, as well as we can)."""
    base = re.sub(r"(_\d+)?r?\.svg$", "", fn)
    parts = [p for p in re.split(r"[_\-]+", base) if p]
    return " ".join(parts[:2]) if parts else base


TRIM_TITLE = re.compile(r"\b(clip ?art|clipart|icon|vector|svg|drawing|illustration|cartoon|simple|cute|\d+)\b", re.I)


# ------------------------------------------------------------------------- #
# | Authors' names in titles, and the Italian and French titles, in English | #
# ------------------------------------------------------------------------- #
# Many of the pictures came from a few Italian and French authors: their   #
# titles are put in English (the original words stay searchable too).     #
AUTHORS = re.compile(r"\b(by nicu buculei|nicu buculei|architetto francesco rollandin|architetto|francesco|"
                     r"rollandin|openclipart|aj|md|v0|amp|atilde|copy)\b", re.I)
PHRASES = {
    "ferro da stiro": "iron", "fuoco da campeggio": "campfire", "pacco regalo": "gift", "pallone aerestatico":
    "hot air balloon", "paesaggio marino": "seaside", "ruota dentata": "gear", "macchina caffe": "coffee maker",
    "pannocchia di gran turco": "corn", "gufo civetta": "owl", "secchio e spugna": "bucket and sponge",
    "sedia e ombrelloni": "beach chair", "scolapasta e pentola": "colander and pot", "orologio da parete":
    "wall clock", "cassa negozio": "cash register", "casa in campagna": "country house", "casa dei sogni":
    "dream house", "borsa estiva": "beach bag", "cigni bianchi e neri": "swans", "cigno di spalle": "swan",
    "le mie tigri preferite": "tigers", "io donna uomo": "woman and man", "io bambina": "girl",
    "mix cucina frullatore": "blender", "lampada di aladino": "magic lamp", "gelato all italiana": "ice cream",
    "rondelle d orange": "orange slice", "gauffre au chocolat": "chocolate waffle", "glace italienne": "ice cream",
    "mante religieuse": "praying mantis", "mantide religiosa": "praying mantis", "quattro farfalle": "butterflies",
    "farfalla semplice": "butterfly", "farfalla stilizzata": "butterfly", "pattinatrici sul ghiaccio": "ice skaters",
    "pinguino col piccolo": "penguin and chick", "libro di ricette": "cookbook", "pace e bene": "peace",
}
WORDS = dict(w.split(":") for w in """
    albero:tree aglio:garlic acquila:eagle abeille:bee antilope:antelope appunti:notes arbre:tree bussola:compass
    calamita:magnet calcolatrice:calculator carta:paper cartella:folder casa:house cavallo:horse cavalletta:grasshopper
    cestino:wastebasket cesto:basket champignon:mushroom chiave:key cigno:swan coccinella:ladybug coccinelle:ladybug
    coccinellona:ladybug coniglio:rabbit couronne:crown dinosauro:dinosaur dinosauri:dinosaurs elefante:elephant
    farfalla:butterfly fabbrica:factory fiore:flower fiori:flowers gatto:cat gattina:kitten gelato:ice-cream
    glace:ice-cream lana:yarn lampada:lamp lente:magnifier leone:lion lettera:letter libellule:dragonfly libro:book
    lucchetto:padlock lucertola:lizard lumaca:snail mondo:world moschito:mosquito nonno:grandpa orologio:clock
    orso:bear ours:bear palloncini:balloons pattinatrice:ice-skater pattino:skate pecora:sheep pennello:paintbrush
    pera:pear pesca:peach pescetto:fish pinguino:penguin pinzatrice:stapler pollo:chicken pomodori:tomatoes
    porcinet:piglet portafoglio:wallet puntine:pushpins rana:frog ragno:spider ravanello:radish sapin:fir-tree
    sedia:chair signore:man sole:sun stambecco:ibex pasteque:watermelon galette:cookie olivier:olive-tree
    engrenagem:gear tazza:cup prugna:plum forbici:scissors padella:frying-pan tigri:tigers colori:crayons
    canguro:kangaroo cani:dogs binocolo:binoculars diagramma:chart istogramma:chart flamand:flamingo
    grigio:grey grigia:grey ottone:brass verde:green figo:cool cucina:kitchen italiana:italian legno:wooden
    stecchito:flattened turbo:turbo bn:black-and-white rondelle:slice amp: d: di: da: del: della: col: il:
    tacchino:turkey topo:mouse torta:cake teiera:teapot tigre:tiger vacca:cow utensile:tool utensili:tools
    sega:saw cacciavite:screwdriver televisore:tv telecomando:remote subacqueo:diver gatti:cats arancione:orange
    stagioni:seasons pezzata:spotted rossa:red valdostano: valdostana: utente:user singolo: frollandin:
    la: le: sul: au: un: une: e: in: the:the
""".split())


def english(t):
    for k, v in PHRASES.items():
        t = re.sub(r"\b" + k + r"\b", v, t)
    out = []
    for w in t.split():
        e = WORDS.get(w, w).replace("-", " ")
        if e:
            out.append(e)
    return " ".join(out)


def clean_title(t):
    t = re.sub(r"[_\-]+", " ", t)
    t = AUTHORS.sub(" ", TRIM_TITLE.sub(" ", t.lower()))
    t = re.sub(r"[^a-z ]+", " ", unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode())
    t = english(re.sub(r"\s+", " ", t).strip()).split()
    return " ".join(w for i, w in enumerate(t) if w not in t[:i])  # "gatto cat" -> "cat cat" -> "cat"


# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
### ------------------------------ ###
### | One picture: keep it? how? | ###
### ------------------------------ ###
SCOUR = [
    "--enable-viewboxing", "--strip-xml-prolog", "--remove-metadata", "--remove-descriptive-elements",
    "--enable-comment-stripping", "--shorten-ids", "--set-precision=4", "--indent=none", "--no-line-breaks",
    "--create-groups", "--quiet",
]
BLACKS = re.compile(r"(fill|stroke)(=\"|:)\s*(#000000|#000|black)\b", re.I)


UNITS = {"": 1, "px": 1, "pt": 1.25, "pc": 15, "mm": 3.543307, "cm": 35.43307, "in": 90}
EDITOR = re.compile(r'\s(sodipodi|inkscape|sketch|i|x|a|graph|ns\d*):[a-zA-Z_-]+="[^"]*"')


def tidy(raw):
    """Old editor leftovers out (some name their namespace in ways the cleaner doesn't know), and a
    viewBox for drawings that only give a page size ("23cm"), so they can be scaled and cropped."""
    s = raw.decode("utf8", "ignore")
    s = re.sub(r"<(sodipodi|inkscape):[a-zA-Z_-]+\b[^>]*/>", "", s)
    s = re.sub(r"<(sodipodi|inkscape):([a-zA-Z_-]+)\b[^>]*>.*?</\1:\2>", "", s, flags=re.S)
    s = EDITOR.sub("", s)
    m = re.search(r"<svg\b[^>]*>", s)
    if m and "viewBox" not in m.group(0):
        tag = m.group(0)
        def size(a):
            v = re.search(a + r'="\s*([0-9.]+)\s*([a-z]*)\s*"', tag)
            return v and v.group(2) in UNITS and float(v.group(1)) * UNITS[v.group(2)]
        w, h = size(r"\swidth"), size(r"\sheight")
        if w and h:
            s = s.replace(tag, tag[:-1].rstrip("/") + f' viewBox="0 0 {w:g} {h:g}">' if not tag.endswith("/>") else tag, 1)
    return s


def render(svg_text, size=160):
    p = subprocess.run(["rsvg-convert", "-w", str(size), "-h", str(size), "--keep-aspect-ratio"],
                       input=svg_text.encode(), capture_output=True, timeout=30)
    if p.returncode or not p.stdout:
        return None
    return Image.open(io.BytesIO(p.stdout)).convert("RGBA")


def tiny_hash(img):
    """The picture shrunk to 12x12 grays: two copies of one drawing (in two folders) match."""
    g = Image.new("RGB", img.size, BOARD)
    g.paste(img, (0, 0), img)
    return bytes(v // 32 for v in g.convert("L").resize((12, 12)).tobytes()).hex()


def looks(img):
    """How much of the page is picture, and how much of the picture is near black."""
    a = img.getchannel("A")
    box = a.point(lambda v: 255 if v > 24 else 0).getbbox()
    if not box:
        return None
    px = [p for p in img.get_flattened_data() if p[3] > 128]
    if not px:
        return None
    dark = sum(1 for r, g, b, _ in px if 0.3 * r + 0.59 * g + 0.11 * b < 55) / len(px)
    colors = len({(r >> 5, g >> 5, b >> 5) for r, g, b, _ in px[:: max(1, len(px) // 4000)]})
    return box, dark, colors, len(px) / (img.width * img.height)


def one(job):
    path, rel, extra = job
    try:
        raw = open(path, "rb").read()
    except OSError:
        return None
    if len(raw) > 250_000 or re.search(rb"<(svg:)?(image|script|foreignObject)\b", raw):
        return None
    for t in re.finditer(rb"<(svg:)?(text|flowRoot)\b.*?</(svg:)?(text|flowRoot)>", raw, re.S):
        if re.search(rb">[^<]*[A-Za-z0-9]", t.group(0)):
            return None  # words drawn in (a sign, a label): not for a picture board
    if re.search(rb"(xlink:)?href=\"(https?:|file:)", raw):
        return None
    title, keys = words_of(raw)
    fname = os.path.basename(path)
    label = clean_title(title)
    if len(label) < 3:
        label = clean_title(name_from_file(fname))
    if len(label) < 3:
        return None
    original = re.sub(r"[^a-z ]+", " ", title.lower())  # the Italian or French words, still searchable
    allwords = set(re.findall(r"[a-z]+", " ".join([label, " ".join(keys), rel.lower(), fname.lower()])))
    if allwords & BAD or NOT_CLIPART.search(" ".join([label, fname.replace("_", " ")])):
        return None
    # cleaned up
    try:
        out = scour.scourString(tidy(raw), scour.parse_args(SCOUR))
    except Exception:
        return None
    m = re.search(r"<svg\b([^>]*)>(.*)</svg>\s*$", out, re.S)
    if not m:
        return None
    attrs, body = m.group(1), m.group(2)
    vb = re.search(r'viewBox="([^"]+)"', attrs)
    if not vb:
        return None
    try:
        vx, vy, vw, vh = [float(v) for v in vb.group(1).replace(",", " ").split()]
    except ValueError:
        return None
    if vw <= 0 or vh <= 0:
        return None
    body = body.replace("xlink:href", "href")
    # a root style or fill (rare) goes onto a group around everything, so it isn't lost
    root = re.findall(r'\s(fill|stroke|style|fill-rule|stroke-width|opacity)="([^"]*)"', attrs)
    if root:
        body = "<g " + " ".join(f'{k}="{v}"' for k, v in root) + ">" + body + "</g>"
    if re.search(r"\s[a-zA-Z]+:[a-zA-Z-]+=", body.replace("xml:space", "")):
        return None  # leftovers from some other editor: wouldn't load
    def wrap(b, x, y, w, h):
        k = 160 / max(w, h)
        return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x:g} {y:g} {w:g} {h:g}" '
                f'width="{max(1, round(w * k))}" height="{max(1, round(h * k))}">{b}</svg>')
    try:
        ET.fromstring(wrap(body, vx, vy, vw, vh))
    except ET.ParseError:
        return None
    img = render(wrap(body, vx, vy, vw, vh))
    lk = img and looks(img)
    if not lk:
        return None  # empty, or rsvg couldn't draw it
    box, dark, colors, fill = lk
    # cropped to the picture (a little air around it)
    x0, y0, x1, y1 = box
    sx, sy = vw / img.width, vh / img.height
    pad = 2
    nx, ny = vx + max(0, x0 - pad) * sx, vy + max(0, y0 - pad) * sy
    nw = (min(img.width, x1 + pad) - max(0, x0 - pad)) * sx
    nh = (min(img.height, y1 + pad) - max(0, y0 - pad)) * sy
    if nw <= 0 or nh <= 0 or max(nw, nh) / min(nw, nh) > 6:
        return None  # a line or a strip: not a picture
    final = wrap(body, nx, ny, nw, nh)
    img2 = render(final)
    lk2 = img2 and looks(img2)
    if not lk2:
        return None
    _, dark, colors, fill = lk2
    return {
        "rel": rel,
        "label": label,
        "keys": keys + [original],
        "extra": extra,
        "body": body,
        "box": [round(nx, 3), round(ny, 3), round(nw, 3), round(nh, 3)],
        "dark": round(dark, 3),
        "colors": colors,
        "fill": round(fill, 3),
        "bytes": len(body),
        "hexes": len(set(re.findall(r"#[0-9a-fA-F]{6}\b", body))),
        "hash": tiny_hash(img2),
        "shapes": len(re.findall(r"<(path|polygon|ellipse|circle|rect)\b", body)),
    }


# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
### ------------ ###
### | Choosing | ###
### ------------ ###
### Good enough to keep: colored (black line art vanishes on the board), ###
### not a big file for a little picture, and one of each title per folder. ###
def good(p):
    # (thousands of little shapes or colors: a traced photo of a real person, not clipart)
    return p["dark"] < 0.45 and p["colors"] >= 3 and p["fill"] > 0.06 and p["bytes"] < 120_000 and p["shapes"] < 1200 and p["hexes"] < 80


def folder_of(rel):
    for f in sorted(KEEP, key=len, reverse=True):
        if rel == f or rel.startswith(f + "/"):
            return f
    return None


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    root = sys.argv[1]
    sheet = sys.argv[sys.argv.index("--sheet") + 1] if "--sheet" in sys.argv else None
    jobs = []
    for d, _subs, files in os.walk(root):
        rel = os.path.relpath(d, root).replace(os.sep, "/")
        if any(rel == s or rel.startswith(s + "/") for s in SKIP):
            continue
        f = folder_of(rel)
        if f is None:
            continue
        extra = " ".join(w for w in [KEEP[f]] + rel.split("/") if w)
        for fn in sorted(files):
            if fn.endswith(".svg"):
                jobs.append((os.path.join(d, fn), rel, extra))
    print(f"{len(jobs)} pictures in the folders kept", file=sys.stderr)
    with ProcessPoolExecutor() as ex:
        got = [r for r in ex.map(one, jobs, chunksize=8) if r]
    print(f"{len(got)} drawable and family-friendly", file=sys.stderr)
    kept = [p for p in got if good(p)]
    print(f"{len(kept)} look right on the board", file=sys.stderr)
    # at most three of each title, each one different (the smaller files), and the black-and-white copy only when there's
    # no colored one
    labels = {p["label"] for p in kept}
    seen, icons, tags = {}, {}, {}
    for p in sorted(kept, key=lambda p: p["bytes"]):
        bw = re.sub(r"\s*\b(b and w|bw|black and white)\b\s*", " ", p["label"]).strip()
        if bw != p["label"] and bw in labels:
            continue
        seen[p["label"]] = seen.get(p["label"], 0) + 1
        if seen[p["label"]] > 3 or p["hash"] in seen:
            continue  # the same drawing again
        seen[p["hash"]] = 1
        base = slug(p["label"])[:48] or "picture"
        name, n = base, 2
        while name in icons:
            name, n = f"{base}-{n}", n + 1
        x, y, w, h = p["box"]
        icons[name] = {"body": p["body"], "left": x, "top": y, "width": w, "height": h}
        words = []
        for wd in re.findall(r"[a-z]+", " ".join(p["keys"] + [p["extra"].replace("_", " ")])):
            if wd not in words and wd not in name.split("-") and len(wd) > 2 and wd not in BAD and wd not in JUNK:
                words.append(wd)
        tags[name] = " ".join(words[:24])
    icons = dict(sorted(icons.items()))
    out = {"prefix": "oc", "width": 160, "height": 160, "icons": icons, "tags": {k: tags[k] for k in icons}}
    data = json.dumps(out, separators=(",", ":")).encode()
    with gzip.GzipFile(OUT, "wb", mtime=0) as g:
        g.write(data)
    print(f"{len(icons)} kept -> {OUT} ({len(data) // 1024} KB, {os.path.getsize(OUT) // 1024} KB packed)", file=sys.stderr)
    if sheet:
        contact(icons, sheet)


def contact(icons, d):
    """Sheets of 10x8 pictures on the board's color, each with its name, to look over by eye."""
    from PIL import ImageDraw
    os.makedirs(d, exist_ok=True)
    names = list(icons)
    per, cell = 80, 120
    for s in range(0, len(names), per):
        im = Image.new("RGB", (10 * cell, 8 * cell), BOARD)
        dr = ImageDraw.Draw(im)
        for i, n in enumerate(names[s : s + per]):
            ic = icons[n]
            svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{ic["left"]} {ic["top"]} {ic["width"]} {ic["height"]}" '
                   f'width="100" height="100">{ic["body"]}</svg>')
            img = render(svg, 96)
            x, y = (i % 10) * cell, (i // 10) * cell
            if img:
                im.paste(img, (x + 12 + (96 - img.width) // 2, y + 4 + (96 - img.height) // 2), img)
            dr.text((x + 4, y + 104), n[:19], fill=(220, 220, 210))
        im.save(os.path.join(d, f"sheet-{s // per + 1:03d}.png"))


if __name__ == "__main__":
    main()
