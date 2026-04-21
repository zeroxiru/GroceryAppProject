import { apiRequest } from './client';
import { Shop } from '../../types';

export interface ShopSettings extends Shop {
  currency?: string;
  tax_rate?: number;
  receipt_header?: string;
}

export const shopApi = {
  async getMe(): Promise<ShopSettings> {
    return apiRequest<ShopSettings>('GET', '/shops/me');
  },

  async update(data: Partial<ShopSettings>): Promise<ShopSettings> {
    return apiRequest<ShopSettings>('PUT', '/shops/me', data);
  },
};
