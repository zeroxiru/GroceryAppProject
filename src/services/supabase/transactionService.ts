import { billingApi, BillingPayload, BillingResponse, PaymentMethod } from '../api/billingApi';
import { inventoryApi } from '../api/inventoryApi';
import { Transaction, TransactionInput } from '../../types';
import { useAuthStore, useTransactionStore, useProductStore } from '../../store';
import { OfflineError } from '../api/client';
import { v4 as uuidv4 } from 'uuid';
import { format } from 'date-fns';

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

    // Optimistic local stock update
    for (const item of payload.items) {
      if (item.product_id) {
        useProductStore.getState().updateStock(item.product_id, -item.quantity);
      }
    }

    try {
      const res = await billingApi.create(payload);
      const txns = billingResponseToTransactions(res, shop.id, user.id, user.name);
      useTransactionStore.getState().addTransactions(txns);
      return res;
    } catch (e) {
      if (e instanceof OfflineError) {
        console.warn('Offline — billing queued for sync');
        useTransactionStore.getState().addPendingBill(payload);
        // Return synthetic response for receipt display
        const syntheticInvoice = `INV-${format(new Date(), 'yyyyMMdd')}-${Math.floor(1000 + Math.random() * 9000)}`;
        const subtotal = payload.items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
        return {
          invoice_number: syntheticInvoice,
          created_at: new Date().toISOString(),
          items: [],
          subtotal,
          discount_amount: 0,
          net_total: subtotal,
          payment_method: payload.payment_method,
        };
      }
      // Revert optimistic stock update on error
      for (const item of payload.items) {
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
      const res = await billingApi.today();
      useTransactionStore.getState().setTodayTransactions(res.transactions);
      return res.transactions;
    } catch (e) {
      if (e instanceof OfflineError) {
        console.warn('Offline — using local transactions');
        return useTransactionStore.getState().todayTransactions;
      }
      console.warn('fetchTodayTransactions error:', e);
      return useTransactionStore.getState().todayTransactions;
    }
  },

  async fetchByDateRange(from: string, to: string): Promise<Transaction[]> {
    try {
      return await billingApi.byDateRange(from, to);
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
    const { pendingBills, clearPendingBills } = useTransactionStore.getState();
    if (pendingBills.length === 0) return;
    const results = await Promise.allSettled(pendingBills.map(b => billingApi.create(b)));
    const allOk = results.every(r => r.status === 'fulfilled');
    if (allOk) {
      clearPendingBills();
      console.log(`Synced ${pendingBills.length} pending bills`);
    } else {
      const failed = results.filter(r => r.status === 'rejected').length;
      console.warn(`${failed} bills failed to sync — will retry`);
    }
  },
};
