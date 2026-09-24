import { apiRequest } from './client';
import { Product, GlobalProduct } from '../../types';

export interface ProductListResponse {
  products: Product[];
  total: number;
  page: number;
}

export interface BarcodeResult {
  product: Product | null;
  globalProduct: GlobalProduct | null;
  found: boolean;
}

export interface BulkImportRow {
  name_bangla?: string;
  name_english?: string;
  brand?: string;
  category?: string;
  size?: string;
  unit?: string;
  sale_price?: number;
  purchase_price?: number;
  mrp?: number;
  current_stock?: number;
  min_stock_alert?: number;
  barcode?: string;
  origin_country?: string;
  expiry_date?: string;
}

export interface BulkImportResult {
  imported: number;
  failed: number;
  errors?: { row: number; message: string }[];
}

// The backend allows up to 2000 per page. One big page (not many small ones) matters: it orders by created_at, and rows
// that share a timestamp come back in an unstable order between pages -> duplicated and missing products.
const PAGE_SIZE = 1000;

export const productApi = {
  /** Fetch a single page (low-level). Prefer listAll() for most callers. */
  async list(page = 1, limit = PAGE_SIZE): Promise<Product[]> {
    return apiRequest<Product[]>('GET', `/products?page=${page}&limit=${limit}`);
  },

  /** Fetch every product for the shop by walking all pages until exhausted. */
  async listAll(): Promise<Product[]> {
    let page = 1;
    const all: Product[] = [];
    while (page <= 50) { // safety cap: 50 × 200 = 10 000 products max
      const batch = await apiRequest<Product[]>('GET', `/products?page=${page}&limit=${PAGE_SIZE}`);
      if (!Array.isArray(batch) || batch.length === 0) break;
      const seen = new Set(all.map(p => p.id));
      const fresh = batch.filter(p => !seen.has(p.id)); // never show the same product twice
      if (fresh.length === 0) break;                    // server repeated a page we already have
      all.push(...fresh);
      if (batch.length < PAGE_SIZE) break; // last page — got fewer than a full batch
      page++;
    }
    return all;
  },

  async search(q: string): Promise<Product[]> {
    const res = await apiRequest<Product[]>('GET', `/products/search?q=${encodeURIComponent(q)}`);
    return res;
  },

  async barcodeLookup(code: string): Promise<BarcodeResult> {
    return apiRequest<BarcodeResult>('GET', `/products/barcode/${encodeURIComponent(code)}`);
  },

  async create(data: Omit<Product, 'id' | 'updated_at'>): Promise<Product> {
    return apiRequest<Product>('POST', '/products', data);
  },

  async update(id: string, data: Partial<Product>): Promise<Product> {
    return apiRequest<Product>('PATCH', `/products/${id}`, data);
  },

  async remove(id: string): Promise<void> {
    return apiRequest<void>('DELETE', `/products/${id}`);
  },

  async generateBarcode(id: string): Promise<{ barcode: string }> {
    return apiRequest<{ barcode: string }>('POST', `/products/${id}/generate-barcode`);
  },

  async bulkImport(products: BulkImportRow[]): Promise<BulkImportResult> {
    return apiRequest<BulkImportResult>('POST', '/products/bulk-import', { products });
  },
};
