import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONT_SIZES } from '@/constants';

export interface DropdownOption {
  value: string;
  /** Main text (what the shopkeeper reads). */
  label: string;
  /** Smaller text under it, e.g. the English name. */
  hint?: string;
}

interface Props {
  label?: string;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  /** Title of the picker sheet. Defaults to `label`. */
  title?: string;
}

/**
 * A real dropdown: a field that shows the current choice and opens a sheet listing EVERY option (no sideways scrolling,
 * nothing hidden off-screen). Used for units and categories in the product forms.
 */
export default function DropdownSelect({ label, value, options, onChange, placeholder = 'বাছাই করুন', title }: Props) {
  const [open, setOpen] = useState(false);
  const current = options.find(o => o.value === value);

  return (
    <View style={{ gap: 6 }}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <TouchableOpacity style={styles.field} onPress={() => setOpen(true)} activeOpacity={0.7}>
        <View style={{ flex: 1 }}>
          {current ? (
            <>
              <Text style={styles.value} numberOfLines={1}>{current.label}</Text>
              {!!current.hint && <Text style={styles.hint} numberOfLines={1}>{current.hint}</Text>}
            </>
          ) : (
            <Text style={styles.placeholder}>{value || placeholder}</Text>
          )}
        </View>
        <Ionicons name="chevron-down" size={18} color={COLORS.textSecondary} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.wrap}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>{title ?? label ?? placeholder}</Text>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={options}
              keyExtractor={o => o.value}
              renderItem={({ item }) => {
                const on = item.value === value;
                return (
                  <TouchableOpacity
                    style={[styles.row, on && styles.rowOn]}
                    onPress={() => { onChange(item.value); setOpen(false); }}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowLabel, on && { fontWeight: '800', color: COLORS.primary }]}>{item.label}</Text>
                      {!!item.hint && <Text style={styles.rowHint}>{item.hint}</Text>}
                    </View>
                    {on && <Ionicons name="checkmark-circle" size={22} color={COLORS.primary} />}
                  </TouchableOpacity>
                );
              }}
              ItemSeparatorComponent={() => <View style={styles.sep} />}
              contentContainerStyle={{ paddingBottom: 24 }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.textSecondary },
  field: {
    flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 50,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: COLORS.surfaceSecondary ?? '#F3F4F6',
  },
  value: { fontSize: FONT_SIZES.md, color: COLORS.text, fontWeight: '600' },
  hint: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 1 },
  placeholder: { fontSize: FONT_SIZES.md, color: COLORS.textMuted },
  wrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { maxHeight: '75%', backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  sheetTitle: { fontSize: FONT_SIZES.lg, fontWeight: '800', color: COLORS.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingVertical: 14 },
  rowOn: { backgroundColor: 'rgba(17,108,65,0.08)' },
  rowLabel: { fontSize: FONT_SIZES.md, color: COLORS.text },
  rowHint: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 1 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border, marginHorizontal: 18 },
});
