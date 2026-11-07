// Talking to the board's server. Every address is relative to the page's <base>, so the screens work
// wherever the board is served from. Changes carry the X-Chalk header (the server refuses changes
// without it: no other site can post to the board).
export class ApiError extends Error {
  status: number;
  body: Record<string, unknown>;
  constructor(message: string, status: number, body: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.body = body;
  }
  // the server's hints: sign in, pair this screen, sign in to the console again
  get needsSignIn() {
    return this.status === 401 && !this.body.admin;
  }
}

export const url = (path: string) => new URL(path.replace(/^\//, ''), document.baseURI).toString();

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url(path), { credentials: 'same-origin', ...init });
  } catch {
    throw new ApiError('Can’t reach the board - check the Wi-Fi', 0, {});
  }
  const body = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new ApiError(String(body.error || `The board answered ${r.status}`), r.status, body);
  return body as T;
}

export const get = <T>(path: string) => call<T>(path);
export const post = <T>(path: string, body: unknown = {}) =>
  call<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Chalk': '1' },
    body: JSON.stringify(body)
  });
// a picture for the board (a GIF, a photo): sent as it is; the answer says where the board keeps it
export const upload = (blob: Blob) =>
  call<{ src: string }>('api/media', {
    method: 'POST',
    headers: { 'Content-Type': blob.type || 'application/octet-stream', 'X-Chalk': '1' },
    body: blob
  });
