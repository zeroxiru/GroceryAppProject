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

interface Props {
  categories: RailCategory[]; // already sorted, biggest first
  selected: string | null;
  onSelect: (key: string | null) => void;
  totalCount: number;
}

const MAX_VISIBLE = 10; // past this the rail folds the rest into "আরও" so it never becomes an endless scroll

/**
 * Horizontal category filter (design system's CategoryChipRail). The shop's
 * shelves aren't organised by category, so the app's category colour is the
 * organising system: the same category is the same colour on the chip, on the
 * product tile, everywhere. The colour is always paired with the text label.
 */
export default function CategoryChipRail({ categories, selected, onSelect, totalCount }: Props) {
  const [moreVisible, setMoreVisible] = useState(false);

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

        {visible.map(cat => {
          const on = cat.key === selected;
          return (
            <TouchableOpacity
              key={cat.key}
              style={[styles.chip, { backgroundColor: tagColorFor(cat.key) }, on && styles.chipOn]}
              onPress={() => pick(cat.key)}
              activeOpacity={0.8}
            >
              <Text style={[styles.label, { color: POS.tagInk }, on && { fontWeight: '800' }]} numberOfLines={1}>{cat.label}</Text>
              <Text style={[styles.count, { color: POS.tagInk }]}>{cat.count}</Text>
            </TouchableOpacity>
          );
        })}

        {hasMore && (
          <TouchableOpacity style={[styles.chip, styles.moreChip]} onPress={() => setMoreVisible(true)} activeOpacity={0.8}>
            <Text style={[styles.label, { color: POS.ink600 }]}>আরও</Text>
            <Ionicons name="chevron-down" size={12} color={POS.ink600} />
          </TouchableOpacity>
        )}
      </ScrollView>

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
