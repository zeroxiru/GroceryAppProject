import { apiRequest } from './client';
import { Product } from '../../types';

export type MovementType = 'stock_in' | 'damage' | 'loss' | 'expired' | 'theft';

export interface StockMovement {
  id: string;
  product_id: string;
  product_name: string;
  type: MovementType;
  quantity: number;
  quantity_before: number;
  quantity_after: number;
  reference?: string;
  notes?: string;
  user_name: string;
  supplier_id?: string;
  supplier_name?: string;
  created_at: string;
}

export const inventoryApi = {
  async stockIn(params: {
    product_id: string;
    quantity: number;
    purchase_price?: number;
    supplier_id?: string;
    notes?: string;
  }): Promise<void> {
    return apiRequest<void>('POST', '/inventory/stock-in', params);
  },

  async damage(params: {
    product_id: string;
    quantity: number;
    type: MovementType;
    notes?: string;
  }): Promise<void> {
    return apiRequest<void>('POST', '/inventory/damage', params);
  },

  async lowStock(): Promise<Product[]> {
    return apiRequest<Product[]>('GET', '/inventory/low-stock');
  },

  async expiring(days = 30): Promise<Product[]> {
    return apiRequest<Product[]>('GET', `/inventory/expiring?days=${days}`);
  },

  async movements(page = 1, type?: MovementType): Promise<StockMovement[]> {
    const q = type ? `?page=${page}&type=${type}` : `?page=${page}`;
    return apiRequest<StockMovement[]>('GET', `/inventory/movements${q}`);
  },
};
