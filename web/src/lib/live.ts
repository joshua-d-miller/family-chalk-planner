// Live updates: one connection to the board (/api/stream) for the whole page. A change anywhere arrives
// as an event ("chores", "meals"...), and whatever shows that list fetches it again.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, get, url } from './api.ts';

type Handler = (data: unknown) => void;
const handlers = new Map<string, Set<Handler>>();
let source: EventSource | null = null;
let version: string | null = null;

function connect() {
  if (source) return;
  source = new EventSource(url('api/stream'));
  source.addEventListener('hello', e => {
    const v = (JSON.parse((e as MessageEvent).data) as { v: string }).v;
    // a new version of the board was installed: load it (the page's own state is all on the server)
    if (version && v !== version) location.reload();
    version = v;
    emit('hello', {}); // after a reconnect: everything may have changed meanwhile
  });
  source.onmessage = null;
  source.onopen = () => setOnline(true);
  source.onerror = () => setOnline(false); // EventSource keeps trying by itself
}
// whether the live connection is up (the board shows "Offline" when it isn't)
let online = true;
const onlineSubs = new Set<(v: boolean) => void>();
function setOnline(v: boolean) {
  if (v === online) return;
  online = v;
  for (const f of onlineSubs) f(v);
}
export function useOnline() {
  const [v, setV] = useState(online);
  useEffect(() => {
    connect();
    onlineSubs.add(setV);
    return () => {
      onlineSubs.delete(setV);
    };
  }, []);
  return v;
}
function emit(event: string, data: unknown) {
  for (const h of handlers.get(event) || []) h(data);
}
const known = new Set<string>(['hello']);

export function subscribe(event: string, h: Handler) {
  connect();
  if (!known.has(event)) {
    known.add(event);
    source!.addEventListener(event, e => emit(event, JSON.parse((e as MessageEvent).data || '{}')));
  }
  if (!handlers.has(event)) handlers.set(event, new Set());
  handlers.get(event)!.add(h);
  return () => handlers.get(event)!.delete(h);
}

// Something from the server, kept up to date: fetched now, and again whenever one of `events` arrives
export function useLive<T>(path: string, events: string[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const seq = useRef(0);
  const load = useCallback(() => {
    const n = ++seq.current;
    get<T>(path).then(
      d => n === seq.current && (setData(d), setError(null)),
      e => n === seq.current && setError(e as ApiError)
    );
  }, [path]);
  const key = events.join(',');
  useEffect(() => {
    load();
    const offs = [...key.split(','), 'hello'].map(ev => subscribe(ev, () => load()));
    return () => offs.forEach(off => off());
  }, [load, key]);
  // a change this screen made: show the server's answer straight away
  return { data, error, reload: load, set: setData };
}
