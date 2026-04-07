import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Modal, Alert, ActivityIndicator, TextInput,
  Vibration
} from 'react-native';
import { CameraView, Camera } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { COLORS, FONT_SIZES } from '@/constants';
import { barcodeService } from '@/services/barcode/barcodeService';
import { Product, GlobalProduct } from '@/types';
import { useProductStore } from '@/store';

export default function BarcodeScannerScreen() {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [torch, setTorch] = useState(false);
  const [scanning, setScanning] = useState(true);
  const [loading, setLoading] = useState(false);

  // Product found state
  const [foundProduct, setFoundProduct] = useState<Product | null>(null);
  const [foundGlobal, setFoundGlobal] = useState<GlobalProduct | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [productModalVisible, setProductModalVisible] = useState(false);

  // New product state (not found)
  const [notFoundBarcode, setNotFoundBarcode] = useState('');
  const [newProductModal, setNewProductModal] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductPrice, setNewProductPrice] = useState('');
  const [newProductUnit, setNewProductUnit] = useState('piece');

  const lastScanned = useRef<string>('');
  const cooldownRef = useRef<boolean>(false);

  useEffect(() => {
    requestPermission();
  }, []);

  const requestPermission = async () => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    setHasPermission(status === 'granted');
  };

  const handleBarcodeScan = async ({ data }: { type: string; data: string }) => {
    // Prevent duplicate scans
    if (cooldownRef.current || !scanning || data === lastScanned.current) return;
    cooldownRef.current = true;
    lastScanned.current = data;
    setScanning(false);
    setLoading(true);

    // Vibrate on scan
    Vibration.vibrate(100);

    try {
      const result = await barcodeService.lookupBarcode(data);

      if (result.product) {
        // Found in shop products
        setFoundProduct(result.product);
        setQuantity(1);
        setProductModalVisible(true);
      } else if (result.globalProduct) {
        // Found in global products
        setFoundGlobal(result.globalProduct);
        setQuantity(1);
        setProductModalVisible(true);
      } else {
        // Not found anywhere
        setNotFoundBarcode(data);
        setNewProductModal(true);
      }
    } catch (e) {
      Alert.alert('ত্রুটি', 'স্ক্যান করতে সমস্যা হয়েছে');
      resumeScanning();
    } finally {
      setLoading(false);
    }
  };

  const resumeScanning = () => {
    setScanning(true);
    setFoundProduct(null);
    setFoundGlobal(null);
    setProductModalVisible(false);
    setNewProductModal(false);
    setTimeout(() => {
      cooldownRef.current = false;
      lastScanned.current = '';
    }, 1500);
  };

  const handleAddTobill = () => {
    const product = foundProduct ?? (foundGlobal ? {
      id: foundGlobal.id,
      name_bangla: foundGlobal.name_bangla ?? foundGlobal.name_english,
      name_english: foundGlobal.name_english,
      unit: foundGlobal.unit as any,
      sale_price: foundGlobal.standard_price || foundGlobal.standard_mrp,
      barcode: foundGlobal.barcode,
      brand: foundGlobal.brand,
      origin_country: foundGlobal.origin_country,
    } as any : null);

    if (!product) return;

    const draftItem = {
      product_name: product.name_bangla || product.name_english || '',
      product_id: product.id,
      quantity,
      unit: product.unit,
      unit_price: product.sale_price,
      total: +(quantity * product.sale_price).toFixed(2),
      checked: true,
      confidence: 1.0,
    };

    // Pass back to home screen via router params
    router.back();
    // Use global event or params to pass item
    router.setParams({ scannedItem: JSON.stringify(draftItem) });
  };

  const handleSaveNewProduct = async () => {
    if (!newProductName || !newProductPrice) {
      Alert.alert('সতর্কতা', 'পণ্যের নাম ও দাম দিন');
      return;
    }
    setLoading(true);
    try {
      const price = parseFloat(newProductPrice);
      // Create minimal product
      const fakeGlobal: GlobalProduct = {
        id: notFoundBarcode,
        barcode: notFoundBarcode,
        name_english: newProductName,
        category: 'other',
        unit: newProductUnit,
        standard_mrp: price,
        standard_price: price,
      };
      const product = await barcodeService.createFromGlobal(fakeGlobal, price);
      setFoundProduct(product);
      setNewProductModal(false);
      setProductModalVisible(true);
    } catch (e: any) {
      Alert.alert('ত্রুটি', e.message);
    } finally {
      setLoading(false);
    }
  };

  // Permission denied
  if (hasPermission === false) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
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

  // Loading permission
  if (hasPermission === null) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
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

      {/* Dark overlay */}
      <View style={styles.overlay}>
        {/* Top area */}
        <View style={styles.overlayTop} />

        {/* Middle row */}
        <View style={{ flexDirection: 'row' }}>
          <View style={styles.overlaySide} />
          {/* Focus box */}
          <View style={styles.focusBox}>
            {/* Corner markers */}
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
            {loading && (
              <ActivityIndicator color={COLORS.primary} size="large" />
            )}
          </View>
          <View style={styles.overlaySide} />
        </View>

        {/* Bottom area */}
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

      {/* Product Found Modal */}
      <Modal
        visible={productModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={resumeScanning}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 0.5, borderBottomColor: COLORS.border }}>
            <TouchableOpacity onPress={resumeScanning}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={{ fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.text }}>পণ্য পাওয়া গেছে ✓</Text>
            <View style={{ width: 24 }} />
          </View>

          <View style={{ padding: 20, gap: 16 }}>
            {/* Product Info */}
            <View style={{ backgroundColor: '#F0FFF4', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: COLORS.sale }}>
              <Text style={{ fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.text }}>
                {foundProduct?.name_bangla || foundProduct?.name_english || foundGlobal?.name_english}
              </Text>
              {(foundProduct?.brand || foundGlobal?.brand) && (
                <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, marginTop: 4 }}>
                  {foundProduct?.brand || foundGlobal?.brand}
                  {(foundProduct?.origin_country || foundGlobal?.origin_country)
                    ? ` • ${foundProduct?.origin_country || foundGlobal?.origin_country}`
                    : ''}
                </Text>
              )}
              <Text style={{ fontSize: FONT_SIZES.xl, fontWeight: '700', color: COLORS.primary, marginTop: 8 }}>
                ৳{foundProduct?.sale_price || foundGlobal?.standard_price || foundGlobal?.standard_mrp}
              </Text>
            </View>

            {/* Quantity Selector */}
            <View>
              <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.text, marginBottom: 10 }}>
                পরিমাণ
              </Text>
              {/* Quick buttons */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                {[1, 2, 3, 5, 10].map(q => (
                  <TouchableOpacity
                    key={q}
                    style={[{
                      flex: 1, height: 40, borderRadius: 8,
                      borderWidth: 1.5, borderColor: COLORS.border,
                      alignItems: 'center', justifyContent: 'center',
                    }, quantity === q && { backgroundColor: COLORS.primary, borderColor: COLORS.primary }]}
                    onPress={() => setQuantity(q)}
                  >
                    <Text style={[{ fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.text }, quantity === q && { color: '#fff' }]}>{q}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {/* Manual input */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <TouchableOpacity
                  style={styles.qtyBtn}
                  onPress={() => setQuantity(q => Math.max(1, q - 1))}
                >
                  <Ionicons name="remove" size={20} color={COLORS.text} />
                </TouchableOpacity>
                <Text style={{ fontSize: FONT_SIZES.xl, fontWeight: '700', flex: 1, textAlign: 'center', color: COLORS.text }}>
                  {quantity}
                </Text>
                <TouchableOpacity
                  style={styles.qtyBtn}
                  onPress={() => setQuantity(q => q + 1)}
                >
                  <Ionicons name="add" size={20} color={COLORS.text} />
                </TouchableOpacity>
              </View>

              {/* Total */}
              <View style={{ backgroundColor: COLORS.surfaceSecondary, borderRadius: 10, padding: 12, marginTop: 12, flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.textSecondary }}>
                  {quantity} × ৳{foundProduct?.sale_price || foundGlobal?.standard_price}
                </Text>
                <Text style={{ fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.primary }}>
                  ৳{(quantity * (foundProduct?.sale_price || foundGlobal?.standard_price || 0)).toFixed(0)}
                </Text>
              </View>
            </View>

            {/* Action buttons */}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: COLORS.surfaceSecondary, borderWidth: 1, borderColor: COLORS.border }]}
                onPress={resumeScanning}
              >
                <Text style={{ fontSize: FONT_SIZES.md, color: COLORS.textSecondary, fontWeight: '600' }}>আবার স্ক্যান</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: COLORS.primary }]}
                onPress={handleAddTobill}
              >
                <Ionicons name="checkmark" size={20} color="#fff" />
                <Text style={{ fontSize: FONT_SIZES.md, color: '#fff', fontWeight: '700' }}>বিলে যোগ করুন</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Product Not Found Modal */}
      <Modal
        visible={newProductModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={resumeScanning}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 0.5, borderBottomColor: COLORS.border }}>
            <TouchableOpacity onPress={resumeScanning}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={{ fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.text }}>নতুন পণ্য যোগ করুন</Text>
            <View style={{ width: 24 }} />
          </View>
          <View style={{ padding: 20, gap: 16 }}>
            <View style={{ backgroundColor: '#FEF3C7', padding: 12, borderRadius: 10 }}>
              <Text style={{ fontSize: FONT_SIZES.xs, color: '#92400E', fontWeight: '600' }}>
                বারকোড: {notFoundBarcode}
              </Text>
              <Text style={{ fontSize: FONT_SIZES.sm, color: '#92400E', marginTop: 4 }}>
                এই পণ্য ডেটাবেজে নেই। নিচে তথ্য দিন।
              </Text>
            </View>

            {[
              { label: 'পণ্যের নাম *', value: newProductName, set: setNewProductName, placeholder: 'যেমন: Nivea Cream 200ML', numeric: false },
              { label: 'বিক্রয় মূল্য (৳) *', value: newProductPrice, set: setNewProductPrice, placeholder: '0', numeric: true },
            ].map((f, i) => (
              <View key={i} style={{ gap: 6 }}>
                <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.text }}>{f.label}</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, height: 48, paddingHorizontal: 14, fontSize: FONT_SIZES.md, color: COLORS.text, backgroundColor: COLORS.surfaceSecondary }}
                  value={f.value}
                  onChangeText={f.set}
                  placeholder={f.placeholder}
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType={f.numeric ? 'numeric' : 'default'}
                />
              </View>
            ))}

            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.text }}>একক</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {['piece', 'kg', 'gram', 'litre', 'ml', 'dozen', 'packet'].map(u => (
                  <TouchableOpacity
                    key={u}
                    style={[{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border }, newProductUnit === u && { backgroundColor: COLORS.primary, borderColor: COLORS.primary }]}
                    onPress={() => setNewProductUnit(u)}
                  >
                    <Text style={[{ fontSize: FONT_SIZES.sm, color: COLORS.textSecondary }, newProductUnit === u && { color: '#fff', fontWeight: '700' }]}>{u}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: COLORS.surfaceSecondary, borderWidth: 1, borderColor: COLORS.border }]}
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
                  : <Text style={{ color: '#fff', fontWeight: '700', fontSize: FONT_SIZES.md }}>যোগ করুন ✓</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const FOCUS_WIDTH = 280;
const FOCUS_HEIGHT = 180;
const CORNER = 20;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  overlay: { ...StyleSheet.absoluteFillObject },
  overlayTop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  overlaySide: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  overlayBottom: { flex: 2, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', paddingTop: 20 },
  focusBox: { width: FOCUS_WIDTH, height: FOCUS_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: COLORS.primary, borderWidth: 3 },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  scanHint: { color: '#fff', fontSize: FONT_SIZES.sm, textAlign: 'center', paddingHorizontal: 40 },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  topBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontSize: FONT_SIZES.md, fontWeight: '700', color: '#fff' },
  qtyBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.surfaceSecondary, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
  actionBtn: { flex: 1, height: 52, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
});