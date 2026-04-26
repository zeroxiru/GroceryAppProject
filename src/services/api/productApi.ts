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

export const productApi = {
  async list(page = 1, limit = 200): Promise<Product[]> {
    return apiRequest<Product[]>('GET', `/products?page=${page}&limit=${limit}`);
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
