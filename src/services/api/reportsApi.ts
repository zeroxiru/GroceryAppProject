import { apiRequest } from './client';

export type ReportPeriod = 'today' | 'week' | 'month';

export interface ReportSummary {
  period: ReportPeriod;
  total_sales: number;
  total_purchases: number;
  total_purchase_cost: number;
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
    // Backend summary and profit-loss are separate endpoints — fetch in parallel
    const [s, pl] = await Promise.all([
      apiRequest<any>('GET', `/reports/summary?period=${period}`),
      apiRequest<any>('GET', `/reports/profit-loss?period=${period}`).catch(() => null),
    ]);
    return {
      period,
      total_sales:          s?.total_revenue        ?? 0,
      total_purchases:      pl?.total_purchase_cost ?? 0,
      total_purchase_cost:  pl?.total_purchase_cost ?? 0,
      gross_profit:         pl?.gross_profit        ?? 0,
      transaction_count:    s?.total_bills          ?? 0,
      average_bill_value:   s?.average_bill_value   ?? 0,
      total_discount:       s?.total_discount       ?? 0,
      voided_count:         s?.voided_count         ?? 0,
      voided_amount:        s?.voided_amount        ?? 0,
      payment_breakdown:    s?.payment_breakdown    ?? {},
      daily_breakdown:      [],  // backend doesn't provide day-by-day breakdown yet
    };
  },

  async topProducts(): Promise<TopProduct[]> {
    // Backend wraps in { period, date_from, date_to, products: [] }
    const res = await apiRequest<{ products?: TopProduct[] }>('GET', '/reports/top-products');
    return res?.products ?? [];
  },

  async stockValuation(): Promise<StockValuation> {
    const res = await apiRequest<any>('GET', '/reports/stock-valuation');
    return {
      total_value:          res?.total_value         ?? 0,
      product_count:        res?.product_count       ?? 0,
      in_stock_count:       res?.stocked_count       ?? res?.in_stock_count ?? 0,
      low_stock_count:      res?.low_stock_count     ?? 0,
      out_of_stock_count:   res?.out_of_stock_count  ?? 0,
      top_value_products: (res?.top_value_products ?? []).map((p: any) => ({
        name:  p.product_name ?? p.name  ?? '',
        value: p.stock_value  ?? p.value ?? 0,
      })),
    };
  },
};
