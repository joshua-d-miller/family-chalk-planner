/*
===============================================================================
 Family Chalk Planner | Screens | Helpers | lang.ts
===============================================================================
 Version:   1.2.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-21
 Updated:   2026-11-21

 Purpose:
     This screen's language: the board's (⚙️ Board in the admin console),
     or its own (⚙️ Settings → This screen). Started before the board is
     drawn, from what this browser remembers, so it doesn't flash English
     first; then the board's answer (/api/lang), and the page starts again
     if that's another language.

 Used by:
     web/src/main.tsx
     web/src/pages/Settings.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.2.0    2026-11-21   joshua    New file.
                        claude
===============================================================================
*/

import { language, startTranslating } from '../../../shared/i18n.ts';
import { ES } from '../../../shared/i18n-es.ts';
import { post, url } from './api.ts';
import { subscribe, useLive } from './live.ts';

export type Lang = 'en' | 'es';
export const LANGUAGES: [Lang, string][] = [
  ['en', 'English'],
  ['es', 'Español']
];
const KEY = 'chalkLang';
const remembered = (): Lang => {
  try {
    return localStorage.getItem(KEY) === 'es' ? 'es' : 'en';
  } catch {
    return 'en';
  }
};
const remember = (l: Lang) => {
  try {
    if (l === 'en') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, l);
  } catch {
    /* (private browsing: asked again next time) */
  }
};

// before the board is drawn: the language this browser remembers, then the board's say
export function startLanguage() {
  if (remembered() === 'es') startTranslating(ES, 'es');
  const check = () =>
    fetch(url('api/lang'), { credentials: 'same-origin' })
      .then(r => (r.ok ? r.json() : null))
      .then((d: { lang?: string } | null) => {
        const want: Lang = d?.lang === 'es' ? 'es' : 'en';
        if (want === language()) return;
        remember(want);
        location.reload(); // (the simplest way to have every word in the new language)
      })
      .catch(() => {});
  void check();
  subscribe('lang', () => void check()); // changed here, or for this screen in the admin console
}

// ⚙️ Settings → This screen
export function useLanguage() {
  return useLive<{ lang: Lang; mine: Lang | null; board: Lang }>('api/lang', ['lang']).data;
}
export async function setLanguage(l: Lang | null) {
  await post('api/lang', { lang: l });
}
