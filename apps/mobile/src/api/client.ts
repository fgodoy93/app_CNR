import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_TOKEN = 'tc_token';
const KEY_USER = 'tc_user';
const KEY_API_URL = 'tc_api_url';
const KEY_DEVICE_ID = 'tc_device_id';

export const DEFAULT_API_URL = 'http://10.0.2.2:4000';

export async function getApiUrl(): Promise<string> {
  return (await AsyncStorage.getItem(KEY_API_URL)) || DEFAULT_API_URL;
}

export async function setApiUrl(url: string) {
  await AsyncStorage.setItem(KEY_API_URL, url.replace(/\/$/, ''));
}

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(KEY_TOKEN);
}

export async function setSession(token: string, user: unknown) {
  await AsyncStorage.setItem(KEY_TOKEN, token);
  await AsyncStorage.setItem(KEY_USER, JSON.stringify(user));
}

export async function clearSession() {
  await AsyncStorage.removeItem(KEY_TOKEN);
  await AsyncStorage.removeItem(KEY_USER);
}

export async function getDeviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(KEY_DEVICE_ID);
  if (!id) {
    id = `mobile-${Math.random().toString(36).slice(2, 10)}`;
    await AsyncStorage.setItem(KEY_DEVICE_ID, id);
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
