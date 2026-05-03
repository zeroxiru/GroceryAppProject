import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Modal, Alert, ActivityIndicator, TextInput,
  Vibration, ScrollView,
} from 'react-native';
import { CameraView, Camera } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS, FONT_SIZES } from '@/constants';
import { useProductStore, useAuthStore } from '@/store';
import { productApi } from '@/services/api/productApi';
import { GlobalProduct } from '@/types';
import { v4 as uuidv4 } from 'uuid';

// Categories based on shop type
const GROCERY_CATEGORIES = [
  'grain', 'oil', 'spice', 'essential', 'vegetable',
  'dairy', 'drink', 'snack', 'beverage', 'toiletry', 'other'
];

const COSMETICS_CATEGORIES = [
  'Hair Care', 'Skin Care', 'Face Care', 'Body Care',
  'Baby Care', 'Perfume', 'Makeup', 'Nail Care', 'Other'
];

const IMPORTED_CATEGORIES = [
  'Chocolates', 'Instant Noodles', 'Snacks', 'Beverages',
  'Cosmetics', 'Baby Food', 'Health', 'Other'
];

const ORIGIN_COUNTRIES = [
  'Bangladesh', 'India', 'Thailand', 'China', 'USA',
  'Germany', 'UK', 'Japan', 'South Korea', 'Indonesia',
  'Malaysia', 'Singapore', 'Canada', 'Australia', 'Other'
];

interface FoundProduct {
  id: string;
  name: string;
  brand?: string;
  origin_country?: string;
  unit: string;
  sale_price: number;
  barcode: string;
  current_stock?: number;
  expiry_date?: string;
  mrp?: number;
}

export default function BarcodeScannerScreen() {
  const { products = [], setProducts } = useProductStore();
  const { shop } = useAuthStore();
  const isCosmetics = shop?.shop_type === 'cosmetics' || shop?.shop_type === 'imported';

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [torch, setTorch] = useState(false);
  const [scanning, setScanning] = useState(true);
  const [loading, setLoading] = useState(false);

  // Found product state
  const [foundProduct, setFoundProduct] = useState<FoundProduct | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [productModalVisible, setProductModalVisible] = useState(false);

  // New product form state
  const [notFoundBarcode, setNotFoundBarcode] = useState('');
  const [newProductModal, setNewProductModal] = useState(false);

  // Basic fields
  const [newProductName, setNewProductName] = useState('');
  const [newProductPrice, setNewProductPrice] = useState('');
  const [newProductUnit, setNewProductUnit] = useState('piece');

  // Stock fields
  const [openingStock, setOpeningStock] = useState('0');
  const [minStockAlert, setMinStockAlert] = useState('5');
  const [purchasePrice, setPurchasePrice] = useState('');

  // Cosmetics/Imported fields
  const [productBrand, setProductBrand] = useState('');
  const [productMRP, setProductMRP] = useState('');
  const [productExpiry, setProductExpiry] = useState('');
  const [productCategory, setProductCategory] = useState('');
  const [productSize, setProductSize] = useState('');
  const [productCountry, setProductCountry] = useState('');
  const [showCountryPicker, setShowCountryPicker] = useState(false);

  const cooldownRef = useRef<boolean>(false);
  const lastScanned = useRef<string>('');

  useEffect(() => {
    requestPermission();
  }, []);

  const requestPermission = async () => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    setHasPermission(status === 'granted');
  };

  const handleBarcodeScan = async ({ data }: { type: string; data: string }) => {
    if (cooldownRef.current || !scanning || data === lastScanned.current) return;
    cooldownRef.current = true;
    lastScanned.current = data;
    setScanning(false);
    setLoading(true);
    Vibration.vibrate(100);

    try {
      // Always call API first — it is the authoritative source and prevents stale-cache misses
      const res = await productApi.barcodeLookup(data);

      if (res.product) {
        const p = res.product;
        // Sync to local cache if this product isn't already there
        if (!products.find(c => c.id === p.id)) {
          setProducts([...products, p as any]);
        }
        setFoundProduct({
          id: p.id,
          name: p.name_bangla || (p as any).name_english || '',
          brand: (p as any).brand,
          unit: p.unit,
          sale_price: p.sale_price,
          barcode: data,
          current_stock: p.current_stock,
          mrp: (p as any).mrp,
        });
        setQuantity(1);
        setProductModalVisible(true);
        return;
      }

      if (res.globalProduct) {
        const g = res.globalProduct;
        setFoundProduct({
          id: g.id,
          name: g.name_english,
          brand: g.brand,
          origin_country: g.origin_country,
          unit: g.unit,
          sale_price: g.standard_price || g.standard_mrp,
          barcode: data,
          mrp: g.standard_mrp,
        });
        setQuantity(1);
        setProductModalVisible(true);
        return;
      }

      // Confirmed not in DB — open add form
      setNotFoundBarcode(data);
      setProductCategory(isCosmetics ? 'Skin Care' : 'other');
      setNewProductModal(true);

    } catch (e) {
      // Offline fallback — check local cache before giving up
      const localMatch = products.find(p => (p as any).barcode === data);
      if (localMatch) {
        setFoundProduct({
          id: localMatch.id,
          name: localMatch.name_bangla || (localMatch as any).name_english || '',
          brand: (localMatch as any).brand,
          unit: localMatch.unit,
          sale_price: localMatch.sale_price,
          barcode: data,
          current_stock: localMatch.current_stock,
          mrp: (localMatch as any).mrp,
        });
        setQuantity(1);
        setProductModalVisible(true);
        return;
      }
      console.warn('Barcode lookup error:', e);
      setNotFoundBarcode(data);
      setNewProductModal(true);
    } finally {
      setLoading(false);
    }
  };

  const resumeScanning = () => {
    setScanning(true);
    setFoundProduct(null);
    setProductModalVisible(false);
    setNewProductModal(false);
    resetForm();
    setTimeout(() => {
      cooldownRef.current = false;
      lastScanned.current = '';
    }, 1500);
  };

  const resetForm = () => {
    setNewProductName('');
    setNewProductPrice('');
    setNewProductUnit('piece');
    setOpeningStock('0');
    setMinStockAlert('5');
    setPurchasePrice('');
    setProductBrand('');
    setProductMRP('');
    setProductExpiry('');
    setProductCategory('');
    setProductSize('');
    setProductCountry('');
  };

  const handleAddToBill = () => {
    if (!foundProduct) return;
    const item = {
      product_name: foundProduct.name,
      product_id: foundProduct.id,
      quantity,
      unit: foundProduct.unit,
      unit_price: foundProduct.sale_price,
      total: +(quantity * foundProduct.sale_price).toFixed(2),
      checked: true,
      confidence: 1.0,
    };
    router.back();
    router.setParams({ scannedItem: JSON.stringify(item) });
  };

  const handleSaveNewProduct = async () => {
    if (!newProductName.trim()) {
      Alert.alert('সতর্কতা', 'পণ্যের নাম দিন');
      return;
    }
    if (!newProductPrice.trim()) {
      Alert.alert('সতর্কতা', 'বিক্রয় মূল্য দিন');
      return;
    }
    setLoading(true);

    // Guard against duplicates: re-check the barcode one final time before creating
    if (notFoundBarcode) {
      try {
        const dupCheck = await productApi.barcodeLookup(notFoundBarcode);
        if (dupCheck.product) {
          const p = dupCheck.product;
          if (!products.find(c => c.id === p.id)) {
            setProducts([...products, p as any]);
          }
          setLoading(false);
          Alert.alert(
            'পণ্য আগে থেকেই আছে',
            `"${p.name_bangla || (p as any).name_english}" এই বারকোড দিয়ে ইতিমধ্যে ডেটাবেজে আছে।`,
            [{
              text: 'পণ্য দেখুন',
              onPress: () => {
                setNewProductModal(false);
                resetForm();
                setFoundProduct({
                  id: p.id,
                  name: p.name_bangla || (p as any).name_english || '',
                  brand: (p as any).brand,
                  unit: p.unit,
                  sale_price: p.sale_price,
                  barcode: notFoundBarcode,
                  current_stock: p.current_stock,
                  mrp: (p as any).mrp,
                });
                setQuantity(1);
                setProductModalVisible(true);
              },
            }],
          );
          return;
        }
      } catch {
        // Offline — check local cache
        const localDup = products.find(p => (p as any).barcode === notFoundBarcode);
        if (localDup) {
          setLoading(false);
          Alert.alert('সতর্কতা', 'এই বারকোড দিয়ে পণ্য আগে থেকেই আছে।');
          return;
        }
      }
    }

    try {
      const salePrice = parseFloat(newProductPrice) || 0;
      const costPrice = parseFloat(purchasePrice) || salePrice;
      const mrp = parseFloat(productMRP) || salePrice;
      const stock = parseFloat(openingStock) || 0;
      const minAlert = parseFloat(minStockAlert) || 5;

      const newProduct = {
        id: uuidv4(),
        shop_id: shop?.id,
        name_bangla: newProductName,
        name_english: newProductName,
        aliases: productBrand ? [productBrand.toLowerCase()] : [],
        unit: newProductUnit,
        category: productCategory || 'other',
        sale_price: salePrice,
        purchase_price: costPrice,
        current_stock: stock,
        min_stock_alert: minAlert,
        is_active: true,
        barcode: notFoundBarcode,
        brand: productBrand || null,
        origin_country: productCountry || null,
        expiry_date: productExpiry || null,
        mrp: mrp,
        size: productSize || null,
      };

      // Save to local store immediately
      setProducts([...products, newProduct as any]);

      // Sync to backend
      try {
        const created = await productApi.create(newProduct);
        setProducts(prev => prev.map((p: any) => p.id === newProduct.id ? created : p));
      } catch {
        console.warn('Offline — saved locally');
      }

      // Add to bill
      const item = {
        product_name: newProductName,
        product_id: newProduct.id,
        quantity: 1,
        unit: newProductUnit,
        unit_price: salePrice,
        total: salePrice,
        checked: true,
        confidence: 1.0,
      };

      setNewProductModal(false);
      resetForm();
      router.back();
      router.setParams({ scannedItem: JSON.stringify(item) });

    } catch (e: any) {
      Alert.alert('ত্রুটি', e.message);
    } finally {
      setLoading(false);
    }
  };

  const categories = shop?.shop_type === 'cosmetics'
    ? COSMETICS_CATEGORIES
    : shop?.shop_type === 'imported'
    ? IMPORTED_CATEGORIES
    : GROCERY_CATEGORIES;

  if (hasPermission === false) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface, justifyContent: 'center', alignItems: 'center' }}>
        <Ionicons name="camera-outline" size={64} color={COLORS.textMuted} />
        <Text style={{ color: COLORS.text, fontSize: FONT_SIZES.md, marginTop: 16, textAlign: 'center', paddingHorizontal: 32 }}>
          ক্যামেরা ব্যবহারের অনুমতি দিন
        </Text>
        <TouchableOpacity
          style={{ marginTop: 20, backgroundColor: COLORS.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 }}
          onPress={requestPermission}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>অনুমতি দিন</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ marginTop: 12 }} onPress={() => router.back()}>
          <Text style={{ color: COLORS.textSecondary }}>ফিরে যান</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (hasPermission === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Camera */}
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        enableTorch={torch}
        onBarcodeScanned={scanning ? handleBarcodeScan : undefined}
        barcodeScannerSettings={{
          barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'],
        }}
      />

      {/* Overlay */}
      <View style={styles.overlay}>
        <View style={styles.overlayTop} />
        <View style={{ flexDirection: 'row' }}>
          <View style={styles.overlaySide} />
          <View style={styles.focusBox}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
            {loading && <ActivityIndicator color={COLORS.primary} size="large" />}
          </View>
          <View style={styles.overlaySide} />
        </View>
        <View style={styles.overlayBottom}>
          <Text style={styles.scanHint}>
            {loading ? 'খুঁজছি...' : 'পণ্যের বারকোড ক্যামেরার সামনে ধরুন'}
          </Text>
        </View>
      </View>

      {/* Top bar */}
      <SafeAreaView style={styles.topBar} edges={['top']}>
        <TouchableOpacity style={styles.topBtn} onPress={() => router.back()}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>বারকোড স্ক্যান করুন</Text>
        <TouchableOpacity style={styles.topBtn} onPress={() => setTorch(!torch)}>
          <Ionicons name={torch ? 'flash' : 'flash-outline'} size={24} color="#fff" />
        </TouchableOpacity>
      </SafeAreaView>

      {/* ── PRODUCT FOUND MODAL ── */}
      <Modal visible={productModalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={resumeScanning}>
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={resumeScanning}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>পণ্য পাওয়া গেছে ✓</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
            {/* Product info card */}
            <View style={styles.productCard}>
              <Text style={styles.productCardName}>{foundProduct?.name}</Text>
              {foundProduct?.brand && (
                <Text style={styles.productCardBrand}>
                  {foundProduct.brand}
                  {foundProduct.origin_country ? ` • ${foundProduct.origin_country}` : ''}
                </Text>
              )}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                <View>
                  <Text style={{ fontSize: 10, color: COLORS.textMuted }}>বিক্রয় মূল্য</Text>
                  <Text style={styles.productCardPrice}>৳{foundProduct?.sale_price}</Text>
                </View>
                {foundProduct?.mrp && foundProduct.mrp !== foundProduct.sale_price && (
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 10, color: COLORS.textMuted }}>MRP</Text>
                    <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, textDecorationLine: 'line-through' }}>
                      ৳{foundProduct.mrp}
                    </Text>
                  </View>
                )}
                {foundProduct?.current_stock !== undefined && (
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 10, color: COLORS.textMuted }}>স্টক</Text>
                    <Text style={{ fontSize: FONT_SIZES.sm, color: foundProduct.current_stock < 5 ? COLORS.error : COLORS.sale, fontWeight: '700' }}>
                      {foundProduct.current_stock} {foundProduct.unit}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Quantity selector */}
            <View>
              <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.text, marginBottom: 10 }}>পরিমাণ</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                {[1, 2, 3, 5, 10].map(q => (
                  <TouchableOpacity
                    key={q}
                    style={[styles.qtyQuickBtn, quantity === q && styles.qtyQuickBtnActive]}
                    onPress={() => setQuantity(q)}
                  >
                    <Text style={[styles.qtyQuickTxt, quantity === q && { color: '#fff' }]}>{q}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <TouchableOpacity style={styles.qtyBtn} onPress={() => setQuantity(q => Math.max(1, q - 1))}>
                  <Ionicons name="remove" size={20} color={COLORS.text} />
                </TouchableOpacity>
                <Text style={{ fontSize: FONT_SIZES.xl, fontWeight: '700', flex: 1, textAlign: 'center' }}>{quantity}</Text>
                <TouchableOpacity style={styles.qtyBtn} onPress={() => setQuantity(q => q + 1)}>
                  <Ionicons name="add" size={20} color={COLORS.text} />
                </TouchableOpacity>
              </View>
              <View style={styles.totalRow}>
                <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.textSecondary }}>
                  {quantity} × ৳{foundProduct?.sale_price}
                </Text>
                <Text style={{ fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.primary }}>
                  ৳{((quantity) * (foundProduct?.sale_price ?? 0)).toFixed(0)}
                </Text>
              </View>
            </View>

            {/* Action buttons */}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity style={[styles.actionBtn, styles.actionBtnSecondary]} onPress={resumeScanning}>
                <Text style={{ color: COLORS.textSecondary, fontWeight: '600' }}>আবার স্ক্যান</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: COLORS.primary }]} onPress={handleAddToBill}>
                <Ionicons name="checkmark" size={20} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: FONT_SIZES.md }}>বিলে যোগ করুন</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── NEW PRODUCT MODAL ── */}
      <Modal visible={newProductModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={resumeScanning}>
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={resumeScanning}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>নতুন পণ্য যোগ করুন</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} showsVerticalScrollIndicator={false}>
            {/* Barcode info */}
            <View style={styles.barcodeInfoBox}>
              <Ionicons name="barcode-outline" size={16} color="#92400E" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: FONT_SIZES.xs, color: '#92400E', fontWeight: '700' }}>
                  বারকোড: {notFoundBarcode}
                </Text>
                <Text style={{ fontSize: FONT_SIZES.xs, color: '#92400E', marginTop: 2 }}>
                  এই পণ্য ডেটাবেজে নেই। তথ্য দিয়ে যোগ করুন।
                </Text>
              </View>
            </View>

            {/* ── SECTION 1: Basic Info ── */}
            <Text style={styles.sectionLabel}>📦 মূল তথ্য</Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>পণ্যের নাম *</Text>
              <TextInput
                style={styles.input}
                value={newProductName}
                onChangeText={setNewProductName}
                placeholder="যেমন: Vaseline Body Lotion 400ML"
                placeholderTextColor={COLORS.textMuted}
                autoFocus
              />
            </View>

            {isCosmetics && (
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>ব্র্যান্ড</Text>
                <TextInput
                  style={styles.input}
                  value={productBrand}
                  onChangeText={setProductBrand}
                  placeholder="যেমন: Vaseline, Nivea, AOX"
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>
            )}

            {isCosmetics && (
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>সাইজ / ভেরিয়েন্ট</Text>
                <TextInput
                  style={styles.input}
                  value={productSize}
                  onChangeText={setProductSize}
                  placeholder="যেমন: 400ML, 200GM, 50ML"
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>
            )}

            {/* Unit selector */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>একক *</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {['piece', 'kg', 'gram', 'litre', 'ml', 'dozen', 'packet'].map(u => (
                  <TouchableOpacity
                    key={u}
                    style={[styles.unitBtn, newProductUnit === u && styles.unitBtnActive]}
                    onPress={() => setNewProductUnit(u)}
                  >
                    <Text style={[styles.unitBtnTxt, newProductUnit === u && { color: '#fff', fontWeight: '700' }]}>{u}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* ── SECTION 2: Pricing ── */}
            <Text style={styles.sectionLabel}>💰 মূল্য তথ্য</Text>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={styles.fieldLabel}>বিক্রয় মূল্য (৳) *</Text>
                <TextInput
                  style={styles.input}
                  value={newProductPrice}
                  onChangeText={setNewProductPrice}
                  placeholder="0"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="numeric"
                />
              </View>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={styles.fieldLabel}>ক্রয় মূল্য (৳)</Text>
                <TextInput
                  style={styles.input}
                  value={purchasePrice}
                  onChangeText={setPurchasePrice}
                  placeholder="0"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="numeric"
                />
              </View>
            </View>

            {isCosmetics && (
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>MRP (বোতলে ছাপা দাম)</Text>
                <TextInput
                  style={styles.input}
                  value={productMRP}
                  onChangeText={setProductMRP}
                  placeholder="0"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="numeric"
                />
              </View>
            )}

            {/* ── SECTION 3: Stock ── */}
            <Text style={styles.sectionLabel}>📊 স্টক তথ্য</Text>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={styles.fieldLabel}>বর্তমান স্টক</Text>
                <TextInput
                  style={styles.input}
                  value={openingStock}
                  onChangeText={setOpeningStock}
                  placeholder="0"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="numeric"
                />
              </View>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={styles.fieldLabel}>সর্বনিম্ন স্টক এলার্ট</Text>
                <TextInput
                  style={styles.input}
                  value={minStockAlert}
                  onChangeText={setMinStockAlert}
                  placeholder="5"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="numeric"
                />
              </View>
            </View>

            {/* ── SECTION 4: Cosmetics Specific ── */}
            {isCosmetics && (
              <>
                <Text style={styles.sectionLabel}>🌍 অতিরিক্ত তথ্য</Text>

                {/* Category */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>ক্যাটাগরি</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {categories.map(cat => (
                        <TouchableOpacity
                          key={cat}
                          style={[styles.catBtn, productCategory === cat && styles.catBtnActive]}
                          onPress={() => setProductCategory(cat)}
                        >
                          <Text style={[styles.catBtnTxt, productCategory === cat && { color: '#fff' }]}>{cat}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>

                {/* Origin Country */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>উৎপত্তি দেশ</Text>
                  <TouchableOpacity
                    style={[styles.input, { justifyContent: 'center' }]}
                    onPress={() => setShowCountryPicker(true)}
                  >
                    <Text style={{ color: productCountry ? COLORS.text : COLORS.textMuted, fontSize: FONT_SIZES.md }}>
                      {productCountry || 'দেশ বেছে নিন'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Expiry Date */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>মেয়াদ শেষের তারিখ</Text>
                  <TextInput
                    style={styles.input}
                    value={productExpiry}
                    onChangeText={setProductExpiry}
                    placeholder="Jan-2028 বা 31/01/2028"
                    placeholderTextColor={COLORS.textMuted}
                  />
                </View>
              </>
            )}

            {/* Save button */}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnSecondary]}
                onPress={resumeScanning}
              >
                <Text style={{ color: COLORS.textSecondary, fontWeight: '600' }}>বাতিল</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: COLORS.primary }, loading && { opacity: 0.6 }]}
                onPress={handleSaveNewProduct}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <>
                    <Ionicons name="checkmark-circle" size={18} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: FONT_SIZES.md }}>যোগ করুন ✓</Text>
                  </>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Country Picker Modal */}
      <Modal visible={showCountryPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCountryPicker(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowCountryPicker(false)}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>দেশ বেছে নিন</Text>
            <View style={{ width: 24 }} />
          </View>
          <ScrollView>
            {ORIGIN_COUNTRIES.map(country => (
              <TouchableOpacity
                key={country}
                style={{ padding: 16, borderBottomWidth: 0.5, borderBottomColor: COLORS.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                onPress={() => { setProductCountry(country); setShowCountryPicker(false); }}
              >
                <Text style={{ fontSize: FONT_SIZES.md, color: COLORS.text }}>{country}</Text>
                {productCountry === country && <Ionicons name="checkmark" size={20} color={COLORS.primary} />}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const FOCUS_WIDTH = 280;
const FOCUS_HEIGHT = 180;
const CORNER = 24;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  overlay: { ...StyleSheet.absoluteFillObject },
  overlayTop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)' },
  overlaySide: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)' },
  overlayBottom: { flex: 2, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', paddingTop: 24 },
  focusBox: { width: FOCUS_WIDTH, height: FOCUS_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: COLORS.primary, borderWidth: 3 },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  scanHint: { color: 'rgba(255,255,255,0.85)', fontSize: FONT_SIZES.sm, textAlign: 'center', paddingHorizontal: 40 },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  topBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontSize: FONT_SIZES.md, fontWeight: '700', color: '#fff' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 0.5, borderBottomColor: COLORS.border },
  modalTitle: { fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.text },
  productCard: { backgroundColor: '#F0FFF4', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: COLORS.sale },
  productCardName: { fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.text },
  productCardBrand: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, marginTop: 4 },
  productCardPrice: { fontSize: FONT_SIZES.xl, fontWeight: '700', color: COLORS.primary },
  qtyQuickBtn: { flex: 1, height: 40, borderRadius: 8, borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  qtyQuickBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  qtyQuickTxt: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.text },
  qtyBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.surfaceSecondary, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
  totalRow: { backgroundColor: COLORS.surfaceSecondary, borderRadius: 10, padding: 12, marginTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actionBtn: { flex: 1, height: 52, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  actionBtnSecondary: { backgroundColor: COLORS.surfaceSecondary, borderWidth: 1, borderColor: COLORS.border },
  barcodeInfoBox: { backgroundColor: '#FEF3C7', padding: 12, borderRadius: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  sectionLabel: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.textSecondary, marginTop: 4 },
  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.text },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, height: 48, paddingHorizontal: 14, fontSize: FONT_SIZES.md, color: COLORS.text, backgroundColor: COLORS.surfaceSecondary },
  unitBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, backgroundColor: '#fff' },
  unitBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  unitBtnTxt: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary },
  catBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, backgroundColor: '#fff' },
  catBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  catBtnTxt: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary },
});
