/*
===============================================================================
 Family Chalk Planner | Screens | Drawing | Draw.tsx
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-07
 Updated:   2026-11-07

 Purpose:
     Drawing on the board (a tablet): chalk or Posca lines (Apple Pencil
     pressure makes them thicker), writing, the eraser, and selecting to
     move, resize, recolor, copy or erase. Lines are saved as they're
     finished; everything can be undone. Fingers resting on the screen
     while the Pencil draws are ignored.

 Used by:
     web/src/board/Board.tsx
     web/src/board/draw/Find.tsx
     web/src/board/draw/Tools.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    The new board: drawing on a tablet (chalk,
                        claude    Posca, writing, eraser, select, stamps,
                        colby     GIFs).

                                  The new screens take over: /, /edit and
                                  /chores are the React board; the old one
                                  stays at /classic.
===============================================================================
*/

import { useRef, useState } from 'react';
import type { PointerEvent as RPointerEvent } from 'react';
import { Art } from '../Art.tsx';
import type { ArtItem } from '../Art.tsx';
import { hits, inRect, isClosedLine, unionBox, xform } from '../geom.ts';
import type { Box } from '../geom.ts';
import { CHALK, POSCA } from '../../ui/Colors.tsx';
import type { ArtEditor } from './useArt.ts';
import './draw.css';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------ //
// | Tools and pens | //
// ------------------ //
export type Tool = 'pen' | 'erase' | 'text' | 'select';
export type Medium = 'chalk' | 'posca';
export const SIZES = [3, 6, 12];
export const TEXT_SIZES: [number, string][] = [
  [26, 'S'],
  [40, 'M'],
  [60, 'L'],
  [88, 'XL']
];
const ERASE_R = 16;

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------- //
// | Fingers on the screen | //
// ------------------------- //
// Fingers on the screen right now (the board counts them): two or more =    //
// pinching, not drawing                                                     //
export const touches = new Set<number>();
const W = 1252;
const H = 642;
export const isPosca = (c: string) => !CHALK.includes(c.toUpperCase());

export interface Pen {
  tool: Tool;
  medium: Medium;
  color: Record<Medium, string>;
  size: number; // index into SIZES
}
export const firstPen = (): Pen => ({
  tool: 'pen',
  medium: 'chalk',
  color: { chalk: CHALK[0], posca: POSCA[0] },
  size: 1
});

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------ //
// | Drawing on the board | //
// ------------------------ //
type Drag =
  | { k: 'line'; item: ArtItem }
  | { k: 'erase'; gone: Set<number>; last: [number, number]; at: [number, number] }
  | { k: 'band'; b: Box; x0: number; y0: number }
  | { k: 'move'; start: [number, number]; orig: ArtItem[]; moved: boolean }
  | { k: 'scale'; orig: ArtItem[]; box: Box; start: [number, number] }
  | { k: 'text'; item: ArtItem; start: [number, number]; moved: boolean }
  | null;

export function DrawLayer({
  art,
  pen,
  bg,
  res,
  selection,
  setSelection,
  onText,
  onRecolor,
  onSaveStamp,
  placing,
  onPlace,
  onHide
}: {
  art: ArtEditor;
  pen: Pen;
  bg: number;
  res: number;
  selection: number[];
  setSelection: (ids: number[]) => void;
  onText: (item: ArtItem | null, at: [number, number]) => void;
  onRecolor: () => void;
  onSaveStamp?: () => void; // not on a family screen
  placing: boolean; // a stamp is waiting for a tap
  onPlace: (at: [number, number]) => void;
  onHide: (ids: number[]) => void; // what the eraser is rubbing out, hidden until it's saved
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag>(null);
  const dragRef = useRef<Drag>(null);
  const lastPen = useRef(0);
  const go = (d: Drag) => {
    dragRef.current = d;
    setDrag(d);
    onHide(d?.k === 'erase' ? [...d.gone] : []);
  };
  const toBoard = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = ref.current!.getBoundingClientRect();
    return [((e.clientX - r.left) * W) / r.width, ((e.clientY - r.top) * H) / r.height];
  };
  const items = art.items;
  const sel = items.filter(x => selection.includes(x.id));
  const selBox = sel.length ? unionBox(sel) : null;
  const topHit = (x: number, y: number, r: number) => {
    for (let i = items.length - 1; i >= 0; i--) if (items[i].id >= 0 && hits(items[i], x, y, r)) return items[i];
    return null;
  };

  function down(e: RPointerEvent) {
    if (dragRef.current) return;
    if (e.pointerType === 'pen') lastPen.current = Date.now();
    else if (e.pointerType === 'touch' && Date.now() - lastPen.current < 1500) return; // a palm resting while the Pencil draws
    if (e.pointerType === 'touch' && touches.size > 1) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const pt = toBoard(e);
    if (placing) return onPlace(pt);
    if (pen.tool === 'select') {
      if (
        selBox &&
        pt[0] >= selBox.x1 - 10 &&
        pt[0] <= selBox.x2 + 10 &&
        pt[1] >= selBox.y1 - 10 &&
        pt[1] <= selBox.y2 + 10
      )
        return go({ k: 'move', start: pt, orig: sel, moved: false });
      // pressing right on something picks it up (with the rest of its picture) and drags it in one motion
      const hit = topHit(pt[0], pt[1], 8);
      if (hit) {
        const grp = hit.g ? items.filter(x => x.g === hit.g && x.id >= 0) : [hit];
        setSelection(grp.map(x => x.id));
        return go({ k: 'move', start: pt, orig: grp, moved: false });
      }
      setSelection([]);
      return go({ k: 'band', b: { x1: pt[0], y1: pt[1], x2: pt[0], y2: pt[1] }, x0: pt[0], y0: pt[1] });
    }
    if (pen.tool === 'erase') {
      const gone = new Set<number>();
      for (const s of items) if (s.id >= 0 && hits(s, pt[0], pt[1], ERASE_R)) gone.add(s.id);
      return go({ k: 'erase', gone, last: pt, at: pt });
    }
    if (pen.tool === 'text') {
      const t = [...items].reverse().find(x => x.k === 't' && x.id >= 0 && hits(x, pt[0], pt[1], 4));
      if (t) return go({ k: 'text', item: t, start: pt, moved: false });
      return onText(null, pt);
    }
    const posca = pen.medium === 'posca';
    let w = SIZES[pen.size] * (e.pointerType === 'pen' && e.pressure ? 0.6 + e.pressure : 1);
    if (posca) w *= 1.3; // Posca tips lay down a fatter line
    const item: ArtItem = { id: -1e9, c: pen.color[pen.medium], w: Math.round(w * 10) / 10, p: [pt[0], pt[1]] };
    if (posca) item.m = true;
    go({ k: 'line', item });
  }

  function move(e: RPointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    if (e.pointerType === 'pen') lastPen.current = Date.now();
    if (e.pointerType === 'touch' && touches.size > 1) {
      go(null); // a second finger: it's a pinch, not a line
      return;
    }
    e.preventDefault();
    const evs = (e.nativeEvent.getCoalescedEvents?.() || []) as PointerEvent[];
    const pt = toBoard(e);
    if (d.k === 'line') {
      const p = d.item.p!.slice();
      for (const ev of evs.length ? evs : [e]) p.push(...toBoard(ev));
      go({ k: 'line', item: { ...d.item, p } });
    } else if (d.k === 'erase') {
      const [ax, ay] = d.last;
      const steps = Math.max(1, Math.ceil(Math.hypot(pt[0] - ax, pt[1] - ay) / 6));
      const gone = new Set(d.gone);
      for (let i = 1; i <= steps; i++) {
        const x = ax + ((pt[0] - ax) * i) / steps;
        const y = ay + ((pt[1] - ay) * i) / steps;
        for (const s of items) if (s.id >= 0 && !gone.has(s.id) && hits(s, x, y, ERASE_R)) gone.add(s.id);
      }
      go({ k: 'erase', gone, last: pt, at: pt });
    } else if (d.k === 'band') {
      go({
        ...d,
        b: {
          x1: Math.min(d.x0, pt[0]),
          y1: Math.min(d.y0, pt[1]),
          x2: Math.max(d.x0, pt[0]),
          y2: Math.max(d.y0, pt[1])
        }
      });
    } else if (d.k === 'move') {
      const dx = pt[0] - d.start[0];
      const dy = pt[1] - d.start[1];
      const moved = d.moved || Math.hypot(dx, dy) > 4;
      if (moved) art.preview(d.orig.map(o => xform(o, dx, dy)));
      if (moved !== d.moved) go({ ...d, moved });
    } else if (d.k === 'scale') {
      const cx = (d.box.x1 + d.box.x2) / 2;
      const cy = (d.box.y1 + d.box.y2) / 2;
      const k0 = Math.hypot(d.start[0] - cx, d.start[1] - cy) || 1;
      const k = Math.max(0.15, Math.min(6, Math.hypot(pt[0] - cx, pt[1] - cy) / k0));
      art.preview(d.orig.map(o => xform(o, 0, 0, k, cx, cy)));
    } else if (d.k === 'text') {
      const dx = pt[0] - d.start[0];
      const dy = pt[1] - d.start[1];
      if (d.moved || Math.hypot(dx, dy) > 6) {
        art.preview([xform(d.item, dx, dy)]);
        if (!d.moved) go({ ...d, moved: true });
      }
    }
  }

  function up() {
    const d = dragRef.current;
    go(null);
    if (!d) return;
    if (d.k === 'line') {
      const p = d.item.p!;
      if (p.length < 4) p.push(p[0] + 0.5, p[1] + 0.5);
      const { id: _, ...line } = d.item;
      void _;
      art.add({ ...line, p: p.map(v => Math.round(v * 10) / 10) } as ArtItem);
    } else if (d.k === 'erase') {
      if (d.gone.size) art.remove(items.filter(x => d.gone.has(x.id)));
    } else if (d.k === 'band') {
      const r = d.b;
      if (r.x2 - r.x1 < 8 && r.y2 - r.y1 < 8) {
        const hit = topHit(r.x1, r.y1, 8); // a tap: the one thing under the finger
        setSelection(hit ? [hit.id] : []);
      } else setSelection(items.filter(x => x.id >= 0 && inRect(x, r)).map(x => x.id));
    } else if (d.k === 'move' || d.k === 'scale') {
      const ids = new Set(d.orig.map(o => o.id));
      if (d.k === 'scale' || d.moved)
        art.update(
          d.orig,
          items.filter(x => ids.has(x.id))
        );
    } else if (d.k === 'text') {
      if (d.moved)
        art.update(
          [d.item],
          items.filter(x => x.id === d.item.id)
        );
      else onText(d.item, [d.item.x || 0, d.item.y || 0]);
    }
  }

  const resize = (k: number) => {
    if (!selBox) return;
    const cx = (selBox.x1 + selBox.x2) / 2;
    const cy = (selBox.y1 + selBox.y2) / 2;
    art.update(
      sel,
      sel.map(o => xform(o, 0, 0, k, cx, cy))
    );
  };
  const barW = 430;
  return (
    <div
      ref={ref}
      className={'drawLayer tool-' + (placing ? 'place' : pen.tool)}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onTouchStart={e => {
        // the Pencil's touches belong to the drawing (iPadOS Scribble and edge gestures can't take them)
        for (const t of Array.from(e.changedTouches))
          if ((t as Touch & { touchType?: string }).touchType === 'stylus' && e.cancelable) e.preventDefault();
      }}
    >
      {drag?.k === 'line' && <Art items={[{ ...drag.item, id: -1 }]} bg={bg} res={res} gifsPlay={false} />}
      <svg className="drawUi" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        {drag?.k === 'erase' && <circle cx={drag.at[0]} cy={drag.at[1]} r={ERASE_R} className="ring" />}
        {drag?.k === 'band' && (
          <rect
            x={drag.b.x1}
            y={drag.b.y1}
            width={drag.b.x2 - drag.b.x1}
            height={drag.b.y2 - drag.b.y1}
            className="band"
          />
        )}
        {selBox && (
          <rect
            x={selBox.x1 - 4}
            y={selBox.y1 - 4}
            width={selBox.x2 - selBox.x1 + 8}
            height={selBox.y2 - selBox.y1 + 8}
            className="selbox"
          />
        )}
      </svg>
      {selBox && !drag && (
        <>
          <div
            className="selGrip"
            aria-label="Drag to resize"
            style={{ left: Math.min(W - 16, selBox.x2 + 6), top: Math.min(H - 16, selBox.y2 + 6) }}
            onPointerDown={e => {
              e.stopPropagation();
              e.preventDefault();
              (e.target as Element).setPointerCapture?.(e.pointerId);
              go({ k: 'scale', orig: sel, box: selBox, start: toBoard(e) });
            }}
          />
          <div
            className="selbar"
            onPointerDown={e => e.stopPropagation()}
            style={{
              left: Math.max(6, Math.min(W - barW - 6, (selBox.x1 + selBox.x2) / 2 - barW / 2)),
              top: selBox.y1 - 62 > 4 ? selBox.y1 - 62 : Math.min(H - 54, selBox.y2 + 14)
            }}
          >
            {onSaveStamp && (
              <button type="button" className="star" onClick={onSaveStamp}>
                ★ Save as stamp
              </button>
            )}
            <button type="button" onClick={onRecolor}>
              🎨 Color
            </button>
            <button type="button" aria-label="Make smaller" onClick={() => resize(1 / 1.2)}>
              −
            </button>
            <button type="button" aria-label="Make bigger" onClick={() => resize(1.2)}>
              +
            </button>
            <button
              type="button"
              onClick={async () => {
                const ids = await art.addMany(sel.map(it => xform(it, 30, 30)));
                setSelection(ids);
              }}
            >
              Copy
            </button>
            <button
              type="button"
              onClick={() => {
                art.remove(sel);
                setSelection([]);
              }}
            >
              Erase
            </button>
            <button type="button" aria-label="Done" onClick={() => setSelection([])}>
              ✕
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------- //
// | Recoloring | //
// -------------- //
// The line and fill colors of what's selected (fill: closed shapes only)    //
export function recolor(items: ArtItem[], line: string | undefined, fill: string | null | undefined) {
  return items.map(it => {
    const o: ArtItem = JSON.parse(JSON.stringify(it));
    if (line) {
      o.c = line;
      if (isPosca(line)) o.m = true;
      else delete o.m;
    }
    if (fill === null) delete o.fc;
    else if (fill && isClosedLine(o)) o.fc = fill;
    return o;
  });
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
