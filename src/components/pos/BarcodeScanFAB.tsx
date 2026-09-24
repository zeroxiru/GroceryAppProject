import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { POS } from '@/constants/posTokens';

interface Props {
  onPress: () => void;
  /** Lift above the bill bar when the active customer has items, so the two never overlap. */
  raised: boolean;
}

/**
 * Floating scan button (design system's BarcodeScanFAB): reachable with the
 * thumb mid-scroll, so a shopkeeper ringing up a basket never has to go back
 * to the top of the screen for the search bar's scan icon.
 */
export default function BarcodeScanFAB({ onPress, raised }: Props) {
  return (
    <TouchableOpacity
      style={[styles.fab, { bottom: raised ? 92 : 20 }]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityLabel="বারকোড স্ক্যান করুন"
    >
      <Ionicons name="barcode-outline" size={28} color="#fff" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute', right: 16, width: 56, height: 56, borderRadius: 28,
    backgroundColor: POS.brand600, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.25, shadowOffset: { width: 0, height: 4 }, shadowRadius: 10, elevation: 8,
  },
});
