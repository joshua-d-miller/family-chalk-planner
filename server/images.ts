/*
===============================================================================
 Family Chalk Planner | Server | images.ts
===============================================================================
 Version:   1.2.8
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-24
 Updated:   2026-11-24

 Purpose:
     Every picture the board brings in from elsewhere (album photos, web
     pictures and their thumbnails, animated emoji, pictures from a link or
     an upload) is opened and drawn again as a new file before it's kept,
     the way the OWASP File Upload Cheat Sheet recommends ("decode and
     re-encode to an allowed image format, explicitly removing unnecessary
     metadata"). What's kept is a picture the board made itself: anything
     hidden in the original (a script, a second file tucked on the end,
     where a photo was taken) doesn't come along. GIFs and WebPs stay
     animated; photos are turned the right way up first.

 How it fits:
     The drawing is done by sharp (libvips), with limits on size so a huge
     or broken picture can't tie the board up. GitHub's code scanning
     (CodeQL) sees that what's saved is the board's own new file, not the
     downloaded bytes, so it isn't reported as "network data written to
     file".

 Known limitations:
     Drawing a picture again takes a moment (a big photo, a fraction of a
     second on a Raspberry Pi), once, when it's first kept; pictures are
     drawn one at a time. On a 32-bit Raspberry Pi OS older than Bookworm
     the image library can't load: the board runs, but new pictures from
     elsewhere aren't kept there (docs/install.md → Node.js).

 Used by:
     server/clipart.ts
     server/media.ts
     server/photos/photos.ts
     server/webclip.ts
     test/gif-link.test.ts
     test/images.test.ts
     test/webclip.test.ts
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.2.8     2026-11-24   joshua    New: pictures from elsewhere are drawn again
                        claude    before they're kept. GIF frames keep their
                                  own colors (up to 255 a frame, all a GIF
                                  frame holds); one picture at a time;
                                  the library loads on first use.
===============================================================================
*/

import type SharpType from 'sharp';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------------- //
// | The image library | //
// --------------------- //
// Loaded the first time a picture is drawn, not when the board starts: a    //
// computer that can't run it (a 32-bit Raspberry Pi OS older than Bookworm) //
// still starts and shows everything it already has; only new pictures from  //
// elsewhere aren't kept there, and the log says why. Nothing kept in memory //
// between pictures, and one thread each (a Raspberry Pi has little to       //
// spare).                                                                   //
let lib: Promise<typeof SharpType | null> | null = null;
function sharpLib() {
  lib ??= import('sharp').then(
    m => {
      m.default.cache(false);
      m.default.concurrency(1);
      return m.default;
    },
    (e: Error) => {
      console.error(
        `Chalk Planner: new pictures from elsewhere can't be kept on this computer: its image library didn't load (${e.message}). A 32-bit Raspberry Pi OS needs Bookworm or newer.`
      );
      return null;
    }
  );
  return lib;
}

// ------------------------- //
// | One picture at a time | //
// ------------------------- //
// Drawing a big picture takes a lot of memory for a moment (up to about 160 //
// MB for the largest), so pictures are drawn one after another, never side  //
// by side, even when an upload, an album sync and a thumbnail arrive        //
// together. A picture that fails never holds up the next.                   //
let queue: Promise<unknown> = Promise.resolve();
function oneAtATime<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------- //
// | Picture types | //
// ----------------- //
// Recognized by their first bytes, never by the name or what the sender    //
// says it is.                                                              //
export type Kind = 'gif' | 'png' | 'jpg' | 'webp';
const MAGIC: [Kind, (b: Buffer) => boolean][] = [
  ['gif', b => b.subarray(0, 6).toString('latin1').startsWith('GIF8')],
  ['png', b => b.readUInt32BE(0) === 0x89504e47],
  ['jpg', b => b[0] === 0xff && b[1] === 0xd8],
  ['webp', b => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP']
];
export const kindOf = (b: Buffer): Kind | undefined =>
  b.byteLength > 16 ? MAGIC.find(([, test]) => test(b))?.[0] : undefined;
export const MIME: Record<Kind, string> = { gif: 'image/gif', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

// at most 40 million pixels (a 7000 × 5700 photo, or every frame of a long GIF together)
const LIMITS = { limitInputPixels: 40e6, failOn: 'error' as const };

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------------------- //
// | Drawing a picture again | //
// --------------------------- //
// The same picture as a new file of the same type (still, or animated for  //
// GIF and WebP), or null when it isn't a picture after all. as: a type to  //
// make instead (an album photo is always kept as a JPEG).                  //
export async function remade(buf: Buffer, as?: Kind): Promise<{ buf: Buffer; kind: Kind } | null> {
  const from = kindOf(buf);
  if (!from) return null;
  const kind = as || from;
  const animated = (from === 'gif' || from === 'webp') && (kind === 'gif' || kind === 'webp');
  const sharp = await sharpLib();
  if (!sharp) return null;
  return oneAtATime(async () => {
    try {
      let img = sharp(buf, { ...LIMITS, animated });
      if (!animated) img = img.rotate(); // the right way up, from the camera's note, before the notes are left behind
      const out =
        kind === 'gif'
          ? // every frame's own colors: no palette carried over from another frame, no dithering. Unchanged up to
            // 255 colors a frame (what one GIF frame holds, with see-through); a frame showing more (one drawn over
            // another) comes out as close as 255 colors get
            img.gif({ interPaletteMaxError: 0, interFrameMaxError: 0, dither: 0 })
          : kind === 'png'
            ? img.png()
            : kind === 'webp'
              ? img.webp({ quality: 95, alphaQuality: 100 })
              : // quality 95 with full color detail (4:4:4): no softer than the original, even on a 4K wall
                img.flatten({ background: '#ffffff' }).jpeg({ quality: 95, chromaSubsampling: '4:4:4' });
      return { buf: await out.toBuffer(), kind };
    } catch {
      return null;
    }
  });
}

// ----------------------- //
// | A drawing, as a PNG | //
// ----------------------- //
// An SVG drawing (an emoji's still picture) drawn as a 2048 × 2048 PNG,     //
// drawn at that size (never a small picture made bigger), so it stays sharp //
// even as big as the whole board on a 4K wall (the board is 1252 × 642,     //
// about 3 × on 4K). Null when it can't be drawn. Nothing in the SVG runs or //
// is fetched: only its shapes are painted.                                  //
export async function svgAsPng(svg: Buffer, size = 2048): Promise<Buffer | null> {
  const sharp = await sharpLib();
  if (!sharp) return null;
  return oneAtATime(async () => {
    try {
      // how big the drawing says it is (at 72 dots an inch), so it's drawn at the density that makes it size across
      const { width = 128, height = 128 } = await sharp(svg, LIMITS).metadata();
      const density = Math.min(20000, (72 * size) / Math.max(width, height, 1));
      return await sharp(svg, { ...LIMITS, density })
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
    } catch {
      return null;
    }
  });
}
