/*
===============================================================================
 Family Chalk Planner | Server | backup.ts
===============================================================================
 Version:   1.2.8
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-06
 Updated:   2026-11-24

 Purpose:
     Nightly snapshot of the database (a consistent copy, taken while the
     board runs) into the backup folder, for restic or any other backup
     tool. The last 14 days are kept.

     The encryption key for passwords saved in the console
     (data/secret.key) is copied there too, right away and whenever it
     changes, so a backup always has the key that matches it. A different
     key that's already there is never thrown away: an older database may
     need it.

 Used by:
     server/main.ts
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-06   joshua    Live updates, nightly backup and the Notes
                        claude    extras in their own TypeScript modules.

 1.2.8    2026-11-24   joshua    The encryption key's backup copy is read
                        claude    and written in one step each
                                  (server/files.ts).
===============================================================================
*/

import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { readIfThere, writeWhole } from './files.ts';

const KEEP_SNAPSHOTS = 14;

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------------------- //
// | Nightly snapshot and the key | //
// -------------------------------- //
export function setup({
  db,
  dataDir,
  backupDir,
  secretFromEnv,
  today
}: {
  db: DatabaseSync;
  dataDir: string;
  backupDir: string;
  secretFromEnv: boolean; // SECRET_KEY is set: there's no key file to copy
  today: () => string;
}) {
  const keyFile = path.join(dataDir, 'secret.key');
  const keyBackup = path.join(backupDir, 'secret.key');

  // ------------------------------------------- //
  // | The encryption key, next to the backups | //
  // ------------------------------------------- //
  // Copied right away and whenever it changes, so a backup always has the   //
  // key that matches it. A different key already there is kept: an older    //
  // database may need it.                                                   //
  function backupKey() {
    try {
      const k = readIfThere(keyFile);
      if (!k) return;
      const old = readIfThere(keyBackup);
      if (old && old.equals(k)) return;
      fs.mkdirSync(backupDir, { recursive: true });
      // a different key there already: it's kept beside the new one, never lost (each written in one step)
      if (old) writeWhole(path.join(backupDir, `secret.key.replaced-${today()}-${Date.now() % 1e6}`), old, 0o600);
      writeWhole(keyBackup, k, 0o600);
      fs.chmodSync(keyBackup, 0o600);
      console.log(`Chalkboard: encryption key copied to ${keyBackup}`);
    } catch (e) {
      console.error('Chalkboard: couldn’t copy the encryption key to the backup folder:', (e as Error).message);
    }
  }

  // ------------------------- //
  // | For the admin console | //
  // ------------------------- //
  // For Board settings: where the key is and whether the backup has it      //
  function keyInfo() {
    if (secretFromEnv)
      return { source: 'env', note: 'SECRET_KEY (set outside the board) — keep it with your server notes' };
    const exists = fs.existsSync(keyFile);
    let backedUp = false;
    try {
      backedUp = exists && fs.readFileSync(keyBackup).equals(fs.readFileSync(keyFile));
    } catch {
      /* no backup yet */
    }
    return { source: 'file', path: keyFile, exists, backup: keyBackup, backedUp };
  }

  // ------------------ //
  // | Tonight's copy | //
  // ------------------ //
  // VACUUM INTO makes a consistent copy while the board runs. The last 14   //
  // days are kept.                                                          //
  function snapshot() {
    try {
      fs.mkdirSync(backupDir, { recursive: true });
      const file = path.join(backupDir, `chalkboard-${today()}.db`);
      if (fs.existsSync(file)) return;
      db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
      fs.chmodSync(file, 0o600);
      backupKey();
      const old = fs
        .readdirSync(backupDir)
        .filter(f => /^chalkboard-\d{4}-\d{2}-\d{2}\.db$/.test(f))
        .sort()
        .reverse()
        .slice(KEEP_SNAPSHOTS);
      for (const f of old) fs.unlinkSync(path.join(backupDir, f));
      console.log(`Chalkboard: snapshot ${path.basename(file)}`);
    } catch (e) {
      console.error('Chalkboard: snapshot failed:', (e as Error).message);
    }
  }

  backupKey();
  snapshot();
  setInterval(snapshot, 10 * 60 * 1000); // makes one per day, shortly after midnight
  return { keyInfo };
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
