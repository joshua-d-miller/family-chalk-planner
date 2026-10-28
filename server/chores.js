// Chores: a shared checklist for the family, kept on the board's server (like the meal plan and jars) so
// every screen and phone sees the same list. Chores repeat every day, week or month; a check-off only
// counts for the current day / week / month, so they reset by themselves.
//   kv 'chores'     { people: [{ id, name, kid }], chores: [{ id, title, who: [personId], every, times, each }] }
//   kv 'chore_done' { [choreId] or [choreId:personId]: { p: periodKey, n: count, by, at } }
// A chore for several people is either shared (done once, by any of them: "load the dishwasher") or
// "each" (everyone does their own and checks off their own: "put dirty clothes in the hamper").
const EVERY = ['day', 'week', 'month'];
const MAX = { people: 8, chores: 120, title: 60, name: 20, times: 7 };

// Mom and Dad's cleaning schedule, as an example to start from (rename the people, change anything)
const EXAMPLE = {
  people: [{ id: 'dad', name: 'Dad' }, { id: 'mom', name: 'Mom' }, { id: 'kid1', name: 'Kid 1', kid: true }, { id: 'kid2', name: 'Kid 2', kid: true }],
  chores: [
    ['day', 'dad mom', 'Load/unload dishwasher'], ['day', 'dad mom', 'Wipe kitchen counters'], ['day', 'dad mom', 'Quick living room pickup'],
    ['day', 'dad', 'Start and switch laundry as needed'],
    ['day', 'kid1 kid2', 'Put dirty clothes in hampers', 1, true], ['day', 'kid1 kid2', 'Put away toys and belongings', 1, true], ['day', 'kid1 kid2', 'Help feed the cats (with a grown-up)'],
    ['week', 'dad', 'Clean bathroom 1'], ['week', 'dad', 'Clean bathroom 2'], ['week', 'dad', 'Vacuum carpeted rooms'], ['week', 'dad', 'Vacuum hard floors'],
    ['week', 'dad', 'Mop kitchen and bathroom floors'], ['week', 'dad', 'Wash bedding'],
    ['week', 'mom', 'Dust living room and common areas'], ['week', 'mom', 'Clean kitchen surfaces and appliances'], ['week', 'mom', 'Wipe mirrors'],
    ['week', 'mom', 'Fold laundry', 3],
    ['week', 'dad mom', 'Change bed linens'], ['week', 'dad mom', 'Put away our own laundry', 1, true],
    ['week', 'kid1', 'Tidy bedroom'], ['week', 'kid1', 'Put away clean clothes'], ['week', 'kid1', 'Empty bedroom trash'],
    ['week', 'kid2', 'Tidy bedroom'], ['week', 'kid2', 'Put away clean clothes'], ['week', 'kid2', 'Organize toys and belongings'],
    ['month', 'dad', 'Clean refrigerator shelves'], ['month', 'dad', 'Dust baseboards'], ['month', 'dad', 'Clean interior windows'],
    ['month', 'dad', 'Vacuum lower-level office'], ['month', 'dad', 'Vacuum under furniture'],
    ['month', 'mom', 'Wipe kitchen cabinet fronts'], ['month', 'mom', 'Clean microwave'], ['month', 'mom', 'Wipe doors and light switches']
  ].map(([every, who, title, times, each], i) => ({ id: 'c' + (i + 1), title, who: who.split(' '), every, times: times || 1, ...(each ? { each: true } : {}) }))
};

const idOk = v => typeof v === 'string' && /^[a-z0-9]{1,16}$/.test(v);
const text = (v, max) => String(v == null ? '' : v).replace(/[\r\n<>]/g, ' ').trim().slice(0, max);

function clean(input) {
  const errs = [];
  const people = [], seen = new Set();
  for (const p of (Array.isArray(input && input.people) ? input.people : []).slice(0, MAX.people)) {
    const name = text(p && p.name, MAX.name);
    if (!idOk(p && p.id) || seen.has(p.id) || !name) { errs.push('each person needs a name'); continue; }
    seen.add(p.id); people.push({ id: p.id, name, ...(p.kid ? { kid: true } : {}) });
  }
  const chores = [], cids = new Set();
  for (const c of (Array.isArray(input && input.chores) ? input.chores : []).slice(0, MAX.chores)) {
    const title = text(c && c.title, MAX.title);
    const who = [...new Set((Array.isArray(c && c.who) ? c.who : []).filter(id => seen.has(id)))];
    if (!idOk(c && c.id) || cids.has(c.id) || !title || !who.length || !EVERY.includes(c && c.every)) { errs.push('each chore needs a name, someone and how often'); continue; }
    cids.add(c.id);
    chores.push({ id: c.id, title, who, every: c.every, times: Math.min(Math.max(Math.round(+c.times) || 1, 1), MAX.times), ...(c.each && who.length > 1 ? { each: true } : {}) });
  }
  return { people, chores, errs };
}

// period keys: '2026-10-28' (day), the date the week starts (week), '2026-10' (month)
function periods(today, weekStart) {
  const [y, m, d] = today.split('-').map(Number), t = Date.UTC(y, m - 1, d), dow = new Date(t).getUTCDay();
  const ws = new Date(t - ((dow - weekStart + 7) % 7) * 864e5).toISOString().slice(0, 10);
  return { day: today, week: ws, month: today.slice(0, 7) };
}

function setup({ app, kvGet, kvSet, broadcast, today, weekStart, kidOf, who }) {
  const load = () => kvGet('chores') || { people: [], chores: [] };
  const doneMap = () => kvGet('chore_done') || {};
  const view = () => {
    const data = load(), per = periods(today(), weekStart), done = doneMap();
    const cur = (key, c) => { const r = done[key]; return r && r.p === per[c.every] ? r : null; };
    return {
      people: data.people, periods: per,
      chores: data.chores.map(c => {
        if (c.each) {   // everyone their own: { personId: count }
          const each = {}; for (const id of c.who) { const r = cur(c.id + ':' + id, c); each[id] = r ? r.n : 0; }
          return { ...c, doneEach: each };
        }
        const r = cur(c.id, c); return { ...c, done: r ? r.n : 0, by: r ? r.by : null };
      })
    };
  };
  const changed = () => broadcast('chores', { at: Date.now() });

  app.get('/api/chores', (req, res) => res.json({ ...view(), mine: kidOf(req) || null }));

  // check off (or undo) one: family screens and signed-in people, any chore; a kid's tablet, only their own
  app.post('/api/chores/check', (req, res) => {
    const { id, undo } = req.body || {};
    const c = load().chores.find(x => x.id === id);
    if (!c) return res.status(404).json({ error: 'That chore was removed' });
    const kid = kidOf(req);
    if (kid && !c.who.includes(kid)) return res.status(403).json({ error: 'That one isn’t yours' });
    let key = id;
    if (c.each) {   // whose own: a kid's tablet is always its kid
      const person = kid || (req.body || {}).person;
      if (!c.who.includes(person)) return res.status(400).json({ error: 'Whose is it?' });
      key = id + ':' + person;
    }
    const per = periods(today(), weekStart)[c.every], all = doneMap(), r = all[key] && all[key].p === per ? all[key] : { p: per, n: 0 };
    r.n = undo ? Math.max(0, r.n - 1) : Math.min(c.times, r.n + 1);
    r.by = who(req); r.at = Date.now();
    all[key] = r;
    kvSet('chore_done', all);
    changed();
    res.json(view());
  });

  // the whole list (signed-in people only): people and chores; check-offs of removed chores are dropped
  app.post('/api/chores/save', (req, res) => {
    const b = req.body || {};
    const src = b.example ? EXAMPLE : b;
    const { people, chores, errs } = clean(src);
    if (errs.length) return res.status(400).json({ error: errs[0] });
    kvSet('chores', { people, chores });
    const all = doneMap(), keep = new Set(chores.map(c => c.id));
    for (const k of Object.keys(all)) if (!keep.has(k.split(':')[0])) delete all[k];
    kvSet('chore_done', all);
    changed();
    res.json(view());
  });

  return { people: () => load().people };
}

module.exports = { setup, periods, clean, EXAMPLE };
