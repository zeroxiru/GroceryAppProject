import { db } from './client';
import { Product } from '../../types';
import { useAuthStore, useProductStore } from '../../store';
import { v4 as uuidv4 } from 'uuid';

export const productService = {
  async fetchProducts(): Promise<Product[]> {
    const { shop } = useAuthStore.getState();
    if (!shop) return [];

    const { products: cached, lastFetched } = useProductStore.getState();

    // Use cache if fetched within last 30 minutes
    if (cached.length > 0 && lastFetched) {
      const age = Date.now() - new Date(lastFetched).getTime();
      if (age < 5 * 60 * 1000) {
        console.log('Using cached products:', cached.length);
        return cached;
      }
    }

    // Try to fetch fresh from Supabase
    try {
      const { data, error } = await db.products()
        .select('*')
        .eq('shop_id', shop.id)
        .eq('is_active', true)
        .order('name_bangla');

      if (error) throw error;

      useProductStore.getState().setProducts(data as Product[]);
      return data as Product[];
    } catch (e) {
      console.warn('Offline — using cached products:', cached.length);
      // Return cached products even if stale
      if (cached.length > 0) return cached;
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

    const newProduct = {
      id: uuidv4(),
      shop_id: shop.id,
      name_bangla: params.name_bangla,
      name_english: '',
      aliases: [],
      unit: params.unit,
      category: 'other',
      sale_price: params.sale_price,
      purchase_price: params.purchase_price ?? params.sale_price,
      current_stock: 0,
      min_stock_alert: 0,
      is_active: true,
    };

    // Save to local store immediately (works offline)
    const current = useProductStore.getState().products;
    useProductStore.getState().setProducts([...current, newProduct as Product]);

    // Try to sync to Supabase
    try {
      const { data, error } = await db.products()
        .insert(newProduct)
        .select()
        .single();
      if (error) throw error;
      return data as Product;
    } catch {
      console.warn('Offline — product saved locally only');
      return newProduct as Product;
    }
  },
};
