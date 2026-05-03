import { productApi } from '../api/productApi';
import { Product } from '../../types';
import { useAuthStore, useProductStore } from '../../store';
import { OfflineError } from '../api/client';
import { v4 as uuidv4 } from 'uuid';

export const productService = {
  async fetchProducts(): Promise<Product[]> {
    const { products: cached } = useProductStore.getState();

    const doFetch = async () => {
      const fresh = await productApi.listAll();
      useProductStore.getState().setProducts(fresh);
      return fresh;
    };

    if (cached.length > 0) {
      // Serve cache immediately; refresh in background so the count updates within seconds
      doFetch().catch(e => {
        if (!(e instanceof OfflineError)) console.warn('fetchProducts bg refresh:', e);
      });
      return cached;
    }

    // No cache — wait for first load
    try {
      return await doFetch();
    } catch (e) {
      if (e instanceof OfflineError) {
        console.warn('Offline — no cached products');
        return [];
      }
      console.warn('fetchProducts error:', e);
      return [];
    }
  },

  async addNewProduct(params: {
    name_bangla: string;
    unit: string;
    sale_price: number;
    purchase_price?: number;
  }): Promise<Product> {
    const { shop } = useAuthStore.getState();
    if (!shop) throw new Error('Not authenticated');

    const optimistic: Product = {
      id: uuidv4(),
      shop_id: shop.id,
      name_bangla: params.name_bangla,
      name_english: '',
      aliases: [],
      unit: params.unit as any,
      category: 'other',
      sale_price: params.sale_price,
      purchase_price: params.purchase_price ?? params.sale_price,
      current_stock: 0,
      min_stock_alert: 0,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    // Save locally first (offline-first)
    const current = useProductStore.getState().products;
    useProductStore.getState().setProducts([...current, optimistic]);

    try {
      const created = await productApi.create({
        shop_id: shop.id,
        name_bangla: params.name_bangla,
        name_english: '',
        aliases: [],
        unit: params.unit as any,
        category: 'other',
        sale_price: params.sale_price,
        purchase_price: params.purchase_price ?? params.sale_price,
        current_stock: 0,
        min_stock_alert: 0,
        is_active: true,
      });
      // Replace optimistic record with server record
      const updated = useProductStore.getState().products.map(p =>
        p.id === optimistic.id ? created : p
      );
      useProductStore.getState().setProducts(updated);
      return created;
    } catch (e) {
      if (e instanceof OfflineError) {
        console.warn('Offline — product saved locally only');
        return optimistic;
      }
      throw e;
    }
  },
};
