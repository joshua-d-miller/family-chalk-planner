// The ☰ menu: every page, what this screen may open; ☆ keeps one on the strip (up to 4).
import { post } from '../lib/api.ts';
import { MAX_FAVORITES, useFavorites } from '../lib/favorites.ts';
import type { Who } from '../lib/who.ts';
import { PAGES } from '../routes.ts';

const GROUPS: [string, string][] = [
  ['pages', 'Pages'],
  ['board', 'The board'],
  ['account', 'Account']
];

export function Menu({ who, here, onClose }: { who: Who | null; here: string; onClose: () => void }) {
  const fav = useFavorites();
  const rank = who?.rank || 0;
  const admin = who?.user?.role === 'admin';
  const mayOpen = (need: number, id: string) => (id === 'admin' ? admin : rank >= need);
  return (
    <>
      <div className="menuScrim" onClick={onClose} />
      <nav className="menu" aria-label="Menu" id="menuPanel">
        {GROUPS.map(([g, title]) => {
          const items = PAGES.filter(p => p.group === g && mayOpen(p.need, p.id));
          if (!items.length) return null;
          return (
            <section key={g}>
              <h4>{title}</h4>
              {items.map(p => {
                const on = fav.items.includes(p.id);
                return (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center' }}>
                    <a
                      className={'item' + (p.id === here ? ' here' : '')}
                      href={p.href}
                      aria-current={p.id === here ? 'page' : undefined}
                    >
                      <span className="ic" aria-hidden="true">
                        {p.icon}
                      </span>
                      <span className="lbl">{p.title}</span>
                    </a>
                    {fav.canSave && p.group === 'pages' && (
                      <button
                        type="button"
                        className={'star' + (on ? ' on' : '')}
                        aria-pressed={on}
                        aria-label={on ? `Take ${p.title} off the strip` : `Keep ${p.title} on the strip`}
                        title={
                          on
                            ? 'On the strip'
                            : fav.items.length >= MAX_FAVORITES
                              ? `Keep on the strip (up to ${MAX_FAVORITES})`
                              : 'Keep on the strip'
                        }
                        onClick={() => fav.toggle(p.id)}
                      >
                        {on ? '★' : '☆'}
                      </button>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}
        <div className="who">
          {who?.user ? (
            <>
              Signed in as {who.user.name}.{' '}
              <button
                type="button"
                className="item"
                style={{ display: 'inline', width: 'auto', minHeight: 0, padding: 0, color: 'var(--yellow)' }}
                onClick={() => post('api/account/logout').then(() => location.reload())}
              >
                Sign out
              </button>
            </>
          ) : who?.device ? (
            <>This screen: {who.device.name}</>
          ) : null}
        </div>
      </nav>
    </>
  );
}
