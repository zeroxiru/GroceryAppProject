import React, { useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Product } from '@/types';
import { COLORS, FONT_SIZES } from '@/constants';
import { ProductSearchIndex } from '@/services/search/productSearch';

interface Props {
  products: Product[];
  onSelect: (product: Product) => void;
  onScanPress: () => void;
  placeholder?: string;
  /**
   * Shown when the bar is focused but empty, so a shopkeeper can find a
   * common item without typing (PRD FR-4). Optional — a page with no sale
   * history to draw from (e.g. Inventory) can simply omit these and the
   * empty-focused state stays blank.
   */
  recentProducts?: Product[];
  frequentProducts?: Product[];
}

function ProductRow({ item, onPress }: { item: Product; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.resultRow} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.resultThumb}>
        <Text style={styles.resultThumbTxt}>{(item.name_bangla || item.name_english || '?').charAt(0)}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.resultName} numberOfLines={1}>{item.name_bangla}</Text>
        <Text style={styles.resultMeta} numberOfLines={1}>
          {item.name_english ? `${item.name_english} · ` : ''}৳{item.sale_price} · স্টক {item.current_stock}
        </Text>
      </View>
      <View style={styles.resultAddBtn}>
        <Ionicons name="add" size={18} color="#fff" />
      </View>
    </TouchableOpacity>
  );
}

/**
 * The POS screen's headline requirement: type a single character — Bangla or
 * English — and a ranked, live result list appears directly under this bar.
 * No search button, no debounce long enough to feel like lag. Matches
 * PRD "POS Redesign — PRD.md" §2 Goal 1 and §6.A.
 *
 * The Fuse index is built ONCE per `products` change (see the useMemo below),
 * never rebuilt per keystroke — that's what keeps every keystroke instant.
 */
export default function InstantSearchBar({
  products, onSelect, onScanPress, placeholder, recentProducts = [], frequentProducts = [],
}: Props) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);

  // Rebuilt only when the product list itself changes — not on every keystroke.
  const index = useMemo(() => new ProductSearchIndex(products), [products]);

  // Every character — including the first — re-queries the in-memory index.
  const results = useMemo(() => index.search(query), [index, query]);

  const isEmpty = query.trim().length === 0;
  const showResults = focused && !isEmpty;
  const hasEmptyState = recentProducts.length > 0 || frequentProducts.length > 0;
  const showEmptyState = focused && isEmpty && hasEmptyState;

  const handleSelect = (product: Product) => {
    onSelect(product);
    setQuery('');
    inputRef.current?.blur();
  };

  return (
    <View style={styles.wrap}>
      <View style={[styles.bar, focused && styles.barFocused]}>
        <Ionicons name="search" size={18} color={COLORS.textSecondary} />
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)} // allow a result tap to register first
          placeholder={placeholder ?? 'পণ্য খুঁজুন বা বারকোড স্ক্যান করুন…'}
          placeholderTextColor={COLORS.textMuted}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={onScanPress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginLeft: 6 }}>
          <Ionicons name="barcode-outline" size={22} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {showResults && (
        <View style={styles.resultsPanel}>
          {results.length === 0 ? (
            <View style={styles.noMatch}>
              <Text style={styles.noMatchText}>"{query}" — এই পণ্য পাওয়া যায়নি</Text>
              <Text style={styles.noMatchHint}>বানান বা বারকোড আলাদা হতে পারে</Text>
            </View>
          ) : (
            <FlatList
              data={results}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 320 }}
              renderItem={({ item }) => <ProductRow item={item} onPress={() => handleSelect(item)} />}
            />
          )}
        </View>
      )}

      {showEmptyState && (
        <View style={styles.resultsPanel}>
          <FlatList
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: 360 }}
            data={[
              ...(frequentProducts.length > 0 ? [{ type: 'header', key: 'h-freq', label: '🔥 জনপ্রিয়' } as const] : []),
              ...frequentProducts.map((p, i) => ({ type: 'product', key: `f-${p.id}-${i}`, product: p } as const)),
              ...(recentProducts.length > 0 ? [{ type: 'header', key: 'h-recent', label: '🕓 সাম্প্রতিক' } as const] : []),
              ...recentProducts.map((p, i) => ({ type: 'product', key: `r-${p.id}-${i}`, product: p } as const)),
            ]}
            keyExtractor={(row) => row.key}
            renderItem={({ item: row }) =>
              row.type === 'header' ? (
                <Text style={styles.sectionLabel}>{row.label}</Text>
              ) : (
                <ProductRow item={row.product} onPress={() => handleSelect(row.product)} />
              )
            }
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4, zIndex: 20 },
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.surface, borderRadius: 22, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, height: 46,
  },
  barFocused: { borderColor: COLORS.primary },
  input: { flex: 1, fontSize: FONT_SIZES.md, color: COLORS.text, height: '100%' },
  resultsPanel: {
    backgroundColor: COLORS.surface, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border,
    marginTop: 6, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.12, shadowOffset: { width: 0, height: 4 }, shadowRadius: 10, elevation: 4,
  },
  sectionLabel: {
    fontSize: FONT_SIZES.xs, fontWeight: '700', color: COLORS.textSecondary,
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4,
  },
  resultRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 0.5, borderBottomColor: COLORS.border,
  },
  resultThumb: {
    width: 36, height: 36, borderRadius: 8, backgroundColor: COLORS.surfaceSecondary,
    alignItems: 'center', justifyContent: 'center',
  },
  resultThumbTxt: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.primary },
  resultName: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.text },
  resultMeta: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, marginTop: 1 },
  resultAddBtn: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  noMatch: { padding: 16, alignItems: 'center', gap: 2 },
  noMatchText: { fontSize: FONT_SIZES.sm, color: COLORS.text, fontWeight: '600' },
  noMatchHint: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted },
});
