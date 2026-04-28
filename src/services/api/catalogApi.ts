import { apiRequest } from './client';
import { CatalogCategory } from '../../types';

export const catalogApi = {
  async getCategories(): Promise<CatalogCategory[]> {
    return apiRequest<CatalogCategory[]>('GET', '/catalog/categories');
  },
};
