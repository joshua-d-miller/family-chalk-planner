// Pairing a screen (a wall, a shared tablet, a kid's tablet): it shows a code, an admin types it in the
// admin console (📺 Screens) and picks what the screen may do, and the screen carries on by itself.
import { useEffect, useState } from 'react';
import { get, post } from '../lib/api.ts';
import type { Who } from '../lib/who.ts';

export function Pair({ who }: { who: Who }) {
  const [code, setCode] = useState('····-····');
  const [note, setNote] = useState('Waiting… (the code changes every 15 minutes)');
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    const start = () =>
      post<{ code: string }>('api/pair/start').then(
        r => live && (setCode(r.code), setErr('')),
        e => live && setErr((e as Error).message)
      );
    start();
    const t = setInterval(() => {
      get<{ state: string }>('api/pair/status').then(
        st => {
          if (st.state === 'paired') {
            clearInterval(t);
            setNote('Paired ✓');
            setTimeout(() => location.replace(new URL('./', document.baseURI).href), 600);
          } else if (st.state === 'expired') start();
        },
        () => {}
      );
    }, 2500);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);
  return (
    <div className="page" id="pairpad">
      <div className="sheet open" role="dialog" aria-labelledby="pairTitle" style={{ margin: '10vh auto 0' }}>
        <h3 id="pairTitle">Pair this screen</h3>
        <p>
          In the admin console (<b>/admin</b> on your phone or computer) → <b>📺 Screens</b>, enter this code:
        </p>
        <div className="pcode" id="pairCode">
          {code}
        </div>
        <p className="dim">{note}</p>
        {who.firstRun ? (
          <p className="dim">First time? Open /admin on a phone or computer to create the admin account.</p>
        ) : (
          <p className="dim">
            <a href="edit" style={{ color: 'var(--yellow)' }}>
              Sign in to edit instead
            </a>
          </p>
        )}
        <div className="err">{err}</div>
      </div>
    </div>
  );
}
