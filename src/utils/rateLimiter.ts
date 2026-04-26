import AsyncStorage from '@react-native-async-storage/async-storage';

interface LockoutState {
  attempts: number;
  lockedUntil: number;
}

// Lockout durations (seconds) indexed by attempt count: 5th fail→30s, 6th→60s, 7th→120s, 8th+→300s
const LOCKOUT_SECONDS = [0, 0, 0, 0, 0, 30, 60, 120, 300];

const KEY = (id: string) => `dokan_pin_lockout_${id}`;

async function getState(identifier: string): Promise<LockoutState> {
  try {
    const raw = await AsyncStorage.getItem(KEY(identifier));
    return raw ? JSON.parse(raw) : { attempts: 0, lockedUntil: 0 };
  } catch {
    return { attempts: 0, lockedUntil: 0 };
  }
}

export const pinRateLimiter = {
  async check(identifier: string): Promise<{ locked: boolean; secondsLeft: number }> {
    const state = await getState(identifier);
    const now = Date.now();
    if (state.lockedUntil > now) {
      return { locked: true, secondsLeft: Math.ceil((state.lockedUntil - now) / 1000) };
    }
    return { locked: false, secondsLeft: 0 };
  },

  async recordFailure(identifier: string): Promise<{ lockSec: number; attemptsLeft: number }> {
    const state = await getState(identifier);
    const attempts = state.attempts + 1;
    const idx = Math.min(attempts, LOCKOUT_SECONDS.length - 1);
    const sec = LOCKOUT_SECONDS[idx];
    const lockedUntil = sec > 0 ? Date.now() + sec * 1000 : 0;
    await AsyncStorage.setItem(KEY(identifier), JSON.stringify({ attempts, lockedUntil }));
    // Lockout triggers at attempt index 5 — up to 4 free attempts before first lockout
    const attemptsLeft = sec > 0 ? 0 : Math.max(0, 5 - attempts);
    return { lockSec: sec, attemptsLeft };
  },

  async recordSuccess(identifier: string): Promise<void> {
    await AsyncStorage.removeItem(KEY(identifier));
  },
};
