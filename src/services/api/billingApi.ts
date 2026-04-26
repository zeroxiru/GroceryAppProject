import { apiRequest } from './client';
import { Transaction, Unit } from '../../types';

export type PaymentMethod = 'cash' | 'bkash' | 'nagad' | 'card' | 'credit';

export interface BillingItem {
  product_id?: string;
  product_name: string;
  quantity: number;
  unit: Unit;
  unit_price: number;
}

export interface BillingPayload {
  items: BillingItem[];
  customer_name?: string;
  payment_method: PaymentMethod;
  discount_type?: 'percentage' | 'amount';
  discount_value?: number;
  notes?: string;
}

export interface BillingResponse {
  invoice_number: string;
  created_at: string;
  items: Transaction[];
  subtotal: number;
  discount_amount: number;
  net_total: number;
  payment_method: PaymentMethod;
  customer_name?: string;
  customer_id?: string;
}

export interface TodayBillingResponse {
  transactions: Transaction[];
  total_sales: number;
  total_purchases: number;
}

export const billingApi = {
  async create(payload: BillingPayload): Promise<BillingResponse> {
    return apiRequest<BillingResponse>('POST', '/billing', payload);
  },

  async today(): Promise<TodayBillingResponse> {
    return apiRequest<TodayBillingResponse>('GET', '/billing/today');
  },

  async byDateRange(from: string, to: string): Promise<Transaction[]> {
    return apiRequest<Transaction[]>('GET', `/billing?from=${from}&to=${to}`);
  },

  async getOne(invoiceNo: string): Promise<BillingResponse> {
    return apiRequest<BillingResponse>('GET', `/billing/${invoiceNo}`);
  },

  async voidInvoice(invoiceNo: string): Promise<void> {
    return apiRequest<void>('POST', `/billing/${invoiceNo}/void`);
  },
};
