/*
===============================================================================
 Family Chalk Planner | Tests | images.test.ts
===============================================================================
 Version:   1.2.8
 Author:    Joshua D. Miller, Claude
 Updated:   2026-11-24

 Purpose:
     Pictures from elsewhere are drawn again before they're kept
     (server/images.ts): the same picture comes out, still moving if it
     moved, the right way up, and nothing hidden in the original comes
     along (a second file tucked on the end, where a photo was taken).
     Something that only looks like a picture is turned away. A board from
     before 1.2.8 keeps its animated emoji list and still pictures without
     the internet.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.2.8     2026-11-24   joshua    New file.
                        claude
===============================================================================
*/

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { client, makeAdmin, startServer } from './helpers.ts';
import { kindOf, remade, svgAsPng } from '../server/images.ts';
import { GIF, JPEG, PNG, WEBP } from './sample-pictures.ts';

test('each kind comes out as the same kind of picture, the same size', async () => {
  for (const [buf, kind] of [
    [GIF, 'gif'],
    [PNG, 'png'],
    [JPEG, 'jpg'],
    [WEBP, 'webp']
  ] as const) {
    const out = await remade(buf);
    assert.ok(out, kind);
    assert.equal(out.kind, kind);
    assert.equal(kindOf(out.buf), kind);
    const m = await sharp(out.buf).metadata();
    assert.deepEqual([m.width, m.height], [2, 2], kind);
  }
});

test('nothing tucked on the end comes along', async () => {
  const hidden = Buffer.from('<script>alert(1)</script> and a whole second file');
  for (const buf of [GIF, PNG, JPEG]) {
    const out = await remade(Buffer.concat([buf, hidden]));
    assert.ok(out);
    assert.equal(out.buf.includes(hidden), false);
    assert.equal(out.buf.includes(Buffer.from('<script>')), false);
  }
});

test('a photo: turned the right way up, and where it was taken is left behind', async () => {
  // 4 wide × 2 tall, with a camera note saying "turn it a quarter" and a place it was taken
  const photo = await sharp({ create: { width: 4, height: 2, channels: 3, background: '#3a6' } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .withExif({ IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '40/1 26/1 46/1' } })
    .toBuffer();
  const before = await sharp(photo).metadata();
  assert.equal(before.orientation, 6);
  assert.ok(before.exif);
  const out = await remade(photo);
  assert.ok(out);
  const m = await sharp(out.buf).metadata();
  assert.deepEqual([m.width, m.height], [2, 4], 'turned upright');
  assert.equal(m.orientation, undefined);
  assert.equal(m.exif, undefined, 'no camera notes, no place');
});

test('a GIF that moves still moves', async () => {
  const frame = (c: string) =>
    sharp({ create: { width: 2, height: 2, channels: 4, background: c } })
      .png()
      .toBuffer();
  const animated = await sharp(await Promise.all(['#c33', '#3c3', '#33c'].map(frame)), { join: { animated: true } })
    .gif({ loop: 0 })
    .toBuffer();
  assert.equal((await sharp(animated, { animated: true }).metadata()).pages, 3);
  const out = await remade(animated);
  assert.ok(out);
  assert.equal((await sharp(out.buf, { animated: true }).metadata()).pages, 3, 'all three frames');
});

test('something that only looks like a picture is turned away', async () => {
  assert.equal(await remade(Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(30)])), null);
  assert.equal(await remade(Buffer.from('<svg onload="alert(1)"/>')), null, 'not a picture type it keeps');
  assert.equal(await remade(Buffer.alloc(4)), null);
});

test('an emoji’s SVG drawing becomes a 512 × 512 PNG, with nothing in it run', async () => {
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script><circle cx="5" cy="5" r="4" fill="red"/></svg>'
  );
  const png = await svgAsPng(svg);
  assert.ok(png);
  assert.equal(kindOf(png), 'png');
  const m = await sharp(png).metadata();
  assert.deepEqual([m.width, m.height], [512, 512]);
  assert.equal(png.includes(Buffer.from('script')), false);
  assert.equal(await svgAsPng(Buffer.from('not a drawing')), null);
});

test('a board from before 1.2.8: its animated emoji list and still pictures need no internet', async () => {
  // what such a board kept in its data folder: Google's list, and an emoji's SVG still picture
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fcp-anim-'));
  const cache = path.join(data, 'clipart-cache');
  fs.mkdirSync(path.join(cache, 'anim'), { recursive: true });
  fs.writeFileSync(
    path.join(cache, 'noto-anim-api.json'),
    JSON.stringify({ icons: [{ codepoint: '1f600', tags: [':grinning:'], categories: ['Smileys'], popularity: 5 }] })
  );
  fs.writeFileSync(
    path.join(cache, 'anim', '1f600.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="gold"/></svg>'
  );
  const PORT = 3981;
  const board = await startServer(PORT, {}, data);
  try {
    assert.ok(board.up, board.output());
    const base = `http://127.0.0.1:${PORT}`;
    const ed = client(base, (await makeAdmin(base, data)).cookie);
    assert.deepEqual(await (await ed.api('/api/anim/list')).json(), [
      { cp: '1f600', tags: 'grinning', cat: 'Smileys' }
    ]);
    const still = await ed.api('/api/anim/1f600/svg');
    assert.equal(still.status, 200);
    assert.equal(still.headers.get('content-type'), 'image/png');
    const m = await sharp(Buffer.from(await still.arrayBuffer())).metadata();
    assert.deepEqual([m.width, m.height], [512, 512]);
  } finally {
    await board.stop();
    fs.rmSync(data, { recursive: true, force: true });
  }
});
