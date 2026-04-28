import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Shop, User, Product, Transaction, VoiceStatus, PaymentMethod, CatalogCategory } from '../types';
import { BillingPayload } from '../services/api/billingApi';

interface AuthStore {
  shop: Shop | null;
  user: User | null;
  isAuthenticated: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  setShop: (shop: Shop) => void;
  setUser: (user: User) => void;
  setTokens: (access: string, refresh: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      shop: null,
      user: null,
      isAuthenticated: false,
      accessToken: null,
      refreshToken: null,
      setShop: (shop) => set({ shop }),
      setUser: (user) => set({ user, isAuthenticated: true }),
      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      logout: () => set({ user: null, isAuthenticated: false, shop: null, accessToken: null, refreshToken: null }),
    }),
    { name: 'dokan-auth', storage: createJSONStorage(() => AsyncStorage) }
  )
);

interface ProductStore {
  products: Product[];
  isLoading: boolean;
  lastFetched: string | null;
  setProducts: (products: Product[]) => void;
  updateStock: (id: string, delta: number) => void;
  setLoading: (loading: boolean) => void;
}

export const useProductStore = create<ProductStore>()(
  persist(
    (set) => ({
      products: [],
      isLoading: false,
      lastFetched: null,
      setProducts: (products) => set({ products, lastFetched: new Date().toISOString() }),
      updateStock: (id, delta) => set((s) => ({
        products: s.products.map(p =>
          p.id === id ? { ...p, current_stock: p.current_stock + delta } : p
        ),
      })),
      setLoading: (isLoading) => set({ isLoading }),
    }),
    { name: 'dokan-products', storage: createJSONStorage(() => AsyncStorage) }
  )
);

interface TransactionStore {
  todayTransactions: Transaction[];
  pendingBills: BillingPayload[];
  setTodayTransactions: (txns: Transaction[]) => void;
  addTransactions: (txns: Transaction[]) => void;
  addPendingBill: (bill: BillingPayload) => void;
  clearPendingBills: () => void;
}

export const useTransactionStore = create<TransactionStore>()(
  persist(
    (set) => ({
      todayTransactions: [] as Transaction[],
      pendingBills: [] as BillingPayload[],
      setTodayTransactions: (todayTransactions) => set({ todayTransactions: todayTransactions ?? [] }),
      addTransactions: (txns) => set((s) => ({
        todayTransactions: [...(txns ?? []), ...(s.todayTransactions ?? [])],
      })),
      addPendingBill: (bill) => set((s) => ({
        pendingBills: [...(s.pendingBills ?? []), bill],
      })),
      clearPendingBills: () => set({ pendingBills: [] }),
    }),
    {
      name: 'dokan-transactions',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ pendingBills: s.pendingBills }),
      merge: (persisted: any, current) => ({
        ...current,
        ...persisted,
        todayTransactions: persisted?.todayTransactions ?? [],
        pendingBills: persisted?.pendingBills ?? [],
      }),
    }
  )
);

interface VoiceStore {
  status: VoiceStatus;
  rawText: string;
  confirmationText: string;
  setStatus: (s: VoiceStatus) => void;
  setRawText: (t: string) => void;
  setConfirmationText: (t: string) => void;
  reset: () => void;
}

export const useVoiceStore = create<VoiceStore>((set) => ({
  status: 'idle',
  rawText: '',
  confirmationText: '',
  setStatus: (status) => set({ status }),
  setRawText: (rawText) => set({ rawText }),
  setConfirmationText: (confirmationText) => set({ confirmationText }),
  reset: () => set({ status: 'idle', rawText: '', confirmationText: '' }),
}));

// ─── Catalog Store ────────────────────────────────────────────────────────────
// Persisted to AsyncStorage. TTL: 24 h — re-fetched silently in background
// when stale. Cleared on logout via useAuthStore.logout().

const CATALOG_TTL_MS = 24 * 60 * 60 * 1000;

interface CatalogStore {
  categories: CatalogCategory[];
  lastFetched: string | null;
  isLoading: boolean;
  error: string | null;
  setCategories: (cats: CatalogCategory[]) => void;
  setLoading: (v: boolean) => void;
  setError: (e: string | null) => void;
  isStale: () => boolean;
  clear: () => void;
}

export const useCatalogStore = create<CatalogStore>()(
  persist(
    (set, get) => ({
      categories: [],
      lastFetched: null,
      isLoading: false,
      error: null,
      setCategories: (categories) =>
        set({ categories, lastFetched: new Date().toISOString(), error: null }),
      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),
      isStale: () => {
        const { lastFetched } = get();
        if (!lastFetched) return true;
        return Date.now() - new Date(lastFetched).getTime() > CATALOG_TTL_MS;
      },
      clear: () => set({ categories: [], lastFetched: null, error: null }),
    }),
    { name: 'dokan-catalog', storage: createJSONStorage(() => AsyncStorage) },
  ),
);