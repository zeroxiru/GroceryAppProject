import { apiRequest } from './client';

export type ReportPeriod = 'today' | 'week' | 'month';

export interface ReportSummary {
  period: ReportPeriod;
  total_sales: number;
  total_purchases: number;
  gross_profit: number;
  transaction_count: number;
  average_bill_value: number;
  total_discount: number;
  voided_count: number;
  voided_amount: number;
  payment_breakdown: Record<string, number>;
  daily_breakdown: { date: string; sales: number; purchases: number }[];
}

export interface TopProduct {
  product_id: string;
  product_name: string;
  total_quantity: number;
  total_revenue: number;
}

export interface StockValuation {
  total_value: number;
  product_count: number;
  in_stock_count: number;
  low_stock_count: number;
  out_of_stock_count: number;
  top_value_products: { name: string; value: number }[];
}

export const reportsApi = {
  async summary(period: ReportPeriod): Promise<ReportSummary> {
    return apiRequest<ReportSummary>('GET', `/reports/summary?period=${period}`);
  },

  async topProducts(): Promise<TopProduct[]> {
    return apiRequest<TopProduct[]>('GET', '/reports/top-products');
  },

  async stockValuation(): Promise<StockValuation> {
    return apiRequest<StockValuation>('GET', '/reports/stock-valuation');
  },
};
