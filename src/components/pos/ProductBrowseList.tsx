import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, Modal, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Product } from '@/types';
import { useCartStore, qtyStep } from '@/store';
import { POS } from '@/constants/posTokens';
import { FONT_SIZES, UNITS } from '@/constants';
import ProductListItem, { formatQty } from './ProductListItem';

interface Props {
  products: Product[];
  category: string | null;
  /** Brand filter inside the category (lower-cased, trimmed brand), or null for all brands. */
  brand?: string | null;
  /** product_id → number of times sold today; anything sold today floats to the top. */
  salesCount: Record<string, number>;
  /** Space to leave under the last row so the floating bill bar never hides it. */
  bottomInset: number;
  onAdd: (product: Product) => void;
  /** Loose items: open the weight / amount sheet. */
  onLoose: (product: Product) => void;
}

/**
 * The /pos main area: every product, filtered by the category rail, each row
 * acting directly on the active customer's cart. This is what replaces the
 * old "today's transactions" panel — the counter screen is for finding and
 * adding items, not reading history.
 */
export default function ProductBrowseList({ products, category, brand = null, salesCount, bottomInset, onAdd, onLoose }: Props) {
  const cart = useCartStore(s => s.activeCart());
  const [exactFor, setExactFor] = useState<Product | null>(null);
  const [exactText, setExactText] = useState('');

  const qtyByProduct = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of cart?.items ?? []) if (i.product_id) m[i.product_id] = (m[i.product_id] ?? 0) + i.quantity;
    return m;
  }, [cart]);

  const rows = useMemo(() => {
    let list = category ? products.filter(p => p.category === category) : products;
    if (category && brand) list = list.filter(p => (p.brand ?? '').trim().toLowerCase() === brand);
    return [...list].sort((a, b) => {
      const sa = salesCount[a.id] ?? 0;
      const sb = salesCount[b.id] ?? 0;
      if (sa !== sb) return sb - sa;
      return (a.name_bangla || a.name_english || '').localeCompare(b.name_bangla || b.name_english || '');
    });
  }, [products, category, brand, salesCount]);

  // Stable callbacks (read the store at call time) so memoised rows don't re-render on every cart change.
  const handleStep = useCallback((product: Product, direction: 1 | -1) => {
    const s = useCartStore.getState();
    const line = s.activeCart().items.find(i => i.product_id === product.id);
    const unit = line?.unit ?? product.unit;
    s.changeQuantity(s.activeCart().id, product.id, direction * qtyStep(unit));
  }, []);

  const handleExact = useCallback((product: Product) => {
    const line = useCartStore.getState().activeCart().items.find(i => i.product_id === product.id);
    setExactText(line ? formatQty(line.quantity) : '');
    setExactFor(product);
  }, []);

  const confirmExact = () => {
    if (exactFor) {
      const q = parseFloat(exactText.replace(',', '.'));
      if (!isNaN(q)) {
        const s = useCartStore.getState();
        s.setQuantity(s.activeCart().id, exactFor.id, q);
      }
    }
    setExactFor(null);
  };

  const exactUnit = exactFor ? (UNITS[exactFor.unit]?.bangla ?? exactFor.unit) : '';

  return (
    <>
      <FlatList
        data={rows}
        keyExtractor={p => p.id}
        extraData={qtyByProduct}
        renderItem={({ item }) => (
          <ProductListItem
            product={item}
            qty={qtyByProduct[item.id] ?? 0}
            onAdd={onAdd}
            onStep={handleStep}
            onExact={handleExact}
            onLoose={onLoose}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: bottomInset }}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>এই ক্যাটাগরিতে কোনো পণ্য নেই</Text>
            <Text style={styles.emptyHint}>উপরের সার্চ বার দিয়ে পণ্য খুঁজুন</Text>
          </View>
        }
      />

      <Modal visible={!!exactFor} transparent animationType="fade" onRequestClose={() => setExactFor(null)}>
        <View style={styles.overlay}>
          <View style={styles.card}>
            <Text style={styles.cardTitle} numberOfLines={2}>{exactFor?.name_bangla || exactFor?.name_english}</Text>
            <Text style={styles.cardHint}>কতটুকু? (একক: {exactUnit})</Text>
            <TextInput
              style={styles.input}
              value={exactText}
              onChangeText={setExactText}
              keyboardType="decimal-pad"
              autoFocus
              selectTextOnFocus
              placeholder="যেমন: 2.5"
              placeholderTextColor={POS.ink400}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity style={[styles.btn, { backgroundColor: POS.surface200 }]} onPress={() => setExactFor(null)}>
                <Text style={{ fontWeight: '600', color: POS.ink900 }}>বাতিল</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, { backgroundColor: POS.brand600 }]} onPress={confirmExact}>
                <Text style={{ fontWeight: '700', color: '#fff' }}>ঠিক আছে</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', paddingTop: 48, gap: 6 },
  emptyTitle: { fontSize: FONT_SIZES.md, fontWeight: '600', color: POS.ink600 },
  emptyHint: { fontSize: FONT_SIZES.sm, color: POS.ink400 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 20, width: '100%' },
  cardTitle: { fontSize: FONT_SIZES.md, fontWeight: '700', color: POS.ink900 },
  cardHint: { fontSize: FONT_SIZES.sm, color: POS.ink600, marginTop: 4, marginBottom: 10 },
  input: {
    borderWidth: 1.5, borderColor: POS.border600, borderRadius: 12, height: 52,
    paddingHorizontal: 14, fontSize: FONT_SIZES.xl, fontWeight: '700', color: POS.ink900,
  },
  btn: { flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
