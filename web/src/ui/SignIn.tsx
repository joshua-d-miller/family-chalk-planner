// Signing in on a phone or tablet: a passkey (Face ID, fingerprint), or username + password + the code
// from the authenticator app (at home, with home sign-in on: just the password).
import { useState } from 'react';
import { post } from '../lib/api.ts';
import { passkeysSupported, signInWithPasskey } from '../lib/passkey.ts';
import type { Who } from '../lib/who.ts';
import { Btn, Field } from './bits.tsx';

export function SignIn({ who, why, onDone }: { who: Who | null; why?: string; onDone: () => void }) {
  const [user, setUser] = useState('');
  const [pw, setPw] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const noCode = !!who?.homeSignin;
  const go = async () => {
    setErr('');
    setBusy(true);
    try {
      await post('api/account/login', { username: user, password: pw, code, kind: 'edit' });
      onDone();
    } catch (e) {
      setErr((e as Error).message);
      setCode('');
    } finally {
      setBusy(false);
    }
  };
  const passkey = async () => {
    setErr('');
    setBusy(true);
    try {
      await signInWithPasskey('edit');
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page">
      <div
        className="sheet open"
        id="signpad"
        role="dialog"
        aria-labelledby="signTitle"
        style={{ margin: '8vh auto 0' }}
      >
        <h3 id="signTitle">Sign in</h3>
        {why && <p className="dim">{why}</p>}
        {who?.passkeys && passkeysSupported() && (
          <>
            <Btn kind="go" onClick={passkey} disabled={busy}>
              Sign in with a passkey
            </Btn>
            <div className="dim small" style={{ textAlign: 'center' }}>
              or
            </div>
          </>
        )}
        <form
          onSubmit={e => {
            e.preventDefault();
            go();
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          <Field
            label="Username"
            value={user}
            onChange={e => setUser(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
          />
          <Field
            label="Password"
            type="password"
            value={pw}
            onChange={e => setPw(e.target.value)}
            autoComplete="current-password"
          />
          {!noCode && (
            <Field
              label="Code from your authenticator app"
              value={code}
              onChange={e => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
            />
          )}
          <div className="err">{err}</div>
          <Btn kind="go" type="submit" disabled={busy}>
            Sign in
          </Btn>
        </form>
        <p className="dim small">
          A wall or shared touch screen?{' '}
          <a href="./?pair" id="toPair" style={{ color: 'var(--yellow)' }}>
            Pair it
          </a>{' '}
          instead.
        </p>
      </div>
    </div>
  );
}
