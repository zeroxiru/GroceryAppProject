import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Alert, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS, FONT_SIZES } from '@/constants';
import { productService } from '@/services/supabase/productService';
import { useProductStore, useAuthStore } from '@/store';
import { db } from '@/services/supabase/client';

const CATEGORIES = [
  { key: 'drink', label: '��� পানীয়' },
  { key: 'grain', label: '��� চাল ও ডাল' },
  { key: 'oil', label: '��� তেল ও ঘি' },
  { key: 'spice', label: '���️ মসলা' },
  { key: 'essential', label: '��� নিত্যপণ্য' },
  { key: 'vegetable', label: '��� সবজি' },
  { key: 'dairy', label: '��� দুগ্ধ ও ডিম' },
  { key: 'snack', label: '��� বিস্কুট ও স্ন্যাকস' },
  { key: 'beverage', label: '��� চা ও কফি' },
  { key: 'toiletry', label: '��� সাবান ও টিস্যু' },
  { key: 'other', label: '��� অন্যান্য' },
];

interface ProductRow {
  id: string;
  name_bangla: string;
  unit: string;
  sale_price: number;
  selected: boolean;
  editable_price: string;
}

export default function ProductSetupScreen() {
  const { shop } = useAuthStore();
  const [selectedCategory, setSelectedCategory] = useState('grain');
  const [allProducts, setAllProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    loadCategoryProducts(selectedCategory);
  }, [selectedCategory]);

  const loadCategoryProducts = async (category: string) => {
    if (!shop) return;
    setLoading(true);
    try {
      // Get all products for this category for this shop
      const { data } = await db.products()
        .select('*')
        .eq('shop_id', shop.id)
        .eq('category', category)
        .order('name_bangla');

      setAllProducts((data ?? []).map(p => ({
        id: p.id,
        name_bangla: p.name_bangla,
        unit: p.unit,
        sale_price: p.sale_price,
        selected: p.current_stock >= 0,
        editable_price: String(p.sale_price),
      })));
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAll = async () => {
    const selected = allProducts.filter(p => p.selected);
    if (selected.length === 0) {
      Alert.alert('সতর্কতা', 'কমপক্ষে একটি পণ্য সিলেক্ট করুন');
      return;
    }
    setSaving(true);
    try {
      for (const product of selected) {
        const newPrice = parseFloat(product.editable_price) || product.sale_price;
        await db.products()
          .update({ sale_price: newPrice, is_active: true })
          .eq('id', product.id);
      }
      // Reload products in store
      await productService.fetchProducts();
      Alert.alert(
        '✓ সেভ হয়েছে',
        `${selected.length} টি পণ্য আপডেট হয়েছে`,
        [{ text: 'ঠিক আছে' }]
      );
    } catch (e: any) {
      Alert.alert('ত্রুটি', e.message);
    } finally {
      setSaving(false);
    }
  };

  const filtered = allProducts.filter(p =>
    p.name_bangla.toLowerCase().includes(searchText.toLowerCase())
  );

  const selectedCount = allProducts.filter(p => p.selected).length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.surface} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/product-setup')}>
        <Text>পণ্য সেটআপ</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>পণ্য সেটআপ</Text>
        <Text style={styles.headerCount}>{selectedCount} সিলেক্ট</Text>
      </View>

      {/* Category tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryScroll}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
      >
        {CATEGORIES.map(cat => (
          <TouchableOpacity
            key={cat.key}
            style={[styles.catBtn, selectedCategory === cat.key && styles.catBtnActive]}
            onPress={() => { setSelectedCategory(cat.key); setSearchText(''); }}
          >
            <Text style={[styles.catBtnText, selectedCategory === cat.key && styles.catBtnTextActive]}>
              {cat.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Search */}
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={18} color={COLORS.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="পণ্য খুঁজুন..."
          placeholderTextColor={COLORS.textMuted}
          value={searchText}
          onChangeText={setSearchText}
        />
      </View>

      {/* Select all row */}
      <View style={styles.selectAllRow}>
        <TouchableOpacity
          onPress={() => setAllProducts(prev => prev.map(p => ({ ...p, selected: true })))}
        >
          <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.primary, fontWeight: '600' }}>সব সিলেক্ট</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setAllProducts(prev => prev.map(p => ({ ...p, selected: false })))}
        >
          <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.error, fontWeight: '600' }}>সব বাতিল</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textMuted }}>
          {filtered.length} পণ্য পাওয়া গেছে
        </Text>
      </View>

      {/* Product list */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }}>
          {filtered.map((product, i) => (
            <TouchableOpacity
              key={product.id}
              style={[styles.productRow, product.selected && styles.productRowSelected]}
              onPress={() => {
                const updated = [...allProducts];
                const idx = allProducts.findIndex(p => p.id === product.id);
                updated[idx] = { ...updated[idx], selected: !updated[idx].selected };
                setAllProducts(updated);
              }}
            >
              {/* Checkbox */}
              <View style={[styles.checkbox, product.selected && styles.checkboxOn]}>
                {product.selected && <Ionicons name="checkmark" size={14} color="#fff" />}
              </View>

              {/* Name */}
              <Text style={[styles.productName, !product.selected && { color: COLORS.textMuted }]}>
                {product.name_bangla}
              </Text>

              {/* Unit */}
              <Text style={styles.productUnit}>{product.unit}</Text>

              {/* Price input */}
              <View style={styles.priceBox}>
                <Text style={styles.taka}>৳</Text>
                <TextInput
                  style={styles.priceInput}
                  value={product.editable_price}
                  onChangeText={(val) => {
                    const updated = [...allProducts];
                    const idx = allProducts.findIndex(p => p.id === product.id);
                    updated[idx] = { ...updated[idx], editable_price: val, selected: true };
                    setAllProducts(updated);
                  }}
                  keyboardType="numeric"
                  selectTextOnFocus
                />
              </View>
            </TouchableOpacity>
          ))}

          {filtered.length === 0 && (
            <View style={{ alignItems: 'center', paddingTop: 40 }}>
              <Text style={{ color: COLORS.textMuted, fontSize: FONT_SIZES.md }}>
                কোনো পণ্য পাওয়া যায়নি
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* Save button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.saveBtn, (saving || selectedCount === 0) && { opacity: 0.6 }]}
          onPress={handleSaveAll}
          disabled={saving || selectedCount === 0}
        >
          {saving
            ? <ActivityIndicator color="#fff" size="small" />
            : <>
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={styles.saveBtnText}>
                {selectedCount} পণ্য সেভ করুন
              </Text>
            </>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.primary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12 },
  headerTitle: { fontSize: FONT_SIZES.lg, fontWeight: '700', color: '#fff' },
  headerCount: { fontSize: FONT_SIZES.sm, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  categoryScroll: { maxHeight: 48, marginBottom: 8 },
  catBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', marginRight: 8 },
  catBtnActive: { backgroundColor: '#fff' },
  catBtnText: { fontSize: FONT_SIZES.xs, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
  catBtnTextActive: { color: COLORS.primary, fontWeight: '700' },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', marginHorizontal: 12, borderRadius: 10, paddingHorizontal: 12, height: 40, gap: 8, marginBottom: 6 },
  searchInput: { flex: 1, color: '#fff', fontSize: FONT_SIZES.sm },
  selectAllRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 6, backgroundColor: COLORS.surface },
  productRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: COLORS.border, gap: 10, backgroundColor: COLORS.surface },
  productRowSelected: { backgroundColor: '#F0FFF4' },
  checkbox: { width: 22, height: 22, borderRadius: 5, borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  checkboxOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  productName: { flex: 1, fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.text },
  productUnit: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, minWidth: 36 },
  priceBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, paddingHorizontal: 8, height: 36, backgroundColor: '#fff' },
  taka: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary },
  priceInput: { width: 60, fontSize: FONT_SIZES.sm, color: COLORS.text, textAlign: 'right' },
  footer: { padding: 16, backgroundColor: COLORS.surface, borderTopWidth: 0.5, borderTopColor: COLORS.border },
  saveBtn: { backgroundColor: COLORS.primary, borderRadius: 14, height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  saveBtnText: { color: '#fff', fontSize: FONT_SIZES.md, fontWeight: '700' },
});
