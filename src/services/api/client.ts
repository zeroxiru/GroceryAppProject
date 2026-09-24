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

// ─── Session-expired notification ──────────────────────────────────────────
// client.ts is a plain service module, not a component — it can't navigate
// directly. The root layout subscribes here once at startup and decides how
// to react (toast + redirect to pin-login), so every screen gets consistent
// behavior instead of each call site handling a 401 on its own.
type SessionExpiredListener = () => void;
let sessionExpiredListener: SessionExpiredListener | null = null;

export function onSessionExpired(listener: SessionExpiredListener): () => void {
  sessionExpiredListener = listener;
  return () => { sessionExpiredListener = null; };
}

// ─── Token refresh ──────────────────────────────────────────────────────────
// Two outcomes that used to be conflated as "refresh failed → log out":
//   'invalid' — the server rejected the refresh token. The session really is
//               over; clear tokens and notify the app to redirect to login.
//   'offline' — the refresh request couldn't even reach the server. The
//               session may still be perfectly valid; do NOT clear tokens or
//               log the shopkeeper out just for losing signal (offline-first).
type RefreshOutcome =
  | { ok: true; accessToken: string }
  | { ok: false; reason: 'invalid' | 'offline' };

// Concurrent 401s (several in-flight requests landing at once) must share ONE
// refresh attempt. Without this, two requests can each read the same
// still-valid refresh token and race to redeem it — if the backend rotates
// (single-use) refresh tokens, the loser's redemption fails and used to wipe
// both tokens even though the session was still genuinely good.
let refreshInFlight: Promise<RefreshOutcome> | null = null;

function refreshAccessToken(): Promise<RefreshOutcome> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

async function doRefresh(): Promise<RefreshOutcome> {
  const refreshToken = await tokenStore.getRefresh();
  if (!refreshToken) {
    console.warn('[Auth] no refresh token stored — cannot renew the session');
    return { ok: false, reason: 'invalid' };
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/auth/refresh-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    console.warn('[Auth] token refresh could not reach the server — keeping the session');
    return { ok: false, reason: 'offline' };
  }

  if (!res.ok) {
    console.warn(`[Auth] refresh token rejected by the server (HTTP ${res.status})`);
    return { ok: false, reason: 'invalid' };
  }

  const json = await res.json();
  const data = json?.data ?? json;
  await tokenStore.set(data.accessToken, data.refreshToken ?? refreshToken);
  return { ok: true, accessToken: data.accessToken };
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
    const outcome = await refreshAccessToken();
    if (outcome.ok) return apiRequest<T>(method, path, body, false);
    if (outcome.reason === 'offline') throw new OfflineError();
    // reason === 'invalid': the session is genuinely over.
    console.warn(`[Auth] session expired on ${method} ${path} — signing out`);
    await tokenStore.clear();
    sessionExpiredListener?.();
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
