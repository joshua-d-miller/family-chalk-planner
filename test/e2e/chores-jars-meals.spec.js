// Chores (tablet, phone, kid's tablet, wall), reward jars and the meal plan.
const { test, expect } = require('./fixtures');

const names = { dad: 'Josh', mom: 'Tarin', kid1: 'Theo', kid2: 'Nora' };
async function exampleChores(board) {
  const v = await (await board.admin.post('/api/chores/save', { example: true })).json();
  await board.admin.post('/api/chores/save', { people: v.people.map(p => ({ ...p, name: names[p.id] })), chores: v.chores });
}
const doneOf = async (board, title) => {
  const c = (await (await board.admin.api('/api/chores')).json()).chores.find(x => x.title === title);
  return c.each ? c.doneEach : c.done;
};

test('chores on the tablet: open from the strip, tick one off, swipe back to the calendar', async ({ as, board }) => {
  await exampleChores(board);
  const page = await as('tablet');
  await page.locator('#choresBtn').click();
  await expect(page.locator('#chores')).toBeVisible();
  await expect(page.locator('#chCols .chcol h3', { hasText: 'Josh & Tarin' })).toBeVisible();
  await page.locator('.chitem', { hasText: 'Wipe kitchen counters' }).click();
  await expect(page.locator('.chitem', { hasText: 'Wipe kitchen counters' })).toHaveClass(/done/);
  await expect.poll(() => doneOf(board, 'Wipe kitchen counters')).toBe(1);
  await page.locator('.chtabs button', { hasText: 'This week' }).click();
  await expect(page.locator('.chitem', { hasText: 'Fold laundry' })).toContainText('0 of 3');
  // swipe right: back to the calendar
  const b = await page.locator('#chores').boundingBox();
  await page.mouse.move(b.x + 300, b.y + 400); await page.mouse.down();
  await page.mouse.move(b.x + 500, b.y + 405, { steps: 6 }); await page.mouse.move(b.x + 700, b.y + 410, { steps: 6 }); await page.mouse.up();
  await expect(page.locator('#chores')).toBeHidden();
});

test('change the chores: add one for the kids, each their own', async ({ as, board }) => {
  await exampleChores(board);
  const page = await as('tablet');
  await page.locator('#choresBtn').click();
  await page.locator('#chEdit').click();
  await expect(page.locator('#chedmodal')).toHaveClass(/open/);
  await page.locator('#chedTabs .seg', { hasText: 'Every week' }).click();
  await page.locator('#chedAddC').click();
  await page.keyboard.type('Water the plants');
  const row = page.locator('#chedList .chedc').last();
  await row.locator('.who .seg', { hasText: 'Theo' }).click();
  await row.locator('.who .seg', { hasText: 'Nora' }).click();
  await row.locator('.who .seg', { hasText: 'Each does their own' }).click();
  await page.locator('#chedSave').click();
  await expect(page.locator('#chedmodal')).not.toHaveClass(/open/);
  const c = (await (await board.admin.api('/api/chores')).json()).chores.find(x => x.title === 'Water the plants');
  expect(c).toMatchObject({ every: 'week', who: ['kid1', 'kid2'], each: true });
});

test('a phone: /chores asks to sign in, then shows the chores on one page', async ({ as, board }) => {
  await exampleChores(board);
  const out = await as('phone-signed-out');
  await expect(out.locator('#signpad')).toHaveClass(/open/);
  await expect(out.locator('#pairpad')).not.toHaveClass(/open/);
  const phone = await as('phone');
  await expect(phone.locator('body')).toHaveClass(/chorespage/);
  await expect(phone.locator('#chores h2')).toHaveText('Chores');
  await phone.locator('.chitem', { hasText: 'Quick living room pickup' }).click();
  await expect.poll(() => doneOf(board, 'Quick living room pickup')).toBe(1);
  // nothing runs off the side of the phone
  expect(await phone.evaluate(() => document.getElementById('chores').scrollWidth <= innerWidth + 1)).toBe(true);
});

test("a kid's tablet shows only their chores, and they can only tick their own", async ({ as, board }) => {
  await exampleChores(board);
  const kid = await as('kid:kid1');
  await expect(kid.locator('#chores')).toBeVisible();
  await expect(kid.locator('#chores h2')).toHaveText('Theo’s chores');
  await expect(kid.locator('#chCols .chcol h3').first()).toContainText('Just me');
  await kid.locator('.chitem', { hasText: 'Put dirty clothes in hampers' }).click();
  await expect.poll(async () => (await doneOf(board, 'Put dirty clothes in hampers')).kid1).toBe(1);
  expect((await doneOf(board, 'Put dirty clothes in hampers')).kid2).toBe(0);
  // someone else's chore, straight to the server: refused
  const dad = (await (await board.admin.api('/api/chores')).json()).chores.find(c => c.who.length === 1 && c.who[0] === 'dad');
  expect(await kid.evaluate(id => fetch('/api/chores/check', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Chalk': '1' }, body: JSON.stringify({ id }) }).then(r => r.status), dad.id)).toBe(403);
});

test('the wall shows chores when swiped to, but can’t tick them', async ({ as, board }) => {
  await exampleChores(board);
  const wall = await as('wall');
  const b = await wall.locator('#slate').boundingBox();
  await wall.mouse.move(b.x + 800, b.y + 300); await wall.mouse.down();
  await wall.mouse.move(b.x + 600, b.y + 305, { steps: 6 }); await wall.mouse.move(b.x + 400, b.y + 310, { steps: 6 }); await wall.mouse.up();
  await expect(wall.locator('#chores')).toBeVisible();
  await expect(wall.locator('.chitem.can')).toHaveCount(0);
});

test('reward jars: add a jar, add pieces, take one out', async ({ as, board }) => {
  await board.admin.post('/api/jars', { jars: [] });
  const page = await as('tablet');
  await page.locator('.jaradd').click();
  await expect(page.locator('#jmodal')).toHaveClass(/open/);
  await page.locator('#jName').fill('Nora');
  await page.locator('#jPlus').click(); await page.locator('#jPlus').click();
  await expect(page.locator('#jNum')).toHaveText('2');
  await page.locator('#jMinus').click();
  await expect(page.locator('#jNum')).toHaveText('1');
  await page.locator('#jClose').click();
  await expect.poll(async () => (await (await board.admin.api('/api/jars')).json())[0]).toMatchObject({ name: 'Nora', count: 1 });
});

test('meal plan: tap it, add meals, they show in the Notes column', async ({ as, board }) => {
  await board.admin.post('/api/meals', { items: [] });
  const page = await as('tablet');
  await page.locator('#meals').click();
  await expect(page.locator('#mmodal')).toHaveClass(/open/);
  const first = page.locator('#mRows input[type=text]').first();
  await first.fill('Tacos');
  await page.locator('#mAdd').click();
  await page.locator('#mRows input[type=text]').last().fill('Spaghetti');
  await page.locator('#mSave').click();
  await expect(page.locator('#mealList')).toContainText('Tacos');
  await expect(page.locator('#mealList')).toContainText('Spaghetti');
});
