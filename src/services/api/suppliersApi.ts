import { apiRequest } from './client';
import { Supplier } from '../../types';

export interface SupplierPurchase {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit: string;
  purchase_price: number;
  total_cost: number;
  notes?: string;
  created_at: string;
}

export interface SupplierPurchaseSummary {
  supplier: Supplier;
  purchases: SupplierPurchase[];
  total_spent: number;
  purchase_count: number;
}

export const suppliersApi = {
  async list(): Promise<Supplier[]> {
    return apiRequest<Supplier[]>('GET', '/suppliers');
  },

  async create(data: { name: string; phone?: string; address?: string; notes?: string }): Promise<Supplier> {
    return apiRequest<Supplier>('POST', '/suppliers', data);
  },

  async update(id: string, data: Partial<Supplier>): Promise<Supplier> {
    return apiRequest<Supplier>('PATCH', `/suppliers/${id}`, data);
  },

  async purchases(id: string): Promise<SupplierPurchaseSummary> {
    return apiRequest<SupplierPurchaseSummary>('GET', `/suppliers/${id}/purchases`);
  },
};
