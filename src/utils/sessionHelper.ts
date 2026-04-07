import { SaleItem, ParsedCommand } from '../types';

export function buildSaleItem(parsedCmd: ParsedCommand): SaleItem | null {
  if (!parsedCmd.product_name || !parsedCmd.quantity || !parsedCmd.price) {
    return null;
  }
  return {
    product_name: parsedCmd.product_name,
    product_id: parsedCmd.matched_product?.id,
    quantity: parsedCmd.quantity,
    unit: parsedCmd.unit ?? parsedCmd.matched_product?.unit ?? 'kg',
    unit_price: parsedCmd.price,
    total: +(parsedCmd.quantity * parsedCmd.price).toFixed(2),
  };
}
