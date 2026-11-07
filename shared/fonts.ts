/*
===============================================================================
 Family Chalk Planner | Shared types | fonts.ts
===============================================================================
 Version:   0.14.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-07
 Updated:   2026-11-07

 Purpose:
     The board's fonts, for the server (which serves them, from npm, so
     nothing ever comes from Google) and the screens (the month title,
     words written on the board, and the board style). All SIL Open Font
     License. The order matters: words on the board and month titles keep
     their font as a number, so new fonts go at the end.

 Used by:
     server/art.ts
     server/month.ts
     server/pages.ts
     server/theme.ts
     web/src/board/Art.tsx
     web/src/board/theme.ts
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.14.0    2026-11-07   joshua    New file.
                        claude
===============================================================================
*/

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------- //
// | Groups | //
// ---------- //
export type FontGroup = 'Handwritten' | 'Chalk & sketch' | 'Script' | 'Bold & bubbly' | 'Holidays';
export const FONT_GROUPS: FontGroup[] = ['Handwritten', 'Chalk & sketch', 'Script', 'Bold & bubbly', 'Holidays'];

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------- //
// | A font | //
// ---------- //
export interface BoardFont {
  id: string; // the board style keeps this
  name: string; // what the pickers show
  family: string; // the CSS font-family
  weight: number;
  group: FontGroup;
  z: number; // how big it looks next to Kalam at the same size (the board style evens them out)
  pkg: string; // @fontsource/<pkg>
  tag?: string; // a season it suits
}

const f = (
  id: string,
  family: string,
  weight: number,
  group: FontGroup,
  z = 1,
  opts: { name?: string; tag?: string; pkg?: string } = {}
): BoardFont => ({
  id,
  name: opts.name || family,
  family,
  weight,
  group,
  z,
  pkg: opts.pkg || family.toLowerCase().replace(/ /g, '-'),
  ...(opts.tag ? { tag: opts.tag } : {})
});

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------- //
// | The fonts | //
// ------------- //
// The first 8 are the ones the board has always had (numbers 0-7); new ones //
// go at the end.                                                            //
export const BOARD_FONTS: BoardFont[] = [
  // the first 8, as the board has always had them (numbers 0-7)
  f('kalam', 'Kalam', 700, 'Handwritten', 1),
  f('caveat', 'Caveat', 600, 'Handwritten', 1.15),
  f('marker', 'Permanent Marker', 400, 'Handwritten', 0.92, { name: 'Marker' }),
  f('pacifico', 'Pacifico', 400, 'Script', 0.88),
  f('chalk', 'Fredericka the Great', 400, 'Chalk & sketch', 1, { name: 'Chalk' }),
  f('tall', 'Amatic SC', 700, 'Chalk & sketch', 1.3, { name: 'Tall' }),
  f('scratchy', 'Rock Salt', 400, 'Chalk & sketch', 0.78, { name: 'Scratchy' }),
  f('script', 'Dancing Script', 700, 'Script', 1.1, { name: 'Script' }),
  // handwritten, like a marker on the fridge calendar
  f('patrick', 'Patrick Hand', 400, 'Handwritten', 1.1),
  f('gochi', 'Gochi Hand', 400, 'Handwritten', 1.05),
  f('shadows', 'Shadows Into Light', 400, 'Handwritten', 1.1),
  f('indie', 'Indie Flower', 400, 'Handwritten', 1),
  f('architects', 'Architects Daughter', 400, 'Handwritten', 0.95),
  f('gloria', 'Gloria Hallelujah', 400, 'Handwritten', 0.9),
  f('schoolbell', 'Schoolbell', 400, 'Handwritten', 1),
  f('comingsoon', 'Coming Soon', 400, 'Handwritten', 0.95),
  f('reenie', 'Reenie Beanie', 400, 'Handwritten', 1.3),
  f('nanumpen', 'Nanum Pen Script', 400, 'Handwritten', 1.3),
  // chalk and sketch
  f('cabin', 'Cabin Sketch', 700, 'Chalk & sketch', 0.9),
  f('londrina', 'Londrina Sketch', 400, 'Chalk & sketch', 1.05),
  f('loveya', 'Love Ya Like A Sister', 400, 'Chalk & sketch', 0.95),
  f('sedgwick', 'Sedgwick Ave', 400, 'Chalk & sketch', 1),
  f('grace', 'Covered By Your Grace', 400, 'Chalk & sketch', 1.15),
  f('gaegu', 'Gaegu', 700, 'Chalk & sketch', 1.1),
  // script and lettering
  f('sacramento', 'Sacramento', 400, 'Script', 1.3),
  f('vibes', 'Great Vibes', 400, 'Script', 1.2),
  f('satisfy', 'Satisfy', 400, 'Script', 1.1),
  f('kaushan', 'Kaushan Script', 400, 'Script', 1),
  f('yellowtail', 'Yellowtail', 400, 'Script', 1.1),
  f('lobster', 'Lobster', 400, 'Script', 1),
  f('courgette', 'Courgette', 400, 'Script', 0.95),
  f('playball', 'Playball', 400, 'Script', 1.05),
  f('berkshire', 'Berkshire Swash', 400, 'Script', 0.95),
  f('grandhotel', 'Grand Hotel', 400, 'Script', 1.1),
  // bold and bubbly
  f('chewy', 'Chewy', 400, 'Bold & bubbly', 0.95),
  f('luckiest', 'Luckiest Guy', 400, 'Bold & bubbly', 0.85),
  f('fredoka', 'Fredoka', 600, 'Bold & bubbly', 0.95),
  f('bubblegum', 'Bubblegum Sans', 400, 'Bold & bubbly', 1.05),
  f('sniglet', 'Sniglet', 800, 'Bold & bubbly', 0.9),
  f('baloo', 'Baloo 2', 700, 'Bold & bubbly', 0.95),
  f('titan', 'Titan One', 400, 'Bold & bubbly', 0.85),
  f('bungee', 'Bungee', 400, 'Bold & bubbly', 0.8),
  // holidays and seasons
  f('creepster', 'Creepster', 400, 'Holidays', 0.9, { tag: 'Halloween' }),
  f('christmas', 'Mountains of Christmas', 700, 'Holidays', 1, { tag: 'Christmas' }),
  f('hennypenny', 'Henny Penny', 400, 'Holidays', 0.85, { tag: 'Spring' }),
  f('emilys', 'Emilys Candy', 400, 'Holidays', 0.9, { tag: 'Valentine’s' }),
  f('cherrysoda', 'Cherry Cream Soda', 400, 'Holidays', 0.85, { tag: 'Summer' }),
  f('rye', 'Rye', 400, 'Holidays', 0.85, { tag: 'Thanksgiving' }),
  f('elite', 'Special Elite', 400, 'Holidays', 0.9, { tag: 'Back to school' }),
  f('swanky', 'Fontdiner Swanky', 400, 'Holidays', 0.8, { tag: 'Birthdays' }),
  f('butcherman', 'Butcherman', 400, 'Holidays', 0.8, { tag: 'Halloween' })
];

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------- //
// | Classic | //
// ----------- //
// the board style also has Classic (the day names' serif), which isn't      //
// offered for writing on the board                                          //
export const CLASSIC_FONT = f('classic', 'Cormorant Garamond', 600, 'Script', 1.05, { name: 'Classic' });

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------- //
// | Using one | //
// ------------- //
export const fontAt = (n: number | undefined) => BOARD_FONTS[n || 0] || BOARD_FONTS[0];
export const fontStack = (b: BoardFont) =>
  `'${b.family}', ${b.group === 'Chalk & sketch' && b.id === 'chalk' ? 'serif' : 'cursive'}`;
// the CSS `font` shorthand for writing at a size
export const fontShorthand = (n: number | undefined, px: number) => {
  const b = fontAt(n);
  return `${b.weight} ${px}px ${fontStack(b)}`;
};

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
