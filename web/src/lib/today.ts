// Today, as the board sees it (its own time zone), and how it shows dates
import { useLive } from './live.ts';

export interface Today {
  today: string; // YYYY-MM-DD
  ym: string;
  weekStart: 0 | 1; // 0 = Sunday
  time24: boolean;
}
export const useToday = () => useLive<Today>('api/today', ['calendar']);

export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
// the days of the week in the board's order (weeks starting on Sunday or Monday)
export const weekOrder = (start: number) => Array.from({ length: 7 }, (_, i) => (i + start) % 7);
export const dowOf = (date: string) => new Date(date + 'T12:00:00Z').getUTCDay();
// 9:30 → "9:30am" or "09:30"
export function fmtTime(hm: string, time24: boolean) {
  const [h, m] = hm.split(':').map(Number);
  if (time24) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return `${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''}${h < 12 ? 'am' : 'pm'}`;
}
