import { getDb } from '../db/sqlite';

const KEY_TOKEN = 'tc_token';
const KEY_USER = 'tc_user';
const KEY_API_URL = 'tc_api_url';
const KEY_DEVICE_ID = 'tc_device_id';

export const DEFAULT_API_URL = 'http://192.168.1.158:4000';

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

export async function setSession(token: string, user: unknown) {
  await kvSet(KEY_TOKEN, token);
  await kvSet(KEY_USER, JSON.stringify(user));
}

export async function clearSession() {
  await kvDel(KEY_TOKEN);
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
  const token = await getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${base}${path}`, { ...init, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.message || `Error HTTP ${res.status}`);
  return data as T;
}
