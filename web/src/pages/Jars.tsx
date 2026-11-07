// Reward jars: a kid earns a piece, someone drops it in; the jar fills up toward its goal. Two screens
// dropping pieces in at once both count.
import { useState } from 'react';
import type { Jar, JarPiece } from '../../../shared/lists.ts';
import { post } from '../lib/api.ts';
import { useLive } from '../lib/live.ts';
import { RANK } from '../lib/who.ts';
import type { Who } from '../lib/who.ts';
import { Btn } from '../ui/bits.tsx';
import { JarArt } from '../ui/JarArt.tsx';
import { Page } from '../ui/Page.tsx';
import './lists.css';

export const PIECE: Record<JarPiece, string> = { heart: '❤️', rainbow: '🌈', star: '⭐', bolt: '⚡', critter: '🐞' };

export function Jars({ who }: { who: Who | null }) {
  const live = useLive<Jar[]>('api/jars', ['jars']);
  const [err, setErr] = useState('');
  const can = (who?.rank || 0) >= RANK.family;
  const piece = (body: Record<string, unknown>) =>
    post<Jar[]>('api/jars/piece', body).then(live.set, e => setErr((e as Error).message));
  const jars = live.data || [];
  return (
    <Page id="jars" title="Reward jars" who={who}>
      <div className="err">{err}</div>
      {live.data && !jars.length && (
        <div className="empty">No jars yet. Add them on the board (✏️ Edit → + Reward jar).</div>
      )}
      <div className="daygrid">
        {jars.map(j => (
          <section className="section jar" key={j.id}>
            <h3>
              {j.name}
              <small>
                {j.count} of {j.goal}
                {j.count >= j.goal && ' 🎉'}
              </small>
            </h3>
            <div className="jarbar" role="progressbar" aria-valuemin={0} aria-valuemax={j.goal} aria-valuenow={j.count}>
              <span style={{ width: `${Math.min(100, (j.count / j.goal) * 100)}%` }} />
            </div>
            <div className="jarpic" aria-label={`${j.count} pieces`}>
              <JarArt jar={j} />
            </div>
            {can && (
              <div className="segs">
                {j.pieces.map(p => (
                  <Btn key={p} kind="go" aria-label={`Add a ${p}`} onClick={() => piece({ id: j.id, piece: p })}>
                    + <span className="emoji">{PIECE[p]}</span>
                  </Btn>
                ))}
                <Btn aria-label="Take one out" disabled={!j.count} onClick={() => piece({ id: j.id, out: true })}>
                  −
                </Btn>
              </div>
            )}
          </section>
        ))}
      </div>
    </Page>
  );
}
