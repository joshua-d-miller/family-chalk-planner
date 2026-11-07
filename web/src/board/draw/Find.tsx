// "Find more": about 5,000 line drawings (Tabler Icons, MIT) turned into real chalk or Posca lines, so
// they can be erased, recolored and filled like anything drawn by hand.
import { createElement, useEffect, useRef, useState } from 'react';
import { get } from '../../lib/api.ts';
import { CHALK, Colors } from '../../ui/Colors.tsx';
import type { ArtItem } from '../Art.tsx';
import { isClosedLine } from '../geom.ts';
import { isPosca } from './Draw.tsx';
import type { Stamp } from './Library.tsx';

type Node = [string, Record<string, string>];
type Found = { items: { name: string; nodes: Node[] }[]; total?: number };
const WORDS =
  'birthday christmas halloween easter heart star sport food pet school weather car home music flower'.split(' ');
const NS = 'http://www.w3.org/2000/svg';

// every outline sampled into points; a jump in a path (a "move") starts a new line
function toItems(nodes: Node[], line: string, fill: string | null): ArtItem[] {
  const holder = document.createElementNS(NS, 'svg');
  holder.setAttribute('viewBox', '0 0 24 24');
  holder.setAttribute('width', '24');
  holder.setAttribute('height', '24');
  holder.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden';
  document.body.appendChild(holder);
  const K = 4;
  const posca = isPosca(line);
  const out: ArtItem[] = [];
  try {
    for (const [tag, attrs] of nodes) {
      if (attrs?.stroke === 'none') continue;
      const el = document.createElementNS(NS, tag) as SVGGeometryElement;
      for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
      holder.appendChild(el);
      if (typeof el.getTotalLength !== 'function') continue;
      const len = el.getTotalLength();
      let pts: number[] = [];
      const flush = () => {
        if (pts.length) {
          const st: ArtItem = { id: 0, c: line, w: posca ? 5.5 : 5, p: pts };
          if (posca) st.m = true;
          if (fill && isClosedLine(st)) st.fc = fill;
          out.push(st);
        }
        pts = [];
      };
      if (len < 0.3) {
        const q = el.getPointAtLength(0);
        pts = [(q.x - 12) * K, (q.y - 12) * K, (q.x - 12) * K + 0.4, (q.y - 12) * K + 0.4];
        flush();
        continue;
      }
      const steps = Math.max(2, Math.ceil(len / 0.35));
      let prev: DOMPoint | null = null;
      for (let i = 0; i <= steps; i++) {
        const q = el.getPointAtLength((len * i) / steps);
        if (prev && Math.hypot(q.x - prev.x, q.y - prev.y) > 1.2) flush();
        pts.push(Math.round((q.x - 12) * K * 10) / 10, Math.round((q.y - 12) * K * 10) / 10);
        prev = q;
      }
      flush();
    }
  } finally {
    holder.remove();
  }
  return out;
}

export function FindPane({ pick }: { pick: (s: Stamp) => void }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Found | null>(null);
  const [note, setNote] = useState('');
  const [line, setLine] = useState(CHALK[0]);
  const [fill, setFill] = useState<string | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    const n = ++seq.current;
    if (!q.trim()) {
      setFound(null);
      setNote('');
      return;
    }
    const t = setTimeout(() => {
      setNote('Searching…');
      get<Found>('api/clipart/search?q=' + encodeURIComponent(q)).then(
        r => {
          if (n !== seq.current) return;
          setFound(r);
          setNote(
            r.items.length
              ? r.total && r.total > r.items.length
                ? `Showing ${r.items.length} of ${r.total} - add another word to narrow it`
                : `${r.items.length} found`
              : 'Nothing found - try another word'
          );
        },
        e => n === seq.current && setNote('Couldn’t search: ' + (e as Error).message)
      );
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <>
      <input
        type="search"
        className="clipq"
        placeholder="Search: pumpkin, birthday, dog, soccer…"
        value={q}
        onChange={e => setQ(e.target.value)}
        aria-label="Search line drawings"
      />
      <div className="segs">
        {WORDS.map(w => (
          <button type="button" key={w} className="seg" onClick={() => setQ(w)}>
            {w}
          </button>
        ))}
      </div>
      <div className="sublbl">Line</div>
      <Colors value={line} onChange={c => c && setLine(c)} label="Line color" />
      <div className="sublbl">Fill</div>
      <Colors value={fill} onChange={setFill} none="No fill" label="Fill" />
      <div className="sublbl">{note}</div>
      <div className="cgrid big icons">
        {found?.items.map(it => (
          <button
            type="button"
            key={it.name}
            className="ctile"
            title={it.name.replace(/-/g, ' ')}
            aria-label={it.name.replace(/-/g, ' ')}
            onClick={() => pick({ name: it.name.replace(/-/g, ' '), items: toItems(it.nodes, line, fill) })}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke={line}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {it.nodes
                .filter(([, a]) => a?.stroke !== 'none')
                .map(([tag, a], i) =>
                  createElement(tag, { key: i, ...a, fill: fill && /z\s*$/i.test(a?.d || '') ? fill : undefined })
                )}
            </svg>
          </button>
        ))}
      </div>
      <div className="sublbl">Line drawings: Tabler Icons (MIT)</div>
    </>
  );
}
