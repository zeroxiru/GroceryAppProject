import { apiRequest } from './client';

export interface CreditAgingCustomer {
  customer_name: string;
  total_outstanding: number;
  oldest_unpaid_date: string;
  overdue_days: number;
  invoice_count: number;
}

export const customersApi = {
  async creditAging(): Promise<CreditAgingCustomer[]> {
    return apiRequest<CreditAgingCustomer[]>('GET', '/customers/credit-aging');
  },
};
