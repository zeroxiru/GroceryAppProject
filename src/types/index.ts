export type Unit = 'kg' | 'gram' | 'litre' | 'ml' | 'piece' | 'dozen' | 'packet' | 'bag';
export type TransactionType = 'sale' | 'purchase';
export type ShopType = 'grocery' | 'cosmetics' | 'imported' | 'mixed';
export type ProductCategory = 'grain' | 'oil' | 'spice' | 'vegetable' | 'fish_meat' | 'dairy' | 'beverage' | 'snack' | 'cleaning' | 'other';
export type VoiceStatus = 'idle' | 'listening' | 'processing' | 'confirming' | 'saving' | 'error';

export interface Shop {
  id: string;
  name: string;
  phone: string;
  address?: string;
  owner_name?: string;
  pin?: string;
  shop_type?: 'grocery' | 'cosmetics' | 'imported' | 'mixed';
  voice_language?: string;
  created_at?: string;
}

export interface User {
  id: string;
  shop_id: string;
  name: string;
  phone?: string;
  pin: string;
  role: 'owner' | 'helper';
  is_active: boolean;
  created_at: string;
}

export interface Product {
  id: string;
  shop_id: string;
  name_bangla: string;
  name_english?: string;
  aliases?: string[];
  unit: Unit;
  category: string;
  sale_price: number;
  purchase_price: number;
  current_stock: number;
  min_stock_alert: number;
  is_active: boolean;
  barcode?: string;
  brand?: string;
  origin_country?: string;
  expiry_date?: string;
  mrp?: number;
  discount_percent?: number;
  created_at?: string;
  updated_at: string;
  size?: string;
}

export type PaymentMethod = 'cash' | 'bkash' | 'nagad' | 'card' | 'credit';

export interface Transaction {
  id: string;
  shop_id: string;
  user_id: string;
  user_name: string;
  type: TransactionType;
  product_id: string;
  product_name: string;
  quantity: number;
  unit: Unit;
  unit_price: number;
  total_amount: number;
  subtotal?: number;
  net_total?: number;
  discount_type?: 'percentage' | 'amount';
  discount_value?: number;
  discount_amount?: number;
  invoice_number?: string;
  customer_name?: string;
  payment_method?: PaymentMethod;
  notes?: string;
  voided?: boolean;
  is_synced: boolean;
  created_at: string;
}

export interface TransactionInput {
  type: TransactionType;
  product_id?: string;
  product_name: string;
  quantity: number;
  unit: Unit;
  unit_price: number;
  payment_method?: PaymentMethod;
  notes?: string;
  voice_raw_text?: string;
  customer_name?: string;
  invoice_number?: string;
  discount_type?: 'percentage' | 'amount';
  discount_value?: number;
  discount_amount?: number;
  subtotal?: number;
  net_total?: number;
}

export interface ParsedCommand {
  action: 'sale' | 'purchase' | 'stock_check' | 'daily_summary' | 'unknown';
  product_name?: string;
  matched_product?: Product;
  quantity?: number;
  unit?: Unit;
  price?: number;
  total?: number;
  confidence: number;
}

export interface DailySummary {
  id: string;
  shop_id: string;
  date: string;
  total_sales: number;
  total_purchases: number;
  gross_profit: number;
  transaction_count: number;
  created_at: string;
}

export interface SaleSession {
  items: SaleItem[];
  customer_name?: string;
  created_at: string;
}

export interface SaleItem {
  product_name: string;
  product_id?: string;
  quantity: number;
  unit: Unit;
  unit_price: number;
  total: number;
}

export interface GlobalProduct {
  id: string;
  barcode: string;
  name_english: string;
  name_bangla?: string;
  brand?: string;
  category: string;
  sub_category?: string;
  origin_country?: string;
  unit: string;
  size?: string;
  standard_mrp: number;
  standard_price: number;
  description?: string;
}
