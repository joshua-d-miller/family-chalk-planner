/*
===============================================================================
 Family Chalk Planner | Shared | i18n.ts
===============================================================================
 Version:   1.2.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-21
 Updated:   2026-11-21

 Purpose:
     The board in another language. The screens are written in English;
     in another language each piece of English text on the page is swapped
     for its translation as it appears (the text between tags, and the
     words in labels, titles and placeholders), using that language's
     dictionary (English → the language: shared/i18n-es.ts). Wording with
     numbers or names in it is a pattern: "{#0} days" → "{0} días" ({#0}: a
     number; {0}: anything). Parts joined with " · " or " — ", and words
     after an emoji, are translated part by part.

     What the family wrote (events, meals, names, writing on the board) is
     never translated: anything inside translate="no" is left as it is.

 How it fits:
     The screens start it in web/src/main.tsx; the admin console loads this
     same file at /i18n.js (served with the types stripped, server/pages.ts)
     and its dictionary at /i18n-es.js. Which language: /api/lang (this
     screen's choice, else the board's).

 Used by:
     web/src/main.tsx
     web/src/lib/lang.ts
     public/admin.html (as /i18n.js)
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.2.0    2026-11-21   joshua    New file.
                        claude
===============================================================================
*/

export type Dict = Record<string, string>;

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------ //
// | The dictionary | //
// ------------------ //
// Exact wording first; then the patterns ({0}, {1}: anything), the one    //
// with the most wording of its own first, so the most particular wins.    //
let words: Map<string, string> = new Map();
let patterns: { re: RegExp; to: string; n: number }[] = [];
let done: Set<string> = new Set(); // what's already in the language (left as it is)
let code = 'en';
const esc = (s: string) => s.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
export function setDictionary(dict: Dict | null, lang = 'en') {
  code = dict ? lang : 'en';
  words = new Map();
  patterns = [];
  done = new Set();
  if (!dict) return;
  for (const [en, to] of Object.entries(dict)) {
    if (!to) continue;
    done.add(to.trim());
    if (/\{#?\d\}/.test(en)) {
      try {
        // {0}: anything; {#0}: a number only (so "{#0} of {#1}" is "3 of 10", never "Bottom of Notes")
        const re = new RegExp(
          '^' +
            esc(en)
              .replace(/\{#(\d)\}/g, '(?<g$1>[\\d.,]+)')
              .replace(/\{(\d)\}/g, '(?<g$1>[\\s\\S]+?)') +
            '$'
        );
        patterns.push({ re, to: to.replace(/\{#(\d)\}/g, '{$1}'), n: en.replace(/\{#?\d\}/g, '').length });
      } catch {
        /* (a pattern that doesn't make a regex: left out, never the whole language) */
      }
    } else words.set(en, to);
  }
  patterns.sort((a, b) => b.n - a.n); // the most words of its own first ("The board’s ({0})" before "{0} ({1})")
}
export const language = () => code;

// one piece of text in the language (its spaces around it kept); as it was if there's nothing for it
export function tr(s: string): string {
  if (code === 'en' || !s) return s;
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s)!;
  const core = m[2].replace(/\s+/g, ' ');
  if (!core || done.has(core)) return s;
  const w = words.get(core);
  if (w !== undefined) return m[1] + w + m[3];
  for (const p of patterns) {
    const g = p.re.exec(core);
    if (g) return m[1] + p.to.replace(/\{(\d)\}/g, (_, n) => tr(g.groups?.['g' + n] ?? '')) + m[3];
  }
  // parts joined with " · " or " — " (a screen's details, a log line): each part on its own
  for (const sep of [' · ', ' — ']) {
    if (core.includes(sep)) {
      const to = core
        .split(sep)
        .map(x => tr(x))
        .join(sep);
      if (to !== core) return m[1] + to + m[3];
    }
  }
  // an emoji, flag or icon first ("🇺🇸 Veterans Day", "🌤️ Weather"): the words after it
  const pre = /^([^\p{L}\p{N}(“"'¿¡]+\s)(\S[\s\S]*)$/u.exec(core);
  if (pre) {
    const to = tr(pre[2]);
    if (to !== pre[2]) return m[1] + pre[1] + to + m[3];
  }
  return s;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------- //
// | On the page | //
// ------------------- //
// Every text and the words in labels, now and whenever the page changes   //
// (a card opening, a message, the next month). Not inside translate="no", //
// a field being typed in, or a script.                                    //
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
const SKIP = 'script, style, textarea, [translate="no"], [contenteditable="true"]';
const left = (n: Node) => {
  const el = n.nodeType === 1 ? (n as Element) : n.parentElement;
  return !el || !!el.closest(SKIP);
};
function text(n: Text) {
  if (left(n)) return;
  const to = tr(n.data);
  if (to !== n.data) n.data = to;
}
function attrs(el: Element) {
  if (el.closest(SKIP)) return;
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v) {
      const to = tr(v);
      if (to !== v) el.setAttribute(a, to);
    }
  }
  if (el instanceof HTMLInputElement && (el.type === 'button' || el.type === 'submit') && el.value) {
    const to = tr(el.value);
    if (to !== el.value) el.value = to;
  }
}
function all(root: Node) {
  if (root.nodeType === 3) return text(root as Text);
  if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
  if (root.nodeType === 1) attrs(root as Element);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (n.nodeType === 3) text(n as Text);
    else attrs(n as Element);
  }
}
let watching: MutationObserver | null = null;
export function startTranslating(dict: Dict, lang: string) {
  setDictionary(dict, lang);
  document.documentElement.lang = lang;
  all(document.body);
  if (document.title) document.title = tr(document.title);
  watching?.disconnect();
  watching = new MutationObserver(list => {
    for (const m of list) {
      if (m.type === 'characterData') text(m.target as Text);
      else if (m.type === 'attributes') attrs(m.target as Element);
      else m.addedNodes.forEach(all);
    }
  });
  watching.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...ATTRS, 'value']
  });
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------- //
// | Dates | //
// ----------- //
// The browser's own month and day names, in the board's language.         //
export const locale = () => (code === 'en' ? undefined : code);
