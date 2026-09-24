import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Shop, User, Product, Transaction, VoiceStatus, PaymentMethod, CatalogCategory, Unit } from '../types';
import { BillingPayload } from '../services/api/billingApi';
import { v4 as uuidv4 } from 'uuid';

interface AuthStore {
  shop: Shop | null;
  user: User | null;
  isAuthenticated: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  // Survives logout (which nulls `shop`) so a login into a DIFFERENT shop can be detected.
  lastShopId: string | null;
  setShop: (shop: Shop) => void;
  setUser: (user: User) => void;
  setTokens: (access: string, refresh: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      shop: null,
      user: null,
      isAuthenticated: false,
      accessToken: null,
      refreshToken: null,
      lastShopId: null,
      setShop: (shop) => {
        // First login after this field was introduced has lastShopId=null but may still hold
        // another shop's cart/products — treat unknown as "changed" once.
        const prev = get().lastShopId ?? get().shop?.id ?? null;
        if (prev !== shop.id) onShopChanged(prev, shop.id);
        set({ shop, lastShopId: shop.id });
      },
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

// ─── Cart Store ───────────────────────────────────────────────────────────────
// Multi-bill hold/switch (PRD "POS Redesign", FR-10–FR-13): one cart per
// customer tab, persisted, unaffected by auth/session state — a held
// customer's items must never be lost, including to a token refresh failure.
// This is NOT useTransactionStore.pendingBills (that's the post-payment
// offline sync queue for completed sales) — this is pre-payment, in-progress
// carts that never touch the network until checkout.

export interface CartItem {
  product_id?: string;
  product_name: string;
  quantity: number;
  unit: Unit;
  unit_price: number;
  total: number;
  checked: boolean;
  confidence: number;
  notes?: string;
  /** An intentional open item ("৳15 of loose biscuits") — no catalog product, so nothing to register. */
  custom?: boolean;
  /** Loose items: the product's price PER GRAM. unit_price is derived from it so the line total is a whole taka. */
  list_unit_price?: number;
}

export interface Cart {
  id: string;
  label: string;
  items: CartItem[];
  customerName: string;
  discountType: 'percentage' | 'amount' | null;
  discountValue: string;
  paymentMethod: PaymentMethod;
  createdAt: string;
}

export const MAX_CARTS = 6;

/**
 * What a customer would actually pay: checked lines, less the cart's discount.
 * One definition, used by the customer tab and the bill bar, so they can never
 * show different totals for the same cart.
 */
export function cartTotals(cart: Cart): { subtotal: number; discount: number; net: number } {
  const subtotal = cart.items.filter(i => i.checked).reduce((s, i) => s + i.total, 0);
  const v = parseFloat(cart.discountValue) || 0;
  let discount = 0;
  if (cart.discountType && v && !isNaN(v)) {
    discount = cart.discountType === 'percentage' ? +(subtotal * Math.min(v, 100) / 100).toFixed(2) : Math.min(v, subtotal);
  }
  return { subtotal, discount, net: subtotal - discount };
}

/**
 * New quantity for a bill line. Loose (gram) lines are priced to a WHOLE taka — 500 g at ৳0.065/g is ৳33, not ৳32.5 —
 * and unit_price is set to total/qty so the server's own qty × unit_price lands on exactly that whole-taka total.
 */
function repriceLine(i: CartItem, q: number): { quantity: number; total: number; unit_price: number } {
  if (i.unit === 'gram' && i.list_unit_price) {
    const total = Math.max(1, Math.round(q * i.list_unit_price));
    return { quantity: q, total, unit_price: total / q };
  }
  return { quantity: q, total: +(q * i.unit_price).toFixed(2), unit_price: i.unit_price };
}

/** Quantities are stored to 2 dp so repeated 0.25 steps never drift (0.1+0.2 style). */
function roundQty(q: number): number {
  return Math.round(q * 100) / 100;
}

/** How far one tap of the − / + stepper moves: weighed goods in quarter steps, counted goods by 1. */
export function qtyStep(unit: Unit): number {
  if (unit === 'gram') return 100; // loose items are counted in grams; one tap = 100 g, exact amounts go through the weight sheet
  return unit === 'kg' || unit === 'litre' ? 0.25 : 1;
}

function newCart(label: string, id?: string): Cart {
  return {
    // A real cart is always created later, from a user tap (addTab), well
    // after react-native-get-random-values has patched crypto — safe to use
    // uuidv4() there. The one exception is the store's own bootstrap cart
    // below, built at module-evaluation time, before that polyfill is
    // guaranteed to have run; it gets a fixed id instead so this file never
    // calls uuidv4() at import time.
    id: id ?? uuidv4(),
    label,
    items: [],
    customerName: '',
    discountType: null,
    discountValue: '',
    paymentMethod: 'cash',
    createdAt: new Date().toISOString(),
  };
}

function nextCustomerLabel(carts: Cart[]): string {
  // "কাস্টমার N" using the next number not already in use, so closing/reopening
  // tabs doesn't collide with a still-open one.
  const used = new Set(
    carts.map(c => { const m = c.label.match(/কাস্টমার (\d+)/); return m ? parseInt(m[1], 10) : null; })
      .filter((n): n is number => n !== null)
  );
  let n = 1;
  while (used.has(n)) n++;
  return `কাস্টমার ${n}`;
}

interface CartStore {
  carts: Cart[];
  activeCartId: string;

  activeCart: () => Cart;
  getCart: (id: string) => Cart | undefined;

  addTab: () => string | null; // returns new cart id, or null if at MAX_CARTS
  setActiveCart: (id: string) => void;
  renameTab: (id: string, label: string) => void;
  closeTab: (id: string) => void; // manual close/cancel — always leaves ≥1 cart
  mergeTabs: (fromId: string, intoId: string) => void;

  addItem: (item: CartItem, cartId?: string) => void;
  /** Step a product's quantity in a cart; reaching 0 removes the line. */
  changeQuantity: (cartId: string, productId: string, delta: number) => void;
  /** Set an exact quantity (weighed goods); 0 removes the line. */
  setQuantity: (cartId: string, productId: string, quantity: number) => void;
  updateItem: (cartId: string, index: number, patch: Partial<CartItem>) => void;
  toggleItem: (cartId: string, index: number) => void;
  removeItem: (cartId: string, index: number) => void;
  /** Empties a cart's items in place — the tab itself stays (unlike closeTab). Used for "cancel this bill". */
  clearCartItems: (cartId: string) => void;

  setCustomerName: (cartId: string, name: string) => void;
  setDiscountType: (cartId: string, type: 'percentage' | 'amount' | null) => void;
  setDiscountValue: (cartId: string, value: string) => void;
  setPaymentMethod: (cartId: string, method: PaymentMethod) => void;

  /** Sale completed — remove this cart; if it was the only one, a fresh empty one takes its place. */
  completeCart: (cartId: string) => void;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      carts: [newCart('কাস্টমার ১', 'cart-bootstrap')],
      activeCartId: 'cart-bootstrap', // the bootstrap cart's fixed id; rehydrate re-points it if a saved id is stale

      activeCart: () => {
        const { carts, activeCartId } = get();
        return carts.find(c => c.id === activeCartId) ?? carts[0];
      },
      getCart: (id) => get().carts.find(c => c.id === id),

      addTab: () => {
        const { carts } = get();
        if (carts.length >= MAX_CARTS) return null;
        const cart = newCart(nextCustomerLabel(carts));
        set({ carts: [...carts, cart], activeCartId: cart.id });
        return cart.id;
      },
      setActiveCart: (id) => set({ activeCartId: id }),
      renameTab: (id, label) => set(s => ({ carts: s.carts.map(c => c.id === id ? { ...c, label } : c) })),
      closeTab: (id) => {
        const { carts, activeCartId } = get();
        const remaining = carts.filter(c => c.id !== id);
        if (remaining.length === 0) {
          const fresh = newCart('কাস্টমার ১');
          set({ carts: [fresh], activeCartId: fresh.id });
          return;
        }
        set({ carts: remaining, activeCartId: activeCartId === id ? remaining[0].id : activeCartId });
      },
      mergeTabs: (fromId, intoId) => {
        const { carts, activeCartId } = get();
        const from = carts.find(c => c.id === fromId);
        const into = carts.find(c => c.id === intoId);
        if (!from || !into || fromId === intoId) return;
        const merged = carts
          .map(c => c.id === intoId ? { ...c, items: [...c.items, ...from.items] } : c)
          .filter(c => c.id !== fromId);
        set({ carts: merged, activeCartId: activeCartId === fromId ? intoId : activeCartId });
      },

      addItem: (item, cartId) => {
        const id = cartId ?? get().activeCartId;
        set(s => ({
          carts: s.carts.map(c => {
            if (c.id !== id) return c;
            // Same product at the same price and unit is the same bill line —
            // raise its quantity instead of stacking a duplicate row, so the
            // product list's − / + stepper always acts on exactly one line.
            const at = item.product_id
              ? c.items.findIndex(i => i.product_id === item.product_id && i.unit === item.unit && i.unit_price === item.unit_price)
              : -1;
            if (at === -1) return { ...c, items: [...c.items, item] };
            const items = c.items.map((i, idx) => {
              if (idx !== at) return i;
              return { ...i, ...repriceLine(i, roundQty(i.quantity + item.quantity)), checked: true };
            });
            return { ...c, items };
          }),
        }));
      },
      changeQuantity: (cartId, productId, delta) => set(s => ({
        carts: s.carts.map(c => {
          if (c.id !== cartId) return c;
          const at = c.items.findIndex(i => i.product_id === productId);
          if (at === -1) return c;
          const quantity = roundQty(c.items[at].quantity + delta);
          if (quantity <= 0) return { ...c, items: c.items.filter((_, idx) => idx !== at) };
          return { ...c, items: c.items.map((i, idx) => idx !== at ? i : { ...i, ...repriceLine(i, quantity) }) };
        }),
      })),
      setQuantity: (cartId, productId, quantity) => set(s => ({
        carts: s.carts.map(c => {
          if (c.id !== cartId) return c;
          const at = c.items.findIndex(i => i.product_id === productId);
          if (at === -1) return c;
          const q = roundQty(quantity);
          if (q <= 0) return { ...c, items: c.items.filter((_, idx) => idx !== at) };
          return { ...c, items: c.items.map((i, idx) => idx !== at ? i : { ...i, ...repriceLine(i, q) }) };
        }),
      })),
      updateItem: (cartId, index, patch) => set(s => ({
        carts: s.carts.map(c => c.id !== cartId ? c : {
          ...c, items: c.items.map((it, i) => i === index ? { ...it, ...patch } : it),
        }),
      })),
      toggleItem: (cartId, index) => set(s => ({
        carts: s.carts.map(c => c.id !== cartId ? c : {
          ...c, items: c.items.map((it, i) => i === index ? { ...it, checked: !it.checked } : it),
        }),
      })),
      removeItem: (cartId, index) => set(s => ({
        carts: s.carts.map(c => c.id !== cartId ? c : { ...c, items: c.items.filter((_, i) => i !== index) }),
      })),
      clearCartItems: (cartId) => set(s => ({
        carts: s.carts.map(c => c.id !== cartId ? c : { ...c, items: [] }),
      })),

      setCustomerName: (cartId, customerName) => set(s => ({ carts: s.carts.map(c => c.id === cartId ? { ...c, customerName } : c) })),
      setDiscountType: (cartId, discountType) => set(s => ({ carts: s.carts.map(c => c.id === cartId ? { ...c, discountType, discountValue: '' } : c) })),
      setDiscountValue: (cartId, discountValue) => set(s => ({ carts: s.carts.map(c => c.id === cartId ? { ...c, discountValue } : c) })),
      setPaymentMethod: (cartId, paymentMethod) => set(s => ({ carts: s.carts.map(c => c.id === cartId ? { ...c, paymentMethod } : c) })),

      completeCart: (cartId) => get().closeTab(cartId),
    }),
    {
      name: 'dokan-carts',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        // Guarantee activeCartId always points at a real cart after reload —
        // persisted carts, freshly created ones, either way.
        if (state && (!state.activeCartId || !state.carts.some(c => c.id === state.activeCartId))) {
          state.activeCartId = state.carts[0]?.id ?? '';
        }
      },
    },
  ),
);

// ─── Shop switch hygiene ──────────────────────────────────────────────────────
// Carts, cached products, the category catalog and unsynced bills all belong to ONE shop.
// Logging into a different shop with the old data still in place shows the wrong products,
// and bills queued for the old shop are refused by the server ("product not found") forever.
// Unsynced bills are parked (not deleted) under the shop they belong to and restored if
// that shop logs in again on this device.
const PARKED_BILLS_KEY = (shopId: string | null) => `dokan-parked-bills-${shopId ?? 'legacy'}`;

function onShopChanged(prevShopId: string | null, nextShopId: string): void {
  console.warn(`[Shop] switching ${prevShopId ?? 'unknown'} -> ${nextShopId}: clearing shop-scoped local data`);
  const pending = useTransactionStore.getState().pendingBills ?? [];
  if (pending.length > 0) {
    AsyncStorage.setItem(PARKED_BILLS_KEY(prevShopId), JSON.stringify(pending)).catch(() => {});
    console.warn(`[Shop] parked ${pending.length} unsynced bill(s) for ${prevShopId ?? 'legacy'}`);
  }
  useTransactionStore.setState({ pendingBills: [], todayTransactions: [] });
  useProductStore.setState({ products: [], lastFetched: null });
  useCatalogStore.getState().clear();
  useCartStore.setState({ carts: [newCart('কাস্টমার ১', 'cart-bootstrap')], activeCartId: 'cart-bootstrap' });

  AsyncStorage.getItem(PARKED_BILLS_KEY(nextShopId)).then((json) => {
    if (!json) return;
    const back = JSON.parse(json);
    useTransactionStore.setState((st) => ({ pendingBills: [...back, ...(st.pendingBills ?? [])] }));
    AsyncStorage.removeItem(PARKED_BILLS_KEY(nextShopId)).catch(() => {});
    console.warn(`[Shop] restored ${back.length} parked bill(s) for ${nextShopId}`);
  }).catch(() => {});
}
