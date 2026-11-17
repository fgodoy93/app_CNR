import { getDb } from '../db/sqlite';

const KEY_TOKEN = 'tc_token';
const KEY_REFRESH = 'tc_refresh_token';
const KEY_USER = 'tc_user';
const KEY_API_URL = 'tc_api_url';
const KEY_DEVICE_ID = 'tc_device_id';

export const DEFAULT_API_URL = 'http://13.140.47.47:3000';

async function kvGet(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(`SELECT value FROM kv WHERE key = ?`, [key]);
  return row?.value ?? null;
}

async function kvSet(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)`, [key, value]);
}

async function kvDel(key: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM kv WHERE key = ?`, [key]);
}

export async function getApiUrl(): Promise<string> {
  return (await kvGet(KEY_API_URL)) || DEFAULT_API_URL;
}

export async function setApiUrl(url: string) {
  await kvSet(KEY_API_URL, url.replace(/\/$/, ''));
}

export async function getToken(): Promise<string | null> {
  return kvGet(KEY_TOKEN);
}

export async function setSession(token: string, user: unknown, refreshToken?: string) {
  await kvSet(KEY_TOKEN, token);
  await kvSet(KEY_USER, JSON.stringify(user));
  if (refreshToken) await kvSet(KEY_REFRESH, refreshToken);
}

export async function getStoredUser(): Promise<{ id: string; name: string; email: string; role: string; permissions: string[] } | null> {
  const raw = await kvGet(KEY_USER);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function clearSession() {
  const rt = await kvGet(KEY_REFRESH);
  if (rt) {
    const base = await getApiUrl();
    fetch(`${base}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt }),
    }).catch(() => undefined);
  }
  await kvDel(KEY_TOKEN);
  await kvDel(KEY_REFRESH);
  await kvDel(KEY_USER);
}

export async function getDeviceId(): Promise<string> {
  let id = await kvGet(KEY_DEVICE_ID);
  if (!id) {
    id = `mobile-${Math.random().toString(36).slice(2, 10)}`;
    await kvSet(KEY_DEVICE_ID, id);
  }
  return id;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const base = await getApiUrl();

  const doRequest = async (tok: string | null) => {
    const headers = new Headers(init.headers);
    if (tok) headers.set('Authorization', `Bearer ${tok}`);
    if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return fetch(`${base}${path}`, { ...init, headers });
  };

  let res = await doRequest(await getToken());

  // Si el accessToken expiró (401), intentar renovarlo automáticamente con el refreshToken de 30 días
  if (res.status === 401 && path !== '/api/v1/auth/login' && path !== '/api/v1/auth/refresh') {
    const rt = await kvGet(KEY_REFRESH);
    if (rt) {
      const refRes = await fetch(`${base}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      });
      if (refRes.ok) {
        const refData = (await refRes.json()) as { accessToken?: string; refreshToken?: string };
        if (refData?.accessToken) {
          await kvSet(KEY_TOKEN, refData.accessToken);
          if (refData.refreshToken) await kvSet(KEY_REFRESH, refData.refreshToken);
          res = await doRequest(refData.accessToken);
        }
      }
    }
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('Sesión expirada. Cierre sesión y vuelva a ingresar (sus datos locales no se pierden).');
    }
    throw new Error(data?.message || `Error HTTP ${res.status}`);
  }
  return data as T;
}
