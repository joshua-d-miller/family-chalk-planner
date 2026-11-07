// The board: the month, the art on it, and the right-hand column, on the board's surface. It's laid out
// at 1252 x 642 board pixels and scaled to fill the screen. Text and art are vector, so they're sharp at
// any size; the surface texture is painted at the screen's real resolution (4K included).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { useLive } from '../lib/live.ts';
import { paintSurface, seasonOf, surfaceOf } from '../lib/surface.ts';
import type { Who } from '../lib/who.ts';
import { Art } from './Art.tsx';
import type { ArtItem } from './Art.tsx';
import { MONTHS, Month } from './Month.tsx';
import type { Bins, Border, MonthData } from './Month.tsx';
import type { Photos } from './photos.ts';
import { DEFAULT_TITLE, Title } from './Title.tsx';
import type { TitleStyle } from './Title.tsx';
import { TitlePhotos, titlePool } from './TitlePhotos.tsx';
import type { Side } from './TitlePhotos.tsx';
import { DayView, ReminderAlert, TimerDone } from './Alerts.tsx';
import { Notes } from './Notes.tsx';
import { Slideshow, useSlides } from './Slideshow.tsx';
import { EventEditor } from './EventEditor.tsx';
import { BorderEditor } from './editors/BorderEditor.tsx';
import { StyleEditor } from './editors/StyleEditor.tsx';
import { TitleEditor } from './editors/TitleEditor.tsx';
import type { TitleDraft } from './editors/TitleEditor.tsx';
import type { BoardEvent } from './Month.tsx';
import { Strip } from './Strip.tsx';
import { DrawLayer, firstPen, isPosca, recolor } from './draw/Draw.tsx';
import type { Pen } from './draw/Draw.tsx';
import { Library } from './draw/Library.tsx';
import type { Stamp } from './draw/Library.tsx';
import { RecolorSheet, SaveStampSheet, TextSheet, Tools } from './draw/Tools.tsx';
import { useArt } from './draw/useArt.ts';
import { unionBox, xform } from './geom.ts';
import type { ArtItem as Item } from './Art.tsx';
import { themeCss, themeVals } from './theme.ts';
import type { Theme } from './theme.ts';
import './board.css';
import './edit.css';

const W = 1252;
const H = 642;
const CORK = 50; // the strip under the board on a tablet
const EDIT_FRAME = 14; // a tablet's board has a wooden frame unless the family set one

export type MonthMeta = {
  hideTitle?: boolean;
  title?: TitleStyle;
  defaultTitle?: TitleStyle;
  side?: Side;
  border?: Border;
  borderYearly?: boolean;
  artPad: number;
  boardPad?: number;
};

// how big the board is on this screen (with its frame, if it has one), and how many screen pixels each
// board pixel gets
function useFit(pad: number, h: number) {
  const calc = () => {
    const scale = Math.min(innerWidth / (W + 2 * pad), innerHeight / (h + 2 * pad));
    return { scale, res: Math.max(1, Math.min(4, Math.round(scale * (devicePixelRatio || 1) * 2) / 2)) };
  };
  const [fit, setFit] = useState(calc);
  useEffect(() => {
    const on = () => setFit(calc());
    on();
    addEventListener('resize', on);
    return () => removeEventListener('resize', on);
  }, [pad, h]);
  return fit;
}

const addMonths = (ym: string, n: number) => {
  const d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

type Editing =
  | { k: 'event'; ev: BoardEvent | null; date: string }
  | { k: 'title' }
  | { k: 'border' }
  | { k: 'style' }
  | { k: 'text'; item: Item | null; at: [number, number] }
  | { k: 'recolor' }
  | { k: 'library' }
  | { k: 'stamp' }
  | null;

export function Board({ who, edit = false }: { who: Who | null; edit?: boolean }) {
  const today = useLive<{ ym: string; time24: boolean }>('api/today', ['calendar']).data;
  const [ym, setYm] = useState<string | null>(null);
  const shown = ym || today?.ym || null;
  const month = useLive<MonthData>(shown ? `api/month?ym=${shown}` : 'api/today', ['calendar']);
  const art = useLive<ArtItem[]>(shown ? `api/art?ym=${shown}` : 'api/today', [
    'stroke',
    'remove',
    'update',
    'undo',
    'clear',
    'restore',
    'meta'
  ]);
  const meta = useLive<MonthMeta>(shown ? `api/meta?ym=${shown}` : 'api/today', ['meta']).data;
  const photos = useLive<Photos>('api/photos', ['photos']).data;
  const pad = meta && 'artPad' in meta ? (meta.boardPad ?? (edit ? EDIT_FRAME : 0)) : edit ? EDIT_FRAME : 0;
  const bh = H + (edit ? CORK : 0);
  const { scale, res } = useFit(pad, bh);
  const extras = useLive<{ bins: Bins }>('api/extras', ['extras']).data;
  const savedTheme = useLive<Theme>('api/theme', ['theme']).data;
  const [themeDraft, setThemeDraft] = useState<Theme | null>(null);
  const theme = themeDraft || savedTheme;
  const [editing, setEditing] = useState<Editing>(null);
  const [titleDraft, setTitleDraft] = useState<TitleDraft | null>(null);
  const [borderDraft, setBorderDraft] = useState<Border | null | undefined>(undefined);
  const sf = surfaceOf(theme?.s || 'slate');
  const season = theme?.z && shown ? seasonOf(+shown.slice(5, 7), false) : '';
  const bg = useMemo(() => {
    try {
      return paintSurface(sf, season, res);
    } catch {
      return 'none';
    }
  }, [sf, season, res]);
  useEffect(() => {
    document.body.classList.add('boardpage');
    return () => document.body.classList.remove('boardpage');
  }, []);
  // the wall follows the current month; a tablet goes back to it after 3 minutes untouched
  useEffect(() => {
    if (!edit && today && ym && ym !== today.ym) setYm(null);
  }, [today, ym, edit]);
  const [touched, setTouched] = useState(0);
  useEffect(() => {
    if (!edit || !ym || editing) return;
    const t = setTimeout(() => setYm(null), 3 * 60 * 1000);
    return () => clearTimeout(t);
  }, [edit, ym, touched, editing]);

  const tv = useMemo(() => themeVals(theme), [theme]);
  const css = useMemo(() => themeCss(tv, sf.lum), [tv, sf.lum]);
  const m = month.data && 'grid' in month.data ? month.data : null;
  const slides = useSlides(photos, !edit);
  const [day, setDay] = useState<string | null>(null);
  const closeDay = useCallback(() => setDay(null), []);
  // On the wall: tap a day = everything on it; double tap = the photo frame (during a night-time peek,
  // back to the slideshow)
  const lastTap = useRef(0);
  const single = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tap = (e: PointerEvent) => {
    setTouched(Date.now());
    if (edit) return;
    if (day) return (setDay(null), void (lastTap.current = 0));
    if (slides.on || slides.justChanged()) return void (lastTap.current = 0);
    if (single.current) clearTimeout(single.current);
    if (e.timeStamp - lastTap.current < 450) {
      lastTap.current = 0;
      slides.doubleTap();
      return;
    }
    lastTap.current = e.timeStamp;
    const wk = (e.target as Element).closest?.('.week');
    if (!wk) return;
    const r = wk.getBoundingClientRect();
    const cells = wk.querySelectorAll<HTMLElement>('.day');
    const ds = cells[Math.floor(((e.clientX - r.left) / r.width) * 7)]?.dataset.date;
    if (ds) single.current = setTimeout(() => setDay(ds), 460); // wait: it might be a double tap
  };
  const mm = meta && 'artPad' in meta ? meta : null;
  const ed = useArt(shown, art);
  const [drawing, setDrawing] = useState(false);
  const [pen, setPen] = useState<Pen>(firstPen);
  const [selection, setSelection] = useState<number[]>([]);
  const [hidden, setHidden] = useState<number[]>([]);
  const [placing, setPlacing] = useState<{ st: Stamp; k: number } | null>(null);
  const [note, setNote] = useState('');
  useEffect(() => {
    setSelection([]);
    setPlacing(null);
  }, [shown, drawing]);
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(''), 3500);
    return () => clearTimeout(t);
  }, [note]);
  const items = hidden.length ? ed.items.filter(x => !hidden.includes(x.id)) : ed.items;
  const selItems = ed.items.filter(x => selection.includes(x.id));
  const place = async (at: [number, number]) => {
    if (!placing) return;
    const b = unionBox(placing.st.items) || { x1: 0, y1: 0, x2: 0, y2: 0 };
    const cx = (b.x1 + b.x2) / 2;
    const cy = (b.y1 + b.y2) / 2;
    const list = placing.st.items.map(it => {
      const o = xform(it, at[0] - cx, at[1] - cy, placing.k, cx, cy);
      delete (o as Partial<Item>).g;
      return o;
    });
    setPlacing(null);
    const ids = await ed.addMany(list);
    setPen(p => ({ ...p, tool: 'select' }));
    setSelection(ids);
  };
  const titleStyle = titleDraft?.style || mm?.title || mm?.defaultTitle || DEFAULT_TITLE;
  const hand = titleDraft ? titleDraft.hand : !!mm?.hideTitle;
  const border = borderDraft !== undefined ? borderDraft : mm?.border || null;
  const go = (n: number) => shown && setYm(addMonths(shown, n));
  // a tablet: a day = everything on it (to change or add); an event = change it
  const onDay = edit
    ? (ds: string) =>
        m?.events.some(x => x.start <= ds && x.end >= ds) ? setDay(ds) : setEditing({ k: 'event', ev: null, date: ds })
    : undefined;
  const onEvent = edit
    ? (ev: BoardEvent) => (ev.ref && !ev.readOnly ? setEditing({ k: 'event', ev, date: ev.start }) : setDay(ev.start))
    : undefined;
  const closeEditor = useCallback(() => setEditing(null), []);
  const saved = useCallback(
    (dates: string[]) => {
      setEditing(null);
      const other = dates.find(d => d && d.slice(0, 7) !== shown);
      if (other && !dates.some(d => d?.slice(0, 7) === shown)) setYm(other.slice(0, 7));
      month.reload();
    },
    [shown, month]
  );
  const photosOn = mm?.side ? mm.side.mode === 'photos' : !!photos?.cfg?.frame;
  const pool = photos?.photos && photosOn ? titlePool(photos.photos, mm?.side) : [];
  const monthName = m ? MONTHS[m.grid.m - 1] : '';
  return (
    // one continuous surface across the whole screen, so the bands beside the board match it
    <div
      id="stage"
      className={(sf.lum > 0.18 ? 'light' : '') + (pad ? ' framed' : '')}
      style={pad ? undefined : { backgroundImage: bg }}
      onPointerUp={tap}
    >
      <div
        id="board"
        className={edit ? 'edit' : ''}
        style={{
          transform: `scale(${scale})`,
          padding: pad,
          width: W + 2 * pad,
          height: bh + 2 * pad,
          background: pad ? sf.frame || 'var(--wood)' : undefined
        }}
      >
        <div className="slate" data-surface={sf.id} style={pad ? { backgroundImage: bg } : undefined}>
          <style>{css}</style>
          {m && (
            <Month
              data={m}
              bins={extras?.bins || null}
              bg={sf.lum}
              today={{ shape: tv.todayS, color: tv.todayC }}
              border={border}
              onDay={onDay}
              onEvent={onEvent}
              nav={edit ? { prev: () => go(-1), next: () => go(1) } : undefined}
              title={
                <Title
                  text={monthName}
                  year={m.grid.y !== Number(m.today.slice(0, 4)) ? m.grid.y : undefined}
                  style={titleStyle}
                  hand={hand}
                  dashed={edit}
                  bg={sf.lum}
                />
              }
            />
          )}
          {m && (
            <TitlePhotos
              pool={pool}
              art={items}
              layoutKey={`${monthName}|${JSON.stringify(titleStyle)}|${border?.size || ''}`}
            />
          )}
          <Notes time24={!!today?.time24} />
          <Art items={items} bg={sf.lum} res={res} gifsPlay />
          {edit && drawing && (
            <DrawLayer
              art={ed}
              pen={pen}
              bg={sf.lum}
              res={res}
              selection={selection}
              setSelection={setSelection}
              onText={(item, at) => setEditing({ k: 'text', item, at })}
              onRecolor={() => setEditing({ k: 'recolor' })}
              onSaveStamp={() => setEditing({ k: 'stamp' })}
              placing={!!placing}
              onPlace={place}
              onHide={setHidden}
            />
          )}
          {(note || ed.err || placing) && (
            <div className="status" role="status">
              {placing ? `Tap the board where “${placing.st.name}” should go` : note || ed.err}
            </div>
          )}
        </div>
        {edit && (
          <Strip
            who={who}
            tools={
              drawing ? (
                <Tools
                  pen={pen}
                  setPen={setPen}
                  onUndo={ed.undo}
                  onRedo={ed.redo}
                  canUndo={ed.canUndo}
                  canRedo={ed.canRedo}
                  onStamps={() => setEditing({ k: 'library' })}
                  onClear={() => {
                    const all = ed.items.filter(x => x.id >= 0 && !x.e);
                    if (all.length && confirm(`Wipe all the art for ${monthName}? (Undo can bring it back.)`))
                      ed.remove(all);
                  }}
                />
              ) : undefined
            }
          >
            <button
              type="button"
              className={'pill' + (drawing ? ' on' : '')}
              id="drawBtn"
              onClick={() => setDrawing(d => !d)}
            >
              ✎ {drawing ? 'Done drawing' : 'Draw'}
            </button>
            {m && !drawing && (
              <>
                <button type="button" className="pill" id="titleBtn" onClick={() => setEditing({ k: 'title' })}>
                  ✎ Month title
                </button>
                <button type="button" className="pill" id="borderBtn" onClick={() => setEditing({ k: 'border' })}>
                  🖼 Border
                </button>
                <button
                  type="button"
                  className="pill"
                  id="styleBtn"
                  aria-label="Board style"
                  onClick={() => setEditing({ k: 'style' })}
                >
                  🎨
                </button>
                <button
                  type="button"
                  className="pill addev"
                  id="addBtn"
                  onClick={() =>
                    setEditing({ k: 'event', ev: null, date: m.ym === m.today.slice(0, 7) ? m.today : m.ym + '-01' })
                  }
                >
                  + Add event
                </button>
              </>
            )}
          </Strip>
        )}
      </div>
      {!edit && photos && (
        <Slideshow photos={photos} on={slides.on} time24={!!today?.time24} onTap={slides.tapSlides} />
      )}
      <ReminderAlert time24={!!today?.time24} />
      <TimerDone />
      {day && m && (
        <DayView
          date={day}
          events={m.events}
          onClose={closeDay}
          onEvent={
            edit
              ? ev => {
                  setDay(null);
                  if (ev.ref && !ev.readOnly) setEditing({ k: 'event', ev, date: ev.start });
                }
              : undefined
          }
          onAdd={
            edit
              ? () => {
                  setDay(null);
                  setEditing({ k: 'event', ev: null, date: day });
                }
              : undefined
          }
        />
      )}
      {editing?.k === 'event' && m && (
        <EventEditor
          ev={editing.ev}
          date={editing.date}
          calendars={m.calendars || []}
          onClose={closeEditor}
          onSaved={saved}
        />
      )}
      {editing?.k === 'title' && m && shown && (
        <TitleEditor ym={shown} monthName={monthName} meta={mm} onPreview={setTitleDraft} onClose={closeEditor} />
      )}
      {editing?.k === 'border' && m && shown && (
        <BorderEditor ym={shown} monthName={monthName} meta={mm} onPreview={setBorderDraft} onClose={closeEditor} />
      )}
      {editing?.k === 'text' && (
        <TextSheet
          item={editing.item}
          color={pen.color[pen.medium]}
          onClose={closeEditor}
          onDelete={() => {
            if (editing.item) ed.remove([editing.item]);
            closeEditor();
          }}
          onSave={t => {
            const posca = isPosca(t.c);
            if (editing.item) {
              const after: Item = { ...editing.item, ...t };
              if (posca) after.m = true;
              else delete after.m;
              ed.update([editing.item], [after]);
            } else ed.add({ id: 0, k: 't', x: editing.at[0], y: editing.at[1], ...t, ...(posca ? { m: true } : {}) });
            closeEditor();
          }}
        />
      )}
      {editing?.k === 'recolor' && (
        <RecolorSheet
          onClose={closeEditor}
          onSave={(line, fill) => {
            ed.update(selItems, recolor(selItems, line, fill));
            closeEditor();
          }}
        />
      )}
      {editing?.k === 'library' && (
        <Library
          bg={sf.lum}
          onClose={closeEditor}
          onPick={(st, k) => {
            closeEditor();
            setPen(p => (p.tool === 'erase' || p.tool === 'text' ? { ...p, tool: 'select' } : p));
            setPlacing({ st, k });
          }}
        />
      )}
      {editing?.k === 'stamp' && (
        <SaveStampSheet
          items={selItems}
          bg={sf.lum}
          onClose={name => {
            closeEditor();
            if (name) setNote(`Saved “${name}” to Stamps`);
          }}
        />
      )}
      {editing?.k === 'style' && <StyleEditor theme={savedTheme} onPreview={setThemeDraft} onClose={closeEditor} />}
    </div>
  );
}
