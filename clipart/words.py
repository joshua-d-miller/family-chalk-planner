#!/usr/bin/env python3
"""
===============================================================================
 Family Chalk Planner | Clipart | words.py
===============================================================================
 Version:   0.17.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-14
 Updated:   2026-11-14

 Purpose:
     Writes clipart/words.json: the words that go with each emoji picture,
     so searching "turkey" finds the bird (bird, gobble, thanksgiving) and
     "pumpkin" finds the jack-o'-lantern. The words come from Emojibase
     (emojibase-data, MIT), keyed by each emoji's name the way the picture
     sets spell it ("jack-o-lantern", "red-heart"). Also keeps each emoji's
     group, so flags, letters and signs can go to the end of a search.

     npm pack emojibase-data && tar xzf emojibase-data-*.tgz
     python3 clipart/words.py package/en/data.json

 Returns:
     clipart/words.json   { "turkey": ["bird gobble thanksgiving", 3], ... }
                          (the words, and the emoji's group number)

 Known limitations:
     English only. Skin-tone versions have no words of their own (the board
     shows the plain one).
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.17.0    2026-11-14   joshua    New file.
                        claude
===============================================================================
"""

import json
import os
import re
import sys
import unicodedata

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "words.json")


# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
### ------------------------------- ###
### | An emoji's name, as a slug | ###
### ------------------------------- ###
### The way the picture sets name it: lower case, words joined by "-",   ###
### accents and punctuation dropped ("flag: Türkiye" -> flag-turkiye).   ###
def slug(label):
    s = unicodedata.normalize("NFKD", label).encode("ascii", "ignore").decode().lower()
    s = s.replace("&", "and").replace("#", "hash").replace("*", "asterisk")
    s = re.sub(r"[’'.!:,()“”]", "", s)
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


# ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: #
### ------------ ###
### | The list | ###
### ------------ ###
### Each emoji's tags (not its own name again, not two-letter country    ###
### codes), lower case, and its group.                                   ###
def main(src):
    data = json.load(open(src, encoding="utf-8"))
    out = {}
    for e in data:
        s = slug(e["label"])
        tags = sorted({t.lower() for t in e.get("tags", []) if t and t.lower() != s and not re.fullmatch(r"[A-Z]{2}", t)})
        out[s] = [" ".join(tags), e.get("group", -1)]
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"), sort_keys=True)
    print(f"{len(out)} emoji -> {OUT}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "package/en/data.json")
