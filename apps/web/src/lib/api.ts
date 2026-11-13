export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export interface StoredUser {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
  unit: { id: string; code: string; name: string } | null;
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('tc_token');
}

export function getUser(): StoredUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('tc_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

export function logout() {
  if (typeof window === 'undefined') return;
  const rt = localStorage.getItem('tc_refresh_token');
  if (rt) {
    fetch(`${API_BASE}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt }),
    }).catch(() => undefined);
  }
  localStorage.removeItem('tc_token');
  localStorage.removeItem('tc_refresh_token');
  localStorage.removeItem('tc_user');
  window.location.href = '/';
}

async function tryRefreshToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const rt = localStorage.getItem('tc_refresh_token');
  if (!rt) return null;
  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { accessToken?: string; refreshToken?: string };
    if (data?.accessToken) {
      localStorage.setItem('tc_token', data.accessToken);
      if (data.refreshToken) localStorage.setItem('tc_refresh_token', data.refreshToken);
      return data.accessToken;
    }
  } catch {
    // ignore
  }
  return null;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const send = (tok: string | null) => {
    const headers = new Headers(init.headers);
    if (tok) headers.set('Authorization', `Bearer ${tok}`);
    if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return fetch(`${API_BASE}${path}`, { ...init, headers });
  };

  let res = await send(getToken());
  if (res.status === 401) {
    const fresh = await tryRefreshToken();
    if (fresh) {
      res = await send(fresh);
    }
  }
  if (res.status === 401) {
    logout();
    throw new Error('Sesión expirada');
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(data?.message || `Error HTTP ${res.status}`);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  download: async (path: string, filename: string) => {
    const token = getToken();
    const res = await fetch(`${API_BASE}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`Error descargando archivo (${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};
