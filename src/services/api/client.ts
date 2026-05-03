import * as SecureStore from 'expo-secure-store';

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api';

export class OfflineError extends Error {
  constructor() { super('Network unavailable'); this.name = 'OfflineError'; }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
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
    const json = await res.json();
    const data = json?.data ?? json;
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
    let details: unknown;
    try {
      const e = await res.json();
      message = e.message ?? e.error ?? message;
      details = e;
    } catch {}
    // 404 is expected for "not found" lookups — log as info, everything else as error
    if (res.status === 404) {
      console.log(`[API] ${method} ${path} → 404 (not found)`);
    } else {
      console.error(`[API] ${method} ${path} → ${res.status}`);
      console.error('[API] response body:', JSON.stringify(details, null, 2));
    }
    throw new ApiError(res.status, message, details);
  }

  if (res.status === 204) return undefined as T;
  const json = await res.json();
  // Backend wraps all responses in { success, message, data: T }
  return (json && typeof json === 'object' && 'data' in json ? json.data : json) as T;
}
