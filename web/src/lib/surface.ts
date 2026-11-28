/*
===============================================================================
 Family Chalk Planner | Screens | Helpers | surface.ts
===============================================================================
 Version:   1.3.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-07
 Updated:   2026-11-28

 Purpose:
     The board's surfaces (black slate, green chalkboard, cork...),
     painted once into a picture: chalk dust, eraser swipes, cork crumbs,
     wood grain; and a faint seasonal pattern if it's on. Ported from the
     board.

 Used by:
     web/src/App.tsx
     web/src/board/Board.tsx
     web/src/board/editors/StyleEditor.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    The new screens (React + TypeScript): meal
                        colby     plan, reminders, timers, pantry, jars and
                        claude    chores.

 1.1.0    2026-11-17   joshua    More backgrounds: navy and burgundy
                        claude    chalkboards, felt letter board, brick,
                                  burlap, white barnwood, graph paper, and a
                                  photo of your own.

 1.3.0    2026-11-28   joshua    A used board's wear, a marker board's gloss.
                        claude
===============================================================================
*/

import { paintWear } from './chalk.ts';

/* eslint-disable prefer-const -- kept as the board had it, so the textures stay exactly the same */

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------- //
// | The surfaces | //
// ---------------- //
// Each with its colors, how light it is (light ones get dark writing), its  //
// chalk dust and the frame it comes with.                                   //
export interface Surface {
  id: string;
  name: string;
  lum: number; // how light it is: light ones get dark writing
  base: [string, string];
  dust?: string;
  frame: string | null;
}
export const SURFACES: Surface[] = [
  { id: 'slate', name: 'Black slate', lum: 0.0069, base: ['#1d1e1d', '#121312'], dust: '235,232,222', frame: null },
  { id: 'green', name: 'Green chalkboard', lum: 0.042, base: ['#33503f', '#22382c'], dust: '232,238,226', frame: null },
  { id: 'blue', name: 'Blue chalkboard', lum: 0.028, base: ['#2a3e55', '#1b2a3b'], dust: '230,236,242', frame: null },
  { id: 'cork', name: 'Cork', lum: 0.11, base: ['#8a6038', '#704b29'], frame: null },
  { id: 'kraft', name: 'Kraft paper', lum: 0.36, base: ['#c9a87c', '#b69266'], frame: null },
  {
    id: 'white',
    name: 'Whiteboard',
    lum: 0.86,
    base: ['#f7f8f6', '#e6e9e6'],
    frame: 'linear-gradient(180deg,#d9dde1,#a9afb6 50%,#c9ced3)'
  },
  { id: 'wood', name: 'Dark wood', lum: 0.037, base: ['#5b3e2a', '#3c291d'], frame: null },
  { id: 'glass', name: 'Black glass', lum: 0.009, base: ['#1c1e22', '#0c0d10'], frame: null },
  { id: 'linen', name: 'Linen paper', lum: 0.75, base: ['#f2ecdf', '#e2d8c4'], frame: null },
  { id: 'peg', name: 'Pegboard', lum: 0.36, base: ['#cba571', '#b58e5a'], frame: null },
  // 1.1: more to pick from
  { id: 'navy', name: 'Navy chalkboard', lum: 0.02, base: ['#25334d', '#151e30'], dust: '228,234,244', frame: null },
  {
    id: 'burgundy',
    name: 'Burgundy chalkboard',
    lum: 0.025,
    base: ['#4d242b', '#30151a'],
    dust: '244,230,232',
    frame: null
  },
  { id: 'felt', name: 'Felt letter board', lum: 0.006, base: ['#1c1c1c', '#111111'], frame: null },
  { id: 'brick', name: 'Brick', lum: 0.07, base: ['#87503c', '#6a3a2b'], frame: null },
  { id: 'burlap', name: 'Burlap', lum: 0.3, base: ['#b79d72', '#9f865c'], frame: null },
  { id: 'barn', name: 'White barnwood', lum: 0.55, base: ['#e3ddd2', '#cfc6b6'], frame: null },
  { id: 'graph', name: 'Graph paper', lum: 0.86, base: ['#fbfcf8', '#eef1ea'], frame: null },
  // a photo of your own (uploaded in 🎨 Board style), dimmed so the writing stays readable
  { id: 'photo', name: 'Your photo', lum: 0.02, base: ['#2a2a2a', '#151515'], frame: null }
];
// a photo of your own as the background: dimmed, so light writing reads on any photo
export const photoBackground = (src: string) =>
  `linear-gradient(rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0.55)), url("${src.replace(/["\\]/g, '')}")`;
// the seasonal pattern for a month (1-12): holidays in February and October, otherwise the season

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------------- //
// | Seasonal patterns | //
// --------------------- //
// (flipped south of the equator)                                            //
export const SEASONS: Record<string, string> = {
  snow: 'Snowflakes',
  blossom: 'Blossoms',
  sun: 'Suns',
  leaf: 'Leaves',
  heart: 'Hearts',
  pumpkin: 'Pumpkins'
};
export function seasonOf(m: number, south: boolean): string {
  if (m === 2) return 'heart';
  if (m === 10) return 'pumpkin';
  let q = ((m + (south ? 6 : 0) - 1) % 12) + 1;
  return q === 12 || q <= 2 ? 'snow' : q <= 5 ? 'blossom' : q <= 8 ? 'sun' : 'leaf';
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------------------- //
// | A faint seasonal pattern | //
// ---------------------------- //
function paintSeason(g: CanvasRenderingContext2D, W: number, H: number, kind: string, light: boolean) {
  let seed = 77 + kind.length * 131;
  const rnd = function () {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const tint = (
    {
      snow: light ? '90,120,150' : '235,242,250',
      blossom: light ? '190,80,120' : '246,190,210',
      sun: light ? '200,140,20' : '246,214,120',
      leaf: light ? '180,90,30' : '232,150,90',
      heart: light ? '190,40,80' : '246,150,180',
      pumpkin: light ? '200,100,20' : '240,150,70'
    } as Record<string, string>
  )[kind];
  let a = light ? 0.06 : 0.07,
    cols = 10,
    rows = 5,
    i,
    j,
    k;
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.fillStyle = g.strokeStyle = 'rgba(' + tint + ',' + a + ')';
  for (j = 0; j < rows; j++)
    for (i = 0; i < cols; i++) {
      let x = ((i + 0.15 + rnd() * 0.7) * W) / cols,
        y = ((j + 0.15 + rnd() * 0.7) * H) / rows,
        z = 13 + rnd() * 13;
      g.save();
      g.translate(x, y);
      g.rotate((rnd() - 0.5) * 1.4);
      g.scale(z / 20, z / 20);
      g.lineWidth = 2.2;
      g.beginPath();
      if (kind === 'snow') {
        for (k = 0; k < 6; k++) {
          g.rotate(Math.PI / 3);
          g.moveTo(0, 0);
          g.lineTo(0, -20);
          g.moveTo(0, -11);
          g.lineTo(-6, -17);
          g.moveTo(0, -11);
          g.lineTo(6, -17);
        }
        g.stroke();
      } else if (kind === 'blossom') {
        for (k = 0; k < 5; k++) {
          g.rotate((Math.PI * 2) / 5);
          g.moveTo(0, -4);
          g.ellipse(0, -11, 6.5, 9, 0, Math.PI / 2, Math.PI * 2.5);
        }
        g.fill();
        g.beginPath();
        g.arc(0, 0, 3.5, 0, 6.29);
        g.fill();
      } else if (kind === 'sun') {
        g.arc(0, 0, 8, 0, 6.29);
        g.fill();
        g.beginPath();
        for (k = 0; k < 8; k++) {
          g.rotate(Math.PI / 4);
          g.moveTo(0, -12);
          g.lineTo(0, -19);
        }
        g.stroke();
      } else if (kind === 'leaf') {
        g.moveTo(0, -20);
        g.quadraticCurveTo(15, -6, 0, 14);
        g.quadraticCurveTo(-15, -6, 0, -20);
        g.fill();
        g.beginPath();
        g.moveTo(0, -16);
        g.lineTo(0, 20);
        g.lineWidth = 1.6;
        g.stroke();
      } else if (kind === 'heart') {
        g.moveTo(0, 16);
        g.bezierCurveTo(-24, 0, -14, -20, 0, -8);
        g.bezierCurveTo(14, -20, 24, 0, 0, 16);
        g.fill();
      } else if (kind === 'pumpkin') {
        g.ellipse(-7, 3, 9, 13, 0, 0, 6.29);
        g.ellipse(7, 3, 9, 13, 0, 0, 6.29);
        g.fill();
        g.beginPath();
        g.ellipse(0, 3, 9, 14, 0, 0, 6.29);
        g.fill();
        g.beginPath();
        g.moveTo(0, -10);
        g.quadraticCurveTo(1, -17, 5, -20);
        g.lineWidth = 3;
        g.stroke();
      }
      g.restore();
    }
  g.restore();
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------------- //
// | Painting a surface | //
// ---------------------- //
// At `scale` times its size: the screen's pixel ratio, so the texture is as //
// sharp as the writing on it (2 or more on a 4K wall). Returns a CSS        //
// background-image. The steps are kept as the board had them, so the        //
// textures stay exactly the same.                                           //
// wear: how used a chalkboard looks (🎨 Board style → Chalk: 0 clean, 1 lightly used, 2 well used);
// gloss: a chalk-marker board's soft shine
export function paintSurface(sf: Surface, season: string, scale = 1, wear = 0, gloss = false) {
  const W = 1252,
    H = 642,
    c = document.createElement('canvas');
  c.width = Math.round(W * scale);
  c.height = Math.round(H * scale);
  const g = c.getContext('2d')!;
  g.scale(scale, scale);
  let seed = 20261009;
  function rnd() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  let base = g.createRadialGradient(W * 0.5, H * 0.45, 80, W * 0.5, H * 0.5, W * 0.75);
  base.addColorStop(0, sf.base[0]);
  base.addColorStop(1, sf.base[1]);
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  let i, j, k, x, y, r, n, img, d, px;
  if (sf.dust) {
    // chalkboards: chalk-dust clouds and eraser swipes
    for (i = 0; i < 46; i++) {
      x = rnd() * W;
      y = rnd() * H;
      r = 50 + rnd() * 220;
      let a = 0.012 + rnd() * 0.026;
      let rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, 'rgba(' + sf.dust + ',' + a + ')');
      rg.addColorStop(1, 'rgba(' + sf.dust + ',0)');
      g.fillStyle = rg;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.lineCap = 'round';
    for (j = 0; j < 30; j++) {
      let sx = rnd() * W,
        sy = rnd() * H,
        len = 160 + rnd() * 420,
        ang = (rnd() - 0.5) * 0.7,
        bend = (rnd() - 0.5) * 120;
      let ex = sx + Math.cos(ang) * len,
        ey = sy + Math.sin(ang) * len;
      g.strokeStyle = 'rgba(' + sf.dust + ',' + (0.012 + rnd() * 0.022) + ')';
      g.lineWidth = 26 + rnd() * 54;
      g.beginPath();
      g.moveTo(sx, sy);
      g.quadraticCurveTo((sx + ex) / 2 + bend * Math.sin(ang), (sy + ey) / 2 + bend, ex, ey);
      g.stroke();
      g.lineWidth = 1.2;
      for (k = 0; k < 6; k++) {
        let o = (rnd() - 0.5) * 40;
        g.strokeStyle = 'rgba(' + sf.dust + ',' + (0.02 + rnd() * 0.03) + ')';
        g.beginPath();
        g.moveTo(sx, sy + o);
        g.quadraticCurveTo((sx + ex) / 2 + bend * Math.sin(ang), (sy + ey) / 2 + bend + o, ex, ey + o);
        g.stroke();
      }
    }
    img = g.getImageData(0, 0, c.width, c.height);
    d = img.data;
    for (px = 0; px < d.length; px += 4) {
      n = (rnd() - 0.5) * 14;
      d[px] += n;
      d[px + 1] += n;
      d[px + 2] += n;
    }
    g.putImageData(img, 0, 0);
    for (i = 0; i < 260; i++) {
      g.fillStyle = 'rgba(' + sf.dust + ',' + (0.05 + rnd() * 0.12) + ')';
      g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
    }
    paintWear(g, W, H, wear, sf.dust);
    if (gloss) {
      // a chalk-marker board: glossy, a soft reflection across it
      const sh = g.createLinearGradient(0, 0, W, H);
      sh.addColorStop(0.25, 'rgba(255,255,255,0)');
      sh.addColorStop(0.45, 'rgba(255,255,255,0.045)');
      sh.addColorStop(0.6, 'rgba(255,255,255,0)');
      g.fillStyle = sh;
      g.fillRect(0, 0, W, H);
    }
  } else if (sf.id === 'cork') {
    // cork: pressed granules of different sizes and shades, with dark pits between them
    for (i = 0; i < 9000; i++) {
      // big chunks first
      x = rnd() * W;
      y = rnd() * H;
      r = 1.6 + rnd() * 3.4;
      let tone = rnd(),
        col = tone < 0.4 ? '176,124,70' : tone < 0.75 ? '204,152,92' : '228,184,124';
      g.fillStyle = 'rgba(' + col + ',' + (0.35 + rnd() * 0.4) + ')';
      g.beginPath();
      g.ellipse(x, y, r, r * (0.45 + rnd() * 0.55), rnd() * 3.14, 0, 6.29);
      g.fill();
    }
    for (i = 0; i < 22000; i++) {
      // fine crumbs, light and dark
      x = rnd() * W;
      y = rnd() * H;
      r = 0.5 + rnd() * 1.6;
      g.fillStyle =
        rnd() < 0.5 ? 'rgba(236,196,140,' + (0.25 + rnd() * 0.35) + ')' : 'rgba(46,26,10,' + (0.3 + rnd() * 0.4) + ')';
      g.beginPath();
      g.ellipse(x, y, r, r * (0.5 + rnd() * 0.6), rnd() * 3.14, 0, 6.29);
      g.fill();
    }
    for (i = 0; i < 2600; i++) {
      g.fillStyle = 'rgba(24,12,4,' + (0.45 + rnd() * 0.4) + ')';
      g.beginPath();
      g.ellipse(rnd() * W, rnd() * H, 0.8 + rnd() * 1.8, 0.6 + rnd() * 1.2, rnd() * 3.14, 0, 6.29);
      g.fill();
    }
    // keep it a little darker overall, so light text stays easy to read
    g.fillStyle = 'rgba(40,24,10,.28)';
    g.fillRect(0, 0, W, H);
  } else if (sf.id === 'kraft') {
    // kraft paper: long fibers and a soft mottle
    for (i = 0; i < 40; i++) {
      x = rnd() * W;
      y = rnd() * H;
      r = 60 + rnd() * 200;
      let mg = g.createRadialGradient(x, y, 0, x, y, r),
        dk = rnd() < 0.5;
      mg.addColorStop(0, dk ? 'rgba(120,84,44,.07)' : 'rgba(236,212,170,.08)');
      mg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = mg;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.lineWidth = 0.7;
    for (i = 0; i < 2600; i++) {
      x = rnd() * W;
      y = rnd() * H;
      let fl = 6 + rnd() * 26,
        fa = rnd() * 3.14;
      g.strokeStyle =
        rnd() < 0.5
          ? 'rgba(96,66,34,' + (0.06 + rnd() * 0.12) + ')'
          : 'rgba(240,222,190,' + (0.06 + rnd() * 0.12) + ')';
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(fa) * fl, y + Math.sin(fa) * fl);
      g.stroke();
    }
    img = g.getImageData(0, 0, c.width, c.height);
    d = img.data;
    for (px = 0; px < d.length; px += 4) {
      n = (rnd() - 0.5) * 10;
      d[px] += n;
      d[px + 1] += n;
      d[px + 2] += n;
    }
    g.putImageData(img, 0, 0);
  } else if (sf.id === 'wood') {
    // dark wood: six planks, each its own shade, long wavy grain, a few knots, seams and joints
    let ph = H / 6;
    for (j = 0; j < 6; j++) {
      let y0 = j * ph,
        sh0 = (rnd() - 0.5) * 0.16;
      g.fillStyle = sh0 > 0 ? 'rgba(255,220,180,' + sh0 * 0.5 + ')' : 'rgba(0,0,0,' + -sh0 + ')';
      g.fillRect(0, y0, W, ph);
      for (k = 0; k < 34; k++) {
        let gy = y0 + rnd() * ph,
          amp = 1 + rnd() * 4,
          fq = 0.004 + rnd() * 0.01,
          phs = rnd() * 6.28;
        g.strokeStyle =
          rnd() < 0.6 ? 'rgba(20,10,4,' + (0.12 + rnd() * 0.2) + ')' : 'rgba(170,120,80,' + (0.06 + rnd() * 0.1) + ')';
        g.lineWidth = 0.6 + rnd() * 1.8;
        g.beginPath();
        for (x = 0; x <= W; x += 12) {
          y = gy + Math.sin(x * fq + phs) * amp + Math.sin(x * 0.031 + phs) * 0.8;
          if (x) g.lineTo(x, y);
          else g.moveTo(x, y);
        }
        g.stroke();
      }
      if (rnd() < 0.6) {
        let kx = rnd() * W,
          ky = y0 + ph * (0.3 + rnd() * 0.4);
        for (k = 0; k < 6; k++) {
          g.strokeStyle = 'rgba(20,10,4,' + (0.25 - k * 0.03) + ')';
          g.lineWidth = 1.2;
          g.beginPath();
          g.ellipse(kx, ky, 4 + k * 5, 2 + k * 2.2, 0, 0, 6.29);
          g.stroke();
        }
      }
      g.fillStyle = 'rgba(10,5,2,.7)';
      g.fillRect(0, Math.round(y0) - 1, W, 2);
      g.fillStyle = 'rgba(160,110,70,.15)';
      g.fillRect(0, Math.round(y0) + 1, W, 1);
    }
    img = g.getImageData(0, 0, c.width, c.height);
    d = img.data;
    for (px = 0; px < d.length; px += 4) {
      n = (rnd() - 0.5) * 8;
      d[px] += n;
      d[px + 1] += n;
      d[px + 2] += n;
    }
    g.putImageData(img, 0, 0);
  } else if (sf.id === 'glass') {
    // black glass: deep and smooth, with two soft reflections
    let rf = g.createLinearGradient(0, 0, W, H * 0.9);
    rf.addColorStop(0.18, 'rgba(255,255,255,0)');
    rf.addColorStop(0.26, 'rgba(255,255,255,.045)');
    rf.addColorStop(0.3, 'rgba(255,255,255,.02)');
    rf.addColorStop(0.33, 'rgba(255,255,255,0)');
    rf.addColorStop(0.62, 'rgba(255,255,255,0)');
    rf.addColorStop(0.66, 'rgba(255,255,255,.03)');
    rf.addColorStop(0.7, 'rgba(255,255,255,0)');
    g.fillStyle = rf;
    g.fillRect(0, 0, W, H);
    let tp = g.createLinearGradient(0, 0, 0, H * 0.12);
    tp.addColorStop(0, 'rgba(255,255,255,.05)');
    tp.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = tp;
    g.fillRect(0, 0, W, H);
  } else if (sf.id === 'linen') {
    // linen paper: a fine woven crosshatch and a little mottle
    for (y = 0; y < H; y += 2) {
      g.fillStyle = 'rgba(120,96,60,' + (0.015 + rnd() * 0.045) + ')';
      g.fillRect(0, y, W, 1);
    }
    for (x = 0; x < W; x += 2) {
      g.fillStyle = 'rgba(120,96,60,' + (0.012 + rnd() * 0.035) + ')';
      g.fillRect(x, 0, 1, H);
    }
    for (i = 0; i < 30; i++) {
      x = rnd() * W;
      y = rnd() * H;
      r = 80 + rnd() * 200;
      let lg = g.createRadialGradient(x, y, 0, x, y, r);
      lg.addColorStop(0, rnd() < 0.5 ? 'rgba(255,255,255,.12)' : 'rgba(150,120,80,.05)');
      lg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = lg;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  } else if (sf.id === 'peg') {
    // pegboard: hardboard with a regular grid of holes
    img = g.getImageData(0, 0, c.width, c.height);
    d = img.data;
    for (px = 0; px < d.length; px += 4) {
      n = (rnd() - 0.5) * 12;
      d[px] += n;
      d[px + 1] += n;
      d[px + 2] += n;
    }
    g.putImageData(img, 0, 0);
    for (y = 20; y < H; y += 40)
      for (x = 20; x < W; x += 40) {
        // kept soft so the holes don't fight with writing
        g.fillStyle = 'rgba(255,236,200,.18)';
        g.beginPath();
        g.arc(x + 0.6, y + 0.8, 2.8, 0, 6.29);
        g.fill();
        g.fillStyle = 'rgba(70,44,20,.32)';
        g.beginPath();
        g.arc(x, y, 2.5, 0, 6.29);
        g.fill();
      }
  } else if (sf.id === 'felt') {
    // felt letter board: fine ribs for the letters to slot into, and a soft fuzz
    for (y = 6; y < H; y += 14) {
      g.fillStyle = 'rgba(0,0,0,.55)';
      g.fillRect(0, y, W, 2);
      g.fillStyle = 'rgba(255,255,255,.035)';
      g.fillRect(0, y + 2, W, 1);
    }
    img = g.getImageData(0, 0, c.width, c.height);
    d = img.data;
    for (px = 0; px < d.length; px += 4) {
      n = (rnd() - 0.5) * 18;
      d[px] += n;
      d[px + 1] += n;
      d[px + 2] += n;
    }
    g.putImageData(img, 0, 0);
  } else if (sf.id === 'brick') {
    // brick: running bond, each brick its own shade, soft mortar (muted, so writing still reads)
    let bw = 92,
      bh = 34;
    g.fillStyle = 'rgba(205,190,170,.42)';
    g.fillRect(0, 0, W, H);
    for (j = 0, y = 0; y < H; j++, y += bh) {
      for (x = j % 2 ? -bw / 2 : 0; x < W; x += bw) {
        let sh = (rnd() - 0.5) * 0.22;
        g.fillStyle = sf.base[rnd() < 0.5 ? 0 : 1];
        g.fillRect(x + 3, y + 3, bw - 6, bh - 6);
        g.fillStyle = sh > 0 ? 'rgba(255,200,170,' + sh * 0.6 + ')' : 'rgba(0,0,0,' + -sh + ')';
        g.fillRect(x + 3, y + 3, bw - 6, bh - 6);
      }
    }
    img = g.getImageData(0, 0, c.width, c.height);
    d = img.data;
    for (px = 0; px < d.length; px += 4) {
      n = (rnd() - 0.5) * 16;
      d[px] += n;
      d[px + 1] += n;
      d[px + 2] += n;
    }
    g.putImageData(img, 0, 0);
    // a dark wash over it all, so light writing reads on it
    g.fillStyle = 'rgba(20,10,6,.38)';
    g.fillRect(0, 0, W, H);
  } else if (sf.id === 'burlap') {
    // burlap: a coarse open weave of thick, uneven threads
    for (y = 0; y < H; y += 5) {
      g.fillStyle = 'rgba(70,50,25,' + (0.08 + rnd() * 0.12) + ')';
      g.fillRect(0, y, W, 2 + rnd() * 1.2);
    }
    for (x = 0; x < W; x += 5) {
      g.fillStyle = 'rgba(70,50,25,' + (0.06 + rnd() * 0.1) + ')';
      g.fillRect(x, 0, 2 + rnd() * 1.2, H);
    }
    for (i = 0; i < 1600; i++) {
      g.fillStyle = 'rgba(235,215,170,' + (0.06 + rnd() * 0.1) + ')';
      g.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 3, 1);
    }
  } else if (sf.id === 'barn') {
    // white barnwood: wide boards washed white, the grain and gaps showing through
    let pw = W / 7;
    for (j = 0; j < 7; j++) {
      let x0 = j * pw;
      for (k = 0; k < 26; k++) {
        let gx = x0 + rnd() * pw,
          amp = 1 + rnd() * 3,
          fq = 0.006 + rnd() * 0.01,
          phs = rnd() * 6.28;
        g.strokeStyle = 'rgba(110,95,75,' + (0.05 + rnd() * 0.1) + ')';
        g.lineWidth = 0.6 + rnd() * 1.4;
        g.beginPath();
        for (y = 0; y <= H; y += 12) {
          x = gx + Math.sin(y * fq + phs) * amp;
          if (y) g.lineTo(x, y);
          else g.moveTo(x, y);
        }
        g.stroke();
      }
      g.fillStyle = 'rgba(80,65,50,.45)';
      g.fillRect(Math.round(x0) - 1, 0, 3, H);
    }
  } else if (sf.id === 'graph') {
    // graph paper: a light blue grid, a darker line every fifth square
    for (x = 0; x < W; x += 16) {
      g.fillStyle = x % 80 ? 'rgba(90,150,210,.16)' : 'rgba(90,150,210,.32)';
      g.fillRect(x, 0, 1, H);
    }
    for (y = 0; y < H; y += 16) {
      g.fillStyle = y % 80 ? 'rgba(90,150,210,.16)' : 'rgba(90,150,210,.32)';
      g.fillRect(0, y, W, 1);
    }
  } else if (sf.id === 'white') {
    // whiteboard: faint ghosts of old marker and a soft sheen
    g.lineCap = 'round';
    for (j = 0; j < 14; j++) {
      x = rnd() * W;
      y = rnd() * H;
      let gl = 120 + rnd() * 380,
        ga = (rnd() - 0.5) * 0.5;
      g.strokeStyle = 'rgba(110,120,130,' + (0.025 + rnd() * 0.03) + ')';
      g.lineWidth = 18 + rnd() * 40;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(ga) * gl, y + Math.sin(ga) * gl);
      g.stroke();
    }
    let sh = g.createLinearGradient(0, 0, W, H);
    sh.addColorStop(0, 'rgba(255,255,255,0)');
    sh.addColorStop(0.35, 'rgba(255,255,255,.35)');
    sh.addColorStop(0.45, 'rgba(255,255,255,0)');
    g.fillStyle = sh;
    g.fillRect(0, 0, W, H);
  }
  if (season) paintSeason(g, W, H, season, sf.lum > 0.18);
  return 'url(' + c.toDataURL('image/jpeg', 0.9) + ')';
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------------- //
// | A surface by name | //
// --------------------- //
export const surfaceOf = (id: string) => SURFACES.find(s => s.id === id) || SURFACES[0];

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
