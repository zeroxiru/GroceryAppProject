import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Animated, Alert, ActivityIndicator, TextInput, Modal, Share
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { voiceService } from '@/services/voice/voiceService';
import { createNLUService } from '@/services/nlu/nluService';
import { MultiItemParser } from '@/services/nlu/multiItemParser';
import { transactionService } from '@/services/supabase/transactionService';
import { productService } from '@/services/supabase/productService';
import type { PaymentMethod } from '@/types';
import { useAuthStore, useProductStore, useTransactionStore, useVoiceStore } from '@/store';
import { ParsedCommand, Transaction, SaleItem } from '@/types';
import { COLORS, FONT_SIZES } from '@/constants';
import { formatCurrency, formatTime } from '@/utils';
import { format } from 'date-fns';
import { router, useLocalSearchParams } from 'expo-router';

const GROCERY_CATEGORY_LABELS: Record<string, string> = {
  drink:     '🥤 পানীয়',
  beverage:  '🥤 পানীয়',
  grain:     '🌾 চাল-ডাল',
  oil:       '🫙 তেল',
  vegetable: '🥦 সবজি',
  snack:     '🍪 স্ন্যাকস',
  toiletry:  '🧴 সাবান',
  spice:     '🌶️ মসলা',
  dairy:     '🥛 দুগ্ধ',
  essential: '🛒 আবশ্যক',
  other:     '📦 অন্যান্য',
};

const PAYMENT_METHODS: { key: PaymentMethod; label: string; icon: string; activeColor: string }[] = [
  { key: 'cash',   label: 'নগদ',   icon: '💵', activeColor: '#16a34a' },
  { key: 'bkash',  label: 'bKash',  icon: '📱', activeColor: '#E2136E' },
  { key: 'nagad',  label: 'Nagad',  icon: '🔥', activeColor: '#F7941D' },
  { key: 'card',   label: 'Card',   icon: '💳', activeColor: '#2563EB' },
  { key: 'credit', label: 'বাকি',  icon: '📝', activeColor: '#7C3AED' },
];

let ExpoSpeechRecognitionModule: any = null;
let useSpeechRecognitionEvent: any = (_event: string, _cb: any) => {};
try {
  const mod = require('expo-speech-recognition');
  ExpoSpeechRecognitionModule = mod.ExpoSpeechRecognitionModule;
  useSpeechRecognitionEvent = mod.useSpeechRecognitionEvent;
} catch {}

interface DraftItem extends SaleItem {
  checked: boolean;
  confidence: number;
  notes?: string;
}

export default function HomeScreen() {
  const { shop, user } = useAuthStore();
  const { products = [] } = useProductStore();
  const { todayTransactions =[] } = useTransactionStore();
  const { status, setStatus, rawText, setRawText, reset } = useVoiceStore();

  const [saving, setSaving] = useState(false);
  const [textModalVisible, setTextModalVisible] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [draftVisible, setDraftVisible] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [invoiceModalVisible, setInvoiceModalVisible] = useState(false);
 const [lastInvoice, setLastInvoice] = useState<{
  number: string;
  items: SaleItem[];
  total: number;
  customer: string;
  payment_method: PaymentMethod;
  discount_type?: 'percentage' | 'amount';
  discount_value?: number;
  discount_amount?: number;
  net_total?: number;
} | null>(null);
  const [newProductModal, setNewProductModal] = useState(false);
  const [pendingProductName, setPendingProductName] = useState('');
  const [pendingProductPrice, setPendingProductPrice] = useState('');
  const [pendingProductUnit, setPendingProductUnit] = useState('kg');

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const nluRef = useRef(createNLUService(products));
  const multiParserRef = useRef(new MultiItemParser(nluRef.current));
  const voiceAvailable = ExpoSpeechRecognitionModule !== null;
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number>(-1);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editUnit, setEditUnit] = useState('piece');
  const [quickCategory, setQuickCategory] = useState<string | null>(null);
  const [topProducts, setTopProducts] = useState<Record<string, any[]>>({});
  const params = useLocalSearchParams();
  const [discountType, setDiscountType] = useState<'percentage' | 'amount' | null>(null);
  const [discountValue, setDiscountValue] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');

  useSpeechRecognitionEvent('result', (event: any) => {
    const transcript = event.results[0]?.transcript ?? '';
    setLiveTranscript(transcript);
    if (!event.isFinal) return;
    setIsRecording(false);
    setLiveTranscript('');
    if (transcript) processText(transcript);
  });

  useSpeechRecognitionEvent('error', (event: any) => {
    setIsRecording(false);
    setLiveTranscript('');
    setStatus('idle');
    if (event.error === 'no-speech') {
      Toast.show({ type: 'info', text1: 'কিছু শোনা যায়নি', text2: 'আবার চেষ্টা করুন' });
    }
  });

  useSpeechRecognitionEvent('end', () => {
    setIsRecording(false);
    setLiveTranscript('');
  });

  useEffect(() => {
    nluRef.current.updateProducts(products);
    multiParserRef.current = new MultiItemParser(nluRef.current);
  }, [products]);

useEffect(() => {
  const today = new Date().toDateString();
  const localTxns = useTransactionStore.getState().todayTransactions ?? [];
  const todayOnly = (localTxns|| []).filter(t =>
    t?.created_at && new Date(t.created_at).toDateString() === today
  );
  if (todayOnly.length !== localTxns.length) {
    useTransactionStore.getState().setTodayTransactions(todayOnly);
  }
  transactionService.fetchTodayTransactions().catch(console.warn);
  productService.fetchProducts().catch(console.warn);
}, []);

  useEffect(() => {
    if (isRecording) {
      const pulse = Animated.loop(Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 400, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]));
      pulse.start();
      return () => pulse.stop();
    } else { pulseAnim.setValue(1); }
  }, [isRecording]);

  useEffect(() => {
  if (params.scannedItem) {
    try {
      const item = JSON.parse(params.scannedItem as string);
      appendToDraft([{ ...item, checked: true, confidence: 1.0 }]);
      // Clear param
      router.setParams({ scannedItem: undefined });
    } catch {}
  }
}, [params.scannedItem]);

  const todaySales = (todayTransactions ?? []).filter(t => t.type === 'sale').reduce((s, t) => s + (t?.total_amount ?? 0), 0);
  const todayPurchases = (todayTransactions?? []).filter(t => t.type === 'purchase').reduce((s, t) => s + (t?.total_amount ?? 0), 0);
  const checkedTotal = draftItems.filter(i => i.checked).reduce((s, i) => s + i.total, 0);

  const appendToDraft = (newDrafts: DraftItem[]) => {
    setDraftItems(prev => [...prev, ...newDrafts]);
    setDraftVisible(true);
    setStatus('idle');
  };

  const processText = async (text: string) => {
    if (!text.trim()) return;
    setRawText(text);
    setStatus('processing' as any);

    try {
      const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
      if (apiKey && apiKey.length > 10) {
        const { parseWithClaude, claudeResultToSaleItems } = await import('@/services/nlu/claudeNLU');
        const result = await parseWithClaude(text);
        const saleItems = claudeResultToSaleItems(result);
        if (saleItems.length > 0) {
          appendToDraft(saleItems.map((item, i) => ({
            ...item, checked: true,
            confidence: result.items[i]?.confidence ?? 0.8,
            notes: result.items[i]?.notes,
          })));
          await voiceService.speak(`${saleItems.length} টি পণ্য যোগ হয়েছে।`);
          return;
        }
      }
    } catch (e: any) {
      if (e.message !== 'NO_API_KEY') console.warn('Claude fallback:', e.message);
    }

    const { items, isMulti } = multiParserRef.current.parse(text);
    const saleItems = isMulti
      ? multiParserRef.current.toSaleItems(items)
      : items[0] && items[0].product_name && items[0].quantity && items[0].price
        ? [{ product_name: items[0].product_name!, product_id: items[0].matched_product?.id, quantity: items[0].quantity!, unit: items[0].unit ?? 'kg' as any, unit_price: items[0].price!, total: items[0].quantity! * items[0].price! }]
        : [];

    if (saleItems.length > 0) {
      appendToDraft(saleItems.map(item => ({ ...item, checked: true, confidence: 0.7 })));
    } else {
      Toast.show({ type: 'error', text1: 'বুঝতে পারিনি', text2: 'আবার বলুন বা টাইপ করুন' });
      setStatus('idle');
    }
  };

  const startVoice = async () => {
    if (isRecording) return;
    if (!voiceAvailable) { setTextModalVisible(true); return; }
    try {
      const granted = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!granted.granted) { setTextModalVisible(true); return; }
      setIsRecording(true);
      setLiveTranscript('');
      ExpoSpeechRecognitionModule.start({
        lang: 'bn-BD', interimResults: true, maxAlternatives: 1, continuous: true,
        contextualStrings: ['চাল','ডাল','তেল','পেঁয়াজ','আলু','ময়দা','চিনি','লবণ','ডিম','কেজি','লিটার','গ্রাম','পিস','টাকা'],
      });
    } catch { setIsRecording(false); setTextModalVisible(true); }
  };

 

const handleSaveDraft = async () => {
  const itemsToSave = draftItems.filter(i => i.checked);
  if (itemsToSave.length === 0) {
    Alert.alert('সতর্কতা', 'কমপক্ষে একটি পণ্য সিলেক্ট করুন');
    return;
  }
  setSaving(true);
  const subtotal = itemsToSave.reduce((s, i) => s + i.total, 0);
  const discAmt = calculateDiscount(subtotal, discountType, parseFloat(discountValue) || 0);
  const net = subtotal - discAmt;

  try {
    const res = await transactionService.saveBill({
      items: itemsToSave.map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price,
      })),
      customer_name: customerName || undefined,
      payment_method: paymentMethod,
      discount_type: discountType ?? undefined,
      discount_value: parseFloat(discountValue) || 0,
      vat_rate: 0,
    });
    setLastInvoice({
      number: res.invoice_number,
      items: itemsToSave,
      total: subtotal,
      customer: customerName,
      payment_method: paymentMethod,
      discount_type: discountType ?? undefined,
      discount_value: parseFloat(discountValue) || 0,
      discount_amount: discAmt,
      net_total: net,
    });
    setDraftItems([]);
    setDraftVisible(false);
    setCustomerName('');
    setDiscountType(null);
    setDiscountValue('');
    setPaymentMethod('cash');
    setInvoiceModalVisible(true);
    await voiceService.speak(`বিল তৈরি হয়েছে। মোট ${Math.round(net)} টাকা।`);
  } catch (e: any) {
    Alert.alert('ত্রুটি', e.message);
  } finally { setSaving(false); }
};

  const handleShareInvoice = async () => {
  if (!lastInvoice) return;
  const pmInfo = PAYMENT_METHODS.find(p => p.key === lastInvoice.payment_method);
  const lines = [
    `🏪 *${shop?.name}*`,
    `📋 বিল নং: ${lastInvoice.number}`,
    `📅 তারিখ: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`,
    lastInvoice.customer ? `👤 গ্রাহক: ${lastInvoice.customer}` : '',
    pmInfo ? `${pmInfo.icon} পেমেন্ট: ${pmInfo.label}` : '',
    `──────────────`,
    ...lastInvoice.items.map((item, i) =>
      `${i + 1}. ${item.product_name} — ${item.quantity}${item.unit} × ৳${item.unit_price} = ৳${item.total}`
    ),
    `──────────────`,
    `উপমোট: ৳${Math.round(lastInvoice.total)}`,
    lastInvoice.discount_amount
      ? `ছাড়: -৳${Math.round(lastInvoice.discount_amount)}`
      : '',
    `💰 *মোট: ৳${Math.round(lastInvoice.net_total ?? lastInvoice.total)}*`,
    `\nধন্যবাদ! 🙏`,
  ].filter(Boolean).join('\n');
  await Share.share({ message: lines });
};

  const handleAddNewProduct = async () => {
    if (!pendingProductName || !pendingProductPrice) { Alert.alert('সতর্কতা', 'পণ্যের নাম ও দাম দিন'); return; }
    try {
      await productService.addNewProduct({ name_bangla: pendingProductName, unit: pendingProductUnit, sale_price: parseFloat(pendingProductPrice) || 0 });
      Toast.show({ type: 'success', text1: `✓ ${pendingProductName} যোগ হয়েছে` });
      setNewProductModal(false);
    } catch (e: any) { Alert.alert('ত্রুটি', e.message); }
  };
 
  const handleMicToggle = async () => {
  if (isRecording) {
    // Stop recording
    setIsRecording(false);
    try { ExpoSpeechRecognitionModule.stop(); } catch {}
  } else {
    // Start recording
    if (!voiceAvailable) { setTextModalVisible(true); return; }
    try {
      const granted = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!granted.granted) { setTextModalVisible(true); return; }
      setIsRecording(true);
      setLiveTranscript('');
      ExpoSpeechRecognitionModule.start({
        lang: 'bn-BD',
        interimResults: true,
        maxAlternatives: 1,
        continuous: true,
        contextualStrings: [
          'চাল','ডাল','তেল','পেঁয়াজ','আলু','ময়দা','চিনি','লবণ','ডিম',
          'কোকাকোলা','সেভেনআপ','ফান্টা','স্প্রাইট',
          'ফ্রেশ','রাধুনী','প্রাণ',
          'কেজি','লিটার','গ্রাম','পিস','ডজন','প্যাকেট',
          'টাকা','বেচলাম','কিনলাম','কমা',
        ],
      });
    } catch { setIsRecording(false); setTextModalVisible(true); }
  }
};

const getTopProductsForCategory = (category: string) => {
  // Get products for this category
  const catProducts = products.filter(p => p?.category === category);

  // Sort by how many times sold today (from transactions)
  const salesCount: Record<string, number> = {};
  todayTransactions.forEach(t => {
    const name = t?.product_name;
    if (name) salesCount[name] = (salesCount[name] ?? 0) + 1;
  });

  return catProducts
    .sort((a, b) => (salesCount[b?.name_bangla] ?? 0) - (salesCount[a?.name_bangla] ?? 0))
    .slice(0, 5);
};
const quickCategories = (shop?.shop_type === 'cosmetics') ? [
  { key: 'Hair Care', label: '💆 শ্যাম্পু' },
  { key: 'Skin Care', label: '🧴 স্কিন কেয়ার' },
  { key: 'Face Care', label: '🫧 ফেস কেয়ার' },
  { key: 'Body Care', label: '🛁 বডি কেয়ার' },
  { key: 'Baby Care', label: '👶 বেবি' },
  { key: 'Perfume', label: '🌸 পারফিউম' },
] : (shop?.shop_type === 'imported') ? [
  { key: 'Chocolates', label: '🍫 চকলেট' },
  { key: 'Instant Noodles', label: '🍜 নুডলস' },
  { key: 'cosmetics', label: '🧴 কসমেটিক্স' },
  { key: 'Snacks', label: '🍪 স্ন্যাকস' },
] : (() => {
  // Derive categories dynamically from loaded products (like web-POS)
  const seen = new Set<string>();
  const cats: { key: string; label: string }[] = [];
  for (const p of products) {
    if (p?.category && !seen.has(p.category)) {
      seen.add(p.category);
      cats.push({ key: p.category, label: GROCERY_CATEGORY_LABELS[p.category] ?? p.category });
    }
  }
  return cats;
})();
const handleQuickAdd = (product: any) => {
  const item: DraftItem = {
    product_name: product.name_bangla,
    product_id: product.id,
    quantity: 1,
    unit: product.unit === 'gram' || product.unit === 'ml' ? 'piece' : product.unit,
    unit_price: product.sale_price,
    total: product.sale_price,
    checked: true,
    confidence: 1.0,
  };
  setDraftItems(prev => [...prev, item]);
  setDraftVisible(true);
  Toast.show({ type: 'success', text1: `✓ ${product.name_bangla} যোগ হয়েছে` });
};
const calculateDiscount = (total: number, type: 'percentage' | 'amount' | null, value: number): number => {
  if (!type || !value || isNaN(value)) return 0;
  if (type === 'percentage') {
    const pct = Math.min(value, 100); // max 100%
    return +(total * pct / 100).toFixed(2);
  }
  return Math.min(value, total); // discount cannot exceed total
};

const discountAmount = calculateDiscount(checkedTotal, discountType, parseFloat(discountValue) || 0);
const netTotal = checkedTotal - discountAmount;


  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.shopLabel}>{shop?.name}</Text>
          <Text style={styles.userLabel}>{user?.name} • {format(new Date(), 'dd/MM/yyyy')}</Text>
        </View>
        <View style={styles.productBadge}>
          <Ionicons name="cube-outline" size={12} color="rgba(255,255,255,0.9)" />
          <Text style={styles.productBadgeText}>{products.length} পণ্য</Text>
        </View>
      </View>

      {/* Totals */}
      <View style={styles.totalsRow}>
        {[
          { label: 'বিক্রয়', amount: todaySales, color: '#90EE90', icon: 'trending-up' },
          { label: 'ক্রয়', amount: todayPurchases, color: '#ADD8E6', icon: 'trending-down' },
          { label: 'লাভ', amount: todaySales - todayPurchases, color: todaySales - todayPurchases >= 0 ? '#90EE90' : '#FF6B6B', icon: 'wallet-outline' },
        ].map((item, i) => (
          <View key={i} style={styles.totalCard}>
            <Ionicons name={item.icon as any} size={14} color={item.color} />
            <Text style={[styles.totalAmount, { color: item.color }]}>৳{formatCurrency(item.amount)}</Text>
            <Text style={styles.totalLabel}>{item.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.mainArea}>

        {/* ══════════════════════════════════════
            DRAFT PANEL — always visible when items exist
            Layout:
            ┌─────────────────────────────────┐
            │ 📋 ড্রাফট বিল (3)      ৳1110   │
            │ ☑ পিয়াজ    1kg    ৳70  ✕       │
            │ ☑ ময়দা     2kg    ৳150 ✕       │
            │ ☑ তেল      5L     ৳890 ✕       │
            │ [বাতিল]  [🎙️ আরো বলুন/লিখুন]  │
            │ [গ্রাহকের নাম]    [বিল (3)]    │
            └─────────────────────────────────┘
        ══════════════════════════════════════ */}
        {draftVisible && draftItems.length > 0 && (
          <View style={styles.draftPanel}>

            {/* Title row */}
            <View style={styles.draftHeader}>
              <Text style={styles.draftTitle}>📋 ড্রাফট বিল ({draftItems.length} পণ্য)</Text>
              <View style={{ alignItems: 'flex-end' }}>
                  {discountAmount > 0 && (
                    <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textMuted, textDecorationLine: 'line-through' }}>
                      ৳{Math.round(checkedTotal)}
                    </Text>
                  )}
                  <Text style={styles.draftTotal}>৳{Math.round(netTotal)}</Text>
                  {discountAmount > 0 && (
                    <Text style={{ fontSize: 10, color: COLORS.error }}>-৳{Math.round(discountAmount)} ছাড়</Text>
                  )}
                </View>
            </View>

            {/* Item checklist */}
            <ScrollView style={{ maxHeight: 170 }} showsVerticalScrollIndicator={false} nestedScrollEnabled>
              {draftItems.map((item, i) => (
                <TouchableOpacity
                  key={`d-${i}`}
                  style={[styles.draftItem, !item.checked && { opacity: 0.4 }]}
                  onPress={() => {
                    const updated = [...draftItems];
                    updated[i] = { ...updated[i], checked: !updated[i].checked };
                    setDraftItems(updated);
                  }}
                  activeOpacity={0.7}
                >
                  {/* Checkbox */}
                  <View style={[styles.checkbox, item.checked && styles.checkboxOn]}>
                    {item.checked && <Ionicons name="checkmark" size={13} color="#fff" />}
                  </View>

                  {/* Product name */}
                  <Text style={styles.draftName} numberOfLines={1}>{item.product_name}</Text>

                  {/* Qty */}

                  <Text style={styles.draftQty}>{item.quantity}{item.unit}×৳{item.unit_price}</Text>

                  {/* Total */}
                  <Text style={styles.draftAmt}>৳{item.total}</Text>

                  {/* Edit button */}
<TouchableOpacity
  onPress={() => {
    setEditingIndex(i);
    setEditName(item.product_name);
    setEditPrice(String(item.unit_price));
    setEditUnit(item.unit);
    setEditModalVisible(true);
  }}
  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
  style={{ paddingHorizontal: 4 }}
>
  <Ionicons name="pencil" size={16} color={COLORS.primary} />
</TouchableOpacity>

{/* Delete button */}
<TouchableOpacity
  onPress={() => setDraftItems(prev => prev.filter((_, idx) => idx !== i))}
  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
>
  <Ionicons name="close-circle" size={20} color={COLORS.error} />
</TouchableOpacity>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Unmatched product warning */}
            {draftItems.some(i => !i.product_id) && (
              <TouchableOpacity
                style={styles.warnBox}
                onPress={() => {
                  const u = draftItems.find(i => !i.product_id);
                  if (u) { setPendingProductName(u.product_name); setPendingProductPrice(String(u.unit_price)); setPendingProductUnit(u.unit); setNewProductModal(true); }
                }}
              >
                <Ionicons name="warning-outline" size={14} color="#92400E" />
                <Text style={styles.warnText}>কিছু পণ্য স্টকে নেই — ট্যাপ করে যোগ করুন</Text>
              </TouchableOpacity>
            )}

            {/* ── ROW A: বাতিল | 🎙 আরো বলুন ── */}
            <View style={styles.draftRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { setDraftItems([]); setDraftVisible(false); reset(); }}
              >
                <Text style={styles.cancelTxt}>বাতিল</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.addMoreBtn, isRecording && styles.addMoreBtnRec]}
                onPress={() => voiceAvailable ? startVoice() : setTextModalVisible(true)}
              >
                <Ionicons
                  name={isRecording ? 'stop-circle' : (voiceAvailable ? 'mic' : 'pencil')}
                  size={18}
                  color={isRecording ? '#fff' : COLORS.primary}
                />
                <Text style={[styles.addMoreTxt, isRecording && { color: '#fff' }]}>
                  {isRecording
                    ? (shop?.shop_type === 'cosmetics' || shop?.shop_type === 'imported'
                      ? '🎙️ Listening... say product name'
                      : '🎙️ শুনছি... সব পণ্য বলুন')
                    : voiceAvailable
                    ? (shop?.shop_type === 'cosmetics' || shop?.shop_type === 'imported'
                      ? 'Press & say product name in English'
                      : 'চেপে ধরুন ও বলুন')
                    : (shop?.shop_type === 'cosmetics' || shop?.shop_type === 'imported'
                      ? 'Tap pencil to type product name'
                      : 'পেন্সিলে ট্যাপ করে লিখুন')}
                </Text>
              </TouchableOpacity>
            </View>
        {/* ── DISCOUNT ROW ── */}
<View style={{ marginTop: 6 }}>
  {/* Toggle buttons */}
  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
    <TouchableOpacity
      style={[styles.discountTypeBtn, discountType === 'percentage' && styles.discountTypeBtnActive]}
      onPress={() => { setDiscountType('percentage'); setDiscountValue(''); }}
    >
      <Text style={[styles.discountTypeTxt, discountType === 'percentage' && { color: '#fff' }]}>
        % ছাড়
      </Text>
    </TouchableOpacity>
    <TouchableOpacity
      style={[styles.discountTypeBtn, discountType === 'amount' && styles.discountTypeBtnActive]}
      onPress={() => { setDiscountType('amount'); setDiscountValue(''); }}
    >
      <Text style={[styles.discountTypeTxt, discountType === 'amount' && { color: '#fff' }]}>
        ৳ ছাড়
      </Text>
    </TouchableOpacity>
    {discountType && (
      <TouchableOpacity
        style={[styles.discountTypeBtn, { borderColor: COLORS.error }]}
        onPress={() => { setDiscountType(null); setDiscountValue(''); }}
      >
        <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.error }}>বাতিল</Text>
      </TouchableOpacity>
    )}
  </View>

  {/* Discount input */}
  {discountType && (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <TextInput
        style={[styles.nameInput, { flex: 1 }]}
        placeholder={discountType === 'percentage' ? '0 %' : '০ টাকা ছাড়'}
        placeholderTextColor={COLORS.textMuted}
        value={discountValue}
        onChangeText={setDiscountValue}
        keyboardType="numeric"
      />
      {/* Show calculated discount */}
      {discountValue ? (
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textMuted }}>ছাড়</Text>
          <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.error }}>
            -৳{calculateDiscount(checkedTotal, discountType, parseFloat(discountValue)).toFixed(0)}
          </Text>
          <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.primary }}>
            = ৳{(checkedTotal - calculateDiscount(checkedTotal, discountType, parseFloat(discountValue))).toFixed(0)}
          </Text>
        </View>
      ) : null}
    </View>
  )}
</View>

            {/* ── Payment Method ── */}
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, marginBottom: 4 }}>
              {PAYMENT_METHODS.map(({ key, label, icon, activeColor }) => (
                <TouchableOpacity
                  key={key}
                  onPress={() => setPaymentMethod(key)}
                  style={{
                    flex: 1, paddingVertical: 7, borderRadius: 10, alignItems: 'center', gap: 2,
                    backgroundColor: paymentMethod === key ? activeColor : COLORS.surfaceSecondary,
                    borderWidth: 1.5, borderColor: paymentMethod === key ? activeColor : COLORS.border,
                  }}
                >
                  <Text style={{ fontSize: 14 }}>{icon}</Text>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: paymentMethod === key ? '#fff' : COLORS.textSecondary }}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* ── ROW B: গ্রাহকের নাম | বিল বোতাম ── */}
            <View style={styles.draftRow}>
              <TextInput
                style={styles.nameInput}
                placeholder="গ্রাহকের নাম (ঐচ্ছিক)"
                placeholderTextColor={COLORS.textMuted}
                value={customerName}
                onChangeText={setCustomerName}
              />
              <TouchableOpacity
                style={[styles.billBtn, saving && { opacity: 0.6 }]}
                onPress={handleSaveDraft}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <>
                    <Ionicons name="receipt-outline" size={15} color="#fff" />
                    <Text style={styles.billTxt}>বিল ({draftItems.filter(i => i.checked).length})</Text>
                  </>}
              </TouchableOpacity>
            </View>

          </View>
        )}

        {/* Transaction history */}
        <ScrollView style={{ flex: 1, paddingHorizontal: 16 }} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionTitle}>আজকের লেনদেন ({(todayTransactions || []).length})</Text>
          {(todayTransactions|| []).length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 32, gap: 8 }}>
              <Ionicons name="mic-outline" size={52} color={COLORS.textMuted} />
              <Text style={{ color: COLORS.textMuted, fontSize: FONT_SIZES.md, fontWeight: '600' }}>এখনো কোনো এন্ট্রি নেই</Text>
              <Text style={{ color: COLORS.textMuted, fontSize: FONT_SIZES.sm, textAlign: 'center', lineHeight: 22, paddingHorizontal: 32 }}>
                {shop?.shop_type === 'cosmetics' || shop?.shop_type === 'imported'
                  ? `Scan barcode or type product name:\n"Vaseline 400ML 2pcs, Nivea Cream 1pc"`
                  : `মাইক চেপে ধরুন ও বলুন:\n"পিয়াজ ১ কেজি ৭০, ময়দা ২ কেজি ১৫০"`}
              </Text>
            </View>
          ) : (
            <BillSummaryList transactions={todayTransactions} />
          )}
        </ScrollView>

        {/* Voice bottom bar */}
        <View style={styles.voiceBar}>
          {isRecording && liveTranscript ? (
            <View style={styles.liveBox}>
              <Text style={styles.liveTxt}>{liveTranscript}</Text>
            </View>
          ) : null}

          {saving ? (
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <ActivityIndicator color={COLORS.primary} size="small" />
              <Text style={{ color: COLORS.textSecondary, fontSize: FONT_SIZES.sm }}>সেভ হচ্ছে...</Text>
            </View>
          ) : (
            <>
              <Text style={styles.voiceHint}>
                {isRecording ? '🎙️ শুনছি... সব পণ্য বলুন' : voiceAvailable ? 'চেপে ধরুন ও বলুন' : 'পেন্সিলে ট্যাপ করে লিখুন'}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
                <TouchableOpacity style={styles.pencilBtn} onPress={() => setTextModalVisible(true)}>
                  <Ionicons name="pencil" size={20} color={COLORS.primary} />
                </TouchableOpacity>
                <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                  <TouchableOpacity
                    style={[styles.micBtn, { backgroundColor: isRecording ? COLORS.error : voiceAvailable ? COLORS.primary : COLORS.textMuted }]}
                    onPress={handleMicToggle}
                    activeOpacity={0.85}
                  >
                    <Ionicons name={isRecording ? 'stop' : 'mic'} size={38} color="#fff" />
                  </TouchableOpacity>
                </Animated.View>
                <TouchableOpacity
  style={styles.pencilBtn}
  onPress={() => {
    console.log('Barcode button pressed');
    router.push('/barcode-scanner')}}
>
  <Ionicons name="barcode-outline" size={22} color={COLORS.primary} />
</TouchableOpacity>
              </View>
              <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textMuted }}>
                {voiceAvailable ? (isRecording ? 'কথা বলুন...' : 'চেপে ধরুন') : 'নতুন APK বিল্ডে ভয়েস'}
              </Text>
            </>
          )}
        </View>
      </View>
{/* ── QUICK ADD SECTION ── */}
<View style={styles.quickSection}>
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 8, paddingVertical: 8 }}>
    {quickCategories.map(cat => (
      <TouchableOpacity
        key={cat.key}
        style={[styles.quickCatBtn, quickCategory === cat.key && styles.quickCatBtnActive]}
        onPress={() => setQuickCategory(quickCategory === cat.key ? null : cat.key)}
      >
        <Text style={[styles.quickCatTxt, quickCategory === cat.key && { color: '#fff' }]}>
          {cat.label}
        </Text>
        <Ionicons
          name={quickCategory === cat.key ? 'remove' : 'add'}
          size={12}
          color={quickCategory === cat.key ? '#fff' : COLORS.primary}
        />
      </TouchableOpacity>
    ))}
  </ScrollView>

  {/* Show top 5 products for selected category */}
  {quickCategory && (
    <View style={styles.quickProductList}>
      <Text style={styles.quickProductTitle}>
        দ্রুত যোগ করুন:
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}>
        {getTopProductsForCategory(quickCategory).map((product, i) => (
          <TouchableOpacity
            key={i}
            style={styles.quickProductBtn}
            onPress={() => handleQuickAdd(product)}
          >
            <Text style={styles.quickProductName} numberOfLines={2}>
              {product.name_bangla}
            </Text>
            <Text style={styles.quickProductPrice}>৳{product.sale_price}</Text>
            <View style={styles.quickAddIcon}>
              <Ionicons name="add" size={14} color="#fff" />
            </View>
          </TouchableOpacity>
        ))}
        {getTopProductsForCategory(quickCategory).length === 0 && (
          <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.textMuted, padding: 8 }}>
            এই ক্যাটাগরিতে কোনো পণ্য নেই
          </Text>
        )}
      </ScrollView>
    </View>
  )}
</View>
      {/* ══ TEXT MODAL ══ */}
      <Modal visible={textModalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setTextModalVisible(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 0.5, borderBottomColor: COLORS.border }}>
            <TouchableOpacity onPress={() => setTextModalVisible(false)}><Ionicons name="close" size={24} color={COLORS.text} /></TouchableOpacity>
            <Text style={{ fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.text }}>
              {shop?.shop_type === 'cosmetics' || shop?.shop_type === 'imported'
                  ? draftItems.length > 0 ? 'Add More Products' : 'Enter Products'
                  : draftItems.length > 0 ? 'আরো পণ্য যোগ করুন' : 'এন্ট্রি লিখুন'}
            </Text>
            <View style={{ width: 24 }} />
          </View>
          <View style={{ padding: 20, gap: 14 }}>
            {draftItems.length > 0 && (
              <View style={{ backgroundColor: '#E8F5E9', padding: 10, borderRadius: 8 }}>
                <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.sale, fontWeight: '600' }}>✓ বিদ্যমান {draftItems.length} পণ্যের সাথে যোগ হবে</Text>
              </View>
            )}
            <TextInput
              style={{ borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 16, fontSize: FONT_SIZES.md, color: COLORS.text, minHeight: 100, backgroundColor: COLORS.surfaceSecondary, textAlignVertical: 'top' }}
              placeholder={
              shop?.shop_type === 'cosmetics'
                ? 'Vaseline 400ML 2pcs 960, Nivea Cream 200ML 350'
                : shop?.shop_type === 'imported'
                ? 'Cadbury 100g 3pcs 840, Indomie 85g 6pcs 480'
                : 'পিয়াজ ১ কেজি ৭০, ময়দা ২ কেজি ১৫০, তেল ৫ লিটার ৮৯০'
            }
             placeholderTextColor={COLORS.textMuted}
              value={textInput} onChangeText={setTextInput} multiline autoFocus
            />
            <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: '600' }}>উদাহরণ:</Text>
             {(shop?.shop_type === 'cosmetics' ? [
            'Vaseline Body Lotion 400ML 2 pieces 960',
            'Nivea Soft Cream 200ML 1 piece 350',
            'AOX Shampoo Tea Tree 400ML 3 pieces 2655',
            'CeraVe Moisturizing Cream 340G 1 piece 1200',
          ] : shop?.shop_type === 'imported' ? [
            'Cadbury Dairy Milk 100g 3 pieces 840',
            'Indomie Mi Goreng 85g 6 pieces 480',
            'Ferrero Rocher T16 1 piece 1200',
            'Shin Ramyun 120g 4 pieces 800',
          ] : [
            'পিয়াজ ১ কেজি ৭০, ময়দা ২ কেজি ১৫০, তেল ৫ লিটার ৮৯০',
            'Fresh মরিচ গুঁড়া 200g 45, রাধুনী হলুদ 200g 40',
            'কোকাকোলা 1L 3টা 180, 7Up 250ml 6টা 120',
            'চাল ২৫ কেজি ১৮৭৫, ডাল ৫ কেজি ৬৫০',
          ]).map((ex, i) => (
              <TouchableOpacity key={i} style={{ backgroundColor: COLORS.surfaceSecondary, padding: 10, borderRadius: 8, borderWidth: 0.5, borderColor: COLORS.border }} onPress={() => setTextInput(ex)}>
                <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.textSecondary }}>{ex}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[{ backgroundColor: COLORS.primary, borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center' }, !textInput.trim() && { opacity: 0.4 }]}
              onPress={() => { if (textInput.trim()) { setTextModalVisible(false); processText(textInput); setTextInput(''); } }}
              disabled={!textInput.trim()}
            >
              <Text style={{ color: '#fff', fontSize: FONT_SIZES.md, fontWeight: '700' }}>
                {shop?.shop_type === 'cosmetics' || shop?.shop_type === 'imported'
                ? draftItems.length > 0 ? 'Add →' : 'Process →'
                : draftItems.length > 0 ? 'যোগ করুন →' : 'প্রসেস করুন →'}
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* ══ NEW PRODUCT MODAL ══ */}
      <Modal visible={newProductModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setNewProductModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 0.5, borderBottomColor: COLORS.border }}>
            <TouchableOpacity onPress={() => setNewProductModal(false)}><Ionicons name="close" size={24} color={COLORS.text} /></TouchableOpacity>
            <Text style={{ fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.text }}>নতুন পণ্য যোগ করুন</Text>
            <View style={{ width: 24 }} />
          </View>
          <View style={{ padding: 20, gap: 16 }}>
            <View style={{ backgroundColor: '#FEF3C7', padding: 12, borderRadius: 10 }}>
              <Text style={{ fontSize: FONT_SIZES.sm, color: '#92400E' }}>"{pendingProductName}" স্টকে নেই।</Text>
            </View>
            {[
              { label: 'পণ্যের নাম *', value: pendingProductName, set: setPendingProductName, placeholder: 'যেমন: Fresh মরিচ গুঁড়া 200g', numeric: false },
              { label: 'বিক্রয় মূল্য (৳) *', value: pendingProductPrice, set: setPendingProductPrice, placeholder: '0', numeric: true },
            ].map((f, i) => (
              <View key={i} style={{ gap: 6 }}>
                <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.text }}>{f.label}</Text>
                <TextInput style={{ borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, height: 48, paddingHorizontal: 14, fontSize: FONT_SIZES.md, color: COLORS.text, backgroundColor: COLORS.surfaceSecondary }} value={f.value} onChangeText={f.set} placeholder={f.placeholder} placeholderTextColor={COLORS.textMuted} keyboardType={f.numeric ? 'numeric' : 'default'} />
              </View>
            ))}
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.text }}>একক</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {['kg', 'gram', 'litre', 'ml', 'piece', 'dozen', 'packet'].map(u => (
                  <TouchableOpacity key={u} style={[{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border }, pendingProductUnit === u && { backgroundColor: COLORS.primary, borderColor: COLORS.primary }]} onPress={() => setPendingProductUnit(u)}>
                    <Text style={[{ fontSize: FONT_SIZES.sm, color: COLORS.textSecondary }, pendingProductUnit === u && { color: '#fff', fontWeight: '700' }]}>{u}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <TouchableOpacity style={{ backgroundColor: COLORS.primary, borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center' }} onPress={handleAddNewProduct}>
              <Text style={{ color: '#fff', fontSize: FONT_SIZES.md, fontWeight: '700' }}>পণ্য যোগ করুন ✓</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
      
      {/* Edit item modal */}
<Modal visible={editModalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditModalVisible(false)}>
  <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 0.5, borderBottomColor: COLORS.border }}>
      <TouchableOpacity onPress={() => setEditModalVisible(false)}>
        <Ionicons name="close" size={24} color={COLORS.text} />
      </TouchableOpacity>
      <Text style={{ fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.text }}>পণ্য সম্পাদনা</Text>
      <View style={{ width: 24 }} />
    </View>
    <View style={{ padding: 20, gap: 16 }}>
      {/* Similar products from same category */}
      {editingIndex >= 0 && (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.text }}>একই ধরনের পণ্য:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 50 }}>
            {products
              .filter(p => {
                const current = draftItems[editingIndex];
                return current && p.category === (products.find(pp => pp.name_bangla === current.product_name)?.category)
                  && p.name_bangla !== current.product_name;
              })
              .slice(0, 8)
              .map((p, i) => (
                <TouchableOpacity
                  key={i}
                  style={{ backgroundColor: COLORS.surfaceSecondary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginRight: 8, borderWidth: 1, borderColor: COLORS.border }}
                  onPress={() => { setEditName(p.name_bangla); setEditPrice(String(p.sale_price)); setEditUnit(p.unit); }}
                >
                  <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.text }}>{p.name_bangla}</Text>
                </TouchableOpacity>
              ))}
          </ScrollView>
        </View>
      )}

      {[
        { label: 'পণ্যের নাম', value: editName, set: setEditName, placeholder: shop?.shop_type === 'grocery'
  ? 'পণ্যের নাম'
  : 'Product name (e.g. Vaseline 400ML)', },
        { label: 'মূল্য (৳)', value: editPrice, set: setEditPrice, placeholder: '0', numeric: true },
      ].map((f, i) => (
        <View key={i} style={{ gap: 6 }}>
          <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.text }}>{f.label}</Text>
          <TextInput
            style={{ borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, height: 48, paddingHorizontal: 14, fontSize: FONT_SIZES.md, color: COLORS.text, backgroundColor: COLORS.surfaceSecondary }}
            value={f.value}
            onChangeText={f.set}
            placeholder={f.placeholder}
            placeholderTextColor={COLORS.textMuted}
            keyboardType={(f as any).numeric ? 'numeric' : 'default'}
          />
        </View>
      ))}

      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.text }}>একক</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {['piece', 'kg', 'gram', 'litre', 'ml', 'dozen', 'packet'].map(u => (
            <TouchableOpacity
              key={u}
              style={[{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border }, editUnit === u && { backgroundColor: COLORS.primary, borderColor: COLORS.primary }]}
              onPress={() => setEditUnit(u)}
            >
              <Text style={[{ fontSize: FONT_SIZES.sm, color: COLORS.textSecondary }, editUnit === u && { color: '#fff', fontWeight: '700' }]}>{u}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity
        style={{ backgroundColor: COLORS.primary, borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center' }}
        onPress={() => {
          if (editingIndex < 0) return;
          const newPrice = parseFloat(editPrice) || 0;
          const updated = [...draftItems];
          updated[editingIndex] = {
            ...updated[editingIndex],
            product_name: editName,
            unit_price: newPrice,
            unit: editUnit as any,
            total: +(updated[editingIndex].quantity * newPrice).toFixed(2),
          };
          setDraftItems(updated);
          setEditModalVisible(false);
        }}
      >
        <Text style={{ color: '#fff', fontSize: FONT_SIZES.md, fontWeight: '700' }}>আপডেট করুন ✓</Text>
      </TouchableOpacity>
    </View>
  </SafeAreaView>
</Modal>


      {/* ══ INVOICE MODAL ══ */}
      <Modal visible={invoiceModalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setInvoiceModalVisible(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 0.5, borderBottomColor: COLORS.border }}>
            <TouchableOpacity onPress={() => setInvoiceModalVisible(false)}><Ionicons name="close" size={24} color={COLORS.text} /></TouchableOpacity>
            <Text style={{ fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.text }}>বিল / ইনভয়েস</Text>
            <TouchableOpacity onPress={handleShareInvoice}><Ionicons name="share-outline" size={24} color={COLORS.primary} /></TouchableOpacity>
          </View>
          {lastInvoice && (
            <ScrollView contentContainerStyle={{ padding: 20 }}>
              <View style={{ alignItems: 'center', marginBottom: 20 }}>
                <Text style={{ fontSize: FONT_SIZES.xl, fontWeight: '700', color: COLORS.primary }}>{shop?.name}</Text>
                {shop?.address ? <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.textSecondary }}>{shop.address}</Text> : null}
                <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.textSecondary }}>{shop?.phone}</Text>
              </View>
              <View style={{ backgroundColor: COLORS.surfaceSecondary, borderRadius: 12, padding: 14, marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.textSecondary }}>বিল নং</Text>
                  <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.primary }}>{lastInvoice.number}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.textSecondary }}>তারিখ</Text>
                  <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.text }}>{format(new Date(), 'dd/MM/yyyy HH:mm')}</Text>
                </View>
                {lastInvoice.customer ? (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                    <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.textSecondary }}>গ্রাহক</Text>
                    <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.text }}>{lastInvoice.customer}</Text>
                  </View>
                ) : null}
              </View>
              <View style={{ borderWidth: 0.5, borderColor: COLORS.border, borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', backgroundColor: COLORS.primary, padding: 10 }}>
                  <Text style={[styles.invTh, { flex: 2 }]}>পণ্য</Text>
                  <Text style={[styles.invTh, { flex: 1, textAlign: 'center' }]}>পরিমাণ</Text>
                  <Text style={[styles.invTh, { flex: 1, textAlign: 'right' }]}>মোট</Text>
                </View>
                {lastInvoice.items.map((item, i) => (
                  <View key={i} style={[{ flexDirection: 'row', padding: 10, alignItems: 'center' }, i % 2 === 0 && { backgroundColor: COLORS.surfaceSecondary }]}>
                    <View style={{ flex: 2 }}>
                      <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.text }}>{item.product_name}</Text>
                      <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textMuted }}>৳{item.unit_price}/{item.unit}</Text>
                    </View>
                    <Text style={{ flex: 1, fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, textAlign: 'center' }}>{item.quantity}{item.unit}</Text>
                    <Text style={{ flex: 1, fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.text, textAlign: 'right' }}>৳{item.total}</Text>
                  </View>
                ))}
              </View>
              <View style={{ backgroundColor: COLORS.surfaceSecondary, borderRadius: 12, padding: 14, marginBottom: 8, gap: 8 }}>
  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
    <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.textSecondary }}>সাব-টোটাল</Text>
    <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.text }}>৳{Math.round(lastInvoice.total)}</Text>
  </View>
  {lastInvoice.discount_amount ? (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.error }}>
        ছাড় {lastInvoice.discount_type === 'percentage'
          ? `(${lastInvoice.discount_value}%)`
          : '(fixed)'}
      </Text>
      <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.error, fontWeight: '700' }}>
        -৳{Math.round(lastInvoice.discount_amount)}
      </Text>
    </View>
  ) : null}
</View>

{(() => {
  const pm = PAYMENT_METHODS.find(p => p.key === lastInvoice.payment_method);
  return pm ? (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surfaceSecondary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8 }}>
      <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.textSecondary }}>পেমেন্ট</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: pm.activeColor + '18', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, borderWidth: 1, borderColor: pm.activeColor + '44' }}>
        <Text style={{ fontSize: 16 }}>{pm.icon}</Text>
        <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: '700', color: pm.activeColor }}>{pm.label}</Text>
      </View>
    </View>
  ) : null;
})()}

<View style={{ backgroundColor: COLORS.primary, borderRadius: 12, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
  <Text style={{ fontSize: FONT_SIZES.lg, fontWeight: '700', color: '#fff' }}>মোট</Text>
  <Text style={{ fontSize: FONT_SIZES.xxl, fontWeight: '700', color: '#fff' }}>
    ৳{Math.round(lastInvoice.net_total ?? lastInvoice.total)}
  </Text>
</View>
              <TouchableOpacity style={{ backgroundColor: '#25D366', borderRadius: 14, height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 }} onPress={handleShareInvoice}>
                <Ionicons name="logo-whatsapp" size={22} color="#fff" />
                <Text style={{ color: '#fff', fontSize: FONT_SIZES.md, fontWeight: '700' }}>WhatsApp-এ পাঠান</Text>
              </TouchableOpacity>
              <Text style={{ textAlign: 'center', fontSize: FONT_SIZES.xs, color: COLORS.textMuted }}>ধন্যবাদ আপনার ক্রয়ের জন্য 🙏</Text>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function BillSummaryList({ transactions }: { transactions: Transaction[] }) {
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const groups: { key: string; items: Transaction[]; isInvoice: boolean }[] = [];
  const seen = new Set<string>();

  transactions.forEach(txn => {
    const key = (txn as any).invoice_number ?? txn.id ?? String(Math.random());
    if (!seen.has(key)) {
      seen.add(key);
      const relatedItems = (txn as any).invoice_number
        ? transactions.filter(t => (t as any).invoice_number === (txn as any).invoice_number)
        : [txn];
      groups.push({ key, items: relatedItems, isInvoice: !!(txn as any).invoice_number });
    }
  });

  return (
    <View>
      {groups.map(group => {
        const total = group.items.reduce((s, t) => s + t.total_amount, 0);
        const isSale = group.items[0].type === 'sale';
        const isExpanded = expanded === group.key;
        const firstTxn = group.items[0];
        return (
          <TouchableOpacity
            key={group.key}
            style={styles.billRow}
            onPress={() => setExpanded(isExpanded ? null : group.key)}
            activeOpacity={0.7}
          >
            <View style={[styles.txnDot, { backgroundColor: isSale ? COLORS.sale : COLORS.purchase }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.billNum}>
                {group.key}
                {'  '}{group.items.length} পণ্য
              </Text>
              {isExpanded && (
                <View style={{ marginTop: 3 }}>
                  {group.items.map((item, i) => (
                    <Text key={i} style={styles.billDetail}>
                      {item.product_name} {item.quantity}{item.unit} ৳{item.total_amount}
                    </Text>
                  ))}
                </View>
              )}
            </View>
             <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <Text style={[styles.billAmt, { color: isSale ? COLORS.sale : COLORS.purchase }]}>
                {isSale ? '+' : '-'}৳{total}
              </Text>
              <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={11} color={COLORS.textMuted} />
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
function TxnRow({ txn }: { txn: Transaction }) {
  const isSale = txn.type === 'sale';
  return (
    <View style={styles.txnRow}>
      <View style={[styles.txnDot, { backgroundColor: isSale ? COLORS.sale : COLORS.purchase }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.txnProduct}>{txn.product_name}</Text>
        <Text style={styles.txnMeta}>{txn.quantity} {txn.unit} • {txn.user_name} • {formatTime(txn.created_at)}</Text>
      </View>
      <Text style={[styles.txnAmt, { color: isSale ? COLORS.sale : COLORS.purchase }]}>
        {isSale ? '+' : '-'}৳{txn.total_amount}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.primary },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12 },
  shopLabel: { fontSize: FONT_SIZES.md, fontWeight: '700', color: '#fff' },
  userLabel: { fontSize: FONT_SIZES.xs, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  productBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  productBadgeText: { fontSize: FONT_SIZES.xs, color: 'rgba(255,255,255,0.9)' },
  totalsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  totalCard: { flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: 10, alignItems: 'center', gap: 3 },
  totalAmount: { fontSize: FONT_SIZES.md, fontWeight: '700' },
  totalLabel: { fontSize: 9, color: 'rgba(255,255,255,0.7)' },
  mainArea: { flex: 1, backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },

  // Draft panel
  draftPanel: { marginHorizontal: 12, marginTop: 12, marginBottom: 4, backgroundColor: '#F0FFF4', borderRadius: 16, padding: 12, borderWidth: 1.5, borderColor: COLORS.sale },
  draftHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  draftTitle: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.text },
  draftTotal: { fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.sale },
  draftItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: COLORS.border },
  draftName: { flex: 1, fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.text },
  draftQty: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, minWidth: 44, textAlign: 'right' },
  draftAmt: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.text, minWidth: 52, textAlign: 'right' },
  checkbox: { width: 22, height: 22, borderRadius: 5, borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  checkboxOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  warnBox: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FEF3C7', padding: 8, borderRadius: 8, marginTop: 6 },
  warnText: { fontSize: FONT_SIZES.xs, color: '#92400E', flex: 1 },

  // Draft action rows
  draftRow: { flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' },
  cancelBtn: { flex: 1, height: 44, borderRadius: 10, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
  cancelTxt: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, fontWeight: '600' },
  addMoreBtn: { flex: 2, height: 44, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderColor: COLORS.primary, backgroundColor: '#fff' },
  addMoreBtnRec: { backgroundColor: COLORS.error, borderColor: COLORS.error },
  addMoreTxt: { fontSize: FONT_SIZES.sm, color: COLORS.primary, fontWeight: '700' },
  nameInput: { flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 12, height: 44, fontSize: FONT_SIZES.sm, color: COLORS.text, backgroundColor: '#fff' },
  billBtn: { flex: 1, height: 44, borderRadius: 10, backgroundColor: COLORS.sale, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  billTxt: { color: '#fff', fontSize: FONT_SIZES.sm, fontWeight: '700' },

  sectionTitle: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.textSecondary, marginTop: 16, marginBottom: 8 },
  txnRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10, borderBottomWidth: 0.5, borderBottomColor: COLORS.border },
  txnDot: { width: 8, height: 8, borderRadius: 4 },
  txnProduct: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.text },
  txnMeta: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 2 },
  txnAmt: { fontSize: FONT_SIZES.sm, fontWeight: '700' },
  liveBox: { backgroundColor: COLORS.surfaceSecondary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginHorizontal: 16, borderWidth: 1, borderColor: COLORS.border },
  liveTxt: { fontSize: FONT_SIZES.sm, color: COLORS.text, fontStyle: 'italic' },
  voiceBar: { backgroundColor: COLORS.surface, paddingBottom: 24, paddingTop: 12, alignItems: 'center', gap: 8, borderTopWidth: 0.5, borderTopColor: COLORS.border },
  voiceHint: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, textAlign: 'center', paddingHorizontal: 24 },
  micBtn: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', elevation: 8 },
  pencilBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.surfaceSecondary, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
  invTh: { fontSize: FONT_SIZES.xs, fontWeight: '700', color: '#fff' },
  billSummaryRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, gap: 10, borderBottomWidth: 0.5, borderBottomColor: COLORS.border },
  billInvNum: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.text },
  billItemDetail: { fontSize: 11, color: COLORS.textSecondary, paddingLeft: 4, lineHeight: 18 },
  quickSection: { backgroundColor: COLORS.surface, borderBottomWidth: 0.5, borderBottomColor: COLORS.border },
  quickCatBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: COLORS.primary, backgroundColor: '#fff' },
  quickCatBtnActive: { backgroundColor: COLORS.primary },
  quickCatTxt: { fontSize: FONT_SIZES.xs, color: COLORS.primary, fontWeight: '600' },
  quickProductList: { paddingBottom: 8, borderTopWidth: 0.5, borderTopColor: COLORS.border },
  quickProductTitle: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, fontWeight: '600', paddingHorizontal: 12, paddingVertical: 6 },
  quickProductBtn: { width: 90, backgroundColor: COLORS.surfaceSecondary, borderRadius: 10, padding: 8, alignItems: 'center', gap: 4, borderWidth: 0.5, borderColor: COLORS.border },
  quickProductName: { fontSize: 10, color: COLORS.text, fontWeight: '600', textAlign: 'center' },
  quickProductPrice: { fontSize: FONT_SIZES.xs, color: COLORS.primary, fontWeight: '700' },
  quickAddIcon: { backgroundColor: COLORS.primary, borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  billRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, paddingHorizontal: 4, gap: 8, borderBottomWidth: 0.5, borderBottomColor: COLORS.border },
  billNum: { fontSize: 12, fontWeight: '700', color: COLORS.text },
  billMeta: { fontSize: 10, color: COLORS.textMuted, marginTop: 1 },
  billDetail: { fontSize: 10, color: COLORS.textSecondary, lineHeight: 16 },
  billAmt: { fontSize: 12, fontWeight: '700' },
  discountTypeBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: '#fff' },
  discountTypeBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  discountTypeTxt: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, fontWeight: '600' },
}) ;
