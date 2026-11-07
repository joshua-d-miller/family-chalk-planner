// Who is looking: a paired screen (wall, family, a kid's tablet), a signed-in person, or nobody yet.
import { useLive } from './live.ts';

export interface Who {
  device: { id: string; name: string; role: string } | null;
  user: { username: string; name: string; role: 'editor' | 'admin' } | null;
  editor: boolean;
  admin: boolean;
  rank: number; // 0 nobody, 1 view, 2 family, 3 editor, 4 admin
  passkeys: boolean;
  homeSignin: boolean;
  openView: boolean;
}
export const RANK = { view: 1, family: 2, editor: 3, admin: 4 };

export function useWho() {
  return useLive<Who>('api/whoami', ['devices']);
}
// a kid's tablet: whose
export const kidOf = (w: Who | null) => (!w?.user && /^kid:(.+)$/.exec(w?.device?.role || '')?.[1]) || null;
