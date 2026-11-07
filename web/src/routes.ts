// Every page, for the router and the ☰ menu. `href` is relative to the board's address.
import { RANK } from './lib/who.ts';

export interface PageDef {
  id: string;
  title: string;
  icon: string;
  href: string;
  need: number; // who may open it (RANK)
  group: 'pages' | 'board' | 'account';
}
export const PAGES: PageDef[] = [
  { id: 'board', title: 'The board', icon: '🗓️', href: './', need: RANK.view, group: 'board' },
  { id: 'edit', title: 'Edit the board', icon: '✏️', href: 'edit', need: RANK.family, group: 'board' },
  { id: 'chores', title: 'Chores', icon: '🧹', href: 'chores', need: RANK.view, group: 'pages' },
  { id: 'meals', title: 'Meal plan', icon: '🍽️', href: 'meals', need: RANK.view, group: 'pages' },
  { id: 'reminders', title: 'Reminders', icon: '🔔', href: 'reminders', need: RANK.view, group: 'pages' },
  { id: 'timers', title: 'Timers', icon: '⏲️', href: 'timers', need: RANK.view, group: 'pages' },
  { id: 'pantry', title: 'Pantry', icon: '🥫', href: 'pantry', need: RANK.view, group: 'pages' },
  { id: 'jars', title: 'Reward jars', icon: '🫙', href: 'jars', need: RANK.view, group: 'pages' },
  { id: 'settings', title: 'Settings', icon: '⚙️', href: 'settings', need: RANK.editor, group: 'account' },
  { id: 'admin', title: 'Admin console', icon: '🛡️', href: 'admin', need: RANK.admin, group: 'account' }
];

// which page this address is (relative to the board's <base>)
export function pageHere(): string {
  const base = new URL(document.baseURI).pathname;
  let p = location.pathname.startsWith(base)
    ? location.pathname.slice(base.length)
    : location.pathname.replace(/^\//, '');
  p = p.replace(/\/+$/, '');
  return p || 'board';
}
