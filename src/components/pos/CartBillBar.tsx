import { formatCartQty } from '@/utils/looseUnits';
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, TextInput, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useAuthStore, useProductStore, useCartStore, cartTotals, CartItem } from '@/store';
import { transactionService } from '@/services/supabase/transactionService';
import { voiceService } from '@/services/voice/voiceService';
import { PaymentMethod } from '@/types';
import { COLORS, FONT_SIZES } from '@/constants';

export const PAYMENT_METHODS: { key: PaymentMethod; label: string; icon: string; activeColor: string }[] = [
  { key: 'cash',   label: 'নগদ',   icon: '💵', activeColor: '#16a34a' },
  { key: 'bkash',  label: 'bKash',  icon: '📱', activeColor: '#E2136E' },
  { key: 'nagad',  label: 'Nagad',  icon: '🔥', activeColor: '#F7941D' },
  { key: 'card',   label: 'Card',   icon: '💳', activeColor: '#2563EB' },
  { key: 'credit', label: 'বাকি',  icon: '📝', activeColor: '#7C3AED' },
];

function calculateDiscount(total: number, type: 'percentage' | 'amount' | null, value: number): number {
  if (!type || !value || isNaN(value)) return 0;
  if (type === 'percentage') return +(total * Math.min(value, 100) / 100).toFixed(2);
  return Math.min(value, total);
}

interface Props {
  /** An item with no product_id — the shopkeeper needs to register it. Home screen owns that modal. */
  onUnmatchedProduct: (item: CartItem) => void;
  onCheckoutSuccess: (invoice: {
    number: string; items: CartItem[]; total: number; customer: string; payment_method: PaymentMethod;
    discount_type?: 'percentage' | 'amount'; discount_value?: number; discount_amount?: number; net_total?: number;
  }) => void;
  /** Opens the typed multi-item entry modal, already on the home screen. */
  onAddMore: () => void;
}

/**
 * The always-there-but-collapsed bill bar (design system's CartBillBar):
 * pinned above the bottom nav, hidden when the active customer's cart is
 * empty, expands into the full bill sheet on tap. Replaces the old
 * permanently-expanded draft panel — collapsing it is what gives the /pos
 * screen its room back for search results and category browsing.
 */
export default function CartBillBar({ onUnmatchedProduct, onCheckoutSuccess, onAddMore }: Props) {
  const { shop } = useAuthStore();
  const { products } = useProductStore();
  const cart = useCartStore(s => s.activeCart());
  const { toggleItem, removeItem, updateItem, setCustomerName, setDiscountType, setDiscountValue, setPaymentMethod, completeCart, clearCartItems } = useCartStore();

  const [sheetVisible, setSheetVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingIndex, setEditingIndex] = useState(-1);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editUnit, setEditUnit] = useState('piece');
  const [editModalVisible, setEditModalVisible] = useState(false);

  if (!cart || cart.items.length === 0) return null; // empty cart — bar hidden entirely, never shown at ৳0

  const { subtotal: checkedTotal, discount: discountAmount, net: netTotal } = cartTotals(cart);

  const openEdit = (index: number) => {
    const item = cart.items[index];
    setEditingIndex(index);
    setEditName(item.product_name);
    setEditPrice(String(item.unit_price));
    setEditUnit(item.unit);
    setEditModalVisible(true);
  };

  const handleCheckout = async () => {
    const itemsToSave = cart.items.filter(i => i.checked);
    if (itemsToSave.length === 0) {
      Alert.alert('সতর্কতা', 'কমপক্ষে একটি পণ্য সিলেক্ট করুন');
      return;
    }
    setSaving(true);
    try {
      const res = await transactionService.saveBill({
        items: itemsToSave.map(item => ({
          product_id: item.product_id, product_name: item.product_name,
          quantity: item.quantity, unit: item.unit, unit_price: item.unit_price,
        })),
        customer_name: cart.customerName || undefined,
        payment_method: cart.paymentMethod,
        discount_type: cart.discountType ?? undefined,
        discount_value: parseFloat(cart.discountValue) || 0,
        vat_rate: 0,
      });
      onCheckoutSuccess({
        number: res.invoice_number,
        items: itemsToSave,
        total: checkedTotal,
        customer: cart.customerName,
        payment_method: cart.paymentMethod,
        discount_type: cart.discountType ?? undefined,
        discount_value: parseFloat(cart.discountValue) || 0,
        discount_amount: discountAmount,
        net_total: netTotal,
      });
      setSheetVisible(false);
      completeCart(cart.id); // closes this tab; a fresh empty one takes its place if it was the only one
      await voiceService.speak(`বিল তৈরি হয়েছে। মোট ${Math.round(netTotal)} টাকা।`);
    } catch (e: any) {
      // The server refuses a line whose product has no stock. Say so in plain
      // Bangla and offer to drop just that line, instead of showing the raw
      // English message and leaving the shopkeeper to work out what to remove.
      const m = /Insufficient stock for (.+?):/.exec(e?.message ?? '');
      if (m) {
        const name = m[1];
        Alert.alert(
          'স্টকে নেই',
          `"${name}" এর স্টক নেই, তাই বিল হয়নি।`,
          [
            { text: 'বাতিল', style: 'cancel' },
            {
              text: 'এটি বাদ দিন',
              style: 'destructive',
              onPress: () => {
                const idx = cart.items.findIndex(i => i.product_name === name);
                if (idx >= 0) removeItem(cart.id, idx);
              },
            },
          ],
        );
      } else {
        Alert.alert('ত্রুটি', e.message);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Collapsed bar */}
      <TouchableOpacity style={styles.bar} activeOpacity={0.85} onPress={() => setSheetVisible(true)}>
        <View>
          <Text style={styles.barCount}>{cart.items.length} টি পণ্য</Text>
          <Text style={styles.barTotal}>৳{Math.round(netTotal)}</Text>
        </View>
        <View style={styles.barCta}>
          <Text style={styles.barCtaTxt}>চালান দেখুন</Text>
          <Ionicons name="chevron-forward" size={16} color="#0F3D2E" />
        </View>
      </TouchableOpacity>

      {/* Bill sheet */}
      <Modal visible={sheetVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSheetVisible(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }}>
          <View style={styles.sheetHeader}>
            <TouchableOpacity onPress={() => setSheetVisible(false)}><Ionicons name="close" size={24} color={COLORS.text} /></TouchableOpacity>
            <Text style={styles.sheetTitle}>{cart.label} — বিল ({cart.items.length})</Text>
            <TouchableOpacity
              onPress={() => Alert.alert(
                'বিল বাতিল করবেন?',
                `${cart.items.length}টি পণ্য মুছে যাবে।`,
                [
                  { text: 'না', style: 'cancel' },
                  { text: 'হ্যাঁ, বাতিল করুন', style: 'destructive', onPress: () => { clearCartItems(cart.id); setSheetVisible(false); } },
                ],
              )}
            >
              <Text style={{ color: COLORS.error, fontSize: FONT_SIZES.sm, fontWeight: '700' }}>বাতিল</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1, padding: 16 }} keyboardShouldPersistTaps="handled">
            {/* Item checklist */}
            {cart.items.map((item, i) => (
              <TouchableOpacity
                key={`c-${i}`}
                style={[styles.itemRow, !item.checked && { opacity: 0.4 }]}
                onPress={() => toggleItem(cart.id, i)}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, item.checked && styles.checkboxOn]}>
                  {item.checked && <Ionicons name="checkmark" size={13} color="#fff" />}
                </View>
                <Text style={styles.itemName} numberOfLines={1}>{item.product_name}</Text>
                <Text style={styles.itemQty}>{formatCartQty(item)}</Text>
                <Text style={styles.itemAmt}>৳{item.total}</Text>
                <TouchableOpacity onPress={() => openEdit(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ paddingHorizontal: 4 }}>
                  <Ionicons name="pencil" size={16} color={COLORS.primary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => removeItem(cart.id, i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={20} color={COLORS.error} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}

            {/* Unmatched product warning */}
            {cart.items.some(i => !i.product_id && !i.custom) && (
              <TouchableOpacity
                style={styles.warnBox}
                onPress={() => { const u = cart.items.find(i => !i.product_id && !i.custom); if (u) onUnmatchedProduct(u); }}
              >
                <Ionicons name="warning-outline" size={14} color="#92400E" />
                <Text style={styles.warnText}>কিছু পণ্য স্টকে নেই — ট্যাপ করে যোগ করুন</Text>
              </TouchableOpacity>
            )}

            {/* Add more */}
            <TouchableOpacity style={styles.addMoreBtn} onPress={() => { setSheetVisible(false); onAddMore(); }}>
              <Ionicons name="pencil" size={18} color={COLORS.primary} />
              <Text style={styles.addMoreTxt}>
                {shop?.shop_type === 'cosmetics' || shop?.shop_type === 'imported' ? 'Type more product names' : 'আরো পণ্য লিখুন'}
              </Text>
            </TouchableOpacity>

            {/* Discount */}
            <View style={{ marginTop: 14 }}>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
                <TouchableOpacity
                  style={[styles.discountTypeBtn, cart.discountType === 'percentage' && styles.discountTypeBtnActive]}
                  onPress={() => setDiscountType(cart.id, 'percentage')}
                >
                  <Text style={[styles.discountTypeTxt, cart.discountType === 'percentage' && { color: '#fff' }]}>% ছাড়</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.discountTypeBtn, cart.discountType === 'amount' && styles.discountTypeBtnActive]}
                  onPress={() => setDiscountType(cart.id, 'amount')}
                >
                  <Text style={[styles.discountTypeTxt, cart.discountType === 'amount' && { color: '#fff' }]}>৳ ছাড়</Text>
                </TouchableOpacity>
                {cart.discountType && (
                  <TouchableOpacity style={[styles.discountTypeBtn, { borderColor: COLORS.error }]} onPress={() => setDiscountType(cart.id, null)}>
                    <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.error }}>বাতিল</Text>
                  </TouchableOpacity>
                )}
              </View>
              {cart.discountType && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TextInput
                    style={[styles.nameInput, { flex: 1 }]}
                    placeholder={cart.discountType === 'percentage' ? '0 %' : '০ টাকা ছাড়'}
                    placeholderTextColor={COLORS.textMuted}
                    value={cart.discountValue}
                    onChangeText={(v) => setDiscountValue(cart.id, v)}
                    keyboardType="numeric"
                  />
                  {cart.discountValue ? (
                    <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.error }}>
                      -৳{calculateDiscount(checkedTotal, cart.discountType, parseFloat(cart.discountValue)).toFixed(0)}
                    </Text>
                  ) : null}
                </View>
              )}
            </View>

            {/* Payment method */}
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 14 }}>
              {PAYMENT_METHODS.map(({ key, label, icon, activeColor }) => (
                <TouchableOpacity
                  key={key}
                  onPress={() => setPaymentMethod(cart.id, key)}
                  style={{
                    flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', gap: 2,
                    backgroundColor: cart.paymentMethod === key ? activeColor : COLORS.surfaceSecondary,
                    borderWidth: 1.5, borderColor: cart.paymentMethod === key ? activeColor : COLORS.border,
                  }}
                >
                  <Text style={{ fontSize: 15 }}>{icon}</Text>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: cart.paymentMethod === key ? '#fff' : COLORS.textSecondary }}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Customer name */}
            <TextInput
              style={[styles.nameInput, { marginTop: 14 }]}
              placeholder="গ্রাহকের নাম (ঐচ্ছিক)"
              placeholderTextColor={COLORS.textMuted}
              value={cart.customerName}
              onChangeText={(v) => setCustomerName(cart.id, v)}
            />

            <View style={{ height: 100 }} />
          </ScrollView>

          {/* Sticky total + checkout */}
          <View style={styles.checkoutBar}>
            <View>
              {discountAmount > 0 && (
                <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textMuted, textDecorationLine: 'line-through' }}>৳{Math.round(checkedTotal)}</Text>
              )}
              <Text style={styles.checkoutTotal}>৳{Math.round(netTotal)}</Text>
            </View>
            <TouchableOpacity style={[styles.billBtn, saving && { opacity: 0.6 }]} onPress={handleCheckout} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : (
                <>
                  <Ionicons name="receipt-outline" size={15} color="#fff" />
                  <Text style={styles.billTxt}>বিল ({cart.items.filter(i => i.checked).length})</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Edit item modal */}
      <Modal visible={editModalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditModalVisible(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }}>
          <View style={styles.sheetHeader}>
            <TouchableOpacity onPress={() => setEditModalVisible(false)}><Ionicons name="close" size={24} color={COLORS.text} /></TouchableOpacity>
            <Text style={styles.sheetTitle}>পণ্য সম্পাদনা</Text>
            <View style={{ width: 24 }} />
          </View>
          <View style={{ padding: 20, gap: 16 }}>
            {editingIndex >= 0 && (
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.text }}>একই ধরনের পণ্য:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 50 }}>
                  {products
                    .filter(p => {
                      const current = cart.items[editingIndex];
                      return current && p.category === (products.find(pp => pp.name_bangla === current.product_name)?.category)
                        && p.name_bangla !== current.product_name;
                    })
                    .slice(0, 8)
                    .map((p, i) => (
                      <TouchableOpacity
                        key={i}
                        style={styles.similarChip}
                        onPress={() => { setEditName(p.name_bangla); setEditPrice(String(p.sale_price)); setEditUnit(p.unit); }}
                      >
                        <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.text }}>{p.name_bangla}</Text>
                      </TouchableOpacity>
                    ))}
                </ScrollView>
              </View>
            )}
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.text }}>পণ্যের নাম</Text>
              <TextInput style={styles.input} value={editName} onChangeText={setEditName} placeholderTextColor={COLORS.textMuted} />
            </View>
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.text }}>মূল্য (৳)</Text>
              <TextInput style={styles.input} value={editPrice} onChangeText={setEditPrice} keyboardType="numeric" placeholderTextColor={COLORS.textMuted} />
            </View>
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.text }}>একক</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {['piece', 'kg', 'gram', 'litre', 'ml', 'dozen', 'packet'].map(u => (
                  <TouchableOpacity key={u} style={[styles.unitChip, editUnit === u && styles.unitChipActive]} onPress={() => setEditUnit(u)}>
                    <Text style={[styles.unitChipTxt, editUnit === u && { color: '#fff', fontWeight: '700' }]}>{u}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <TouchableOpacity
              style={styles.updateBtn}
              onPress={() => {
                if (editingIndex < 0) return;
                const newPrice = parseFloat(editPrice) || 0;
                const item = cart.items[editingIndex];
                updateItem(cart.id, editingIndex, {
                  product_name: editName, unit_price: newPrice, unit: editUnit as any,
                  total: +(item.quantity * newPrice).toFixed(2),
                });
                setEditModalVisible(false);
              }}
            >
              <Text style={{ color: '#fff', fontSize: FONT_SIZES.md, fontWeight: '700' }}>আপডেট করুন ✓</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute', left: 16, right: 16, bottom: 12, // this screen's container ends at the tab bar, so 12 = just above it
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.primary, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 12,
    shadowColor: '#000', shadowOpacity: 0.2, shadowOffset: { width: 0, height: 4 }, shadowRadius: 10, elevation: 6,
  },
  barCount: { color: 'rgba(255,255,255,0.8)', fontSize: FONT_SIZES.xs },
  barTotal: { color: '#fff', fontSize: 20, fontWeight: '700' },
  barCta: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  barCtaTxt: { color: '#0F3D2E', fontWeight: '700', fontSize: FONT_SIZES.sm },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 0.5, borderBottomColor: COLORS.border },
  sheetTitle: { fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.text },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.surfaceSecondary, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, marginBottom: 8,
  },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  itemName: { flex: 1, fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.text },
  itemQty: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary },
  itemAmt: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.text, minWidth: 50, textAlign: 'right' },
  warnBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF3C7', borderRadius: 10, padding: 10, marginBottom: 8 },
  warnText: { fontSize: FONT_SIZES.xs, color: '#92400E', flex: 1 },
  addMoreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    height: 44, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.primary, backgroundColor: '#fff',
  },
  addMoreTxt: { fontSize: FONT_SIZES.sm, color: COLORS.primary, fontWeight: '700' },
  discountTypeBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border },
  discountTypeBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  discountTypeTxt: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, fontWeight: '600' },
  nameInput: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, height: 46, paddingHorizontal: 14, fontSize: FONT_SIZES.sm, color: COLORS.text, backgroundColor: COLORS.surfaceSecondary },
  checkoutBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 0.5, borderTopColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  checkoutTotal: { fontSize: FONT_SIZES.xl, fontWeight: '700', color: COLORS.primary },
  billBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.primary, borderRadius: 12, paddingHorizontal: 22, height: 48 },
  billTxt: { color: '#fff', fontWeight: '700', fontSize: FONT_SIZES.md },
  similarChip: { backgroundColor: COLORS.surfaceSecondary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginRight: 8, borderWidth: 1, borderColor: COLORS.border },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, height: 48, paddingHorizontal: 14, fontSize: FONT_SIZES.md, color: COLORS.text, backgroundColor: COLORS.surfaceSecondary },
  unitChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border },
  unitChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  unitChipTxt: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary },
  updateBtn: { backgroundColor: COLORS.primary, borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center' },
});
