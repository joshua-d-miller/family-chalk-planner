/* Passkeys (Face ID / Touch ID / fingerprint / Windows Hello) for the board and the admin console.
   window.chalkPasskey.signIn(kind) and .register(name) talk to /api/passkey/... */
(function () {
  'use strict';
  var b64u = {
    toBuf: function (s) { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var bin = atob(s), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; },
    from: function (buf) { var u = new Uint8Array(buf), s = ''; for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  };
  function call(path, body) {
    return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Chalk': '1' }, body: JSON.stringify(body || {}) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) {
          var e = new Error(j.error || ('HTTP ' + r.status)); e.status = r.status; e.body = j;
          // tell the password manager this passkey is gone, so it stops offering it (where supported)
          if (j.unknownCredential && window.PublicKeyCredential && PublicKeyCredential.signalUnknownCredential) {
            try { PublicKeyCredential.signalUnknownCredential({ rpId: j.rpId, credentialId: j.unknownCredential }).catch(function () {}); } catch (x) {}
          }
          throw e;
        }
        return j;
      }); });
  }
  // a name for a new passkey: iPads ask for desktop sites and look like a Mac to the server
  function deviceName() {
    var ua = navigator.userAgent, ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    var os = ipad ? 'iPad' : /iPhone/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /CrOS/.test(ua) ? 'Chromebook' : 'this device';
    var app = window.matchMedia && matchMedia('(display-mode: standalone)').matches ? 'home-screen app' : /CriOS|Chrome\//.test(ua) && !/Edg/.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Edg/.test(ua) ? 'Edge' : 'Safari';
    return app + ' on ' + os;
  }
  function friendly(e) {
    if (e && e.name === 'NotAllowedError') return new Error('Cancelled (or this device has no passkey for the board yet)');
    if (e && e.name === 'InvalidStateError') return new Error('This device already has a passkey for you');
    return e;
  }
  var supported = !!(window.PublicKeyCredential && navigator.credentials && window.isSecureContext);
  function signIn(kind) {
    return call('/api/passkey/login/options', { kind: kind }).then(function (o) {
      var p = o.options;
      var pub = { challenge: b64u.toBuf(p.challenge), rpId: p.rpId, timeout: p.timeout, userVerification: p.userVerification,
        allowCredentials: (p.allowCredentials || []).map(function (c) { return { type: 'public-key', id: b64u.toBuf(c.id), transports: c.transports }; }) };
      return navigator.credentials.get({ publicKey: pub }).then(function (cred) {
        var r = cred.response;
        return call('/api/passkey/login/verify', { id: o.id, response: {
          id: cred.id, rawId: b64u.from(cred.rawId), type: cred.type, clientExtensionResults: cred.getClientExtensionResults ? cred.getClientExtensionResults() : {},
          authenticatorAttachment: cred.authenticatorAttachment || undefined,
          response: { clientDataJSON: b64u.from(r.clientDataJSON), authenticatorData: b64u.from(r.authenticatorData), signature: b64u.from(r.signature), userHandle: r.userHandle ? b64u.from(r.userHandle) : undefined }
        } });
      });
    }).catch(function (e) { throw friendly(e); });
  }
  function register(name) {
    return call('/api/passkey/register/options').then(function (o) {
      var p = o.options;
      var pub = { challenge: b64u.toBuf(p.challenge), rp: p.rp, user: { id: b64u.toBuf(p.user.id), name: p.user.name, displayName: p.user.displayName },
        pubKeyCredParams: p.pubKeyCredParams, timeout: p.timeout, attestation: p.attestation, authenticatorSelection: p.authenticatorSelection,
        excludeCredentials: (p.excludeCredentials || []).map(function (c) { return { type: 'public-key', id: b64u.toBuf(c.id), transports: c.transports }; }),
        extensions: p.extensions };
      return navigator.credentials.create({ publicKey: pub }).then(function (cred) {
        var r = cred.response;
        return call('/api/passkey/register/verify', { id: o.id, name: name || deviceName(), response: {
          id: cred.id, rawId: b64u.from(cred.rawId), type: cred.type, clientExtensionResults: cred.getClientExtensionResults ? cred.getClientExtensionResults() : {},
          authenticatorAttachment: cred.authenticatorAttachment || undefined,
          response: { clientDataJSON: b64u.from(r.clientDataJSON), attestationObject: b64u.from(r.attestationObject), transports: r.getTransports ? r.getTransports() : [] }
        } });
      });
    }).catch(function (e) { throw friendly(e); });
  }
  window.chalkPasskey = { supported: supported, signIn: signIn, register: register };
})();
