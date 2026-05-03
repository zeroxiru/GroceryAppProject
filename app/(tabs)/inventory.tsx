import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Alert, Modal, ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, Camera } from 'expo-camera';
import { useAuthStore, useProductStore } from '@/store';
import { productApi, BulkImportRow } from '@/services/api/productApi';
import { inventoryApi, StockMovement, MovementType } from '@/services/api/inventoryApi';
import { suppliersApi } from '@/services/api/suppliersApi';
import { Supplier } from '@/types';
import { Product } from '@/types';
import { COLORS, FONT_SIZES } from '@/constants';
import { format, differenceInDays, parseISO } from 'date-fns';

// ── Constants ──
const ORIGIN_COUNTRIES = [
  'Bangladesh', 'India', 'Thailand', 'China', 'USA',
  'Germany', 'UK', 'Japan', 'South Korea', 'Indonesia',
  'Malaysia', 'Singapore', 'Canada', 'Australia', 'Other',
];

const GROCERY_CATEGORIES = [
  'grain', 'oil', 'spice', 'essential', 'vegetable',
  'dairy', 'drink', 'snack', 'beverage', 'toiletry', 'other',
];

const COSMETICS_CATEGORIES = [
  'Hair Care', 'Skin Care', 'Face Care', 'Body Care',
  'Baby Care', 'Perfume', 'Makeup', 'Other',
];

const IMPORTED_CATEGORIES = [
  'Chocolates', 'Instant Noodles', 'Snacks',
  'Beverages', 'Cosmetics', 'Baby Food', 'Other',
];

const ALL_UNITS = ['piece', 'kg', 'gram', 'litre', 'ml', 'dozen', 'packet', 'bag'];

// ── Bulk import template columns ──
const BULK_TEMPLATE = [
  'name_english', 'name_bangla', 'brand', 'category', 'size',
  'unit', 'sale_price', 'purchase_price', 'mrp', 'current_stock',
  'min_stock_alert', 'barcode', 'origin_country', 'expiry_date',
].join(',');

// ══════════════════════════════════════════
// MAIN SCREEN
// ══════════════════════════════════════════
type Tab = 'products' | 'low_stock' | 'expiring' | 'movements';

export default function InventoryScreen() {
  const { shop } = useAuthStore();
  const { products = [], setProducts, isLoading = false, setLoading } = useProductStore();
  const [activeTab, setActiveTab] = useState<Tab>('products');
  // Safe guard - prevent filter errors
  const safeProducts = products || [];
  const safeIsLoading = isLoading === undefined ? true : isLoading;
  const [search, setSearch] = useState('');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [bulkModalVisible, setBulkModalVisible] = useState(false);
  const [stockInProduct, setStockInProduct] = useState<Product | null>(null);
  const [stockInModalVisible, setStockInModalVisible] = useState(false);
  const [damageLossProduct, setDamageLossProduct] = useState<Product | null>(null);
  const [damageLossVisible, setDamageLossVisible] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);

  const isCosmetics = shop?.shop_type === 'cosmetics' || shop?.shop_type === 'imported';

  useEffect(() => { fetchProducts(); }, []);

  const fetchProducts = async () => {
    if (!shop) return;
    setLoading(true);
    try {
      const data = await productApi.list();
      setProducts(data);
    } catch { /* use cached */ }
    finally { setLoading(false); }
  };

  const filtered = (products || []).filter(p => {
      if (!p) return false;
    const matchSearch = !search
      || p.name_bangla?.toLowerCase().includes(search.toLowerCase())
      || (p.name_english?.toLowerCase().includes(search.toLowerCase()) ?? false)
      || ((p as any).brand?.toLowerCase().includes(search.toLowerCase()) ?? false)
      || ((p as any).barcode?.includes(search) ?? false);
    const matchCat = !filterCategory || p.category === filterCategory;
    return matchSearch && matchCat;
  });

  const lowStockCount = (products || []).filter(
    p => p && p.min_stock_alert > 0 && p.current_stock <= p.min_stock_alert
  ).length;

  const categories = shop?.shop_type === 'cosmetics' ? COSMETICS_CATEGORIES
    : shop?.shop_type === 'imported' ? IMPORTED_CATEGORIES
    : GROCERY_CATEGORIES;

  const openProductActions = (item: Product) => {
    Alert.alert(
      item.name_bangla || item.name_english || '',
      isCosmetics ? 'Select action' : 'কী করবেন?',
      [
        { text: isCosmetics ? 'Stock In ↑' : 'স্টক ইন ↑', onPress: () => { setStockInProduct(item); setStockInModalVisible(true); } },
        { text: isCosmetics ? 'Record Damage/Loss' : 'ক্ষতি/হারানো', style: 'destructive', onPress: () => { setDamageLossProduct(item); setDamageLossVisible(true); } },
        { text: isCosmetics ? 'Cancel' : 'বাতিল', style: 'cancel' },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={styles.title}>{isCosmetics ? 'Inventory' : 'ইনভেন্টরি'}</Text>
        </View>
        <Text style={styles.subtitle}>0 {isCosmetics ? 'Products' : 'টি পণ্য'}</Text>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {([
          { key: 'products', label: isCosmetics ? 'Products' : 'পণ্য', icon: 'cube-outline' },
          { key: 'low_stock', label: isCosmetics ? 'Low Stock' : 'কম স্টক', icon: 'warning-outline' },
          { key: 'expiring', label: isCosmetics ? 'Expiring' : 'মেয়াদ শেষ', icon: 'time-outline' },
          { key: 'movements', label: isCosmetics ? 'Movements' : 'মুভমেন্ট', icon: 'list-outline' },
        ] as { key: Tab; label: string; icon: any }[]).map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tabBtn, activeTab === tab.key && styles.tabBtnActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Ionicons name={tab.icon} size={14} color={activeTab === tab.key ? COLORS.primary : COLORS.textMuted} />
            <Text style={[styles.tabBtnTxt, activeTab === tab.key && { color: COLORS.primary, fontWeight: '700' }]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab content */}
      {activeTab === 'products' && (
        <>
          {/* Search bar */}
          <View style={styles.searchRow}>
            <Ionicons name="search" size={16} color={COLORS.textMuted} style={{ marginLeft: 12 }} />
            <TextInput
              style={styles.searchInput}
              placeholder={isCosmetics ? 'Search name, brand, barcode...' : 'পণ্য খুঁজুন...'}
              placeholderTextColor={COLORS.textMuted}
              value={search}
              onChangeText={setSearch}
            />
            {search ? (
              <TouchableOpacity onPress={() => setSearch('')} style={{ paddingRight: 12 }}>
                <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Category filter chips */}
          <ScrollView
            horizontal showsHorizontalScrollIndicator={false}
            style={{ maxHeight: 44 }}
            contentContainerStyle={{ paddingHorizontal: 12, gap: 8, alignItems: 'center' }}
          >
            <TouchableOpacity style={[styles.catChip, !filterCategory && styles.catChipActive]} onPress={() => setFilterCategory(null)}>
              <Text style={[styles.catChipTxt, !filterCategory && { color: '#fff' }]}>{isCosmetics ? 'All' : 'সব'}</Text>
            </TouchableOpacity>
            {categories.map(cat => (
              <TouchableOpacity key={cat} style={[styles.catChip, filterCategory === cat && styles.catChipActive]} onPress={() => setFilterCategory(filterCategory === cat ? null : cat)}>
                <Text style={[styles.catChipTxt, filterCategory === cat && { color: '#fff' }]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {isLoading ? <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} /> : (
            <FlatList
              data={filtered}
              keyExtractor={p => p.id}
              contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 110 }}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', paddingTop: 60, gap: 8 }}>
                  <Ionicons name="cube-outline" size={48} color={COLORS.textMuted} />
                  <Text style={{ color: COLORS.textMuted, fontSize: FONT_SIZES.md }}>{isCosmetics ? 'No products found' : 'কোনো পণ্য নেই'}</Text>
                </View>
              }
              renderItem={({ item }) => {
                const isLow = item.min_stock_alert > 0 && item.current_stock <= item.min_stock_alert;
                const p = item as any;
                return (
                  <TouchableOpacity
                    style={[styles.productCard, isLow && { borderColor: COLORS.error, borderWidth: 1.5 }]}
                    onPress={() => { setEditingProduct(item); setModalVisible(true); }}
                    onLongPress={() => openProductActions(item)}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.productName} numberOfLines={1}>{item.name_bangla || item.name_english}</Text>
                      {p.brand && <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.primary, fontWeight: '600' }}>{p.brand}{p.origin_country ? ` • ${p.origin_country}` : ''}</Text>}
                      {p.size && <Text style={{ fontSize: 10, color: COLORS.textMuted }}>{p.size}</Text>}
                      {p.barcode && <Text style={{ fontSize: 10, color: COLORS.textMuted }}>🔢 {p.barcode}</Text>}
                      <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
                        <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.sale, fontWeight: '700' }}>৳{item.sale_price}</Text>
                        {p.mrp && p.mrp !== item.sale_price && <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textMuted, textDecorationLine: 'line-through' }}>MRP ৳{p.mrp}</Text>}
                      </View>
                      {p.expiry_date && <Text style={{ fontSize: 10, color: new Date(p.expiry_date) < new Date() ? COLORS.error : '#F59E0B' }}>⏰ Exp: {p.expiry_date}</Text>}
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text style={[styles.stockNum, isLow && { color: COLORS.error }]}>{item.current_stock}</Text>
                      <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textMuted }}>{item.unit}</Text>
                      {isLow && <Ionicons name="warning" size={14} color={COLORS.error} />}
                      <TouchableOpacity style={styles.stockInBtn} onPress={() => { setStockInProduct(item); setStockInModalVisible(true); }}>
                        <Ionicons name="arrow-up" size={10} color="#fff" />
                        <Text style={styles.stockInBtnTxt}>Stock In</Text>
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}

          {/* FAB buttons */}
          <View style={styles.fabRow}>
            <TouchableOpacity style={styles.bulkBtn} onPress={() => setBulkModalVisible(true)}>
              <Ionicons name="cloud-upload-outline" size={20} color={COLORS.primary} />
              <Text style={styles.bulkBtnTxt}>{isCosmetics ? 'Bulk Import' : 'বাল্ক আমদানি'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.fab} onPress={() => { setEditingProduct(null); setModalVisible(true); }}>
              <Ionicons name="add" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
        </>
      )}

      {activeTab === 'low_stock' && (
        <LowStockTab
          isCosmetics={isCosmetics}
          onStockIn={(p) => { setStockInProduct(p); setStockInModalVisible(true); }}
          onDamage={(p) => { setDamageLossProduct(p); setDamageLossVisible(true); }}
        />
      )}

      {activeTab === 'expiring' && (
        <ExpiringTab isCosmetics={isCosmetics} />
      )}

      {activeTab === 'movements' && (
        <MovementsTab isCosmetics={isCosmetics} />
      )}

      {/* Modals */}
      <ProductModal
        visible={modalVisible}
        product={editingProduct}
        shopId={shop?.id ?? ''}
        shopType={shop?.shop_type ?? 'grocery'}
        shopDefaultDiscount={(shop as any)?.default_discount}
        onClose={() => setModalVisible(false)}
        onSaved={fetchProducts}
      />
      <BulkImportModal
        visible={bulkModalVisible}
        shopId={shop?.id ?? ''}
        shopType={shop?.shop_type ?? 'grocery'}
        onClose={() => setBulkModalVisible(false)}
        onSaved={fetchProducts}
      />
      <StockInModal
        visible={stockInModalVisible}
        product={stockInProduct}
        onClose={() => setStockInModalVisible(false)}
        onSaved={fetchProducts}
      />
      <DamageLossModal
        visible={damageLossVisible}
        product={damageLossProduct}
        isCosmetics={isCosmetics}
        onClose={() => setDamageLossVisible(false)}
        onSaved={fetchProducts}
      />
    </SafeAreaView>
  );
}

// ══════════════════════════════════════════
// PRODUCT MODAL — Add / Edit with all fields
// ══════════════════════════════════════════
function ProductModal({ visible, product, shopId, shopType, shopDefaultDiscount, onClose, onSaved }: any) {
  const isCosmetics = shopType === 'cosmetics' || shopType === 'imported';

  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [brand, setBrand] = useState('');
  const [size, setSize] = useState('');
  const [unit, setUnit] = useState('piece');
  const [category, setCategory] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [mrp, setMrp] = useState('');
  const [mrpAutoApplied, setMrpAutoApplied] = useState(false);
  const [stock, setStock] = useState('0');
  const [minStock, setMinStock] = useState('5');
  const [barcode, setBarcode] = useState('');
  const [originCountry, setOriginCountry] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [cameraPermission, setCameraPermission] = useState<boolean | null>(null);

  const categories = shopType === 'cosmetics' ? COSMETICS_CATEGORIES
    : shopType === 'imported' ? IMPORTED_CATEGORIES
    : GROCERY_CATEGORIES;

  useEffect(() => {
    if (product) {
      setName(product.name_bangla ?? '');
      setNameEn(product.name_english ?? '');
      setBrand((product as any).brand ?? '');
      setSize((product as any).size ?? '');
      setUnit(product.unit ?? 'piece');
      setCategory(product.category ?? '');
      setSalePrice(String(product.sale_price));
      setPurchasePrice(String(product.purchase_price));
      setMrp(String((product as any).mrp ?? ''));
      setStock(String(product.current_stock));
      setMinStock(String(product.min_stock_alert ?? 5));
      setBarcode((product as any).barcode ?? '');
      setOriginCountry((product as any).origin_country ?? '');
      setExpiryDate((product as any).expiry_date ?? '');
    } else {
      setName(''); setNameEn(''); setBrand(''); setSize('');
      setUnit('piece'); setSalePrice(''); setPurchasePrice('');
      setMrp(''); setStock('0'); setMinStock('5'); setBarcode('');
      setOriginCountry(''); setExpiryDate('');
      setCategory(isCosmetics ? 'Skin Care' : 'other');
    }
    setMrpAutoApplied(false);
  }, [product, visible]);

  // B9: Auto-calculate sale price from MRP when adding new cosmetics product
  useEffect(() => {
    if (!isCosmetics || product) return;
    const mrpNum = parseFloat(mrp);
    if (!mrpNum || mrpNum <= 0) { setMrpAutoApplied(false); return; }
    if (!salePrice || mrpAutoApplied) {
      const disc = shopDefaultDiscount ?? 0;
      const auto = disc > 0
        ? Math.round(mrpNum * (1 - disc / 100))
        : mrpNum;
      setSalePrice(String(auto));
      setMrpAutoApplied(true);
    }
  }, [mrp]);

  const handleSave = async () => {
    const productName = isCosmetics ? nameEn : name;
    if (!productName.trim()) {
      Alert.alert(isCosmetics ? 'Warning' : 'সতর্কতা',
        isCosmetics ? 'Enter product name' : 'পণ্যের নাম দিন');
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        shop_id: shopId,
        name_bangla: name || nameEn,
        name_english: nameEn || name,
        brand: brand || null,
        size: size || null,
        unit,
        category: category || 'other',
        sale_price: parseFloat(salePrice) || 0,
        purchase_price: parseFloat(purchasePrice) || 0,
        mrp: parseFloat(mrp) || null,
        current_stock: parseFloat(stock) || 0,
        min_stock_alert: parseFloat(minStock) || 5,
        barcode: barcode || null,
        origin_country: originCountry || null,
        expiry_date: expiryDate || null,
        aliases: brand ? [brand.toLowerCase()] : [],
      };
      if (product) {
        const updated = await productApi.update(product.id, payload);
        const store = useProductStore.getState();
        store.setProducts(store.products.map(p => p.id === product.id ? { ...p, ...updated } : p));
      } else {
        // Duplicate barcode guard before creating
        if (barcode) {
          try {
            const dupCheck = await productApi.barcodeLookup(barcode);
            if (dupCheck.product) {
              const ex = dupCheck.product;
              Alert.alert(
                isCosmetics ? 'Duplicate Barcode' : 'বারকোড আগে থেকেই আছে',
                isCosmetics
                  ? `Barcode is already used by: "${ex.name_english || ex.name_bangla}"`
                  : `এই বারকোড আগে থেকে ব্যবহৃত: "${ex.name_bangla || ex.name_english}"`,
              );
              setSaving(false);
              return;
            }
          } catch {
            const store = useProductStore.getState();
            const localDup = store.products.find(p => (p as any).barcode === barcode);
            if (localDup) {
              Alert.alert(
                isCosmetics ? 'Duplicate Barcode' : 'বারকোড আগে থেকেই আছে',
                isCosmetics
                  ? `Barcode is already used by: "${localDup.name_english || localDup.name_bangla}"`
                  : `এই বারকোড আগে থেকে ব্যবহৃত: "${localDup.name_bangla || localDup.name_english}"`,
              );
              setSaving(false);
              return;
            }
          }
        }
        const created = await productApi.create({ ...payload, is_active: true });
        const store = useProductStore.getState();
        store.setProducts([...store.products, created]);
      }
      onSaved(); onClose();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setSaving(false); }
  };

  const handleDelete = () => {
    Alert.alert(
      isCosmetics ? 'Delete Product' : 'পণ্য মুছুন',
      isCosmetics ? 'Are you sure?' : 'আপনি কি নিশ্চিত?',
      [
        { text: isCosmetics ? 'Cancel' : 'না', style: 'cancel' },
        {
          text: isCosmetics ? 'Delete' : 'হ্যাঁ, মুছুন',
          style: 'destructive',
          onPress: async () => {
            await productApi.remove(product.id);
            const store = useProductStore.getState();
            store.setProducts(store.products.filter((p: Product) => p.id !== product.id));
            onSaved(); onClose();
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>
            {product
              ? (isCosmetics ? 'Edit Product' : 'পণ্য আপডেট')
              : (isCosmetics ? 'New Product' : 'নতুন পণ্য')}
          </Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            {saving
              ? <ActivityIndicator color={COLORS.primary} size="small" />
              : <Text style={{ color: COLORS.primary, fontSize: FONT_SIZES.md, fontWeight: '700' }}>
                  {isCosmetics ? 'Save' : 'সেভ'}
                </Text>}
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }} showsVerticalScrollIndicator={false}>

          {/* ── SECTION 1: Basic Info ── */}
          <Text style={styles.sectionLabel}>📦 {isCosmetics ? 'Basic Info' : 'মূল তথ্য'}</Text>

          {/* Name */}
          {isCosmetics ? (
            <Field label="Product Name *" value={nameEn} onChangeText={setNameEn} placeholder="e.g. Vaseline Body Lotion 400ML" />
          ) : (
            <>
              <Field label="পণ্যের নাম (বাংলা) *" value={name} onChangeText={setName} placeholder="যেমন: চাল" />
              <Field label="ইংরেজি নাম" value={nameEn} onChangeText={setNameEn} placeholder="Rice" />
            </>
          )}

          {/* Brand */}
          <Field label={isCosmetics ? 'Brand' : 'ব্র্যান্ড'} value={brand} onChangeText={setBrand} placeholder="Vaseline, Nivea, AOX" />

          {/* Size/Variant */}
          <Field label={isCosmetics ? 'Size / Variant' : 'সাইজ'} value={size} onChangeText={setSize} placeholder="400ML, 200GM, 1L" />

          {/* Unit */}
          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>{isCosmetics ? 'Unit' : 'একক'} *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {ALL_UNITS.map(u => (
                  <TouchableOpacity
                    key={u}
                    style={[styles.unitBtn, unit === u && styles.unitBtnActive]}
                    onPress={() => setUnit(u)}
                  >
                    <Text style={[styles.unitBtnTxt, unit === u && { color: '#fff', fontWeight: '700' }]}>{u}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>

          {/* Category */}
          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>{isCosmetics ? 'Category' : 'ক্যাটাগরি'}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {categories.map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.unitBtn, category === cat && styles.unitBtnActive]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text style={[styles.unitBtnTxt, category === cat && { color: '#fff', fontWeight: '700' }]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>

          {/* ── SECTION 2: Pricing ── */}
          <Text style={styles.sectionLabel}>💰 {isCosmetics ? 'Pricing' : 'মূল্য তথ্য'}</Text>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Field
                label={isCosmetics ? 'Sale Price (৳) *' : 'বিক্রয় মূল্য (৳) *'}
                value={salePrice}
                onChangeText={(v: string) => { setSalePrice(v); setMrpAutoApplied(false); }}
                placeholder="0"
                numeric
              />
              {mrpAutoApplied && isCosmetics && (shopDefaultDiscount ?? 0) > 0 && (
                <Text style={{ fontSize: 10, color: COLORS.primary, marginTop: 2 }}>
                  Auto: MRP − {shopDefaultDiscount}% discount
                </Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Field label={isCosmetics ? 'Cost Price (৳)' : 'ক্রয় মূল্য (৳)'} value={purchasePrice} onChangeText={setPurchasePrice} placeholder="0" numeric />
            </View>
          </View>

          <Field label={isCosmetics ? 'MRP (Printed Price)' : 'MRP (বোতলে ছাপা দাম)'} value={mrp} onChangeText={setMrp} placeholder="0" numeric />

          {/* ── SECTION 3: Stock ── */}
          <Text style={styles.sectionLabel}>📊 {isCosmetics ? 'Stock Info' : 'স্টক তথ্য'}</Text>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Field label={isCosmetics ? 'Current Stock' : 'বর্তমান স্টক'} value={stock} onChangeText={setStock} placeholder="0" numeric />
            </View>
            <View style={{ flex: 1 }}>
              <Field label={isCosmetics ? 'Min Stock Alert' : 'সর্বনিম্ন স্টক এলার্ট'} value={minStock} onChangeText={setMinStock} placeholder="5" numeric />
            </View>
          </View>

          {/* ── SECTION 4: Additional ── */}
          <Text style={styles.sectionLabel}>🌍 {isCosmetics ? 'Additional Info' : 'অতিরিক্ত তথ্য'}</Text>

          {/* Barcode field with scan + generate buttons */}
          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>{isCosmetics ? 'Barcode (EAN)' : 'বারকোড'}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                style={[styles.modalInput, { flex: 1 }]}
                value={barcode}
                onChangeText={setBarcode}
                placeholder="8906087770558"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="numeric"
              />
              {/* Scan button */}
              <TouchableOpacity
                style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' }}
                onPress={async () => {
                  const { status } = await Camera.requestCameraPermissionsAsync();
                  setCameraPermission(status === 'granted');
                  if (status === 'granted') setShowBarcodeScanner(true);
                  else Alert.alert(isCosmetics ? 'Camera Permission Required' : 'ক্যামেরার অনুমতি দিন');
                }}
              >
                <Ionicons name="barcode-outline" size={24} color="#fff" />
              </TouchableOpacity>
              {/* Generate button — only for existing products without a barcode */}
              {product && !barcode && (
                <TouchableOpacity
                  style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center' }}
                  onPress={async () => {
                    try {
                      const res = await productApi.generateBarcode(product.id);
                      setBarcode(res.barcode);
                    } catch (e: any) {
                      Alert.alert(isCosmetics ? 'Error' : 'ত্রুটি', e.message);
                    }
                  }}
                >
                  <Ionicons name="sparkles-outline" size={22} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
            {product && !barcode && (
              <Text style={{ fontSize: 10, color: '#7C3AED' }}>
                {isCosmetics ? '✦ Tap ✦ to auto-generate an internal barcode' : '✦ বোতামে চাপুন — অভ্যন্তরীণ বারকোড তৈরি হবে'}
              </Text>
            )}
          </View>

          {/* Inline Barcode Scanner Modal */}
          <Modal visible={showBarcodeScanner} animationType="slide" onRequestClose={() => setShowBarcodeScanner(false)}>
            <View style={{ flex: 1, backgroundColor: '#000' }}>
              {cameraPermission && (
                <CameraView
                  style={StyleSheet.absoluteFillObject}
                  facing="back"
                  onBarcodeScanned={({ data }) => {
                    setBarcode(data);
                    setShowBarcodeScanner(false);
                  }}
                  barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] }}
                />
              )}
              {/* Scan frame overlay */}
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 260, height: 160, borderWidth: 2, borderColor: COLORS.primary, borderRadius: 12, backgroundColor: 'transparent' }} />
                <Text style={{ color: '#fff', marginTop: 16, fontSize: FONT_SIZES.sm }}>
                  {isCosmetics ? 'Point camera at barcode' : 'বারকোডের দিকে ক্যামেরা ধরুন'}
                </Text>
              </View>
              {/* Close button */}
              <TouchableOpacity
                style={{ position: 'absolute', top: 50, right: 20, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20, padding: 8 }}
                onPress={() => setShowBarcodeScanner(false)}
              >
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
          </Modal>

          {/* Origin country */}
          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>{isCosmetics ? 'Origin Country' : 'উৎপত্তি দেশ'}</Text>
            <TouchableOpacity
              style={[styles.modalInput, { justifyContent: 'center' }]}
              onPress={() => setShowCountryPicker(true)}
            >
              <Text style={{ color: originCountry ? COLORS.text : COLORS.textMuted, fontSize: FONT_SIZES.md }}>
                {originCountry || (isCosmetics ? 'Select Country' : 'দেশ বেছে নিন')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Expiry date */}
          {isCosmetics && (
            <Field label="Expiry Date" value={expiryDate} onChangeText={setExpiryDate} placeholder="Jan-2028 or 31/01/2028" />
          )}

          {/* Delete button for existing product */}
          {product && (
            <TouchableOpacity
              style={{ marginTop: 8, height: 48, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.error, alignItems: 'center', justifyContent: 'center' }}
              onPress={handleDelete}
            >
              <Text style={{ color: COLORS.error, fontWeight: '700', fontSize: FONT_SIZES.sm }}>
                {isCosmetics ? '🗑 Delete Product' : '🗑 পণ্য মুছুন'}
              </Text>
            </TouchableOpacity>
          )}

        </ScrollView>

        {/* Country Picker Modal */}
        <Modal visible={showCountryPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCountryPicker(false)}>
          <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowCountryPicker(false)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>{isCosmetics ? 'Select Country' : 'দেশ বেছে নিন'}</Text>
              <View style={{ width: 24 }} />
            </View>
            <ScrollView>
              {ORIGIN_COUNTRIES.map(country => (
                <TouchableOpacity
                  key={country}
                  style={{ padding: 16, borderBottomWidth: 0.5, borderBottomColor: COLORS.border, flexDirection: 'row', justifyContent: 'space-between' }}
                  onPress={() => { setOriginCountry(country); setShowCountryPicker(false); }}
                >
                  <Text style={{ fontSize: FONT_SIZES.md, color: COLORS.text }}>{country}</Text>
                  {originCountry === country && <Ionicons name="checkmark" size={20} color={COLORS.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </SafeAreaView>
        </Modal>

      </SafeAreaView>
    </Modal>
  );
}

// ══════════════════════════════════════════
// BULK IMPORT MODAL
// ══════════════════════════════════════════
function BulkImportModal({ visible, shopId, shopType, onClose, onSaved }: any) {
  const isCosmetics = shopType === 'cosmetics' || shopType === 'imported';
  const [csvText, setCsvText] = useState('');
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<any[]>([]);
  const [step, setStep] = useState<'info' | 'paste' | 'preview'>('info');

  const handlePreview = () => {
    if (!csvText.trim()) { Alert.alert('Warning', 'Paste CSV data first'); return; }
    try {
      const lines = csvText.trim().split('\n');
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      const rows = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
        const obj: any = {};
        headers.forEach((h, i) => { obj[h] = values[i] || ''; });
        return obj;
      }).filter(r => r.name_english || r.name_bangla);
      setPreview(rows);
      setStep('preview');
    } catch {
      Alert.alert('Error', 'Invalid CSV format. Please check the template.');
    }
  };

  const handleImport = async () => {
    if (preview.length === 0) return;
    setImporting(true);
    try {
      const rows: BulkImportRow[] = preview.map(row => ({
        name_bangla: row.name_bangla || row.name_english || undefined,
        name_english: row.name_english || row.name_bangla || undefined,
        brand: row.brand || undefined,
        category: row.category || 'other',
        size: row.size || undefined,
        unit: row.unit || 'piece',
        sale_price: parseFloat(row.sale_price) || 0,
        purchase_price: parseFloat(row.purchase_price) || 0,
        mrp: row.mrp ? parseFloat(row.mrp) : undefined,
        current_stock: parseFloat(row.current_stock) || 0,
        min_stock_alert: parseFloat(row.min_stock_alert) || 5,
        barcode: row.barcode || undefined,
        origin_country: row.origin_country || undefined,
        expiry_date: row.expiry_date || undefined,
      }));
      const result = await productApi.bulkImport(rows);
      Alert.alert(
        isCosmetics ? 'Import Complete' : 'আমদানি সম্পন্ন',
        `✓ ${result.imported} products imported${result.failed > 0 ? `\n✗ ${result.failed} failed` : ''}`,
        [{ text: 'OK', onPress: () => { onSaved(); onClose(); setStep('info'); setCsvText(''); setPreview([]); } }]
      );
    } catch (e: any) {
      Alert.alert(isCosmetics ? 'Import Failed' : 'আমদানি ব্যর্থ', e.message);
    } finally { setImporting(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={() => { onClose(); setStep('info'); setCsvText(''); setPreview([]); }}>
            <Ionicons name="close" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>{isCosmetics ? 'Bulk Import' : 'বাল্ক আমদানি'}</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>

          {step === 'info' && (
            <>
              {/* Instructions */}
              <View style={{ backgroundColor: '#EFF6FF', borderRadius: 12, padding: 16, gap: 10 }}>
                <Text style={{ fontSize: FONT_SIZES.md, fontWeight: '700', color: '#1E40AF' }}>
                  {isCosmetics ? 'How to Bulk Import' : 'বাল্ক আমদানি পদ্ধতি'}
                </Text>
                {[
                  isCosmetics ? '1. Download the template below' : '১. নিচের টেমপ্লেট ডাউনলোড করুন',
                  isCosmetics ? '2. Fill your product data in Excel/Google Sheets' : '২. Excel বা Google Sheets-এ পণ্যের তথ্য দিন',
                  isCosmetics ? '3. Save as CSV format' : '৩. CSV ফরম্যাটে সেভ করুন',
                  isCosmetics ? '4. Paste the CSV data here' : '৪. CSV ডেটা এখানে পেস্ট করুন',
                ].map((step, i) => (
                  <Text key={i} style={{ fontSize: FONT_SIZES.sm, color: '#1E40AF' }}>{step}</Text>
                ))}
              </View>

              {/* Template */}
              <View style={{ backgroundColor: COLORS.surfaceSecondary, borderRadius: 12, padding: 14, gap: 8 }}>
                <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.text }}>
                  {isCosmetics ? '📋 CSV Template (Column Headers)' : '📋 CSV টেমপ্লেট (কলামের নাম)'}
                </Text>
                <Text style={{ fontSize: 11, color: COLORS.textSecondary, fontFamily: 'monospace' }}>
                  {BULK_TEMPLATE}
                </Text>
                <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 4 }}>
                  {isCosmetics
                    ? '* Required: name_english, sale_price, unit'
                    : '* আবশ্যিক: name_bangla, sale_price, unit'}
                </Text>
              </View>

              {/* Example row */}
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.text }}>
                  {isCosmetics ? '📝 Example Row' : '📝 উদাহরণ সারি'}
                </Text>
                <View style={{ backgroundColor: '#F0FFF4', borderRadius: 10, padding: 12 }}>
                  <Text style={{ fontSize: 10, color: COLORS.text, fontFamily: 'monospace', lineHeight: 18 }}>
                    {isCosmetics
                      ? 'Vaseline Body Lotion 400ML,,Vaseline,Skin Care,400ML,piece,480,350,850,50,10,8906087770558,Thailand,Jan-2028'
                      : 'সয়াবিন তেল,Soybean Oil,তীর,oil,1L,piece,178,165,890,20,5,,,'}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={{ backgroundColor: COLORS.primary, borderRadius: 12, height: 52, alignItems: 'center', justifyContent: 'center' }}
                onPress={() => setStep('paste')}
              >
                <Text style={{ color: '#fff', fontSize: FONT_SIZES.md, fontWeight: '700' }}>
                  {isCosmetics ? 'Next — Paste CSV Data →' : 'পরবর্তী — CSV পেস্ট করুন →'}
                </Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'paste' && (
            <>
              <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.textSecondary }}>
                {isCosmetics
                  ? 'Copy your CSV data from Excel/Google Sheets and paste below:'
                  : 'Excel বা Google Sheets থেকে CSV ডেটা কপি করে নিচে পেস্ট করুন:'}
              </Text>
              <TextInput
                style={{
                  borderWidth: 1, borderColor: COLORS.border, borderRadius: 12,
                  padding: 14, fontSize: 12, color: COLORS.text, minHeight: 200,
                  backgroundColor: COLORS.surfaceSecondary, textAlignVertical: 'top',
                  fontFamily: 'monospace',
                }}
                value={csvText}
                onChangeText={setCsvText}
                multiline
                placeholder={`name_english,brand,category...\nVaseline 400ML,Vaseline,Skin Care...`}
                placeholderTextColor={COLORS.textMuted}
                autoFocus
              />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: COLORS.surfaceSecondary, borderWidth: 1, borderColor: COLORS.border }]}
                  onPress={() => setStep('info')}
                >
                  <Text style={{ color: COLORS.textSecondary, fontWeight: '600' }}>
                    {isCosmetics ? '← Back' : '← পেছনে'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: COLORS.primary }]}
                  onPress={handlePreview}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>
                    {isCosmetics ? 'Preview →' : 'প্রিভিউ →'}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {step === 'preview' && (
            <>
              <View style={{ backgroundColor: '#F0FFF4', borderRadius: 10, padding: 12 }}>
                <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.sale }}>
                  {isCosmetics
                    ? `✓ ${preview.length} products ready to import`
                    : `✓ ${preview.length} টি পণ্য আমদানির জন্য প্রস্তুত`}
                </Text>
              </View>

              {/* Preview list */}
              {preview.slice(0, 10).map((row, i) => (
                <View key={i} style={{ backgroundColor: COLORS.surfaceSecondary, borderRadius: 10, padding: 12, gap: 4 }}>
                  <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.text }}>
                    {i + 1}. {row.name_english || row.name_bangla}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    {row.brand && <Text style={{ fontSize: 11, color: COLORS.primary }}>{row.brand}</Text>}
                    {row.category && <Text style={{ fontSize: 11, color: COLORS.textSecondary }}>{row.category}</Text>}
                    {row.sale_price && <Text style={{ fontSize: 11, color: COLORS.sale }}>৳{row.sale_price}</Text>}
                    {row.current_stock && <Text style={{ fontSize: 11, color: COLORS.textMuted }}>Stock: {row.current_stock}</Text>}
                  </View>
                  {row.barcode && <Text style={{ fontSize: 10, color: COLORS.textMuted }}>🔢 {row.barcode}</Text>}
                  {row.expiry_date && <Text style={{ fontSize: 10, color: '#F59E0B' }}>⏰ {row.expiry_date}</Text>}
                </View>
              ))}

              {preview.length > 10 && (
                <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textMuted, textAlign: 'center' }}>
                  {isCosmetics ? `... and ${preview.length - 10} more products` : `... আরো ${preview.length - 10} টি পণ্য`}
                </Text>
              )}

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: COLORS.surfaceSecondary, borderWidth: 1, borderColor: COLORS.border }]}
                  onPress={() => setStep('paste')}
                >
                  <Text style={{ color: COLORS.textSecondary, fontWeight: '600' }}>
                    {isCosmetics ? '← Back' : '← পেছনে'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: COLORS.primary }, importing && { opacity: 0.6 }]}
                  onPress={handleImport}
                  disabled={importing}
                >
                  {importing
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={{ color: '#fff', fontWeight: '700' }}>
                        {isCosmetics ? '⬆ Import All' : '⬆ সব আমদানি করুন'}
                      </Text>}
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
// ══════════════════════════════════════════
// STOCK IN MODAL
// ══════════════════════════════════════════
function StockInModal({ visible, product, onClose, onSaved }: any) {
  const { shop, user } = useAuthStore();
  const isCosmetics = shop?.shop_type === 'cosmetics' || shop?.shop_type === 'imported';

  const [quantity, setQuantity] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [showSupplierPicker, setShowSupplierPicker] = useState(false);

  useEffect(() => {
    if (product) {
      setPurchasePrice(String(product.purchase_price ?? ''));
    }
    setQuantity('');
    setNote('');
    setSelectedSupplier(null);
  }, [product, visible]);

  useEffect(() => {
    if (visible) {
      suppliersApi.list().then(setSuppliers).catch(() => {});
    }
  }, [visible]);

  const newStock = (product?.current_stock ?? 0) + (parseFloat(quantity) || 0);

  const handleSave = async () => {
    if (!quantity || parseFloat(quantity) <= 0) {
      Alert.alert(
        isCosmetics ? 'Warning' : 'সতর্কতা',
        isCosmetics ? 'Enter quantity received' : 'পরিমাণ দিন'
      );
      return;
    }
    if (!purchasePrice || parseFloat(purchasePrice) <= 0) {
      Alert.alert(
        isCosmetics ? 'Warning' : 'সতর্কতা',
        isCosmetics ? 'Enter purchase price' : 'ক্রয় মূল্য দিন'
      );
      return;
    }
    setSaving(true);
    try {
      const qty = parseFloat(quantity);
      const price = parseFloat(purchasePrice);
      await inventoryApi.stockIn({
        product_id: product.id,
        quantity: qty,
        purchase_price: price,
        supplier_id: selectedSupplier?.id,
        notes: note || (selectedSupplier ? `From ${selectedSupplier.name}` : 'Stock received'),
      });
      const store = useProductStore.getState();
      if (store.updateStock) {
        store.updateStock(product.id, qty);
      }

      Alert.alert(
        isCosmetics ? 'Stock Updated ✓' : 'স্টক আপডেট ✓',
        isCosmetics
          ? `${qty} ${product.unit} added\nNew stock: ${newStock} ${product.unit}`
          : `${qty} ${product.unit} যোগ হয়েছে\nনতুন স্টক: ${newStock} ${product.unit}`,
        [{ text: 'OK', onPress: () => { onSaved(); onClose(); } }]
      );
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>
            {isCosmetics ? 'Stock In ↑' : 'স্টক ইন ↑'}
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
          {/* Product info */}
          <View style={{ backgroundColor: '#F0FFF4', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.sale }}>
            <Text style={{ fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.text }}>
              {product?.name_bangla || product?.name_english}
            </Text>
            {product?.brand && (
              <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.primary, marginTop: 2 }}>
                {product.brand}
              </Text>
            )}
            <View style={{ flexDirection: 'row', gap: 20, marginTop: 8 }}>
              <View>
                <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textMuted }}>
                  {isCosmetics ? 'Current Stock' : 'বর্তমান স্টক'}
                </Text>
                <Text style={{ fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.primary }}>
                  {product?.current_stock} {product?.unit}
                </Text>
              </View>
              {quantity ? (
                <View>
                  <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textMuted }}>
                    {isCosmetics ? 'After Stock In' : 'যোগ করলে হবে'}
                  </Text>
                  <Text style={{ fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.sale }}>
                    {newStock} {product?.unit}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Quick quantity buttons */}
          <View style={{ gap: 8 }}>
            <Text style={styles.fieldLabel}>
              {isCosmetics ? 'Quantity Received *' : 'প্রাপ্ত পরিমাণ *'}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
              {[6, 10, 12, 24, 48].map(q => (
                <TouchableOpacity
                  key={q}
                  style={[styles.unitBtn, quantity === String(q) && styles.unitBtnActive]}
                  onPress={() => setQuantity(String(q))}
                >
                  <Text style={[styles.unitBtnTxt, quantity === String(q) && { color: '#fff' }]}>
                    {q}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.modalInput}
              value={quantity}
              onChangeText={setQuantity}
              placeholder={isCosmetics ? 'Enter quantity' : 'পরিমাণ লিখুন'}
              placeholderTextColor={COLORS.textMuted}
              keyboardType="numeric"
              autoFocus
            />
          </View>

          {/* Purchase price */}
          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>
              {isCosmetics ? 'Purchase Price (৳) *' : 'ক্রয় মূল্য (৳) *'}
            </Text>
            <TextInput
              style={styles.modalInput}
              value={purchasePrice}
              onChangeText={setPurchasePrice}
              placeholder="0"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="numeric"
            />
            {purchasePrice && quantity ? (
              <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textMuted }}>
                {isCosmetics ? 'Total cost' : 'মোট খরচ'}: ৳{(parseFloat(quantity || '0') * parseFloat(purchasePrice || '0')).toFixed(0)}
              </Text>
            ) : null}
          </View>

          {/* Supplier */}
          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>
              {isCosmetics ? 'Supplier (optional)' : 'সাপ্লায়ার (ঐচ্ছিক)'}
            </Text>
            <TouchableOpacity
              style={[styles.modalInput, { justifyContent: 'center', flexDirection: 'row', alignItems: 'center' }]}
              onPress={() => setShowSupplierPicker(true)}
            >
              <Text style={{ flex: 1, fontSize: FONT_SIZES.md, color: selectedSupplier ? COLORS.text : COLORS.textMuted }}>
                {selectedSupplier ? selectedSupplier.name : (isCosmetics ? 'Select supplier...' : 'সাপ্লায়ার বেছে নিন...')}
              </Text>
              <Ionicons name="chevron-down" size={16} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Supplier picker modal */}
          <Modal visible={showSupplierPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowSupplierPicker(false)}>
            <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setShowSupplierPicker(false)}>
                  <Ionicons name="close" size={24} color={COLORS.text} />
                </TouchableOpacity>
                <Text style={styles.modalTitle}>{isCosmetics ? 'Select Supplier' : 'সাপ্লায়ার বেছে নিন'}</Text>
                <View style={{ width: 24 }} />
              </View>
              <FlatList
                data={[null, ...suppliers]}
                keyExtractor={(s, i) => s?.id ?? `none_${i}`}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={{ padding: 16, borderBottomWidth: 0.5, borderBottomColor: COLORS.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                    onPress={() => { setSelectedSupplier(item); setShowSupplierPicker(false); }}
                  >
                    <View>
                      <Text style={{ fontSize: FONT_SIZES.md, color: item ? COLORS.text : COLORS.textMuted }}>
                        {item ? item.name : (isCosmetics ? 'No supplier' : 'কোনো সাপ্লায়ার নেই')}
                      </Text>
                      {item?.phone && <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textMuted }}>{item.phone}</Text>}
                    </View>
                    {selectedSupplier?.id === item?.id && <Ionicons name="checkmark" size={20} color={COLORS.primary} />}
                  </TouchableOpacity>
                )}
              />
            </SafeAreaView>
          </Modal>

          {/* Note */}
          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>
              {isCosmetics ? 'Note (optional)' : 'নোট (ঐচ্ছিক)'}
            </Text>
            <TextInput
              style={styles.modalInput}
              value={note}
              onChangeText={setNote}
              placeholder={isCosmetics ? 'e.g. Invoice #1234' : 'যেমন: ইনভয়েস #১২৩৪'}
              placeholderTextColor={COLORS.textMuted}
            />
          </View>

          {/* Action buttons */}
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: COLORS.surfaceSecondary, borderWidth: 1, borderColor: COLORS.border }]}
              onPress={onClose}
            >
              <Text style={{ color: COLORS.textSecondary, fontWeight: '600' }}>
                {isCosmetics ? 'Cancel' : 'বাতিল'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: COLORS.sale }, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <>
                  <Ionicons name="arrow-up" size={18} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: FONT_SIZES.md }}>
                    {isCosmetics ? 'Add Stock ✓' : 'স্টক যোগ করুন ✓'}
                  </Text>
                </>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
// ══════════════════════════════════════════
// LOW STOCK TAB
// ══════════════════════════════════════════
function LowStockTab({ isCosmetics, onStockIn, onDamage }: {
  isCosmetics: boolean;
  onStockIn: (p: Product) => void;
  onDamage: (p: Product) => void;
}) {
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await inventoryApi.lowStock();
      setItems(data);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setLoading(false); }
  };

  if (loading) return <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />;

  return (
    <FlatList
      data={items}
      keyExtractor={p => p.id}
      contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40 }}
      ListHeaderComponent={
        <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, marginBottom: 4 }}>
          {isCosmetics ? `${items.length} products below minimum stock` : `${items.length} টি পণ্য সর্বনিম্ন স্টকের নিচে`}
        </Text>
      }
      ListEmptyComponent={
        <View style={{ alignItems: 'center', paddingTop: 60, gap: 8 }}>
          <Ionicons name="checkmark-circle-outline" size={48} color={COLORS.sale} />
          <Text style={{ color: COLORS.textMuted, fontSize: FONT_SIZES.md }}>
            {isCosmetics ? 'All products well stocked' : 'সব পণ্যের স্টক ঠিকঠাক আছে'}
          </Text>
        </View>
      }
      renderItem={({ item }) => {
        const pct = item.min_stock_alert > 0 ? item.current_stock / item.min_stock_alert : 1;
        const urgency = pct === 0 ? COLORS.error : pct <= 0.5 ? '#F97316' : '#F59E0B';
        return (
          <View style={[styles.productCard, { borderLeftWidth: 4, borderLeftColor: urgency }]}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={styles.productName} numberOfLines={1}>
                {item.name_bangla || item.name_english}
              </Text>
              {(item as any).brand && (
                <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.primary, fontWeight: '600' }}>
                  {(item as any).brand}
                </Text>
              )}
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                <View>
                  <Text style={{ fontSize: 10, color: COLORS.textMuted }}>
                    {isCosmetics ? 'Current' : 'বর্তমান'}
                  </Text>
                  <Text style={{ fontSize: FONT_SIZES.md, fontWeight: '700', color: urgency }}>
                    {item.current_stock} {item.unit}
                  </Text>
                </View>
                <View>
                  <Text style={{ fontSize: 10, color: COLORS.textMuted }}>
                    {isCosmetics ? 'Min Alert' : 'সর্বনিম্ন'}
                  </Text>
                  <Text style={{ fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.textSecondary }}>
                    {item.min_stock_alert} {item.unit}
                  </Text>
                </View>
              </View>
            </View>
            <View style={{ gap: 6, justifyContent: 'center' }}>
              <TouchableOpacity
                style={[styles.stockInBtn, { paddingHorizontal: 10, paddingVertical: 6 }]}
                onPress={() => onStockIn(item)}
              >
                <Ionicons name="arrow-up" size={12} color="#fff" />
                <Text style={[styles.stockInBtnTxt, { fontSize: 11 }]}>Stock In</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#FEE2E2', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}
                onPress={() => onDamage(item)}
              >
                <Ionicons name="alert-circle-outline" size={12} color={COLORS.error} />
                <Text style={{ fontSize: 11, color: COLORS.error, fontWeight: '700' }}>
                  {isCosmetics ? 'Damage' : 'ক্ষতি'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      }}
    />
  );
}

// ══════════════════════════════════════════
// EXPIRING TAB
// ══════════════════════════════════════════
const EXPIRY_FILTERS = [7, 14, 30, 60];

function ExpiringTab({ isCosmetics }: { isCosmetics: boolean }) {
  const [days, setDays] = useState(30);
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { load(days); }, [days]);

  const load = async (d: number) => {
    setLoading(true);
    try {
      const data = await inventoryApi.expiring(d);
      setItems(data);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setLoading(false); }
  };

  const expiryColor = (expiry: string) => {
    const d = differenceInDays(parseISO(expiry), new Date());
    if (d <= 0) return COLORS.error;
    if (d <= 7) return COLORS.error;
    if (d <= 14) return '#F97316';
    return '#F59E0B';
  };

  const daysLeft = (expiry: string) => {
    const d = differenceInDays(parseISO(expiry), new Date());
    if (d < 0) return isCosmetics ? 'Expired' : 'মেয়াদ শেষ';
    if (d === 0) return isCosmetics ? 'Expires today' : 'আজ শেষ';
    return isCosmetics ? `${d} days left` : `${d} দিন বাকি`;
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Days filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{ maxHeight: 48 }}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 8, alignItems: 'center', paddingVertical: 8 }}
      >
        {EXPIRY_FILTERS.map(d => (
          <TouchableOpacity
            key={d}
            style={[styles.catChip, days === d && styles.catChipActive]}
            onPress={() => setDays(d)}
          >
            <Text style={[styles.catChipTxt, days === d && { color: '#fff' }]}>
              {isCosmetics ? `${d} days` : `${d} দিন`}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} /> : (
        <FlatList
          data={items}
          keyExtractor={p => p.id}
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40 }}
          ListHeaderComponent={
            <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, marginBottom: 4 }}>
              {isCosmetics
                ? `${items.length} products expiring within ${days} days`
                : `${days} দিনের মধ্যে মেয়াদ শেষ হবে: ${items.length} টি পণ্য`}
            </Text>
          }
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 60, gap: 8 }}>
              <Ionicons name="checkmark-circle-outline" size={48} color={COLORS.sale} />
              <Text style={{ color: COLORS.textMuted, fontSize: FONT_SIZES.md }}>
                {isCosmetics ? 'No products expiring soon' : 'এই সময়ের মধ্যে কোনো পণ্যের মেয়াদ শেষ হচ্ছে না'}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const p = item as any;
            const color = p.expiry_date ? expiryColor(p.expiry_date) : '#F59E0B';
            const label = p.expiry_date ? daysLeft(p.expiry_date) : '';
            return (
              <View style={[styles.productCard, { borderLeftWidth: 4, borderLeftColor: color }]}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.productName} numberOfLines={1}>
                    {item.name_bangla || item.name_english}
                  </Text>
                  {p.brand && (
                    <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.primary, fontWeight: '600' }}>
                      {p.brand}
                    </Text>
                  )}
                  <Text style={{ fontSize: FONT_SIZES.xs, color: color, fontWeight: '700', marginTop: 4 }}>
                    ⏰ {label}
                  </Text>
                  <Text style={{ fontSize: 10, color: COLORS.textMuted }}>
                    {isCosmetics ? 'Expiry:' : 'মেয়াদ:'} {p.expiry_date}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={[styles.stockNum, { fontSize: FONT_SIZES.lg, color }]}>
                    {item.current_stock}
                  </Text>
                  <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textMuted }}>{item.unit}</Text>
                  <View style={{ backgroundColor: color + '20', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                    <Text style={{ fontSize: 10, color, fontWeight: '700' }}>{label}</Text>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

// ══════════════════════════════════════════
// MOVEMENTS TAB
// ══════════════════════════════════════════
const MOVEMENT_FILTERS: { key: MovementType | 'all'; label: string; labelBn: string }[] = [
  { key: 'all',      label: 'All',      labelBn: 'সব' },
  { key: 'stock_in', label: 'Stock In', labelBn: 'স্টক ইন' },
  { key: 'damage',   label: 'Damage',   labelBn: 'ক্ষতি' },
  { key: 'loss',     label: 'Loss',     labelBn: 'হারানো' },
  { key: 'expired',  label: 'Expired',  labelBn: 'মেয়াদ শেষ' },
  { key: 'theft',    label: 'Theft',    labelBn: 'চুরি' },
];

const MOVEMENT_COLORS: Record<string, string> = {
  stock_in: '#16A34A',
  damage:   '#DC2626',
  loss:     '#F97316',
  expired:  '#9333EA',
  theft:    '#1D4ED8',
};

function MovementsTab({ isCosmetics }: { isCosmetics: boolean }) {
  const [typeFilter, setTypeFilter] = useState<MovementType | 'all'>('all');
  const [items, setItems] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    setItems([]);
    setPage(1);
    setHasMore(true);
    loadPage(1, typeFilter);
  }, [typeFilter]);

  const loadPage = async (p: number, type: MovementType | 'all') => {
    setLoading(true);
    try {
      const data = await inventoryApi.movements(p, type === 'all' ? undefined : type);
      if (p === 1) {
        setItems(data);
      } else {
        setItems(prev => [...prev, ...data]);
      }
      setHasMore(data.length === 20);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setLoading(false); }
  };

  const loadMore = () => {
    if (!hasMore || loading) return;
    const next = page + 1;
    setPage(next);
    loadPage(next, typeFilter);
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Type filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{ maxHeight: 48 }}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 8, alignItems: 'center', paddingVertical: 8 }}
      >
        {MOVEMENT_FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.catChip, typeFilter === f.key && { backgroundColor: MOVEMENT_COLORS[f.key] ?? COLORS.primary, borderColor: MOVEMENT_COLORS[f.key] ?? COLORS.primary }]}
            onPress={() => setTypeFilter(f.key)}
          >
            <Text style={[styles.catChipTxt, typeFilter === f.key && { color: '#fff' }]}>
              {isCosmetics ? f.label : f.labelBn}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading && items.length === 0
        ? <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
        : (
          <FlatList
            data={items}
            keyExtractor={m => m.id}
            contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40 }}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', paddingTop: 60, gap: 8 }}>
                <Ionicons name="list-outline" size={48} color={COLORS.textMuted} />
                <Text style={{ color: COLORS.textMuted, fontSize: FONT_SIZES.md }}>
                  {isCosmetics ? 'No movements found' : 'কোনো মুভমেন্ট নেই'}
                </Text>
              </View>
            }
            onEndReached={loadMore}
            onEndReachedThreshold={0.3}
            ListFooterComponent={loading ? <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 16 }} /> : null}
            renderItem={({ item }) => {
              const color = MOVEMENT_COLORS[item.type] ?? COLORS.primary;
              const isIn = item.type === 'stock_in';
              return (
                <View style={[styles.productCard, { paddingVertical: 10 }]}>
                  <View style={[{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 10 }, { backgroundColor: color + '20' }]}>
                    <Ionicons name={isIn ? 'arrow-up' : 'arrow-down'} size={18} color={color} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.productName, { fontSize: FONT_SIZES.sm }]} numberOfLines={1}>
                      {item.product_name}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                      <View style={{ backgroundColor: color + '20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                        <Text style={{ fontSize: 10, color, fontWeight: '700' }}>
                          {isCosmetics
                            ? MOVEMENT_FILTERS.find(f => f.key === item.type)?.label
                            : MOVEMENT_FILTERS.find(f => f.key === item.type)?.labelBn}
                        </Text>
                      </View>
                      <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textMuted }}>
                        {item.quantity_before} → {item.quantity_after}
                      </Text>
                    </View>
                    {item.supplier_name ? (
                      <Text style={{ fontSize: 10, color: COLORS.purchase, fontWeight: '600' }} numberOfLines={1}>
                        🏭 {item.supplier_name}
                      </Text>
                    ) : null}
                    {item.reference ? (
                      <Text style={{ fontSize: 10, color: COLORS.primary, fontWeight: '600' }} numberOfLines={1}>
                        🔗 {item.reference}
                      </Text>
                    ) : null}
                    {item.notes ? (
                      <Text style={{ fontSize: 10, color: COLORS.textMuted }} numberOfLines={1}>
                        {item.notes}
                      </Text>
                    ) : null}
                    <Text style={{ fontSize: 10, color: COLORS.textMuted }}>
                      {item.user_name} • {format(new Date(item.created_at), 'dd/MM HH:mm')}
                    </Text>
                  </View>
                  <Text style={{ fontSize: FONT_SIZES.md, fontWeight: '700', color, minWidth: 40, textAlign: 'right' }}>
                    {isIn ? '+' : '-'}{item.quantity}
                  </Text>
                </View>
              );
            }}
          />
        )}
    </View>
  );
}

// ══════════════════════════════════════════
// DAMAGE / LOSS MODAL
// ══════════════════════════════════════════
const DAMAGE_TYPES: { key: MovementType; label: string; labelBn: string; color: string }[] = [
  { key: 'damage',  label: 'Damage',  labelBn: 'ক্ষতিগ্রস্ত', color: '#DC2626' },
  { key: 'loss',    label: 'Loss',    labelBn: 'হারানো',       color: '#F97316' },
  { key: 'expired', label: 'Expired', labelBn: 'মেয়াদ শেষ',   color: '#9333EA' },
  { key: 'theft',   label: 'Theft',   labelBn: 'চুরি',         color: '#1D4ED8' },
];

function DamageLossModal({ visible, product, isCosmetics, onClose, onSaved }: any) {
  const [damageType, setDamageType] = useState<MovementType>('damage');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) { setQuantity(''); setNotes(''); setDamageType('damage'); }
  }, [visible]);

  const handleSave = async () => {
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) {
      Alert.alert(isCosmetics ? 'Warning' : 'সতর্কতা', isCosmetics ? 'Enter quantity' : 'পরিমাণ দিন');
      return;
    }
    if (product && qty > product.current_stock) {
      Alert.alert(
        isCosmetics ? 'Warning' : 'সতর্কতা',
        isCosmetics ? `Cannot exceed current stock (${product.current_stock})` : `বর্তমান স্টকের (${product.current_stock}) বেশি হতে পারবে না`
      );
      return;
    }
    setSaving(true);
    try {
      await inventoryApi.damage({ product_id: product.id, quantity: qty, type: damageType, notes: notes || undefined });
      useProductStore.getState().updateStock(product.id, -qty);
      Alert.alert(
        isCosmetics ? 'Recorded ✓' : 'রেকর্ড হয়েছে ✓',
        isCosmetics
          ? `${qty} ${product.unit} recorded as ${DAMAGE_TYPES.find(d => d.key === damageType)?.label}`
          : `${qty} ${product.unit} ${DAMAGE_TYPES.find(d => d.key === damageType)?.labelBn} হিসেবে রেকর্ড হয়েছে`,
        [{ text: 'OK', onPress: () => { onSaved(); onClose(); } }]
      );
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>
            {isCosmetics ? 'Record Damage / Loss' : 'ক্ষতি / হারানো রেকর্ড'}
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
          {/* Product info */}
          {product && (
            <View style={{ backgroundColor: '#FEF2F2', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#FECACA' }}>
              <Text style={{ fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.text }}>
                {product.name_bangla || product.name_english}
              </Text>
              {product.brand && (
                <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.primary, marginTop: 2 }}>{product.brand}</Text>
              )}
              <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, marginTop: 6 }}>
                {isCosmetics ? 'Current stock:' : 'বর্তমান স্টক:'} {product.current_stock} {product.unit}
              </Text>
            </View>
          )}

          {/* Type selector */}
          <View style={{ gap: 8 }}>
            <Text style={styles.fieldLabel}>{isCosmetics ? 'Reason *' : 'কারণ *'}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {DAMAGE_TYPES.map(dt => (
                <TouchableOpacity
                  key={dt.key}
                  style={{
                    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5,
                    borderColor: damageType === dt.key ? dt.color : COLORS.border,
                    backgroundColor: damageType === dt.key ? dt.color + '15' : COLORS.surfaceSecondary,
                  }}
                  onPress={() => setDamageType(dt.key)}
                >
                  <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: '600', color: damageType === dt.key ? dt.color : COLORS.textSecondary }}>
                    {isCosmetics ? dt.label : dt.labelBn}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Quantity */}
          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>{isCosmetics ? 'Quantity *' : 'পরিমাণ *'}</Text>
            <TextInput
              style={styles.modalInput}
              value={quantity}
              onChangeText={setQuantity}
              placeholder="0"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="numeric"
              autoFocus
            />
          </View>

          {/* Notes */}
          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>{isCosmetics ? 'Notes (optional)' : 'নোট (ঐচ্ছিক)'}</Text>
            <TextInput
              style={[styles.modalInput, { height: 80, textAlignVertical: 'top', paddingTop: 12 }]}
              value={notes}
              onChangeText={setNotes}
              placeholder={isCosmetics ? 'e.g. Found broken during stocktake' : 'যেমন: স্টক গণনায় ভাঙা পাওয়া গেছে'}
              placeholderTextColor={COLORS.textMuted}
              multiline
            />
          </View>

          {/* Actions */}
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: COLORS.surfaceSecondary, borderWidth: 1, borderColor: COLORS.border }]}
              onPress={onClose}
            >
              <Text style={{ color: COLORS.textSecondary, fontWeight: '600' }}>
                {isCosmetics ? 'Cancel' : 'বাতিল'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: DAMAGE_TYPES.find(d => d.key === damageType)?.color ?? COLORS.error }, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={{ color: '#fff', fontWeight: '700', fontSize: FONT_SIZES.md }}>
                    {isCosmetics ? 'Record ✓' : 'রেকর্ড করুন ✓'}
                  </Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Reusable field component ──
function Field({ label, value, onChangeText, placeholder, numeric }: {
  label: string; value: string;
  onChangeText: (t: string) => void;
  placeholder?: string; numeric?: boolean;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.modalInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textMuted}
        keyboardType={numeric ? 'numeric' : 'default'}
      />
    </View>
  );
}

// ── Styles ──
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background ?? '#F9FAFB' },
  header: { backgroundColor: COLORS.primary, padding: 20 },
  title: { fontSize: FONT_SIZES.xl, fontWeight: '700', color: '#fff' },
  subtitle: { fontSize: FONT_SIZES.sm, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  alertBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.error, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  alertText: { color: '#fff', fontSize: FONT_SIZES.xs, fontWeight: '700' },
  tabBar: { flexDirection: 'row', backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: COLORS.primary },
  tabBtnTxt: { fontSize: 10, color: COLORS.textMuted, fontWeight: '500' },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, margin: 12, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, height: 44 },
  searchInput: { flex: 1, fontSize: FONT_SIZES.sm, color: COLORS.text, paddingHorizontal: 10 },
  catChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, backgroundColor: '#fff' },
  catChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  catChipTxt: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, fontWeight: '600' },
  productCard: { flexDirection: 'row', backgroundColor: COLORS.surface, borderRadius: 12, padding: 14, borderWidth: 0.5, borderColor: COLORS.border },
  productName: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.text },
  stockNum: { fontSize: FONT_SIZES.xxl, fontWeight: '700', color: COLORS.primary },
  fabRow: { position: 'absolute', bottom: 24, right: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  bulkBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 24, elevation: 4, borderWidth: 1.5, borderColor: COLORS.primary },
  bulkBtnTxt: { fontSize: FONT_SIZES.sm, color: COLORS.primary, fontWeight: '700' },
  fab: { width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', elevation: 8 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 0.5, borderBottomColor: COLORS.border },
  modalTitle: { fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.text },
  modalInput: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, height: 48, paddingHorizontal: 14, fontSize: FONT_SIZES.md, color: COLORS.text, backgroundColor: COLORS.surfaceSecondary },
  sectionLabel: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.textSecondary, marginTop: 4 },
  fieldLabel: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.text },
  unitBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, backgroundColor: '#fff' },
  unitBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  unitBtnTxt: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary },
  actionBtn: { flex: 1, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stockInBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: COLORS.sale, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8, marginTop: 2 },
  stockInBtnTxt: { fontSize: 9, color: '#fff', fontWeight: '700' },
});
