import { productApi } from '../api/productApi';
import { useAuthStore, useProductStore } from '../../store';
import { Product, GlobalProduct } from '../../types';
import { OfflineError } from '../api/client';
import { v4 as uuidv4 } from 'uuid';

export const barcodeService = {

  async lookupBarcode(barcode: string): Promise<{
    product: Product | null;
    fromGlobal: boolean;
    globalProduct: GlobalProduct | null;
  }> {
    // Step 1: Check local cache (offline support)
    const cached = useProductStore.getState().products;
    const localMatch = cached.find(p => p.barcode === barcode);
    if (localMatch) {
      return { product: localMatch, fromGlobal: false, globalProduct: null };
    }

    // Step 2: Single API call replaces 3-tier Supabase lookup
    try {
      const res = await productApi.barcodeLookup(barcode);
      if (res.product) {
        return { product: res.product, fromGlobal: false, globalProduct: null };
      }
      if (res.globalProduct) {
        return { product: null, fromGlobal: true, globalProduct: res.globalProduct };
      }
      return { product: null, fromGlobal: false, globalProduct: null };
    } catch (e) {
      if (e instanceof OfflineError) {
        console.warn('Offline — barcode lookup unavailable');
        return { product: null, fromGlobal: false, globalProduct: null };
      }
      throw e;
    }
  },

  async createFromGlobal(globalProduct: GlobalProduct, salePrice: number): Promise<Product> {
    const { shop } = useAuthStore.getState();
    if (!shop) throw new Error('Not authenticated');

    const productData = {
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

    // Optimistic local save
    const optimistic: Product = {
      id: uuidv4(),
      updated_at: new Date().toISOString(),
      ...productData,
    };
    const current = useProductStore.getState().products;
    useProductStore.getState().setProducts([...current, optimistic]);

    try {
      const created = await productApi.create(productData);
      const updated = useProductStore.getState().products.map(p =>
        p.id === optimistic.id ? created : p
      );
      useProductStore.getState().setProducts(updated);
      return created;
    } catch (e) {
      if (e instanceof OfflineError) {
        console.warn('Offline — product saved locally');
        return optimistic;
      }
      throw e;
    }
  },
};
