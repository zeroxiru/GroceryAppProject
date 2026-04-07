import { db, supabase } from '../supabase/client';
import { useAuthStore, useProductStore } from '../../store';
import { Product, GlobalProduct } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export const barcodeService = {

  // Main lookup — checks shop products first, then global
  async lookupBarcode(barcode: string): Promise<{
    product: Product | null;
    fromGlobal: boolean;
    globalProduct: GlobalProduct | null;
  }> {
    const { shop } = useAuthStore.getState();
    if (!shop) return { product: null, fromGlobal: false, globalProduct: null };

    // Step 1: Check local cache first (offline support)
    const cached = useProductStore.getState().products;
    const localMatch = cached.find(p => p.barcode === barcode);
    if (localMatch) {
      return { product: localMatch, fromGlobal: false, globalProduct: null };
    }

    // Step 2: Search shop's own products in Supabase
    try {
      const { data: shopProduct } = await db.products()
        .select('*')
        .eq('shop_id', shop.id)
        .eq('barcode', barcode)
        .single();

      if (shopProduct) {
        return { product: shopProduct as Product, fromGlobal: false, globalProduct: null };
      }
    } catch { /* not found, continue */ }

    // Step 3: Search global products master table
    try {
     const { data: globalProduct } = await db.global_products()
  .select('*')
  .eq('barcode', barcode)
  .single();

      if (globalProduct) {
        return { product: null, fromGlobal: true, globalProduct: globalProduct as GlobalProduct };
      }
    } catch { /* not found */ }

    return { product: null, fromGlobal: false, globalProduct: null };
  },

  // Create shop product from global product template
  async createFromGlobal(
    globalProduct: GlobalProduct,
    salePrice: number
  ): Promise<Product> {
    const { shop } = useAuthStore.getState();
    if (!shop) throw new Error('Not authenticated');

    const newProduct: Product = {
      id: uuidv4(),
      shop_id: shop.id,
      name_bangla: globalProduct.name_bangla ?? globalProduct.name_english,
      name_english: globalProduct.name_english,
      aliases: [globalProduct.brand ?? '', globalProduct.name_english.toLowerCase()].filter(Boolean),
      unit: globalProduct.unit as any,
      category: globalProduct.category,
      sale_price: salePrice,
      purchase_price: globalProduct.standard_price ?? 0,
      current_stock: 0,
      min_stock_alert: 0,
      is_active: true,
      barcode: globalProduct.barcode,
      brand: globalProduct.brand,
      origin_country: globalProduct.origin_country,
      mrp: globalProduct.standard_mrp,
    };

    // Save locally first
    const current = useProductStore.getState().products;
    useProductStore.getState().setProducts([...current, newProduct]);

    // Sync to Supabase
    try {
      await db.products().insert(newProduct);
    } catch (e) {
      console.warn('Offline — product saved locally');
    }

    return newProduct;
  },
};