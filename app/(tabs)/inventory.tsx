import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Alert, Modal, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { db } from '@/services/supabase/client';
import { useAuthStore, useProductStore } from '@/store';
import { Product } from '@/types';
import { COLORS, FONT_SIZES, UNITS } from '@/constants';
import { v4 as uuidv4 } from 'uuid';

export default function InventoryScreen() {
  const { shop } = useAuthStore();
  const { products, setProducts, isLoading, setLoading } = useProductStore();
  const [search, setSearch] = useState('');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => { fetchProducts(); }, []);

  const fetchProducts = async () => {
    if (!shop) return;
    setLoading(true);
    try {
      const { data } = await db.products().select('*').eq('shop_id', shop.id).eq('is_active', true).order('name_bangla');
      if (data) setProducts(data as Product[]);
    } finally { setLoading(false); }
  };

  const filtered = products.filter(p =>
    !search || p.name_bangla.includes(search) || (p.name_english?.toLowerCase().includes(search.toLowerCase()) ?? false)
  );

  const lowStockCount = products.filter(p => p.min_stock_alert > 0 && p.current_stock <= p.min_stock_alert).length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={styles.title}>স্টক তালিকা</Text>
          {lowStockCount > 0 && (
            <View style={styles.alertBadge}>
              <Ionicons name="warning" size={14} color={COLORS.surface} />
              <Text style={styles.alertText}>{lowStockCount} কম স্টক</Text>
            </View>
          )}
        </View>
        <Text style={styles.subtitle}>{products.length} টি পণ্য</Text>
      </View>

      <View style={styles.searchRow}>
        <Ionicons name="search" size={16} color={COLORS.textMuted} style={{ marginLeft: 12 }} />
        <TextInput style={styles.searchInput} placeholder="পণ্য খুঁজুন..." placeholderTextColor={COLORS.textMuted} value={search} onChangeText={setSearch} />
      </View>

      {isLoading ? <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} /> : (
        <FlatList
          data={filtered}
          keyExtractor={p => p.id}
          contentContainerStyle={{ padding: 12, gap: 8 }}
          ListEmptyComponent={<View style={{ alignItems: 'center', paddingTop: 60 }}><Text style={{ color: COLORS.textMuted }}>কোনো পণ্য নেই</Text></View>}
          renderItem={({ item }) => {
            const isLow = item.min_stock_alert > 0 && item.current_stock <= item.min_stock_alert;
            return (
              <TouchableOpacity style={[styles.productCard, isLow && { borderColor: COLORS.error, borderWidth: 1 }]} onPress={() => { setEditingProduct(item); setModalVisible(true); }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.productName}>{item.name_bangla}</Text>
                  {item.name_english && <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textMuted }}>{item.name_english}</Text>}
                  <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, marginTop: 2 }}>বিক্রয়: ৳{item.sale_price} / {UNITS[item.unit].bangla}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.stockNum, isLow && { color: COLORS.error }]}>{item.current_stock}</Text>
                  <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textMuted }}>{UNITS[item.unit].bangla}</Text>
                  {isLow && <Ionicons name="warning" size={14} color={COLORS.error} />}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => { setEditingProduct(null); setModalVisible(true); }}>
        <Ionicons name="add" size={28} color={COLORS.surface} />
      </TouchableOpacity>

      <ProductModal visible={modalVisible} product={editingProduct} shopId={shop?.id ?? ''} onClose={() => setModalVisible(false)} onSaved={fetchProducts} />
    </SafeAreaView>
  );
}

function ProductModal({ visible, product, shopId, onClose, onSaved }: any) {
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [stock, setStock] = useState('0');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (product) { setName(product.name_bangla); setNameEn(product.name_english ?? ''); setSalePrice(String(product.sale_price)); setPurchasePrice(String(product.purchase_price)); setStock(String(product.current_stock)); }
    else { setName(''); setNameEn(''); setSalePrice(''); setPurchasePrice(''); setStock('0'); }
  }, [product, visible]);

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('সতর্কতা', 'পণ্যের নাম দিন'); return; }
    setSaving(true);
    try {
      const payload = { shop_id: shopId, name_bangla: name, name_english: nameEn, sale_price: parseFloat(salePrice) || 0, purchase_price: parseFloat(purchasePrice) || 0, current_stock: parseFloat(stock) || 0 };
      if (product) { await db.products().update(payload).eq('id', product.id); }
      else { await db.products().insert({ ...payload, id: uuidv4(), unit: 'kg', category: 'other', aliases: [], min_stock_alert: 0, is_active: true }); }
      onSaved(); onClose();
    } finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={COLORS.text} /></TouchableOpacity>
          <Text style={styles.modalTitle}>{product ? 'পণ্য আপডেট' : 'নতুন পণ্য'}</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color={COLORS.primary} size="small" /> : <Text style={{ color: COLORS.primary, fontSize: FONT_SIZES.md, fontWeight: '700' }}>সেভ</Text>}
          </TouchableOpacity>
        </View>
        <View style={{ padding: 20, gap: 14 }}>
          {[
            { label: 'পণ্যের নাম (বাংলা) *', value: name, set: setName, placeholder: 'যেমন: চাল' },
            { label: 'ইংরেজি নাম', value: nameEn, set: setNameEn, placeholder: 'Rice' },
            { label: 'বিক্রয় মূল্য (৳)', value: salePrice, set: setSalePrice, placeholder: '0', keyboardType: 'numeric' },
            { label: 'ক্রয় মূল্য (৳)', value: purchasePrice, set: setPurchasePrice, placeholder: '0', keyboardType: 'numeric' },
            { label: 'বর্তমান স্টক', value: stock, set: setStock, placeholder: '0', keyboardType: 'numeric' },
          ].map((f, i) => (
            <View key={i} style={{ gap: 4 }}>
              <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.text }}>{f.label}</Text>
              <TextInput style={styles.modalInput} value={f.value} onChangeText={f.set} placeholder={f.placeholder} placeholderTextColor={COLORS.textMuted} keyboardType={f.keyboardType as any ?? 'default'} />
            </View>
          ))}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { backgroundColor: COLORS.primary, padding: 20 },
  title: { fontSize: FONT_SIZES.xl, fontWeight: '700', color: COLORS.surface },
  subtitle: { fontSize: FONT_SIZES.sm, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  alertBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.error, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  alertText: { color: COLORS.surface, fontSize: FONT_SIZES.xs, fontWeight: '700' },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, margin: 12, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, height: 44 },
  searchInput: { flex: 1, fontSize: FONT_SIZES.sm, color: COLORS.text, paddingHorizontal: 10 },
  productCard: { flexDirection: 'row', backgroundColor: COLORS.surface, borderRadius: 12, padding: 14, borderWidth: 0.5, borderColor: COLORS.border },
  productName: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.text },
  stockNum: { fontSize: FONT_SIZES.xxl, fontWeight: '700', color: COLORS.primary },
  fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', elevation: 8 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 0.5, borderBottomColor: COLORS.border },
  modalTitle: { fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.text },
  modalInput: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, height: 48, paddingHorizontal: 14, fontSize: FONT_SIZES.md, color: COLORS.text, backgroundColor: COLORS.surfaceSecondary },
});