/*
===============================================================================
 Family Chalk Planner | Screens | Helpers | passkey.ts
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-07
 Updated:   2026-11-07

 Purpose:
     Passkeys (Face ID / Touch ID / fingerprint / Windows Hello): signing
     in and adding one.

 Used by:
     web/src/ui/SignIn.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    The new screens (React + TypeScript): meal
                        colby     plan, reminders, timers, pantry, jars and
                        claude    chores.
===============================================================================
*/

import { ApiError, post } from './api.ts';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------ //
// | Bytes and text | //
// ------------------ //
const toBuf = (s: string) => {
  let t = s.replace(/-/g, '+').replace(/_/g, '/');
  while (t.length % 4) t += '=';
  return Uint8Array.from(atob(t), c => c.charCodeAt(0)).buffer;
};
const from = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------------------------- //
// | Can this device use passkeys? | //
// --------------------------------- //
export const passkeysSupported = () =>
  !!(window.PublicKeyCredential && navigator.credentials && window.isSecureContext);
const standalone = () => !!matchMedia?.('(display-mode: standalone)').matches;

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------------------- //
// | When the device says no | //
// --------------------------- //
// The browser refused before anything reached the board: tell the board   //
// why (it shows in the admin console's Activity).                          //
function report(stage: string, e: unknown) {
  const err = e as Error;
  if (!err?.name || e instanceof ApiError) return;
  post('api/passkey/client-error', { stage, name: err.name, message: err.message, app: standalone() }).catch(() => {});
}
function friendly(e: unknown) {
  const err = e as Error;
  if (err?.name === 'NotAllowedError')
    return new Error(
      'The passkey wasn’t used (cancelled, or the password manager couldn’t use it). Password + code still works.'
    );
  if (err?.name === 'InvalidStateError') return new Error('This device already has a passkey for you');
  if (e instanceof ApiError && e.body.unknownCredential) {
    // tell the password manager this passkey is gone, so it stops offering it (where supported)
    const P = PublicKeyCredential as unknown as { signalUnknownCredential?: (o: object) => Promise<void> };
    P.signalUnknownCredential?.({ rpId: e.body.rpId, credentialId: e.body.unknownCredential }).catch(() => {});
  }
  return err;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------------------- //
// | Signing in with a passkey | //
// ----------------------------- //
type Opts = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function signInWithPasskey(kind: 'edit' | 'admin') {
  try {
    const o = await post<{ id: string; options: Opts }>('api/passkey/login/options', { kind });
    const p = o.options;
    let cred: PublicKeyCredential;
    try {
      cred = (await navigator.credentials.get({
        publicKey: {
          challenge: toBuf(p.challenge),
          rpId: p.rpId,
          timeout: p.timeout,
          userVerification: p.userVerification,
          allowCredentials: (p.allowCredentials || []).map((c: Opts) => ({
            type: 'public-key',
            id: toBuf(c.id),
            transports: c.transports
          }))
        }
      })) as PublicKeyCredential;
    } catch (e) {
      report('get', e);
      throw e;
    }
    const r = cred.response as AuthenticatorAssertionResponse;
    return await post<{ ok: true; role: string; name: string }>('api/passkey/login/verify', {
      id: o.id,
      response: {
        id: cred.id,
        rawId: from(cred.rawId),
        type: cred.type,
        clientExtensionResults: cred.getClientExtensionResults?.() || {},
        authenticatorAttachment: cred.authenticatorAttachment || undefined,
        response: {
          clientDataJSON: from(r.clientDataJSON),
          authenticatorData: from(r.authenticatorData),
          signature: from(r.signature),
          userHandle: r.userHandle ? from(r.userHandle) : undefined
        }
      }
    });
  } catch (e) {
    throw friendly(e);
  }
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
