import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, TextInput, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCartStore, MAX_CARTS, Cart, cartTotals } from '@/store';
import { FONT_SIZES } from '@/constants';

/**
 * Horizontal customer tabs sitting in the header — answers "several customers,
 * one cash drawer" (PRD Scenario 2 / FR-10–FR-13, design system's QueueTabs).
 * Every add-to-cart action anywhere on /pos targets whichever tab is active
 * here; switching tabs is instant, no confirmation, no data loss.
 */
export default function QueueTabs() {
  const { carts, activeCartId, setActiveCart, addTab, closeTab, renameTab } = useCartStore();
  const [renaming, setRenaming] = useState<Cart | null>(null);
  const [renameText, setRenameText] = useState('');

  const cartTotal = (c: Cart) => cartTotals(c).net;

  const handleLongPress = (cart: Cart) => {
    const options: any[] = [
      { text: 'নাম পরিবর্তন', onPress: () => { setRenaming(cart); setRenameText(cart.label); } },
    ];
    if (carts.length > 1) {
      options.push({
        text: 'বন্ধ করুন',
        style: 'destructive',
        onPress: () => {
          if (cart.items.length > 0) {
            Alert.alert(
              'এই কাস্টমারের কার্টে পণ্য আছে',
              `"${cart.label}"-এ ${cart.items.length}টি পণ্য আছে। বন্ধ করলে সব হারিয়ে যাবে।`,
              [
                { text: 'বাতিল', style: 'cancel' },
                { text: 'হ্যাঁ, বন্ধ করুন', style: 'destructive', onPress: () => closeTab(cart.id) },
              ],
            );
          } else {
            closeTab(cart.id);
          }
        },
      });
    }
    options.push({ text: 'বাতিল', style: 'cancel' });
    Alert.alert(cart.label, undefined, options);
  };

  const handleAddTab = () => {
    const id = addTab();
    if (!id) {
      Alert.alert('সর্বোচ্চ সীমা', `একসাথে সর্বোচ্চ ${MAX_CARTS} জন কাস্টমার রাখা যাবে। আগেরগুলো শেষ করুন।`);
    }
  };

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
        {carts.map(cart => {
          const active = cart.id === activeCartId;
          const total = cartTotal(cart);
          return (
            <TouchableOpacity
              key={cart.id}
              style={[styles.tab, active ? styles.tabActive : styles.tabHeld]}
              onPress={() => setActiveCart(cart.id)}
              onLongPress={() => handleLongPress(cart)}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabLabel, active ? styles.tabLabelActive : styles.tabLabelHeld]} numberOfLines={1}>
                {cart.label}
              </Text>
              {cart.items.length > 0 && (
                <Text style={[styles.tabMeta, active ? styles.tabLabelActive : styles.tabLabelHeld]}>
                  {' · ৳' + Math.round(total)}
                </Text>
              )}
              {cart.items.length === 0 && !active && (
                <View style={styles.waitingDot} />
              )}
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity style={styles.addBtn} onPress={handleAddTab} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="add" size={16} color="#fff" />
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={!!renaming} transparent animationType="fade" onRequestClose={() => setRenaming(null)}>
        <View style={styles.renameOverlay}>
          <View style={styles.renameCard}>
            <Text style={styles.renameTitle}>কাস্টমারের নাম</Text>
            <TextInput
              style={styles.renameInput}
              value={renameText}
              onChangeText={setRenameText}
              autoFocus
              placeholder="যেমন: কাস্টমার ১"
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity style={styles.renameCancelBtn} onPress={() => setRenaming(null)}>
                <Text style={styles.renameCancelTxt}>বাতিল</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.renameSaveBtn}
                onPress={() => {
                  if (renaming && renameText.trim()) renameTab(renaming.id, renameText.trim());
                  setRenaming(null);
                }}
              >
                <Text style={styles.renameSaveTxt}>সেভ করুন</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, marginTop: 10 },
  tab: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, height: 32, borderRadius: 16, maxWidth: 180,
  },
  tabActive: { backgroundColor: '#fff' },
  tabHeld: { backgroundColor: 'rgba(255,255,255,0.14)' },
  tabLabel: { fontSize: FONT_SIZES.xs, fontWeight: '700' },
  tabMeta: { fontSize: FONT_SIZES.xs, fontWeight: '600' },
  tabLabelActive: { color: '#0F3D2E' },
  tabLabelHeld: { color: '#fff' },
  waitingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#F9A825', marginLeft: 6 },
  addBtn: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)', borderStyle: 'dashed',
  },
  renameOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  renameCard: { backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '100%' },
  renameTitle: { fontSize: FONT_SIZES.md, fontWeight: '700', marginBottom: 10 },
  renameInput: { borderWidth: 1, borderColor: '#DEE2E6', borderRadius: 10, height: 46, paddingHorizontal: 14, fontSize: FONT_SIZES.md },
  renameCancelBtn: { flex: 1, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' },
  renameCancelTxt: { fontWeight: '600', color: '#374151' },
  renameSaveBtn: { flex: 1, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1B4332' },
  renameSaveTxt: { fontWeight: '700', color: '#fff' },
});
