/*
===============================================================================
 Family Chalk Planner | Server | updates.ts
===============================================================================
 Version:   0.17.1
 Author:    Joshua D. Miller, Claude
 Updated:   2026-11-14

 Purpose:
     Updates, from the admin console. The board can't update itself (it
     never runs as root): on a server installed with deploy/install.sh, a
     small root service (family-chalk-planner-update) watches for a
     request file in the data folder and runs deploy/update.sh, which
     backs up the database first, checks the new version really works, and
     goes back to the old code and the backed-up database if it doesn't.
     update.sh writes how it went to update-status.json, which the console
     shows.

     Every night (systemd timer) update.sh also checks for a newer
     release, and if automatic updates are on (⚙️ Board → Updates),
     installs it when it's a minor or patch release (never a new major
     version).
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    Updates: database backup and restore, a real
                        claude    health check, Update now and nightly
                                  updates.

 0.17.1    2026-11-14   joshua    Says when Home Assistant updates the board
                        claude    (the app: UPDATER=homeassistant).
===============================================================================
*/

import fs from 'node:fs';
import path from 'node:path';
import type { Express, Request } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { SCHEMA_VERSION } from './migrations.ts';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------- //
// | The routes | //
// -------------- //
export function setup({
  app,
  db,
  dataDir,
  version,
  updater,
  audit
}: {
  app: Express;
  db: DatabaseSync;
  dataDir: string;
  version: string;
  updater: string | undefined; // 'systemd' when install.sh set up the update service
  audit: (req: Request, what: string, info: Record<string, string>) => void;
}) {
  const statusFile = path.join(dataDir, 'update-status.json');
  const requestFile = path.join(dataDir, 'update-request');

  // -------------------- //
  // | The health check | //
  // -------------------- //
  // For update.sh and Docker's health check: the board answers, the         //
  // database reads, and which version and database version are running      //
  // (update.sh checks it's the new one)                                     //
  app.get('/api/health', (_req, res) => {
    try {
      const v = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
      db.prepare('SELECT 1 FROM kv LIMIT 1').all();
      res.set('Cache-Control', 'no-store').json({ ok: v === SCHEMA_VERSION, version, db: v });
    } catch (e) {
      res.status(500).json({ ok: false, version, error: (e as Error).message });
    }
  });

  // -------------------------------- //
  // | Updates in the admin console | //
  // -------------------------------- //
  // The status update.sh last wrote, and whether this server can update     //
  // from the console (installed with deploy/install.sh, UPDATER=systemd).   //
  // Update now writes a request file; the root service does the rest.       //
  const status = () => {
    try {
      return JSON.parse(fs.readFileSync(statusFile, 'utf8'));
    } catch {
      return null;
    }
  };
  // admin console → ⚙️ Board → Updates
  app.get('/api/updates', (_req, res) => {
    res.set('Cache-Control', 'no-store').json({
      version,
      can: updater === 'systemd', // Docker and hand-made installs update another way
      updater: updater || '', // 'systemd', 'homeassistant' (the app: Home Assistant updates it), or none
      requested: fs.existsSync(requestFile),
      status: status()
    });
  });
  app.post('/api/updates/run', (req, res) => {
    if (updater !== 'systemd')
      return res.status(400).json({
        error:
          updater === 'homeassistant'
            ? 'Home Assistant updates this board: Settings → Apps → Family Chalk Planner → Update.'
            : 'This board can’t update itself from here. With Docker: pull the new image and restart the container. Otherwise run sudo bash deploy/update.sh on the server.'
      });
    fs.writeFileSync(requestFile, new Date().toISOString() + '\n', { mode: 0o640 });
    audit(req, 'update.requested', { detail: `from ${version}` });
    res.json({ ok: true });
  });
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
