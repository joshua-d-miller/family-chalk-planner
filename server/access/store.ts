/*
===============================================================================
 Family Chalk Planner | Server | Access | store.ts
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-06
 Updated:   2026-11-06

 Purpose:
     The access tables and the queries on them. Every key and code is
     stored only as a hash.

 Used by:
     server/access/access.ts
     server/access/accounts.ts
     server/access/people.ts
     server/access/security.ts
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-06   joshua    Move access (screens, people, sign-in,
                        claude    passkeys, security) to TypeScript.
===============================================================================
*/

import type { DatabaseSync, StatementSync } from 'node:sqlite';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------ //
// | The rows | //
// ------------ //
export interface Device {
  id: string;
  key_hash: string;
  name: string;
  role: string; // 'view' | 'family' | 'kid:<person>'
  created: number;
  last_seen: number;
  agent: string;
  ip: string;
}
export interface Pairing {
  id: string;
  code_hash: string;
  secret_hash: string;
  created: number;
  agent: string;
  ip: string;
  device_key: string | null; // set when approved, handed over once
  role: string | null;
}
export interface User {
  id: string;
  username: string;
  name: string;
  role: 'editor' | 'admin';
  pw_hash: string | null;
  totp_secret: string | null; // sealed with the person's password
  totp_ok: number;
  totp_last: number;
  created: number;
  last_login: number | null;
}
export interface Passkey {
  id: string;
  user_id: string;
  public_key: string;
  counter: number;
  transports: string | null;
  name: string;
  created: number;
  last_used: number | null;
}
export interface Session {
  key_hash: string;
  user_id: string;
  kind: 'edit' | 'admin';
  created: number;
  last_seen: number;
  agent: string;
  ip: string;
}
export interface SessionRow extends Session {
  id: number; // rowid
}
export interface Invite {
  code_hash: string;
  user_id: string;
  created: number;
}
export interface AuditRow {
  id: number;
  at: number;
  event: string;
  actor: string | null;
  target: string | null;
  detail: string | null;
  ip: string;
  agent: string;
  ref_type: string | null;
  ref_id: string | null;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------------------------------- //
// | The tables, and every query on them | //
// --------------------------------------- //
export function makeStore(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY, key_hash TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL,
    created INTEGER NOT NULL, last_seen INTEGER NOT NULL, agent TEXT, ip TEXT)`);
  db.exec(`CREATE TABLE IF NOT EXISTS pairing (
    id TEXT PRIMARY KEY, code_hash TEXT UNIQUE NOT NULL, secret_hash TEXT UNIQUE NOT NULL,
    created INTEGER NOT NULL, agent TEXT, ip TEXT, device_key TEXT, role TEXT)`);
  db.exec(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL,
    pw_hash TEXT, totp_secret TEXT, totp_ok INTEGER NOT NULL DEFAULT 0, totp_last INTEGER NOT NULL DEFAULT 0,
    created INTEGER NOT NULL, last_login INTEGER)`);
  db.exec(`CREATE TABLE IF NOT EXISTS passkeys (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, public_key TEXT NOT NULL, counter INTEGER NOT NULL,
    transports TEXT, name TEXT, created INTEGER NOT NULL, last_used INTEGER)`);
  db.exec(`CREATE TABLE IF NOT EXISTS user_sessions (
    key_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, created INTEGER NOT NULL,
    last_seen INTEGER NOT NULL, agent TEXT, ip TEXT)`);
  db.exec(`CREATE TABLE IF NOT EXISTS invites (
    code_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created INTEGER NOT NULL)`);
  db.exec(`CREATE TABLE IF NOT EXISTS audit (
    id INTEGER PRIMARY KEY, at INTEGER NOT NULL, event TEXT NOT NULL, actor TEXT, target TEXT, detail TEXT,
    ip TEXT, agent TEXT, ref_type TEXT, ref_id TEXT)`);

  // typed wrappers: one row (or undefined), all rows, or a change
  const one =
    <T>(st: StatementSync) =>
    (...a: (string | number | null)[]) =>
      st.get(...a) as T | undefined;
  const all =
    <T>(st: StatementSync) =>
    (...a: (string | number | null)[]) =>
      st.all(...a) as unknown as T[];
  const run =
    (st: StatementSync) =>
    (...a: (string | number | null)[]) =>
      st.run(...a);
  const p = (sql: string) => db.prepare(sql);
  const count =
    (st: StatementSync) =>
    (...a: (string | number)[]) =>
      (st.get(...a) as { n: number }).n;

  return {
    // screens
    dByKey: one<Device>(p('SELECT * FROM devices WHERE key_hash = ?')),
    dById: one<Device>(p('SELECT * FROM devices WHERE id = ?')),
    dList: all<Omit<Device, 'key_hash' | 'ip'>>(
      p('SELECT id, name, role, created, last_seen, agent FROM devices ORDER BY created')
    ),
    dAdd: run(
      p('INSERT INTO devices (id, key_hash, name, role, created, last_seen, agent, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    ),
    dSeen: run(p("UPDATE devices SET last_seen = ?, ip = COALESCE(NULLIF(?, ''), ip) WHERE id = ?")),
    dUpd: run(p('UPDATE devices SET name = ?, role = ? WHERE id = ?')),
    dDel: run(p('DELETE FROM devices WHERE id = ?')),
    dStale: all<Device>(p('SELECT * FROM devices WHERE last_seen < ?')),
    // screens waiting to be paired
    pAdd: run(p('INSERT INTO pairing (id, code_hash, secret_hash, created, agent, ip) VALUES (?, ?, ?, ?, ?, ?)')),
    pBySecret: one<Pairing>(p('SELECT * FROM pairing WHERE secret_hash = ?')),
    pByCode: one<Pairing>(p('SELECT * FROM pairing WHERE code_hash = ?')),
    pList: all<Pick<Pairing, 'id' | 'created' | 'agent'>>(
      p('SELECT id, created, agent FROM pairing WHERE device_key IS NULL ORDER BY created')
    ),
    pApprove: run(p('UPDATE pairing SET device_key = ?, role = ? WHERE id = ?')),
    pDel: run(p('DELETE FROM pairing WHERE id = ?')),
    pPurge: run(p('DELETE FROM pairing WHERE created < ?')),
    pCount: count(p('SELECT COUNT(*) AS n FROM pairing WHERE device_key IS NULL')),
    // people
    uById: one<User>(p('SELECT * FROM users WHERE id = ?')),
    uByName: one<User>(p('SELECT * FROM users WHERE username = ?')),
    uList: all<Pick<User, 'id' | 'username' | 'name' | 'role' | 'totp_ok' | 'created' | 'last_login'>>(
      p('SELECT id, username, name, role, totp_ok, created, last_login FROM users ORDER BY created')
    ),
    uAdd: run(p('INSERT INTO users (id, username, name, role, created) VALUES (?, ?, ?, ?, ?)')),
    uSetPw: run(p('UPDATE users SET pw_hash = ? WHERE id = ?')),
    uSetSealed: run(p('UPDATE users SET totp_secret = ? WHERE id = ?')),
    uSetTotp: run(p('UPDATE users SET totp_secret = ?, totp_ok = ?, totp_last = 0 WHERE id = ?')),
    uTotpLast: run(p('UPDATE users SET totp_last = ? WHERE id = ?')),
    uLogin: run(p('UPDATE users SET last_login = ? WHERE id = ?')),
    uUpd: run(p('UPDATE users SET name = ?, role = ? WHERE id = ?')),
    uDel: run(p('DELETE FROM users WHERE id = ?')),
    uAdmins: count(p("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND totp_ok = 1")),
    uStale: all<User>(p('SELECT * FROM users WHERE totp_ok = 0 AND created < ?')),
    // passkeys
    pkByUser: all<Pick<Passkey, 'id' | 'name' | 'created' | 'last_used' | 'transports'>>(
      p('SELECT id, name, created, last_used, transports FROM passkeys WHERE user_id = ? ORDER BY created')
    ),
    pkById: one<Passkey>(p('SELECT * FROM passkeys WHERE id = ?')),
    pkAdd: run(
      p(
        'INSERT INTO passkeys (id, user_id, public_key, counter, transports, name, created) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
    ),
    pkUse: run(p('UPDATE passkeys SET counter = ?, last_used = ? WHERE id = ?')),
    pkDel: run(p('DELETE FROM passkeys WHERE id = ? AND user_id = ?')),
    pkDelUser: run(p('DELETE FROM passkeys WHERE user_id = ?')),
    pkDelAny: run(p('DELETE FROM passkeys WHERE id = ?')),
    pkAll: all<{
      id: string;
      name: string;
      created: number;
      last_used: number | null;
      uid: string;
      uname: string;
      username: string;
    }>(
      p(
        'SELECT p.id, p.name, p.created, p.last_used, u.id AS uid, u.name AS uname, u.username FROM passkeys p JOIN users u ON u.id = p.user_id'
      )
    ),
    // sign-ins
    sAdd: run(
      p(
        'INSERT INTO user_sessions (key_hash, user_id, kind, created, last_seen, agent, ip) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
    ),
    sGet: one<Session>(p('SELECT * FROM user_sessions WHERE key_hash = ?')),
    sSeen: run(p("UPDATE user_sessions SET last_seen = ?, ip = COALESCE(NULLIF(?, ''), ip) WHERE key_hash = ?")),
    sDel: run(p('DELETE FROM user_sessions WHERE key_hash = ?')),
    sDelUser: run(p('DELETE FROM user_sessions WHERE user_id = ?')),
    sDelAdmin: run(p("DELETE FROM user_sessions WHERE user_id = ? AND kind = 'admin'")),
    sByUser: count(p("SELECT COUNT(*) AS n FROM user_sessions WHERE user_id = ? AND kind = 'edit'")),
    sList: all<SessionRow>(
      p(
        'SELECT rowid AS id, kind, created, last_seen, agent, ip, key_hash FROM user_sessions WHERE user_id = ? ORDER BY last_seen DESC'
      )
    ),
    sById: one<SessionRow>(p('SELECT rowid AS id, * FROM user_sessions WHERE rowid = ?')),
    sDelId: run(p('DELETE FROM user_sessions WHERE rowid = ?')),
    sPurge: run(
      p(
        "DELETE FROM user_sessions WHERE (kind = 'edit' AND last_seen < ?) OR (kind = 'admin' AND (last_seen < ? OR created < ?))"
      )
    ),
    sPurgeEditOlder: run(p("DELETE FROM user_sessions WHERE kind = 'edit' AND created < ?")),
    // invites
    iAdd: run(p('INSERT INTO invites (code_hash, user_id, created) VALUES (?, ?, ?)')),
    iGet: one<Invite>(p('SELECT * FROM invites WHERE code_hash = ?')),
    iDelUser: run(p('DELETE FROM invites WHERE user_id = ?')),
    iForUser: one<{ created: number }>(p('SELECT created FROM invites WHERE user_id = ?')),
    iPurge: run(p('DELETE FROM invites WHERE created < ?')),
    // the activity log
    aAdd: run(
      p(
        'INSERT INTO audit (at, event, actor, target, detail, ip, agent, ref_type, ref_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
    ),
    aList: all<AuditRow>(p('SELECT * FROM audit ORDER BY id DESC LIMIT ?')),
    aFails: all<{ target: string; ip: string; n: number; last: number }>(
      p(
        "SELECT target, ip, COUNT(*) AS n, MAX(at) AS last FROM audit WHERE event = 'signin.failed' AND at > ? GROUP BY target, ip ORDER BY n DESC"
      )
    ),
    aPurge: run(p('DELETE FROM audit WHERE at < ?')),
    // everything at once (deploy/reset-admin.sh)
    wipe: () =>
      db.exec(
        'DELETE FROM user_sessions; DELETE FROM passkeys; DELETE FROM invites; DELETE FROM users; DELETE FROM devices; DELETE FROM pairing;'
      )
  };
}
export type Store = ReturnType<typeof makeStore>;

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
