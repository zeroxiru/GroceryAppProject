import { apiRequest } from './client';
import { Shop, User } from '../../types';

export interface AdminShop extends Shop {
  user_count: number;
  product_count: number;
  transaction_count: number;
  last_activity?: string;
  is_suspended?: boolean;
}

export interface AdminUser extends User {
  shop_name?: string;
}

export interface AdminStats {
  total_shops: number;
  active_shops: number;
  suspended_shops: number;
  total_users: number;
  total_products: number;
  total_transactions: number;
  revenue_today: number;
  new_shops_this_month: number;
}

export const adminApi = {
  async stats(): Promise<AdminStats> {
    return apiRequest<AdminStats>('GET', '/admin/stats');
  },

  async listShops(page = 1, search?: string): Promise<{ shops: AdminShop[]; total: number }> {
    const q = search ? `?page=${page}&search=${encodeURIComponent(search)}` : `?page=${page}`;
    return apiRequest<{ shops: AdminShop[]; total: number }>('GET', `/admin/shops${q}`);
  },

  async listUsers(page = 1): Promise<{ users: AdminUser[]; total: number }> {
    return apiRequest<{ users: AdminUser[]; total: number }>('GET', `/admin/users?page=${page}`);
  },

  async suspendShop(id: string): Promise<void> {
    return apiRequest<void>('POST', `/admin/shops/${id}/suspend`);
  },

  async reactivateShop(id: string): Promise<void> {
    return apiRequest<void>('POST', `/admin/shops/${id}/reactivate`);
  },
};
