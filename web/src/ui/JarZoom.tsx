/*
===============================================================================
 Family Chalk Planner | Screens | UI | JarZoom.tsx
===============================================================================
 Version:   1.2.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-16
 Updated:   2026-11-21

 Purpose:
     The zoomed reward jar overlay on the home board. Tapping a jar opens
     this card with piece drop animations, a piece picker to add items,
     a button to take one out, and a reward celebration button when full.

 Used by:
     web/src/board/Notes.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.17.1    2026-11-16   colby     Ported interactive reward jar zoom overlay
                        claude    from colby-board.

 1.2.0    2026-11-21   joshua    ★ Reward empties only that jar (it saved a
                        claude    set of just that one, removing the others).
                                  On the page, not inside the board: quick
                                  taps on the pieces no longer start a family
                                  screen's photo frame.
                                  A ✕ at the top right, like every card.
===============================================================================
*/

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Jar, JarPiece } from '../../../shared/lists.ts';
import { get, post } from '../lib/api.ts';
import { CloseX } from './Sheet.tsx';
import { burstAt, COLORS, JarArt, Piece, PIECE_ONE } from './JarArt.tsx';
import './jar.css';

interface JarZoomProps {
  jar: Jar | null;
  originEl: HTMLElement | null;
  onClose: () => void;
  onUpdate?: (jars: Jar[]) => void;
}

export function JarZoom({ jar, originEl, onClose, onUpdate }: JarZoomProps) {
  const [animClass, setAnimClass] = useState<'starting' | 'open' | 'closing' | ''>('');
  const [origin, setOrigin] = useState<{ x: number; y: number; s: number }>({ x: 0, y: 0, s: 0.32 });
  const closeTimer = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const jarSvgWrapRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef<number | null>(null);

  // Compute origin from clicked element bounding box
  const calcOrigin = (node: HTMLElement | null) => {
    if (!node || !node.getBoundingClientRect) {
      return {
        x: Math.round(window.innerWidth * 0.38),
        y: Math.round(window.innerHeight * 0.34),
        s: 0.28
      };
    }
    const r = node.getBoundingClientRect();
    if (!r.width && !r.height) {
      return {
        x: Math.round(window.innerWidth * 0.38),
        y: Math.round(window.innerHeight * 0.34),
        s: 0.28
      };
    }
    const dx = Math.round(r.left + r.width / 2 - window.innerWidth / 2);
    const dy = Math.round(r.top + r.height / 2 - window.innerHeight / 2);
    const sc = Math.max(0.18, Math.min(0.55, r.width / 240));
    return { x: dx, y: dy, s: parseFloat(sc.toFixed(2)) };
  };

  // Open animation when jar is set
  useEffect(() => {
    if (jar) {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      prevCountRef.current = jar.count;
      setOrigin(calcOrigin(originEl));
      setAnimClass('starting');

      // Force reflow then switch to 'open'
      const frame = requestAnimationFrame(() => {
        setAnimClass('open');
      });
      return () => cancelAnimationFrame(frame);
    } else {
      setAnimClass('');
    }
  }, [jar?.id]);

  const handleClose = () => {
    if (animClass !== 'open') return;
    setOrigin(calcOrigin(originEl));
    setAnimClass('closing');
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      setAnimClass('');
      onClose();
    }, 380);
  };

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && animClass === 'open') {
        handleClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [animClass]);

  if (!jar && animClass === '') return null;
  if (!jar) return null;

  const handleAddPiece = (p: JarPiece) => {
    if (jar.count >= 200) return;
    const prev = jar.count;
    post<Jar[]>('api/jars/piece', { id: jar.id, piece: p })
      .then(updatedList => {
        onUpdate?.(updatedList);
        if (prev < jar.goal && prev + 1 >= jar.goal) {
          setTimeout(() => {
            if (jarSvgWrapRef.current) burstAt(jarSvgWrapRef.current);
          }, 850);
        }
      })
      .catch(() => {});
  };

  const handleTakeOut = () => {
    if (jar.count <= 0) return;
    post<Jar[]>('api/jars/piece', { id: jar.id, out: true })
      .then(updatedList => {
        onUpdate?.(updatedList);
      })
      .catch(() => {});
  };

  const handleReward = () => {
    if (!confirm(`Reward time for ${jar.name}? This celebrates and empties the jar.`)) return;
    if (jarSvgWrapRef.current) burstAt(jarSvgWrapRef.current);
    // empty this jar and keep every other one as it is: the whole set, read fresh, back with this one emptied
    get<Jar[]>('api/jars')
      .then(all =>
        post<Jar[]>('api/jars', { jars: all.map(x => (x.id === jar.id ? { ...x, count: 0, items: [] } : x)) })
      )
      .then(updatedList => {
        onUpdate?.(updatedList);
      })
      .catch(() => {});
  };

  const isFull = jar.count >= jar.goal;
  const pieces: JarPiece[] = ['heart', 'rainbow', 'star', 'bolt', 'critter'];

  // on the page itself, not inside the board: the board's scaling doesn't apply, and quick taps on the
  // pieces aren't a double tap on the calendar (which starts a family screen's photo frame)
  return createPortal(
    <div
      id="jarZoom"
      className={animClass}
      role="dialog"
      aria-modal="true"
      aria-labelledby="jzTitle"
      style={
        {
          '--jzx': `${origin.x}px`,
          '--jzy': `${origin.y}px`,
          '--jzs': origin.s
        } as React.CSSProperties
      }
      onClick={e => {
        if (!cardRef.current || !cardRef.current.contains(e.target as Node)) {
          handleClose();
        }
      }}
    >
      <div className={`jzcard${isFull ? ' full' : ''}`} id="jzCard" ref={cardRef}>
        <span className="jzx">
          <CloseX onClose={handleClose} label="Put the jar back" />
        </span>
        <div className="jztitle chalk" id="jzTitle">
          {jar.name}’s Jar
        </div>
        <div className="jzjar" id="jzJarSvg" ref={jarSvgWrapRef}>
          <JarArt jar={jar} />
        </div>
        <div className="jzcount" id="jzCount">
          {isFull ? `★ Full! ${jar.count} / ${jar.goal}` : `${jar.count} of ${jar.goal}`}
        </div>
        <div className="jzpick" id="jzPick">
          {pieces.map(p => (
            <button
              key={p}
              type="button"
              className="jpc"
              aria-label={`Add a ${PIECE_ONE[p]}`}
              onClick={() => handleAddPiece(p)}
            >
              <svg viewBox="-10 -10 20 20" aria-hidden="true">
                <Piece type={p} c={COLORS[p][0]} />
              </svg>
              <span>{p === 'bolt' ? 'lightning' : PIECE_ONE[p]}</span>
            </button>
          ))}
        </div>
        <div className="jzactions" id="jzActions">
          {jar.count > 0 && (
            <button type="button" onClick={handleTakeOut}>
              − Take one out
            </button>
          )}
          {isFull && (
            <button type="button" className="rew" onClick={handleReward}>
              ★ Reward!
            </button>
          )}
        </div>
        <div className="jzhint">Tap anywhere outside the jar to put it back</div>
      </div>
    </div>,
    document.body
  );
}
