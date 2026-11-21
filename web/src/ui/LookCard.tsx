/*
===============================================================================
 Family Chalk Planner | Screens | UI | LookCard.tsx
===============================================================================
 Version:   1.2.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-17
 Updated:   2026-11-21

 Purpose:
     🎨 Look of cards and menus: this screen's look for its cards, ☰ menu
     and Settings (chalk, light, dark or high contrast), an accent color
     and the text size. Each choice is saved as it's tapped, so Settings
     itself shows the new look straight away.

 How it fits:
     In ⚙️ Settings → 🖥️ This screen (reached from the ☰ menu's This
     screen… on any screen with a menu).

 Used by:
     web/src/pages/Settings.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.1.0    2026-11-17   joshua    New file.
                        claude

 1.2.0    2026-11-21   joshua    The fields only, in ⚙️ Settings → 🖥️ This
                        claude    screen (the card of its own is gone).
===============================================================================
*/

import { useState } from 'react';
import { LOOKS, SIZES, setUiLook, useUiLook } from '../lib/uiLook.ts';
import type { UiLook } from '../lib/uiLook.ts';
import { Segs } from './bits.tsx';
import { Colors } from './Colors.tsx';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// Accents that read well on every look (the + picks any other).             //
const ACCENTS = ['#F6B3CB', '#F2D479', '#9CC9E6', '#A9D8A0', '#E8A35C', '#B49CE0', '#E05A7A', '#2F8F83'];

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------- //
// | The fields | //
// -------------- //
// The look, the accent and the text size: on the card, and in ⚙️ Settings → //
// 🖥️ This screen.                                                          //
export function LookFields() {
  const cur = useUiLook();
  const [err, setErr] = useState('');
  const change = (c: Partial<UiLook>) => {
    setErr('');
    setUiLook(c).catch(e => setErr((e as Error).message));
  };
  return (
    <>
      <p className="dim small" style={{ margin: 0 }}>
        For this screen’s cards, ☰ menu and Settings. The calendar keeps its own style (🎨 Board style).
      </p>
      <div className="lookrow">
        <span className="dim small">Look</span>
        <Segs label="Look" value={cur.look} options={LOOKS} onChange={look => change({ look })} />
      </div>
      <div className="lookrow">
        <span className="dim small">Accent color (headings and what’s picked)</span>
        <Colors
          label="Accent color"
          none="The look’s own"
          set={ACCENTS}
          value={cur.accent}
          onChange={accent => change({ accent })}
        />
      </div>
      <div className="lookrow">
        <span className="dim small">Text size</span>
        <Segs label="Text size" value={cur.size} options={SIZES} onChange={size => change({ size })} />
      </div>
      <div className="err">{err}</div>
    </>
  );
}
