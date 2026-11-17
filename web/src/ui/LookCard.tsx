/*
===============================================================================
 Family Chalk Planner | Screens | UI | LookCard.tsx
===============================================================================
 Version:   1.1.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-17
 Updated:   2026-11-17

 Purpose:
     🎨 Look of cards and menus: this screen's look for its cards, ☰ menu
     and Settings (chalk, light, dark or high contrast), an accent color
     and the text size. Each choice is saved as it's tapped, so the card
     itself shows the new look straight away.

 How it fits:
     Opened from the ☰ menu (any screen with one) or Settings → This
     screen. <LookHost /> sits in the Shell and shows the card when
     openLookCard() is called, so the ☰ menu can close first.

 Used by:
     web/src/ui/Shell.tsx
     web/src/ui/Menu.tsx
     web/src/pages/Settings.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.1.0    2026-11-17   joshua    New file.
                        claude
===============================================================================
*/

import { useEffect, useState } from 'react';
import { LOOKS, SIZES, setUiLook, useUiLook } from '../lib/uiLook.ts';
import type { UiLook } from '../lib/uiLook.ts';
import { Btn, Segs } from './bits.tsx';
import { Colors } from './Colors.tsx';
import { Sheet } from './Sheet.tsx';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------- //
// | Opening it | //
// -------------- //
// Anything can ask for the card; the Shell's <LookHost /> shows it.         //
const OPEN = 'chalk:lookcard';
export const openLookCard = () => dispatchEvent(new Event(OPEN));

export function LookHost() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    addEventListener(OPEN, show);
    return () => removeEventListener(OPEN, show);
  }, []);
  return open ? <LookCard onClose={() => setOpen(false)} /> : null;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------ //
// | The card | //
// ------------ //
// Accents that read well on every look (the + picks any other).             //
const ACCENTS = ['#F6B3CB', '#F2D479', '#9CC9E6', '#A9D8A0', '#E8A35C', '#B49CE0', '#E05A7A', '#2F8F83'];

function LookCard({ onClose }: { onClose: () => void }) {
  const cur = useUiLook();
  const [err, setErr] = useState('');
  const change = (c: Partial<UiLook>) => {
    setErr('');
    setUiLook(c).catch(e => setErr((e as Error).message));
  };
  return (
    <Sheet title="Look of cards and menus" onClose={onClose} id="lookCard">
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
      <div className="actions">
        <Btn kind="go" onClick={onClose}>
          Done
        </Btn>
      </div>
    </Sheet>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
