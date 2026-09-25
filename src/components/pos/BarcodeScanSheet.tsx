import React, { useEffect, useMemo, useRef, useState } from 'react';
import DropdownSelect from '@/components/common/DropdownSelect';
import { unitOptions } from '@/constants/unitOptions';
import {
  View, Text, TouchableOpacity, Modal, TextInput, ScrollView, ActivityIndicator,
  Animated, Easing, KeyboardAvoidingView, StyleSheet,
  Alert,
} from 'react-native';
import { CameraView, Camera } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Product, GlobalProduct, Unit } from '@/types';
import { useProductStore } from '@/store';
import { barcodeService } from '@/services/barcode/barcodeService';
import { productService } from '@/services/supabase/productService';
import { productApi } from '@/services/api/productApi';
import { INTERNAL_BARCODE } from '@/services/barcode/barcodeIndex';
import { playScanBeep, preloadScanBeep } from '@/utils/scanBeep';
import { ProductSearchIndex } from '@/services/search/productSearch';
import { POS } from '@/constants/posTokens';
import { FONT_SIZES } from '@/constants';
import VoiceDictationButton from './VoiceDictationButton';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Called once per successful scan with the shop's product; the host puts one unit in the active customer's cart. */
  onAdd: (product: Product) => void;
}

const FRAME_W = 280;
const FRAME_H = 170;
const UNITS: Unit[] = ['piece', 'kg', 'gram', 'litre', 'ml', 'dozen', 'packet'];

type Unknown = { code: string; global: GlobalProduct | null; networkIssue?: boolean };
type Added = { key: number; name: string; price: number; outOfStock: boolean };

/**
 * The scanner as an overlay on /pos (PRD FR-7–FR-9, design system's
 * scan sheet). It is a Modal over the mounted POS screen, not a
 * route, so the customer tabs and carts underneath are never touched; every
 * successful scan goes straight into the active customer's cart and the camera
 * stays live for the next item.
 */
export default function BarcodeScanSheet({ visible, onClose, onAdd }: Props) {
  const [perm, setPerm] = useState<boolean | null>(null);
  const [torch, setTorch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(false);
  const [count, setCount] = useState(0);
  const [added, setAdded] = useState<Added | null>(null);
  const [unknown, setUnknown] = useState<Unknown | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', price: '', unit: 'piece' as Unit });
  const [formError, setFormError] = useState('');
  const [linking, setLinking] = useState(false);          // "this pack already exists in the shop — attach this barcode to it"
  const [linkQuery, setLinkQuery] = useState('');
  const linkIndexRef = useRef<ProductSearchIndex | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualText, setManualText] = useState('');

  // Repeat-scan guard: the same barcode counts again only after it has left the camera's view.
  const lastCodeRef = useRef('');
  const lastSeenRef = useRef(0);
  // Shorter / non-EAN formats (EAN-8, UPC-E, Code128 incl. the shop's own labels) need 2 consistent reads.
  const bufferRef = useRef<Map<string, number>>(new Map());
  const bufferTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const laser = useRef(new Animated.Value(0)).current;

  const scanning = visible && perm === true && !unknown && !manualOpen && !busy;

  // Fresh session each time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setCount(0); setAdded(null); setUnknown(null); setCreating(false); setLinking(false); setFormError('');
    setManualOpen(false); setManualText(''); setTorch(false);
    lastCodeRef.current = ''; lastSeenRef.current = 0; bufferRef.current.clear();
    preloadScanBeep();
    Camera.requestCameraPermissionsAsync().then(r => setPerm(r.status === 'granted')).catch(() => setPerm(false));
  }, [visible]);

  useEffect(() => {
    if (!scanning) return;
    laser.setValue(0);
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(laser, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(laser, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [scanning, laser]);

  useEffect(() => () => {
    if (bufferTimerRef.current) clearTimeout(bufferTimerRef.current);
    if (addedTimerRef.current) clearTimeout(addedTimerRef.current);
  }, []);

  const addProduct = (product: Product) => {
    onAdd(product);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    playScanBeep();
    setCount(c => c + 1);
    setFlash(true);
    setTimeout(() => setFlash(false), 260);
    setAdded({
      key: Date.now(),
      name: product.name_bangla || product.name_english || '',
      price: product.sale_price,
      outOfStock: Number(product.current_stock ?? 0) <= 0,
    });
    if (addedTimerRef.current) clearTimeout(addedTimerRef.current);
    addedTimerRef.current = setTimeout(() => setAdded(null), 2600);
  };

  const processCode = async (code: string) => {
    // The phone already holds the whole product list: answer from it immediately — no spinner, no waiting, and the camera
    // keeps scanning for the next pack. Only a miss goes to the server.
    const local = barcodeService.findLocal(code);
    if (local) { addProduct(local); return; }

    setBusy(true);
    try {
      const { product, globalProduct, networkIssue } = await barcodeService.lookupBarcode(code);
      if (product) {
        addProduct(product);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        setUnknown({ code, global: globalProduct, networkIssue });
        setCreating(false);
      }
    } catch {
      setUnknown({ code, global: null, networkIssue: true });
    } finally {
      setBusy(false);
    }
  };

  const commit = (code: string, now: number) => {
    lastCodeRef.current = code;
    lastSeenRef.current = now;
    bufferRef.current.clear();
    if (bufferTimerRef.current) { clearTimeout(bufferTimerRef.current); bufferTimerRef.current = null; }
    processCode(code);
  };

  const handleScan = ({ data, type }: { type: string; data: string }) => {
    const now = Date.now();
    const numeric = /^\d+$/.test(data);
    if (numeric && data.length < 8) return; // too short to be a product barcode

    // Still in front of the camera from the last scan — keep it "seen" but don't count it again.
    if (data === lastCodeRef.current && now - lastSeenRef.current < 800) { lastSeenRef.current = now; return; }

    const primary = type === 'ean13' || type === 'upc_a' || (numeric && (data.length === 13 || data.length === 12));
    if (primary) { commit(data, now); return; }

    // The shop's own labels (DKN-XXXX-NNNNNN, Code 128) are a fixed, checksummed shape: one clean read is enough. They used to
    // wait for a second matching read plus a 0.6 s timer, which is what made every loose-item label feel slow.
    if (INTERNAL_BARCODE.test(data)) { commit(data.toUpperCase(), now); return; }

    const seen = (bufferRef.current.get(data) ?? 0) + 1;
    bufferRef.current.set(data, seen);
    if (bufferTimerRef.current) clearTimeout(bufferTimerRef.current);
    bufferTimerRef.current = setTimeout(() => {
      bufferTimerRef.current = null;
      let best = ''; let bestN = 0;
      bufferRef.current.forEach((n, code) => { if (n > bestN) { bestN = n; best = code; } });
      bufferRef.current.clear();
      if (best && bestN >= 2) commit(best, Date.now());
    }, 600);
  };

  const resume = () => {
    setUnknown(null); setCreating(false); setLinking(false); setFormError('');
    lastCodeRef.current = ''; // the same code may be scanned again, e.g. after fixing the label
  };

  const startCreate = () => {
    const g = unknown?.global;
    setForm({
      name: g ? (g.name_bangla || g.name_english || '') : '',
      price: g ? String(g.standard_mrp || g.standard_price || '') : '',
      unit: (g && UNITS.includes(g.unit as Unit) ? g.unit : 'piece') as Unit,
    });
    setFormError('');
    setCreating(true);
  };

  const submitCreate = async () => {
    if (!unknown) return;
    const price = parseFloat(form.price.replace(',', '.'));
    if (!form.name.trim() || !(price > 0)) { setFormError('পণ্যের নাম ও বিক্রয় মূল্য দিন'); return; }
    setBusy(true);
    setFormError('');
    try {
      const g = unknown.global;
      const created = await productService.addNewProduct({
        name_bangla: form.name.trim(),
        unit: form.unit,
        sale_price: price,
        barcode: unknown.code,
        name_english: g?.name_english,
        brand: g?.brand,
        mrp: g?.standard_mrp,
        origin_country: g?.origin_country,
      });
      if (created.localOnly) {
        // Never reached the server, so a bill containing it would be refused. Don't leave a ghost in the list either.
        const { products, setProducts } = useProductStore.getState();
        setProducts(products.filter(p => p.id !== created.id));
        setFormError('ইন্টারনেট নেই — নতুন পণ্য সেভ হয়নি। সংযোগ ঠিক হলে আবার চেষ্টা করুন।');
        return;
      }
      addProduct(created);
      resume();
    } catch (e: any) {
      setFormError(e?.message ?? 'সেভ করা যায়নি');
    } finally {
      setBusy(false);
    }
  };

  // ── Attach the scanned barcode to a product the shop already has ─────────────────────────────────────
  // For a pack that says "unknown" although the product exists (its stored barcode was mistyped or came from
  // old data). Search by name, tap the product, and the real barcode is saved on it — no duplicate product.
  const linkResults = useMemo(
    () => (linking && linkQuery.trim() ? (linkIndexRef.current?.search(linkQuery.trim(), 8) ?? []) : []),
    [linking, linkQuery],
  );

  const startLink = () => {
    linkIndexRef.current = new ProductSearchIndex(useProductStore.getState().products);
    setLinkQuery('');
    setFormError('');
    setLinking(true);
  };

  const confirmLink = async (product: Product) => {
    if (!unknown) return;
    setBusy(true);
    setFormError('');
    try {
      const updated = await productApi.update(product.id, { barcode: unknown.code });
      const merged: Product = { ...product, ...updated, barcode: unknown.code };
      const { products, setProducts } = useProductStore.getState();
      setProducts(products.map(p => (p.id === product.id ? merged : p)));
      addProduct(merged);
      resume();
    } catch (e: any) {
      const msg = String(e?.message ?? '');
      setFormError(/duplicate|unique|already|409/i.test(msg)
        ? 'এই বারকোড অন্য একটি পণ্যে আগে থেকেই আছে'
        : (msg || 'বারকোড যুক্ত করা যায়নি'));
    } finally {
      setBusy(false);
    }
  };

  const linkTo = (product: Product) => {
    if (!unknown) return;
    Alert.alert(
      'বারকোড যুক্ত করবেন?',
      `${product.name_bangla || product.name_english}\n\nনতুন বারকোড: ${unknown.code}${product.barcode ? `\nপুরনো বারকোড: ${product.barcode}` : ''}`,
      [
        { text: 'না', style: 'cancel' },
        { text: 'হ্যাঁ, যুক্ত করুন', onPress: () => { confirmLink(product); } },
      ],
    );
  };

  const submitManual = () => {
    const code = manualText.trim();
    if (code.length < 4) return;
    setManualOpen(false);
    setManualText('');
    lastCodeRef.current = '';
    processCode(code);
  };

  const g = unknown?.global ?? null;

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <SafeAreaProvider>
      <View style={styles.root}>
        {visible && perm === true && (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torch}
            onBarcodeScanned={scanning ? handleScan : undefined}
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] }}
          />
        )}

        {/* Dimmed surround with a clear scan frame */}
        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.dim} />
          <View style={{ flexDirection: 'row' }}>
            <View style={styles.dim} />
            <View style={[styles.frame, flash && styles.frameFlash]}>
              <View style={[styles.corner, styles.cTL]} /><View style={[styles.corner, styles.cTR]} />
              <View style={[styles.corner, styles.cBL]} /><View style={[styles.corner, styles.cBR]} />
              {scanning && (
                <Animated.View
                  style={[styles.laser, { transform: [{ translateY: laser.interpolate({ inputRange: [0, 1], outputRange: [6, FRAME_H - 8] }) }] }]}
                />
              )}
              {busy && <ActivityIndicator color="#fff" size="large" />}
            </View>
            <View style={styles.dim} />
          </View>
          <View style={[styles.dim, { flex: 2, alignItems: 'center', paddingTop: 20 }]}>
            <Text style={styles.hint}>{busy ? 'খুঁজছি...' : 'পণ্যের বারকোড ফ্রেমের ভেতরে ধরুন'}</Text>
          </View>
        </View>

        {/* Top bar */}
        <SafeAreaView edges={['top']} style={styles.topBar}>
          <TouchableOpacity style={styles.roundBtn} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.title}>বারকোড স্ক্যান</Text>
            {count > 0 && <Text style={styles.count}>{count}টি বিলে যোগ হয়েছে</Text>}
          </View>
          <TouchableOpacity style={styles.roundBtn} onPress={() => setTorch(t => !t)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name={torch ? 'flash' : 'flash-outline'} size={22} color="#fff" />
          </TouchableOpacity>
        </SafeAreaView>

        {/* Permission not granted */}
        {perm === false && (
          <View style={styles.center}>
            <Ionicons name="camera-outline" size={56} color="#fff" />
            <Text style={styles.centerTxt}>স্ক্যান করতে ক্যামেরার অনুমতি দিন</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => Camera.requestCameraPermissionsAsync().then(r => setPerm(r.status === 'granted'))}>
              <Text style={styles.primaryTxt}>অনুমতি দিন</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Bottom: last added, manual entry, done */}
        {!unknown && (
          <SafeAreaView edges={['bottom']} style={styles.bottom}>
            {added && (
              <View style={[styles.addedStrip, added.outOfStock && { backgroundColor: POS.warning100 }]}>
                <Ionicons name={added.outOfStock ? 'warning' : 'checkmark-circle'} size={20} color={added.outOfStock ? POS.warning600 : POS.brand600} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.addedName} numberOfLines={1}>{added.name}</Text>
                  {added.outOfStock && <Text style={styles.addedWarn}>স্টকে নেই — বিল করলে ব্যর্থ হতে পারে</Text>}
                </View>
                <Text style={styles.addedPrice}>৳{added.price}</Text>
              </View>
            )}
            <View style={styles.bottomRow}>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => setManualOpen(true)}>
                <Ionicons name="keypad-outline" size={18} color="#fff" />
                <Text style={styles.ghostTxt}>ম্যানুয়াল লিখুন</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={onClose}>
                <Text style={styles.primaryTxt}>{count > 0 ? `সম্পন্ন (${count})` : 'বন্ধ করুন'}</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        )}

        {/* Unknown barcode */}
        {unknown && (
          <KeyboardAvoidingView behavior="padding" style={styles.sheetWrap}>
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.sheet} contentContainerStyle={{ padding: 20, gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={styles.unknownIcon}><Ionicons name="help" size={22} color={POS.warning600} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetTitle}>{g ? 'গ্লোবাল ক্যাটালগে আছে' : unknown.networkIssue ? 'যাচাই করা যায়নি' : 'না-চেনা বারকোড'}</Text>
                  <Text style={styles.sheetCode}>{unknown.code}</Text>
                </View>
              </View>

              {unknown.networkIssue && !creating && (
                <Text style={styles.sheetSub}>ইন্টারনেট ধীর বা নেই — পণ্যটি দোকানে থাকতে পারে। আবার স্ক্যান করুন; নতুন পণ্য হিসেবে যোগ করার আগে নিশ্চিত হয়ে নিন।</Text>
              )}

              {g && !creating && (
                <Text style={styles.sheetSub}>
                  {g.name_bangla || g.name_english}{g.brand ? ` · ${g.brand}` : ''}{g.standard_mrp ? ` · MRP ৳${g.standard_mrp}` : ''}
                </Text>
              )}

              {linking ? (
                <>
                  <Text style={styles.label}>কোন পণ্যের বারকোড এটি? নাম লিখে খুঁজুন</Text>
                  <TextInput
                    style={styles.input}
                    value={linkQuery}
                    onChangeText={setLinkQuery}
                    placeholder="পণ্যের নাম"
                    placeholderTextColor={POS.ink400}
                    autoFocus
                  />
                  {linkQuery.trim().length > 0 && linkResults.length === 0 && (
                    <Text style={styles.sheetSub}>কোনো পণ্য পাওয়া যায়নি</Text>
                  )}
                  {linkResults.map(pr => (
                    <TouchableOpacity key={pr.id} style={styles.linkRow} onPress={() => linkTo(pr)} disabled={busy}>
                      <Text style={styles.linkName} numberOfLines={1}>{pr.name_bangla || pr.name_english}</Text>
                      <Text style={styles.linkMeta} numberOfLines={1}>
                        {pr.name_english ? `${pr.name_english} · ` : ''}৳{pr.sale_price}{pr.barcode ? ` · ${pr.barcode}` : ' · বারকোড নেই'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  {!!formError && <Text style={styles.error}>{formError}</Text>}
                  <TouchableOpacity style={styles.lightBtn} onPress={() => { setLinking(false); setFormError(''); }} disabled={busy}>
                    <Text style={styles.lightTxt}>বাতিল</Text>
                  </TouchableOpacity>
                </>
              ) : !creating ? (
                <>
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                    <TouchableOpacity style={[styles.lightBtn, { flex: 1 }]} onPress={resume}>
                      <Text style={styles.lightTxt}>আবার স্ক্যান</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.primaryBtn, { flex: 1.4 }]} onPress={startCreate}>
                      <Text style={styles.primaryTxt}>{g ? 'দোকানে যোগ করুন' : 'নতুন পণ্য যোগ করুন'}</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity style={styles.linkBtn} onPress={startLink}>
                    <Ionicons name="link-outline" size={18} color={POS.brand600} />
                    <Text style={styles.linkBtnTxt}>আগে থেকে দোকানে আছে? পণ্য খুঁজে বারকোড যুক্ত করুন</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.label}>পণ্যের নাম *</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      value={form.name}
                      onChangeText={v => setForm(f => ({ ...f, name: v }))}
                      placeholder="যেমন: রুচি ডাল ভাজা"
                      placeholderTextColor={POS.ink400}
                      autoFocus
                    />
                    <VoiceDictationButton onResult={v => setForm(f => ({ ...f, name: f.name.trim() ? `${f.name.trim()} ${v}` : v }))} />
                  </View>
                  <Text style={styles.label}>বিক্রয় মূল্য (৳) *</Text>
                  <TextInput
                    style={styles.input}
                    value={form.price}
                    onChangeText={v => setForm(f => ({ ...f, price: v }))}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={POS.ink400}
                  />
                  <DropdownSelect
                    label="একক"
                    title="একক বাছাই করুন"
                    value={form.unit}
                    options={unitOptions()}
                    onChange={v => setForm(f => ({ ...f, unit: v as Unit }))}
                  />
                  {!!formError && <Text style={styles.error}>{formError}</Text>}
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                    <TouchableOpacity style={[styles.lightBtn, { flex: 1 }]} onPress={resume} disabled={busy}>
                      <Text style={styles.lightTxt}>বাতিল</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.primaryBtn, { flex: 1.4 }, busy && { opacity: 0.6 }]} onPress={submitCreate} disabled={busy}>
                      {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.primaryTxt}>যোগ করে বিলে দিন</Text>}
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        )}

        {/* Manual barcode entry — for a printed code that won't scan (worn, folded, glare) */}
        <Modal visible={manualOpen} transparent animationType="fade" onRequestClose={() => setManualOpen(false)}>
          <KeyboardAvoidingView behavior="padding" style={styles.manualOverlay}>
            <View style={styles.manualCard}>
              <Text style={styles.sheetTitle}>বারকোডের নম্বর লিখুন</Text>
              <TextInput
                style={[styles.input, { marginTop: 12, fontSize: FONT_SIZES.lg, letterSpacing: 1 }]}
                value={manualText}
                onChangeText={setManualText}
                keyboardType="number-pad"
                autoFocus
                placeholder="8941189041000"
                placeholderTextColor={POS.ink400}
                onSubmitEditing={submitManual}
              />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <TouchableOpacity style={[styles.lightBtn, { flex: 1 }]} onPress={() => setManualOpen(false)}>
                  <Text style={styles.lightTxt}>বাতিল</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={submitManual}>
                  <Text style={styles.primaryTxt}>খুঁজুন</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
      </SafeAreaProvider>
    </Modal>
  );
}

const DIM = 'rgba(0,0,0,0.62)';
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  overlay: { ...StyleSheet.absoluteFillObject },
  dim: { flex: 1, backgroundColor: DIM },
  frame: { width: FRAME_W, height: FRAME_H, alignItems: 'center', justifyContent: 'center' },
  frameFlash: { backgroundColor: 'rgba(17,108,65,0.5)' },
  corner: { position: 'absolute', width: 26, height: 26, borderColor: '#7BD9A5', borderWidth: 3 },
  cTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  cTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  cBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  cBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  laser: { position: 'absolute', top: 0, left: 10, right: 10, height: 2, backgroundColor: '#FF5A4D', borderRadius: 1 },
  hint: { color: 'rgba(255,255,255,0.9)', fontSize: FONT_SIZES.sm, textAlign: 'center', paddingHorizontal: 40 },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10 },
  roundBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontSize: FONT_SIZES.md, fontWeight: '700' },
  count: { color: '#7BD9A5', fontSize: FONT_SIZES.xs, fontWeight: '700', marginTop: 1 },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32 },
  centerTxt: { color: '#fff', fontSize: FONT_SIZES.md, textAlign: 'center' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingBottom: 12, gap: 10 },
  addedStrip: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: POS.brand100, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  addedName: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: POS.ink900 },
  addedWarn: { fontSize: 11, fontWeight: '600', color: POS.warning600, marginTop: 1 },
  addedPrice: { fontSize: FONT_SIZES.md, fontWeight: '800', color: POS.ink900 },
  bottomRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  ghostBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 48, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.16)' },
  ghostTxt: { color: '#fff', fontWeight: '600', fontSize: FONT_SIZES.sm },
  primaryBtn: { height: 48, borderRadius: 14, backgroundColor: POS.brand600, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryTxt: { color: '#fff', fontWeight: '700', fontSize: FONT_SIZES.md },
  lightBtn: { height: 48, borderRadius: 14, backgroundColor: POS.surface200, alignItems: 'center', justifyContent: 'center' },
  lightTxt: { color: POS.ink900, fontWeight: '600', fontSize: FONT_SIZES.md },
  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, top: 0, justifyContent: 'flex-end' },
  sheet: { maxHeight: '82%', backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, flexGrow: 0 },
  unknownIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: POS.warning100, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontSize: FONT_SIZES.lg, fontWeight: '700', color: POS.ink900 },
  sheetCode: { fontSize: FONT_SIZES.sm, color: POS.ink600, fontVariant: ['tabular-nums'], marginTop: 1 },
  sheetSub: { fontSize: FONT_SIZES.sm, color: POS.ink600 },
  label: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: POS.ink900, marginTop: 4 },
  input: { borderWidth: 1.5, borderColor: POS.border600, borderRadius: 12, height: 50, paddingHorizontal: 14, fontSize: FONT_SIZES.md, color: POS.ink900, backgroundColor: '#fff' },
  linkBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 14, borderWidth: 1.5, borderColor: POS.brand600 },
  linkBtnTxt: { color: POS.brand600, fontSize: FONT_SIZES.sm, fontWeight: '700', flexShrink: 1, textAlign: 'center' },
  linkRow: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: POS.border200, backgroundColor: '#fff' },
  linkName: { fontSize: FONT_SIZES.md, fontWeight: '700', color: POS.ink900 },
  linkMeta: { fontSize: FONT_SIZES.xs, color: POS.ink600, marginTop: 2 },
  unitChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: POS.border600 },
  unitOn: { backgroundColor: POS.brand600, borderColor: POS.brand600 },
  unitTxt: { fontSize: FONT_SIZES.sm, color: POS.ink600 },
  error: { color: POS.danger600, fontSize: FONT_SIZES.sm, fontWeight: '600' },
  manualOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  manualCard: { backgroundColor: '#fff', borderRadius: 18, padding: 20, width: '100%' },
});
