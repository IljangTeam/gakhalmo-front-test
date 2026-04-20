// API 클라이언트 — vite dev proxy (/api → api.dev.gakhalmo.klr.kr) 경유 호출.
// 401 발생 시 refresh_token 으로 1회 재시도 후 실패하면 그대로 반환.

const LS_ACCESS = 'temp-front.access_token';
const LS_REFRESH = 'temp-front.refresh_token';

export const tokens = {
  access: () => localStorage.getItem(LS_ACCESS) || '',
  refresh: () => localStorage.getItem(LS_REFRESH) || '',
  set(a, r) {
    if (a) localStorage.setItem(LS_ACCESS, a);
    if (r) localStorage.setItem(LS_REFRESH, r);
    notifyTokenChange();
  },
  clear() {
    localStorage.removeItem(LS_ACCESS);
    localStorage.removeItem(LS_REFRESH);
    notifyTokenChange();
  },
};

const listeners = new Set();
export function onTokenChange(fn) {
  listeners.add(fn);
  fn();
}
function notifyTokenChange() {
  for (const fn of listeners) fn();
}

async function rawFetch(method, path, { body, auth = true, query } = {}) {
  const url = new URL(path, window.location.origin);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue;
      url.searchParams.set(k, v);
    }
  }
  const headers = { 'Content-Type': 'application/json' };
  const t = tokens.access();
  if (auth && t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(url.toString().replace(window.location.origin, ''), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, ok: res.ok, body: json };
}

export async function call(method, path, opts = {}) {
  let r = await rawFetch(method, path, opts);
  if (r.status === 401 && opts.auth !== false && tokens.refresh()) {
    const refreshed = await rawFetch('POST', '/api/v1/auth/refresh', {
      body: { refresh_token: tokens.refresh() },
      auth: false,
    });
    if (refreshed.ok && refreshed.body?.access_token) {
      tokens.set(refreshed.body.access_token, refreshed.body.refresh_token);
      r = await rawFetch(method, path, opts);
    }
  }
  return r;
}

export function stringify(r) {
  const head = `HTTP ${r.status} ${r.ok ? 'OK' : 'FAIL'}`;
  const body = typeof r.body === 'string' ? r.body : JSON.stringify(r.body, null, 2);
  return `${head}\n${body}`;
}
