/*
===============================================================================
 Family Chalk Planner | Server | files.ts
===============================================================================
 Version:   1.2.8
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-24
 Updated:   2026-11-24

 Purpose:
     Files the board keeps in its own folders (photos, pictures, emoji,
     the settings key), made and read safely: a name always stays inside
     its folder, and a file is written in one step (a temporary file
     renamed into place, or created only if it isn't there yet) rather
     than "is it there? then write it", which another write could slip
     between.

 How it fits:
     GitHub's code scanning (CodeQL) recognizes the check in inside(), so
     the paths it returns aren't reported as "uncontrolled data used in a
     path expression".

 Used by:
     server/backup.ts
     server/clipart.ts
     server/media.ts
     server/pages.ts
     server/photos/photos.ts
     server/settings.ts
     server/webclip.ts
     test/files.test.ts
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.2.8     2026-11-24   joshua    New: names kept inside their folder, and
                        claude    files written in one step.
===============================================================================
*/

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------------- //
// | Inside its folder | //
// --------------------- //
// The full path of name inside dir, or null when it would land anywhere    //
// else (a "../", a "/" or an absolute path in it). The routes check names  //
// against a pattern first too; this is the last word.                      //
export function inside(dir: string, name: string): string | null {
  const root = path.resolve(dir);
  const file = path.resolve(root, String(name));
  if (!file.startsWith(root + path.sep)) return null;
  return file;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------------- //
// | Reading, if it's there | //
// -------------------------- //
// The file's contents, or null when there's no such file (any other        //
// trouble, like no permission, still throws).                              //
export function readIfThere(file: string): Buffer | null {
  try {
    return fs.readFileSync(file);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------------- //
// | Writing in one step | //
// ----------------------- //
// The whole file appears at once: written under a temporary name in the    //
// same folder, then renamed over the real one. A screen asking for it at   //
// the same moment gets the old file or the new one, never half of one.     //
export function writeWhole(file: string, data: string | Buffer, mode?: number) {
  const tmp = `${file}.${crypto.randomBytes(4).toString('hex')}.part`;
  try {
    fs.writeFileSync(tmp, data, mode === undefined ? undefined : { mode });
    fs.renameSync(tmp, file);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
}

// -------------------- //
// | Only if it's new | //
// -------------------- //
// Creates the file only when there's none yet (in one step: the system     //
// refuses if it appeared meanwhile). True when this call made it.          //
export function writeIfNew(file: string, data: string | Buffer, mode?: number): boolean {
  try {
    fs.writeFileSync(file, data, { flag: 'wx', ...(mode === undefined ? {} : { mode }) });
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw e;
  }
}
