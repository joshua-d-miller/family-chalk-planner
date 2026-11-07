/*
===============================================================================
 Family Chalk Planner | Screens | UI | Oops.tsx
===============================================================================
 Version:   0.14.0
 Author:    Joshua D. Miller, Claude
 Updated:   2026-11-07

 Purpose:
     When a screen hits an error it can't recover from: a message and a
     way back instead of a blank page, and the error goes to the board
     (Activity in the admin console, and the server log) so it can be
     fixed.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.14.0    2026-11-07   joshua    New file.
                        claude
===============================================================================
*/

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { post } from '../lib/api.ts';
import './oops.css';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------------- //
// | Telling the board | //
// --------------------- //
let sent = 0;
export function reportError(e: unknown, extra = '') {
  if (++sent > 3) return; // a few per page load is plenty
  const err = e instanceof Error ? e : new Error(String(e));
  post('api/screen-error', {
    where: location.pathname,
    message: `${err.name}: ${err.message}`,
    stack: `${err.stack || ''}${extra ? '\n' + extra : ''}`
  }).catch(() => {});
}

// errors outside React's drawing (a click handler, a timer): reported, the screen carries on
addEventListener('error', e => reportError(e.error || e.message));
addEventListener('unhandledrejection', e => {
  if (!(e.reason && (e.reason as { name?: string }).name === 'ApiError')) reportError(e.reason);
});

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------- //
// | The message | //
// --------------- //
export class Oops extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, info.componentStack || '');
  }
  render() {
    const e = this.state.error;
    if (!e) return this.props.children;
    return (
      <div className="oops" role="alert">
        <h1>Oops</h1>
        <p>Something went wrong on this screen. It has been noted in the admin console (🛡 Activity).</p>
        <p className="why">{e.message}</p>
        <div className="actions">
          <button type="button" className="btn go" onClick={() => location.reload()}>
            Reload
          </button>
          <a className="btn" href="./">
            Back to the board
          </a>
        </div>
      </div>
    );
  }
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
