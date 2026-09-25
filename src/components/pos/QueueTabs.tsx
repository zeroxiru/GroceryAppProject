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
  const { carts, activeCartId, setActiveCart, addTab, closeTab, renameTab, mergeTabs } = useCartStore();
  const [menuFor, setMenuFor] = useState<Cart | null>(null);
  const [mergeFrom, setMergeFrom] = useState<Cart | null>(null);
  const [renaming, setRenaming] = useState<Cart | null>(null);
  const [renameText, setRenameText] = useState('');

  const cartTotal = (c: Cart) => cartTotals(c).net;

  const closeCart = (cart: Cart) => {
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
  };

  // Two customers who turn out to be one bill: pour this cart into another (same products add up into one line).
  const mergeInto = (from: Cart, target: Cart) => {
    Alert.alert(
      'বিল মেলাবেন?',
      `"${from.label}"-এর ${from.items.length}টি পণ্য "${target.label}"-এর সাথে মিলে যাবে। "${from.label}" বন্ধ হয়ে যাবে।`,
      [
        { text: 'না', style: 'cancel' },
        { text: 'হ্যাঁ, মেলান', onPress: () => { mergeTabs(from.id, target.id); setMergeFrom(null); } },
      ],
    );
  };

  const handleLongPress = (cart: Cart) => setMenuFor(cart);

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

      {/* Long-press menu */}
      <Modal visible={!!menuFor} transparent animationType="fade" onRequestClose={() => setMenuFor(null)}>
        <TouchableOpacity style={styles.renameOverlay} activeOpacity={1} onPress={() => setMenuFor(null)}>
          <View style={styles.renameCard}>
            <Text style={styles.renameTitle}>{menuFor?.label}</Text>
            <TouchableOpacity style={styles.menuRow} onPress={() => { const c = menuFor; setMenuFor(null); if (c) { setRenaming(c); setRenameText(c.label); } }}>
              <Ionicons name="create-outline" size={20} color="#1F2937" />
              <Text style={styles.menuTxt}>নাম পরিবর্তন</Text>
            </TouchableOpacity>
            {carts.length > 1 && (menuFor?.items.length ?? 0) > 0 && (
              <TouchableOpacity style={styles.menuRow} onPress={() => { const c = menuFor; setMenuFor(null); setMergeFrom(c); }}>
                <Ionicons name="git-merge-outline" size={20} color="#1F2937" />
                <Text style={styles.menuTxt}>অন্য কাস্টমারের বিলের সাথে মেলান</Text>
              </TouchableOpacity>
            )}
            {carts.length > 1 && (
              <TouchableOpacity style={styles.menuRow} onPress={() => { const c = menuFor; setMenuFor(null); if (c) closeCart(c); }}>
                <Ionicons name="close-circle-outline" size={20} color="#B91C1C" />
                <Text style={[styles.menuTxt, { color: '#B91C1C' }]}>বন্ধ করুন</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.menuRow, { justifyContent: 'center' }]} onPress={() => setMenuFor(null)}>
              <Text style={[styles.menuTxt, { color: '#6B7280' }]}>বাতিল</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Merge target picker */}
      <Modal visible={!!mergeFrom} transparent animationType="fade" onRequestClose={() => setMergeFrom(null)}>
        <TouchableOpacity style={styles.renameOverlay} activeOpacity={1} onPress={() => setMergeFrom(null)}>
          <View style={styles.renameCard}>
            <Text style={styles.renameTitle}>"{mergeFrom?.label}" কার সাথে মিলবে?</Text>
            {carts.filter(c => c.id !== mergeFrom?.id).map(c => (
              <TouchableOpacity key={c.id} style={styles.menuRow} onPress={() => mergeFrom && mergeInto(mergeFrom, c)}>
                <Ionicons name="arrow-forward-circle-outline" size={20} color="#1F2937" />
                <Text style={styles.menuTxt} numberOfLines={1}>
                  {c.label}{c.items.length > 0 ? ` · ৳${Math.round(cartTotal(c))}` : ' · খালি'}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[styles.menuRow, { justifyContent: 'center' }]} onPress={() => setMergeFrom(null)}>
              <Text style={[styles.menuTxt, { color: '#6B7280' }]}>বাতিল</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

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
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 4 },
  menuTxt: { fontSize: FONT_SIZES.md, color: '#1F2937', fontWeight: '600', flexShrink: 1 },
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
