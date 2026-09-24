import type { Product } from '@/types';
import type { CartItem } from '@/store';

/**
 * Loose ("open") items follow the platform convention (migration 012, web-pos OpenProductModal):
 *   unit = 'gram', sale_price = price PER GRAM, current_stock = GRAMS, is_bulk = true.
 * Everything is calculated in grams; kilograms are only ever a *display* format, so the
 * shopkeeper and the customer never see two different units for the same item.
 */
export function isLoose(p: Pick<Product, 'unit' | 'is_bulk'>): boolean {
  return p.is_bulk === true || p.unit === 'gram';
}

const trim = (n: number, dp: number) => String(parseFloat(n.toFixed(dp)));

/** 500 → "500 গ্রাম", 1250 → "1.25 কেজি" */
export function formatWeight(grams: number): string {
  const g = Number(grams) || 0;
  if (Math.abs(g) >= 1000) return `${trim(g / 1000, 2)} কেজি`;
  return `${trim(g, 1)} গ্রাম`;
}

/** Price per gram → price per kg, for display only (0.065 → 65). */
export function pricePerKg(pricePerGram: number): number {
  return Math.round(Number(pricePerGram) * 1000 * 100) / 100;
}

export function formatPricePerKg(pricePerGram: number): string {
  return `৳${pricePerKg(pricePerGram).toLocaleString('en-BD', { maximumFractionDigits: 2 })}/কেজি`;
}

/** Cart line label: "500 গ্রাম × ৳160/কেজি" for loose lines, "2pcs×৳50" style for the rest. */
export function formatCartQty(item: Pick<CartItem, 'quantity' | 'unit' | 'unit_price'>): string {
  // Whole-taka pricing derives unit_price from the total, so a per-kg rate here would read ৳66 for a ৳65 item. Show weight only.
  if (item.unit === 'gram') return formatWeight(item.quantity);
  return `${item.quantity}${item.unit}×৳${item.unit_price}`;
}
