import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * What sold in the last 30 days, per product: how many bills it was on, and when it last sold. Feeds the search bar's
 * "জনপ্রিয়" (frequent) and "সাম্প্রতিক" (recent) strips (PRD FR-4). Persisted, so the strips are there the moment the app
 * opens, even offline; refreshed from the server at most once an hour (transactionService.refreshSalesStats) and bumped
 * locally after every checkout so a sale you just made shows up immediately.
 */
interface SalesStatsStore {
  counts: Record<string, number>;
  lastSold: Record<string, string>;
  fetchedAt: string | null;
  setStats: (counts: Record<string, number>, lastSold: Record<string, string>) => void;
  recordSale: (productIds: string[]) => void;
  clear: () => void;
}

export const useSalesStatsStore = create<SalesStatsStore>()(
  persist(
    (set) => ({
      counts: {},
      lastSold: {},
      fetchedAt: null,
      setStats: (counts, lastSold) => set({ counts, lastSold, fetchedAt: new Date().toISOString() }),
      recordSale: (productIds) => set((s) => {
        const counts = { ...s.counts };
        const lastSold = { ...s.lastSold };
        const now = new Date().toISOString();
        for (const id of new Set(productIds)) {
          counts[id] = (counts[id] ?? 0) + 1;
          lastSold[id] = now;
        }
        return { counts, lastSold };
      }),
      clear: () => set({ counts: {}, lastSold: {}, fetchedAt: null }),
    }),
    { name: 'dokan-sales-stats', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
