import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, FlatList, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { POS, tagColorFor } from '@/constants/posTokens';
import { FONT_SIZES } from '@/constants';

export interface RailCategory {
  key: string;
  label: string;
  count: number;
}

export interface RailBrand { key: string; label: string; count: number }

interface Props {
  categories: RailCategory[]; // already sorted, biggest first
  /** Brands of the chosen category (or of the whole shop when no category is chosen); the chip is hidden when empty. */
  brands?: RailBrand[];
  selectedBrand?: string | null;
  onSelectBrand?: (key: string | null) => void;
  selected: string | null;
  onSelect: (key: string | null) => void;
  totalCount: number;
}

const MAX_VISIBLE = 5; // five chips fit on one screen; the rest live behind "আরও" so the rail never becomes an endless scroll

/**
 * Horizontal category filter (design system's CategoryChipRail). The shop's
 * shelves aren't organised by category, so the app's category colour is the
 * organising system: the same category is the same colour on the chip, on the
 * product tile, everywhere. The colour is always paired with the text label.
 */
export default function CategoryChipRail({ categories, selected, onSelect, totalCount, brands = [], selectedBrand = null, onSelectBrand }: Props) {
  const [moreVisible, setMoreVisible] = useState(false);
  const [brandVisible, setBrandVisible] = useState(false);
  const activeBrand = brands.find(b => b.key === selectedBrand) ?? null;

  // ONE chip, on the same line as the categories, right after the chosen category (or after "সব"): tap it to open the
  // full list of brands. Once a brand is chosen the chip shows its name; tap the ✕ to clear it.
  const brandChip = brands.length > 0 && onSelectBrand ? (
    activeBrand ? (
      <View key="brand-chip" style={[styles.chip, styles.brandOn]}>
        <TouchableOpacity onPress={() => setBrandVisible(true)} activeOpacity={0.8} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[styles.label, { color: '#fff' }]} numberOfLines={1}>{activeBrand.label}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onSelectBrand(null)} hitSlop={{ top: 10, bottom: 10, left: 8, right: 10 }}>
          <Ionicons name="close-circle" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    ) : (
      <TouchableOpacity key="brand-chip" style={[styles.chip, styles.moreChip]} onPress={() => setBrandVisible(true)} activeOpacity={0.8}>
        <Text style={[styles.label, { color: POS.ink600 }]}>ব্র্যান্ড ({brands.length})</Text>
        <Ionicons name="chevron-down" size={14} color={POS.ink600} />
      </TouchableOpacity>
    )
  ) : null;

  // If the selected category would be folded into "আরও", pull it forward so the selection stays visible.
  let visible = categories.slice(0, MAX_VISIBLE);
  const selectedCat = categories.find(c => c.key === selected);
  if (selectedCat && !visible.some(c => c.key === selectedCat.key)) {
    visible = [...visible.slice(0, MAX_VISIBLE - 1), selectedCat];
  }
  const hasMore = categories.length > MAX_VISIBLE;

  const pick = (key: string | null) => onSelect(key === selected ? null : key);

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        <TouchableOpacity
          style={[styles.chip, selected === null ? styles.allOn : styles.allOff]}
          onPress={() => onSelect(null)}
          activeOpacity={0.8}
        >
          <Text style={[styles.label, { color: selected === null ? '#fff' : POS.brand600 }]}>সব</Text>
          <Text style={[styles.count, { color: selected === null ? 'rgba(255,255,255,0.85)' : POS.ink600 }]}>{totalCount}</Text>
        </TouchableOpacity>
        {selected === null && brandChip}

        {visible.map(cat => {
          const on = cat.key === selected;
          return (
            <React.Fragment key={cat.key}>
            <TouchableOpacity
              key={cat.key}
              style={[styles.chip, { backgroundColor: tagColorFor(cat.key) }, on && styles.chipOn]}
              onPress={() => pick(cat.key)}
              activeOpacity={0.8}
            >
              <Text style={[styles.label, { color: POS.tagInk }, on && { fontWeight: '800' }]} numberOfLines={1}>{cat.label}</Text>
              <Text style={[styles.count, { color: POS.tagInk }]}>{cat.count}</Text>
            </TouchableOpacity>
            {on && brandChip}
            </React.Fragment>
          );
        })}

        {hasMore && (
          <TouchableOpacity style={[styles.chip, styles.moreChip]} onPress={() => setMoreVisible(true)} activeOpacity={0.8}>
            <Ionicons name="add" size={14} color={POS.ink600} />
            <Text style={[styles.label, { color: POS.ink600 }]}>আরও ({categories.length - visible.length})</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <Modal visible={brandVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setBrandVisible(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={styles.sheetHeader}>
            <TouchableOpacity onPress={() => setBrandVisible(false)}><Ionicons name="close" size={24} color={POS.ink900} /></TouchableOpacity>
            <Text style={styles.sheetTitle}>ব্র্যান্ড ({brands.length})</Text>
            <View style={{ width: 24 }} />
          </View>
          <FlatList
            data={[{ key: '__all__', label: 'সব ব্র্যান্ড', count: brands.reduce((s, b) => s + b.count, 0) }, ...brands]}
            keyExtractor={b => b.key}
            numColumns={2}
            contentContainerStyle={{ padding: 12, gap: 10 }}
            columnWrapperStyle={{ gap: 10 }}
            renderItem={({ item }) => {
              const all = item.key === '__all__';
              const on = all ? selectedBrand === null : item.key === selectedBrand;
              return (
                <TouchableOpacity
                  style={[styles.gridChip, { backgroundColor: on ? POS.brand600 : POS.surface200 }]}
                  onPress={() => { onSelectBrand?.(all ? null : item.key); setBrandVisible(false); }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.label, { color: on ? '#fff' : POS.ink900 }]} numberOfLines={2}>{item.label}</Text>
                  <Text style={[styles.count, { color: on ? '#fff' : POS.ink600 }]}>{item.count}</Text>
                </TouchableOpacity>
              );
            }}
          />
        </SafeAreaView>
      </Modal>

      <Modal visible={moreVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setMoreVisible(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={styles.sheetHeader}>
            <TouchableOpacity onPress={() => setMoreVisible(false)}><Ionicons name="close" size={24} color={POS.ink900} /></TouchableOpacity>
            <Text style={styles.sheetTitle}>সব ক্যাটাগরি ({categories.length})</Text>
            <View style={{ width: 24 }} />
          </View>
          <FlatList
            data={categories}
            keyExtractor={c => c.key}
            numColumns={2}
            contentContainerStyle={{ padding: 12, gap: 10 }}
            columnWrapperStyle={{ gap: 10 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.gridChip, { backgroundColor: tagColorFor(item.key) }, item.key === selected && styles.chipOn]}
                onPress={() => { pick(item.key); setMoreVisible(false); }}
                activeOpacity={0.8}
              >
                <Text style={[styles.label, { color: POS.tagInk }]} numberOfLines={2}>{item.label}</Text>
                <Text style={[styles.count, { color: POS.tagInk }]}>{item.count}</Text>
              </TouchableOpacity>
            )}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 12, paddingBottom: 8 },
  row: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, height: 36, borderRadius: 999,
    borderWidth: 2, borderColor: 'transparent',
  },
  chipOn: { borderColor: POS.brand600 },
  allOn: { backgroundColor: POS.brand600 },
  allOff: { backgroundColor: '#fff', borderColor: POS.border600 },
  brandOn: { backgroundColor: POS.ink900 },
  moreChip: { backgroundColor: '#fff', borderColor: POS.border600, borderStyle: 'dashed' },
  label: { fontSize: FONT_SIZES.sm, fontWeight: '700', maxWidth: 140 },
  count: { fontSize: FONT_SIZES.xs, fontWeight: '600' },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 20, borderBottomWidth: 0.5, borderBottomColor: POS.border200,
  },
  sheetTitle: { fontSize: FONT_SIZES.lg, fontWeight: '700', color: POS.ink900 },
  gridChip: {
    flex: 1, minHeight: 56, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    borderWidth: 2, borderColor: 'transparent',
  },
});
