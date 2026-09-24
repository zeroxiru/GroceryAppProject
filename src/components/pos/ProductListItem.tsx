import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Product } from '@/types';
import { POS, tagColorFor } from '@/constants/posTokens';
import { FONT_SIZES, UNITS } from '@/constants';

interface Props {
  product: Product;
  /** Quantity of this product in the active customer's cart (0 = not in cart). */
  qty: number;
  onAdd: (product: Product) => void;
  onStep: (product: Product, direction: 1 | -1) => void;
  /** Long-press the quantity to type an exact amount (e.g. 2.5 kg) instead of tapping through quarter steps. */
  onExact: (product: Product) => void;
}

export function formatQty(q: number): string {
  return q % 1 === 0 ? String(q) : q.toFixed(2).replace(/0+$/, '');
}

/**
 * One row of the product list (design system's ProductListItem). Three
 * states, one layout, so the shopkeeper never re-learns the row mid-sale:
 * normal, low/out of stock, and "no barcode yet".
 */
function ProductListItemImpl({ product, qty, onAdd, onStep, onExact }: Props) {
  const stock = Number(product.current_stock ?? 0);
  const min = Number(product.min_stock_alert ?? 0);
  const out = stock <= 0;
  const low = !out && (min > 0 ? stock <= min : stock <= 5);
  const noBarcode = !product.barcode;
  const unitLabel = UNITS[product.unit]?.bangla ?? product.unit;
  const initial = (product.name_bangla || product.name_english || '?').trim().charAt(0);

  return (
    <View style={[styles.row, noBarcode && styles.rowNoBarcode]}>
      <View style={[styles.tile, { backgroundColor: tagColorFor(product.category) }]}>
        <Text style={styles.tileTxt}>{initial}</Text>
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.name} numberOfLines={1}>{product.name_bangla || product.name_english}</Text>
        <View style={styles.priceLine}>
          <Text style={styles.price}>৳{product.sale_price}</Text>
          <Text style={styles.unit}>/{unitLabel}</Text>
          {out ? (
            <View style={[styles.pill, { backgroundColor: POS.danger100 }]}>
              <Text style={[styles.pillTxt, { color: POS.danger600 }]}>স্টক নেই</Text>
            </View>
          ) : low ? (
            <View style={[styles.pill, { backgroundColor: POS.warning100 }]}>
              <Text style={[styles.pillTxt, { color: POS.warning600 }]}>মজুদ কম · {formatQty(stock)}</Text>
            </View>
          ) : noBarcode ? (
            <Text style={styles.noBarcode}>বারকোড নেই</Text>
          ) : (
            <Text style={styles.code} numberOfLines={1}>{product.barcode}</Text>
          )}
        </View>
      </View>

      {qty > 0 ? (
        <View style={styles.stepper}>
          <TouchableOpacity style={styles.stepBtn} onPress={() => onStep(product, -1)} hitSlop={{ top: 8, bottom: 8, left: 6, right: 2 }}>
            <Ionicons name="remove" size={18} color={POS.ink900} />
          </TouchableOpacity>
          <TouchableOpacity onLongPress={() => onExact(product)} onPress={() => onExact(product)} activeOpacity={0.6}>
            <Text style={styles.qty}>{formatQty(qty)}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.stepBtn, styles.stepBtnPlus]} onPress={() => onStep(product, 1)} hitSlop={{ top: 8, bottom: 8, left: 2, right: 6 }}>
            <Ionicons name="add" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.addBtn} onPress={() => onAdd(product)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.8}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

// Long lists re-render on every cart change; only rows whose product or quantity changed need to.
export default React.memo(ProductListItemImpl, (a, b) =>
  a.product === b.product && a.qty === b.qty && a.onAdd === b.onAdd && a.onStep === b.onStep && a.onExact === b.onExact);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: POS.border200,
  },
  rowNoBarcode: { borderStyle: 'dashed', borderColor: POS.warning600 },
  tile: { width: 42, height: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  tileTxt: { fontSize: FONT_SIZES.md, fontWeight: '800', color: POS.tagInk },
  name: { fontSize: FONT_SIZES.md, fontWeight: '600', color: POS.ink900 },
  priceLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  price: { fontSize: FONT_SIZES.md, fontWeight: '700', color: POS.ink900, fontVariant: ['tabular-nums'] },
  unit: { fontSize: FONT_SIZES.xs, color: POS.ink600 },
  code: { flexShrink: 1, fontSize: 11, color: POS.ink400, fontVariant: ['tabular-nums'] },
  noBarcode: { fontSize: 11, fontWeight: '600', color: POS.warning600 },
  pill: { paddingHorizontal: 8, paddingVertical: 1, borderRadius: 999 },
  pillTxt: { fontSize: 11, fontWeight: '700' },
  addBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: POS.brand600, alignItems: 'center', justifyContent: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: POS.surface200, borderRadius: 999, padding: 3 },
  stepBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  stepBtnPlus: { backgroundColor: POS.brand600 },
  qty: { minWidth: 30, textAlign: 'center', fontSize: FONT_SIZES.md, fontWeight: '800', color: POS.ink900, fontVariant: ['tabular-nums'] },
});
