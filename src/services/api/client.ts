import * as SecureStore from 'expo-secure-store';

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api';

export class OfflineError extends Error {
  constructor() { super('Network unavailable'); this.name = 'OfflineError'; }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

const TOKEN_KEY = 'dokan_access_token';
const REFRESH_KEY = 'dokan_refresh_token';

export const tokenStore = {
  async getAccess(): Promise<string | null> { return SecureStore.getItemAsync(TOKEN_KEY); },
  async getRefresh(): Promise<string | null> { return SecureStore.getItemAsync(REFRESH_KEY); },
  async set(access: string, refresh: string): Promise<void> {
    await SecureStore.setItemAsync(TOKEN_KEY, access);
    await SecureStore.setItemAsync(REFRESH_KEY, refresh);
  },
  async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_KEY);
  },
};

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await tokenStore.getRefresh();
  if (!refreshToken) return null;
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) { await tokenStore.clear(); return null; }
    const data = await res.json();
    await tokenStore.set(data.accessToken, data.refreshToken ?? refreshToken);
    return data.accessToken;
  } catch { return null; }
}

export async function apiRequest<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  retry = true,
): Promise<T> {
  const accessToken = await tokenStore.getAccess();

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new OfflineError();
  }

  if (res.status === 401 && retry) {
    const newToken = await refreshAccessToken();
    if (newToken) return apiRequest<T>(method, path, body, false);
    throw new ApiError(401, 'Session expired');
  }

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try { const e = await res.json(); message = e.message ?? e.error ?? message; } catch {}
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
