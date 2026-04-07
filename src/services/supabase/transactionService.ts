import { v4 as uuidv4 } from 'uuid';
import { db } from './client';
import { Transaction, TransactionInput } from '../../types';
import { useAuthStore, useTransactionStore, useProductStore } from '../../store';
import { format } from 'date-fns';

export const transactionService = {
  async saveTransaction(input: TransactionInput): Promise<Transaction> {
    const { shop, user } = useAuthStore.getState();
    if (!shop || !user) throw new Error('Not authenticated');

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
      total_amount: +(input.quantity * input.unit_price).toFixed(2),
      notes: input.notes,
      voice_raw_text: input.voice_raw_text,
      is_synced: false,
      created_at: new Date().toISOString(),
      invoice_number: input.invoice_number,
    };

    // Save locally first — works offline
    useTransactionStore.getState().addTransaction(txn);

    if (input.product_id) {
      const delta = input.type === 'sale' ? -input.quantity : input.quantity;
      useProductStore.getState().updateStock(input.product_id, delta);
    }

    // Try to sync to Supabase
    try {
      const { error } = await db.transactions().insert({ ...txn, is_synced: true });
      if (error) throw error;
      txn.is_synced = true;
    } catch {
      console.warn('Offline — transaction saved locally, will sync later');
      useTransactionStore.getState().addPendingSync(txn);
    }

    return txn;
  },

  async fetchTodayTransactions(): Promise<Transaction[]> {
    const { shop } = useAuthStore.getState();
    if (!shop) return [];

    const today = format(new Date(), 'yyyy-MM-dd');

    try {
      const { data, error } = await db.transactions()
        .select('*')
        .eq('shop_id', shop.id)
        .gte('created_at', `${today}T00:00:00`)
        .lte('created_at', `${today}T23:59:59`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      useTransactionStore.getState().setTodayTransactions(data as Transaction[]);
      return data as Transaction[];
    } catch {
      console.warn('Offline — using local transactions');
      // Return locally stored transactions
      return useTransactionStore.getState().todayTransactions;
    }
  },

  async fetchByDateRange(from: string, to: string): Promise<Transaction[]> {
  const { shop } = useAuthStore.getState();
  if (!shop) return [];

  try {
    const { data, error } = await db.transactions()
      .select('*')
      .eq('shop_id', shop.id)
      .gte('created_at', `${from}T00:00:00`)
      .lte('created_at', `${to}T23:59:59`)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data as Transaction[];
  } catch {
    console.warn('Offline — using local transactions');
    // Fallback: filter local transactions by date range
    const allLocal = useTransactionStore.getState().todayTransactions;
    return allLocal.filter(t => {
      const date = t.created_at.split('T')[0];
      return date >= from && date <= to;
    });
  }
},

  async syncPending(): Promise<void> {
    const { pendingSync, clearPendingSync } = useTransactionStore.getState();
    if (pendingSync.length === 0) return;
    try {
      const { error } = await db.transactions()
        .insert(pendingSync.map(t => ({ ...t, is_synced: true })));
      if (!error) {
        clearPendingSync();
        console.log('Synced', pendingSync.length, 'pending transactions');
      }
    } catch {
      console.warn('Sync failed — will retry later');
    }
  },
};
