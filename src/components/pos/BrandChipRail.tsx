import React from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { POS } from '@/constants/posTokens';
import { FONT_SIZES } from '@/constants';

export interface BrandChip { key: string; label: string; count: number }

interface Props {
  brands: BrandChip[];
  selected: string | null;
  onSelect: (key: string | null) => void;
}

/**
 * Brand filter INSIDE the chosen category (Dettol, Lux, Meril … under Personal Care) — instead of brands becoming
 * categories of their own. Shown only when the category has at least two brands; tapping the selected brand again clears it.
 */
export default function BrandChipRail({ brands, selected, onSelect }: Props) {
  if (brands.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        <TouchableOpacity style={[styles.chip, selected === null && styles.on]} onPress={() => onSelect(null)} activeOpacity={0.8}>
          <Text style={[styles.txt, selected === null && styles.onTxt]}>সব ব্র্যান্ড</Text>
        </TouchableOpacity>
        {brands.map(b => {
          const on = b.key === selected;
          return (
            <TouchableOpacity key={b.key} style={[styles.chip, on && styles.on]} onPress={() => onSelect(on ? null : b.key)} activeOpacity={0.8}>
              <Text style={[styles.txt, on && styles.onTxt]} numberOfLines={1}>{b.label}</Text>
              <Text style={[styles.count, on && styles.onTxt]}>{b.count}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingBottom: 6 },
  row: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 34, borderRadius: 999,
    borderWidth: 1, borderColor: POS.border600, backgroundColor: '#fff',
  },
  on: { backgroundColor: POS.brand600, borderColor: POS.brand600 },
  txt: { fontSize: FONT_SIZES.sm, lineHeight: 20, fontWeight: '600', color: POS.ink900, maxWidth: 140 },
  count: { fontSize: 11, fontWeight: '700', color: POS.ink600 },
  onTxt: { color: '#fff' },
});
