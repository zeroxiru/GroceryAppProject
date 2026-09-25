import { billingApi, BillingPayload, BillingResponse, PaymentMethod, ServerBill } from '../api/billingApi';
import { inventoryApi } from '../api/inventoryApi';
import { Transaction, TransactionInput } from '../../types';
import { useAuthStore, useTransactionStore, useProductStore } from '../../store';
import { useSalesStatsStore } from '../../store/salesStats';
import { OfflineError } from '../api/client';
import { v4 as uuidv4 } from 'uuid';
import { format, subDays } from 'date-fns';

// ── Server bills → the flat per-item Transaction rows the app screens use ──────────────────────────
// The server groups by invoice and counts days in UTC. Bangladesh is UTC+6, so a sale made between
// 00:00 and 06:00 local time belongs to the PREVIOUS UTC day. We therefore ask the server for one extra
// day and then keep only what falls on the shopkeeper's own (local) calendar day.
const localDay = (iso: string) => format(new Date(iso), 'yyyy-MM-dd');
const dayBefore = (d: string) => format(subDays(new Date(`${d}T12:00:00`), 1), 'yyyy-MM-dd');

function billsToTransactions(bills: ServerBill[]): Transaction[] {
  const rows: Transaction[] = [];
  for (const b of bills ?? []) {
    (b.items ?? []).forEach((it, i) => {
      rows.push({
        id: `${b.invoice_number}-${i}`,
        shop_id: b.shop_id ?? '',
        user_id: b.user_id ?? '',
        user_name: b.user_name ?? '',
        type: 'sale',
        product_id: it.product_id ?? '',
        product_name: it.product_name,
        quantity: Number(it.quantity),
        unit: it.unit,
        unit_price: Number(it.unit_price),
        total_amount: Number(it.total_amount),
        subtotal: Number(b.subtotal),
        net_total: Number(b.net_total),
        discount_type: b.discount_type ?? undefined,
        discount_value: b.discount_value,
        discount_amount: b.discount_amount,
        invoice_number: b.invoice_number,
        customer_name: b.customer_name ?? undefined,
        payment_method: b.payment_method,
        voided: !!b.is_voided,
        is_synced: true,
        created_at: b.created_at,
      } as Transaction);
    });
  }
  return rows;
}

function billingResponseToTransactions(
  res: BillingResponse,
  shopId: string,
  userId: string,
  userName: string,
): Transaction[] {
  return res.items.map(item => ({
    ...item,
    shop_id: item.shop_id ?? shopId,
    user_id: item.user_id ?? userId,
    user_name: item.user_name ?? userName,
    invoice_number: res.invoice_number,
    payment_method: res.payment_method,
    is_synced: true,
    created_at: item.created_at ?? res.created_at,
  }));
}

export const transactionService = {

  async saveBill(payload: BillingPayload): Promise<BillingResponse> {
    const { shop, user } = useAuthStore.getState();
    if (!shop || !user) throw new Error('Not authenticated');

    // Ensure vat_rate is always present so the backend resolves the correct
    // create_invoice overload (9-param version with p_vat_rate).
    const normalisedPayload: BillingPayload = { vat_rate: 0, ...payload };

    // Optimistic local stock update
    for (const item of normalisedPayload.items) {
      if (item.product_id) {
        useProductStore.getState().updateStock(item.product_id, -item.quantity);
      }
    }

    try {
      const res = await billingApi.create(normalisedPayload);
      const txns = billingResponseToTransactions(res, shop.id, user.id, user.name);
      useTransactionStore.getState().addTransactions(txns);
      return res;
    } catch (e) {
      if (e instanceof OfflineError) {
        console.warn('Offline — billing queued for sync');
        useTransactionStore.getState().addPendingBill(normalisedPayload);
        const syntheticInvoice = `INV-${format(new Date(), 'yyyyMMdd')}-${Math.floor(1000 + Math.random() * 9000)}`;
        const subtotal = normalisedPayload.items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
        return {
          invoice_number: syntheticInvoice,
          created_at: new Date().toISOString(),
          items: [],
          subtotal,
          discount_amount: 0,
          net_total: subtotal,
          payment_method: normalisedPayload.payment_method,
        };
      }
      // Revert optimistic stock update on error
      for (const item of normalisedPayload.items) {
        if (item.product_id) {
          useProductStore.getState().updateStock(item.product_id, +item.quantity);
        }
      }
      throw e;
    }
  },

  // Legacy single-item save (used by recordStockIn only)
  async saveTransaction(input: TransactionInput): Promise<Transaction> {
    const { shop, user } = useAuthStore.getState();
    if (!shop || !user) throw new Error('Not authenticated');

    if (input.type === 'purchase' && input.product_id) {
      try {
        await inventoryApi.stockIn({
          product_id: input.product_id,
          quantity: input.quantity,
          purchase_price: input.unit_price,
          notes: input.notes,
        });
        useProductStore.getState().updateStock(input.product_id, +input.quantity);
      } catch (e) {
        if (!(e instanceof OfflineError)) throw e;
        console.warn('Offline — stock-in queued');
      }
    }

    const txn: Transaction = {
      id: uuidv4(),
      shop_id: shop.id,
      user_id: user.id,
      user_name: user.name,
      type: input.type,
      product_id: input.product_id ?? '',
      product_name: input.product_name,
      quantity: input.quantity,
      unit: input.unit,
      unit_price: input.unit_price,
      total_amount: input.quantity * input.unit_price,
      subtotal: input.subtotal,
      net_total: input.net_total,
      discount_type: input.discount_type,
      discount_value: input.discount_value,
      discount_amount: input.discount_amount,
      notes: input.notes,
      voice_raw_text: input.voice_raw_text,
      customer_name: input.customer_name,
      invoice_number: input.invoice_number,
      payment_method: input.payment_method,
      is_synced: true,
      created_at: new Date().toISOString(),
    };

    useTransactionStore.getState().addTransactions([txn]);
    return txn;
  },

  async fetchTodayTransactions(): Promise<Transaction[]> {
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const bills = await billingApi.rangeBills(dayBefore(today), today);
      const txns = billsToTransactions(bills).filter(t => localDay(t.created_at) === today);
      useTransactionStore.getState().setTodayTransactions(txns);
      return txns;
    } catch (e) {
      if (e instanceof OfflineError) {
        console.warn('Offline — using local transactions');
        return useTransactionStore.getState().todayTransactions;
      }
      console.warn('fetchTodayTransactions error:', e);
      return useTransactionStore.getState().todayTransactions;
    }
  },

  /**
   * Rebuild the 30-day "what sells" numbers (PRD FR-4). At most once an hour unless forced; silently keeps the saved
   * numbers when offline.
   */
  async refreshSalesStats(force = false): Promise<void> {
    const st = useSalesStatsStore.getState();
    if (!force && st.fetchedAt && Date.now() - new Date(st.fetchedAt).getTime() < 60 * 60 * 1000) return;
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const from = format(subDays(new Date(), 30), 'yyyy-MM-dd');
      const bills = await billingApi.rangeBills(dayBefore(from), today);
      const counts: Record<string, number> = {};
      const lastSold: Record<string, string> = {};
      for (const b of bills ?? []) {
        if (b.is_voided || localDay(b.created_at) < from) continue;
        for (const id of new Set((b.items ?? []).map(i => i.product_id).filter((x): x is string => !!x))) {
          counts[id] = (counts[id] ?? 0) + 1;
          if (!lastSold[id] || b.created_at > lastSold[id]) lastSold[id] = b.created_at;
        }
      }
      useSalesStatsStore.getState().setStats(counts, lastSold);
    } catch (e) {
      if (!(e instanceof OfflineError)) console.warn('refreshSalesStats:', e);
    }
  },

  async fetchByDateRange(from: string, to: string): Promise<Transaction[]> {
    try {
      const bills = await billingApi.rangeBills(dayBefore(from), to);
      return billsToTransactions(bills).filter(t => {
        const d = localDay(t.created_at);
        return d >= from && d <= to;
      });
    } catch (e) {
      if (e instanceof OfflineError) {
        console.warn('Offline — using local transactions');
        const all = useTransactionStore.getState().todayTransactions;
        return all.filter(t => {
          const date = t.created_at.split('T')[0];
          return date >= from && date <= to;
        });
      }
      throw e;
    }
  },

  async recordStockIn(
    productId: string,
    productName: string,
    quantity: number,
    unit: string,
    purchasePrice: number,
    notes?: string,
  ): Promise<Transaction> {
    return this.saveTransaction({
      type: 'purchase',
      product_id: productId,
      product_name: productName,
      quantity,
      unit: unit as any,
      unit_price: purchasePrice,
      invoice_number: `STOCK-IN-${format(new Date(), 'yyyyMMdd')}-${Math.floor(100 + Math.random() * 900)}`,
      notes: notes ?? 'Stock received',
    });
  },

  async syncPending(): Promise<void> {
    const { pendingBills } = useTransactionStore.getState();
    if (pendingBills.length === 0) return;
    const snapshot = pendingBills; // fixed reference for this pass — see the filter below
    const results = await Promise.allSettled(snapshot.map(b => billingApi.create(b)));

    // Only drop the bills that actually succeeded. Clearing the whole queue
    // on any single failure (the old behavior) meant one permanently-bad
    // bill — e.g. referencing a product that no longer exists — jammed the
    // entire queue: every retry re-submitted the already-succeeded bills
    // again, and billingApi.create() isn't idempotent, so they'd duplicate
    // on the server every single sync attempt.
    const succeededSet = new Set(
      snapshot.filter((_, i) => results[i].status === 'fulfilled')
    );
    if (succeededSet.size > 0) {
      const remaining = useTransactionStore.getState().pendingBills.filter(b => !succeededSet.has(b));
      useTransactionStore.setState({ pendingBills: remaining });
    }

    const failedCount = results.length - succeededSet.size;
    if (succeededSet.size > 0) console.log(`Synced ${succeededSet.size} pending bill(s)`);
    if (failedCount > 0) {
      results.forEach((r, i) => {
        if (r.status === 'rejected') console.warn('Pending bill still failing to sync:', r.reason?.message ?? r.reason, snapshot[i]);
      });
      console.warn(`${failedCount} bill(s) failed to sync — will retry next time, kept in the queue`);
    }
  },
};
