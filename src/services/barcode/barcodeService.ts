import { productApi } from '../api/productApi';
import { useAuthStore, useProductStore } from '../../store';
import { Product, GlobalProduct } from '../../types';
import { OfflineError } from '../api/client';
import { v4 as uuidv4 } from 'uuid';
import { findProductByBarcode } from './barcodeIndex';

/** A server lookup that has not answered in this long is treated like "no connection" instead of freezing the scanner. */
const LOOKUP_TIMEOUT_MS = 6000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new OfflineError()), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

/** The other common spelling of the same code (UPC-A <-> EAN-13 with a leading 0), for the server fallback. */
function alternateForm(code: string): string | null {
  const c = code.trim();
  if (/^0\d{12}$/.test(c)) return c.slice(1);
  if (/^\d{12}$/.test(c)) return `0${c}`;
  return null;
}

export const barcodeService = {

  /** Instant, no network: the phone's own product list, format-tolerant (see barcodeIndex.ts). */
  findLocal(barcode: string): Product | null {
    return findProductByBarcode(useProductStore.getState().products, barcode) ?? null;
  },

  async lookupBarcode(barcode: string): Promise<{
    product: Product | null;
    fromGlobal: boolean;
    globalProduct: GlobalProduct | null;
    /** True when the server could not be reached in time — "not found" then means "don't know", not "not in the shop". */
    networkIssue?: boolean;
  }> {
    // Step 1: local list (offline support) — O(1) and tolerant of UPC-A / EAN-13 / UPC-E spellings
    const localMatch = barcodeService.findLocal(barcode);
    if (localMatch) {
      return { product: localMatch, fromGlobal: false, globalProduct: null };
    }

    // Step 2: server, with a time limit. The list on the phone can be older than the shop (a product added on the web POS
    // a minute ago), so a local miss still asks the server before giving up.
    try {
      const tryOne = async (code: string) => {
        const res = await withTimeout(productApi.barcodeLookup(code), LOOKUP_TIMEOUT_MS);
        if (res.product) return { product: res.product, fromGlobal: false, globalProduct: null };
        if (res.globalProduct) return { product: null, fromGlobal: true, globalProduct: res.globalProduct };
        return null;
      };
      const first = await tryOne(barcode);
      if (first) return first;
      const alt = alternateForm(barcode);
      if (alt) {
        const second = await tryOne(alt);
        if (second) return second;
      }
      return { product: null, fromGlobal: false, globalProduct: null };
    } catch (e) {
      if (e instanceof OfflineError) {
        console.warn('Offline / slow — barcode lookup unavailable');
        return { product: null, fromGlobal: false, globalProduct: null, networkIssue: true };
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
