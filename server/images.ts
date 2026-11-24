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
     second on a Raspberry Pi), once, when it's first kept.

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
                        claude    before they're kept.
===============================================================================
*/

import sharp from 'sharp';

// one picture at a time, nothing kept in memory between them (a Raspberry Pi has little to spare)
sharp.cache(false);
sharp.concurrency(1);

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
  try {
    let img = sharp(buf, { ...LIMITS, animated });
    if (!animated) img = img.rotate(); // the right way up, from the camera's note, before the notes are left behind
    const out =
      kind === 'gif'
        ? img.gif()
        : kind === 'png'
          ? img.png()
          : kind === 'webp'
            ? img.webp({ quality: 90 })
            : img.flatten({ background: '#ffffff' }).jpeg({ quality: 90 });
    return { buf: await out.toBuffer(), kind };
  } catch {
    return null;
  }
}

// ----------------------- //
// | A drawing, as a PNG | //
// ----------------------- //
// An SVG drawing (an emoji's still picture) drawn as a 512 × 512 PNG, the  //
// size of its animated GIF; null when it can't be drawn. Nothing in the    //
// SVG runs or is fetched: only its shapes are painted.                     //
export async function svgAsPng(svg: Buffer, size = 512): Promise<Buffer | null> {
  try {
    return await sharp(svg, { ...LIMITS, density: 300 })
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}
