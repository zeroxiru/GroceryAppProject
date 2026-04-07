
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Shop, User, Product, Transaction, VoiceStatus } from '../types';

interface AuthStore {
  shop: Shop | null;
  user: User | null;
  isAuthenticated: boolean;
  setShop: (shop: Shop) => void;
  setUser: (user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      shop: null,
      user: null,
      isAuthenticated: false,
      setShop: (shop) => set({ shop }),
      setUser: (user) => set({ user, isAuthenticated: true }),
      logout: () => set({ user: null, isAuthenticated: false }),
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
  pendingSync: Transaction[];
  setTodayTransactions: (txns: Transaction[]) => void;
  addTransaction: (txn: Transaction) => void;
  addPendingSync: (txn: Transaction) => void;
  clearPendingSync: () => void;
}

export const useTransactionStore = create<TransactionStore>()(
  persist(
    (set) => ({
      todayTransactions: [],
      pendingSync: [],
      setTodayTransactions: (todayTransactions) => set({ todayTransactions }),
      addTransaction: (txn) => set((s) => ({
        todayTransactions: [txn, ...s.todayTransactions],
      })),
      addPendingSync: (txn) => set((s) => ({
        pendingSync: [...s.pendingSync, txn],
      })),
      clearPendingSync: () => set({ pendingSync: [] }),
    }),
    { name: 'dokan-transactions', storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ pendingSync: s.pendingSync }) }
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

interface AuthStore {
  shop: Shop | null;
  user: User | null;
  isAuthenticated: boolean;
  setShop: (shop: Shop) => void;
  setUser: (user: User) => void;
  logout: () => void;
}