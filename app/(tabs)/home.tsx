import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, TextInput, Modal, Share
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
import InstantSearchBar from '@/components/pos/InstantSearchBar';
import VoiceDictationButton from '@/components/pos/VoiceDictationButton';
import QueueTabs from '@/components/pos/QueueTabs';
import CartBillBar, { PAYMENT_METHODS } from '@/components/pos/CartBillBar';
import { useCartStore, CartItem } from '@/store';
import { useCatalog } from '@/hooks/useCatalog';
import CategoryChipRail, { RailCategory, RailBrand } from '@/components/pos/CategoryChipRail';
import ProductBrowseList from '@/components/pos/ProductBrowseList';
import BarcodeScanSheet from '@/components/pos/BarcodeScanSheet';
import LooseQuantitySheet from '@/components/pos/LooseQuantitySheet';
import { useSalesStatsStore } from '@/store/salesStats';
import DropdownSelect from '@/components/common/DropdownSelect';
import { unitOptions } from '@/constants/unitOptions';
import { isLoose, formatWeight } from '@/utils/looseUnits';
import type { Product } from '@/types';
import { GROCERY_CATEGORIES as GROCERY_CATEGORY_LIST } from '@/constants/groceryCategories';

// The 12 approved shop categories live in one shared list (also used by the product forms): fixed shelf order + Bangla names.
const POS_CATEGORIES: [string, string][] = GROCERY_CATEGORY_LIST.map(c => [c.key, c.bn]);
const POS_CATEGORY_BN: Record<string, string> = Object.fromEntries(POS_CATEGORIES);
const POS_CATEGORY_ORDER: Record<string, number> = Object.fromEntries(POS_CATEGORIES.map(([k], i) => [k, i]));

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

// Voice entry was removed from this screen — pronunciation and alias
// matching against a live sale (product + quantity + price, all in one
// parse) turned out too unreliable in practice. Voice now lives only as
// simple dictation into a single text field (product name) when creating a
// new product — see src/components/pos/VoiceDictationButton.tsx, used from
// the "new product" modals in this file and in barcode-scanner.tsx.

export default function HomeScreen() {
  const { shop, user } = useAuthStore();
  const { products = [] } = useProductStore();
  const { todayTransactions =[], pendingBills = [] } = useTransactionStore();
  const { setStatus, setRawText } = useVoiceStore();
  // The cart that's currently receiving adds — whichever customer tab is
  // active in QueueTabs. Every add-to-cart path below targets this cart,
  // not a screen-level draft list (that's the "customer 1 / customer 2"
  // requirement — see QueueTabs/CartBillBar).
  const activeCart = useCartStore(s => s.activeCart());

  const [textModalVisible, setTextModalVisible] = useState(false);
  const [textInput, setTextInput] = useState('');
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

  const nluRef = useRef(createNLUService(products));
  const multiParserRef = useRef(new MultiItemParser(nluRef.current));
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [scanVisible, setScanVisible] = useState(false);
  const params = useLocalSearchParams();

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
  transactionService.refreshSalesStats().catch(console.warn);
  productService.fetchProducts().catch(console.warn);
}, []);

  useEffect(() => {
  if (params.scannedItem) {
    try {
      const parsed = JSON.parse(params.scannedItem as string);
      // The scanner now hands back a batch (rapid multi-item scanning stays
      // open until the shopkeeper closes it) — but keep accepting a single
      // object too, for backward compatibility with any other caller.
      const items = Array.isArray(parsed) ? parsed : [parsed];
      addToActiveCart(items.map((item: any) => ({ ...item, checked: true, confidence: item.confidence ?? 1.0 })));
      // Clear param
      router.setParams({ scannedItem: undefined });
    } catch {}
  }
}, [params.scannedItem]);

  // Recent/frequent for the search bar's empty-focused state (FR-4) — built
  // only from data already loaded (today's transactions + product cache), no
  // new API call. Scoped to today only; a multi-day window would need a
  // separate fetch, deliberately not added here.
  const statCounts = useSalesStatsStore(s => s.counts);
  const statLastSold = useSalesStatsStore(s => s.lastSold);
  const hasStats = Object.keys(statCounts).length > 0;
  const frequentProducts = React.useMemo(() => {
    // Last 30 days (persisted, refreshed hourly). Until the first refresh has ever happened, fall back to today's sales.
    const counts: Record<string, number> = hasStats ? { ...statCounts } : {};
    if (!hasStats) (todayTransactions ?? []).forEach(t => {
      if (t?.type === 'sale' && t.product_id) counts[t.product_id] = (counts[t.product_id] ?? 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => products.find(p => p.id === id))
      .filter((p): p is NonNullable<typeof p> => !!p)
      .slice(0, 8);
  }, [todayTransactions, products, statCounts, hasStats]);

  const recentProducts = React.useMemo(() => {
    const seen = new Set<string>();
    const out: typeof products = [];
    if (hasStats) {
      const byId = new Map(products.map(p => [p.id, p] as const));
      return Object.entries(statLastSold)
        .sort((a, b) => (a[1] < b[1] ? 1 : -1))
        .map(([id]) => byId.get(id))
        .filter((p): p is NonNullable<typeof p> => !!p)
        .slice(0, 8);
    }
    for (const t of todayTransactions ?? []) {
      if (t?.type !== 'sale' || !t.product_id || seen.has(t.product_id)) continue;
      const p = products.find(pp => pp.id === t.product_id);
      if (!p) continue;
      seen.add(t.product_id);
      out.push(p);
      if (out.length >= 8) break;
    }
    return out;
  }, [todayTransactions, products, statLastSold, hasStats]);

  const todaySales = (todayTransactions ?? []).filter(t => t.type === 'sale').reduce((s, t) => s + (t?.total_amount ?? 0), 0);

  const addToActiveCart = (items: CartItem[]) => {
    const cartId = useCartStore.getState().activeCartId;
    items.forEach(item => useCartStore.getState().addItem(item, cartId));
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
          addToActiveCart(saleItems.map((item, i) => ({
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
      addToActiveCart(saleItems.map(item => ({ ...item, checked: true, confidence: 0.7 })));
    } else {
      Toast.show({ type: 'error', text1: 'বুঝতে পারিনি', text2: 'আবার বলুন বা টাইপ করুন' });
      setStatus('idle');
    }
  };

  // CartBillBar owns the checkout call itself (it needs the active cart's
  // items, discount and payment method, which now live in useCartStore);
  // these two just hand the result back to screen-level state (the invoice
  // modal / new-product flow are shared across carts, so they stay here).
  const handleCheckoutSuccess = (invoice: {
    number: string; items: CartItem[]; total: number; customer: string; payment_method: PaymentMethod;
    discount_type?: 'percentage' | 'amount'; discount_value?: number; discount_amount?: number; net_total?: number;
  }) => {
    setLastInvoice(invoice);
    setInvoiceModalVisible(true);
    useSalesStatsStore.getState().recordSale(invoice.items.map(i => i.product_id).filter((x): x is string => !!x));
  };

  const handleUnmatchedProduct = (item: CartItem) => {
    setPendingProductName(item.product_name);
    setPendingProductPrice(String(item.unit_price));
    setPendingProductUnit(item.unit);
    setNewProductModal(true);
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
      `${i + 1}. ${item.product_name} — ${item.unit === 'gram' ? formatWeight(item.quantity) : `${item.quantity}${item.unit} × ৳${item.unit_price}`} = ৳${item.total}`
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
 
  // ── Product browse data (category rail + list) ──────────────────────────
  // Only active products; categories come from the products themselves so a
  // chip can never lead to an empty list, and the count on each chip is live.
  const activeProducts = React.useMemo(() => (products ?? []).filter(p => p && p.is_active !== false), [products]);

  // The catalog supplies proper Bangla category names; useCatalog() serves the
  // cached copy instantly and only re-fetches when it's older than 24 h.
  const { categories: catalogCategories } = useCatalog();
  const railCategories = React.useMemo<RailCategory[]>(() => {
    const counts: Record<string, number> = {};
    for (const p of activeProducts) if (p.category) counts[p.category] = (counts[p.category] ?? 0) + 1;
    return Object.entries(counts)
      // approved categories keep their fixed shelf order; anything else follows, biggest first
      .sort((a, b) => (POS_CATEGORY_ORDER[a[0]] ?? 99) - (POS_CATEGORY_ORDER[b[0]] ?? 99) || b[1] - a[1])
      .map(([key, count]) => ({
        key,
        count,
        label: POS_CATEGORY_BN[key]
          ?? catalogCategories.find(c => c.name === key)?.display_name_bangla
          ?? GROCERY_CATEGORY_LABELS[key]
          ?? key.replace(/_/g, ' '),
      }));
  }, [activeProducts, catalogCategories]);

  // Brand filter inside the chosen category. Brands are grouped ignoring case and stray spaces ("Dettol" = "dettol ").
  // Shown only when the category has two or more brands; changing category clears it.
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  useEffect(() => { setSelectedBrand(null); }, [selectedCategory]);
  const brandChips = React.useMemo<RailBrand[]>(() => {
    const m = new Map<string, RailBrand>();
    for (const p of activeProducts) {
      if (selectedCategory && p.category !== selectedCategory) continue;
      const b = (p.brand ?? '').trim();
      if (!b) continue;
      const key = b.toLowerCase();
      const cur = m.get(key);
      if (cur) cur.count++; else m.set(key, { key, label: b, count: 1 });
    }
    const list = [...m.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    return list.length >= 2 ? list : [];
  }, [activeProducts, selectedCategory]);

  // Anything sold today floats to the top of the list.
  const salesCount = React.useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of todayTransactions ?? []) if (t?.type === 'sale' && t.product_id) m[t.product_id] = (m[t.product_id] ?? 0) + 1;
    return m;
  }, [todayTransactions]);

  const buildCartItem = (product: any): CartItem => ({
    product_name: product.name_bangla || product.name_english,
    product_id: product.id,
    quantity: 1,
    unit: product.unit === 'gram' || product.unit === 'ml' ? 'piece' : product.unit,
    unit_price: product.sale_price,
    total: product.sale_price,
    checked: true,
    confidence: 1.0,
  });

  // The server refuses a bill line for a product with no stock, so say so at
  // the moment of adding rather than letting the checkout fail later.
  const warnIfOutOfStock = (product: any) => {
    if (Number(product.current_stock ?? 0) <= 0) {
      Toast.show({ type: 'info', text1: `${product.name_bangla || product.name_english} — স্টকে নেই`, text2: 'বিল করলে ব্যর্থ হতে পারে' });
    }
  };

  // Loose items are sold by weight or by taka: picking one opens the quantity sheet instead of adding "1".
  const [looseFor, setLooseFor] = useState<Product | null>(null);
  const looseLine = looseFor ? activeCart.items.find(i => i.product_id === looseFor.id && i.unit === 'gram') : undefined;

  const confirmLoose = (grams: number, unitPrice: number, total: number) => {
    const p = looseFor;
    if (!p) return;
    const s = useCartStore.getState();
    const cart = s.activeCart();
    const line: CartItem = {
      product_name: p.name_bangla || p.name_english || 'পণ্য', product_id: p.id,
      quantity: grams, unit: 'gram', unit_price: unitPrice, total, checked: true, confidence: 1.0,
      list_unit_price: Number(p.sale_price),
    };
    const at = cart.items.findIndex(i => i.product_id === p.id && i.unit === 'gram');
    if (at >= 0) s.updateItem(cart.id, at, line); else s.addItem(line);
    Toast.show({ type: 'success', text1: `✓ ${line.product_name} ${formatWeight(grams)} — ৳${total}` });
    setLooseFor(null);
  };

  // From the search dropdown: it closes on select, so confirm with a toast.
  const handleQuickAdd = (product: any) => {
    if (isLoose(product)) { setLooseFor(product); return; }
    addToActiveCart([buildCartItem(product)]);
    Toast.show({ type: 'success', text1: `✓ ${product.name_bangla} যোগ হয়েছে` });
    warnIfOutOfStock(product);
  };

  // Search found nothing (or the shopkeeper wants a new one): open the quick new-product form with the typed name.
  const handleCreateFromSearch = (name: string) => {
    setPendingProductName(name);
    setPendingProductPrice('');
    setPendingProductUnit('piece');
    setNewProductModal(true);
  };

  // PRD FR-19: typing just an amount sells an open item that isn't in the catalog.
  const handleAddCustom = (amount: number) => {
    addToActiveCart([{
      product_name: 'খোলা পণ্য', quantity: 1, unit: 'piece',
      unit_price: amount, total: amount, checked: true, confidence: 1.0, custom: true,
    }]);
    Toast.show({ type: 'success', text1: `✓ খোলা পণ্য ৳${amount} যোগ হয়েছে` });
  };

  // Bills that were saved on this phone but never reached the server don't appear in
  // reports. Surface that instead of retrying silently, and let the shopkeeper decide.
  const handlePendingPress = () => {
    const n = pendingBills.length;
    const total = pendingBills.reduce((s, b) => s + b.items.reduce((t, i) => t + i.quantity * i.unit_price, 0), 0);
    Alert.alert(
      `${n}টি বিল সিঙ্ক হয়নি`,
      `মোট ৳${Math.round(total)}। এগুলো সার্ভারে যায়নি, তাই রিপোর্টে আসবে না।\n\nইন্টারনেট থাকলে আবার চেষ্টা করুন। কোনো পণ্য সার্ভারে না থাকলে বিলটি কখনোই যাবে না।`,
      [
        { text: 'বন্ধ করুন', style: 'cancel' },
        {
          text: 'আবার চেষ্টা',
          onPress: async () => {
            await transactionService.syncPending();
            const left = useTransactionStore.getState().pendingBills.length;
            Toast.show(left === 0
              ? { type: 'success', text1: 'সব বিল সিঙ্ক হয়েছে' }
              : { type: 'error', text1: `${left}টি বিল এখনো যায়নি` });
          },
        },
        {
          text: 'বাদ দিন',
          style: 'destructive',
          onPress: () => Alert.alert('নিশ্চিত?', 'বিলটি চিরতরে মুছে যাবে, সার্ভারে যাবে না।', [
            { text: 'না', style: 'cancel' },
            { text: 'হ্যাঁ, মুছুন', style: 'destructive', onPress: () => useTransactionStore.getState().clearPendingBills() },
          ]),
        },
      ],
    );
  };

  // From the product list: the row itself flips to a − qty + stepper, no toast needed.
  const handleListAdd = React.useCallback((product: any) => {
    if (isLoose(product)) { setLooseFor(product); return; }
    useCartStore.getState().addItem(buildCartItem(product));
    warnIfOutOfStock(product);
  }, []);


  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.shopLabel}>{shop?.name}</Text>
          <Text style={styles.userLabel}>
            {user?.name} • {format(new Date(), 'dd/MM/yyyy')} • আজ ৳{formatCurrency(todaySales)}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {/* Typed multi-item entry ("পিয়াজ ১ কেজি ৭০, ময়দা ২ কেজি ১৫০") — kept, just no longer a full-width bar */}
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => setTextModalVisible(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="create-outline" size={18} color="#fff" />
          </TouchableOpacity>
          <View style={styles.productBadge}>
            <Ionicons name="cube-outline" size={12} color="rgba(255,255,255,0.9)" />
            <Text style={styles.productBadgeText}>{products.length} পণ্য</Text>
          </View>
        </View>
      </View>

      {pendingBills.length > 0 && (
        <TouchableOpacity style={styles.syncPill} onPress={handlePendingPress} activeOpacity={0.8}>
          <Ionicons name="cloud-offline-outline" size={14} color="#7A4E0F" />
          <Text style={styles.syncPillTxt}>{pendingBills.length}টি বিল সিঙ্ক হয়নি — ট্যাপ করুন</Text>
        </TouchableOpacity>
      )}

      {/* Customer tabs — every add-to-cart action targets whichever tab is active here */}
      <QueueTabs />

      {/* ── INSTANT SEARCH — headline requirement, PRD §2 Goal 1 / §6.A ──
          Live, indexed, first-character Bangla+English product search.
          Selecting a result reuses the existing quick-add path unchanged. */}
      <InstantSearchBar
        products={activeProducts}
        onSelect={handleQuickAdd}
        onScanPress={() => setScanVisible(true)}
        recentProducts={recentProducts}
        frequentProducts={frequentProducts}
        onCreateProduct={handleCreateFromSearch}
        onAddCustom={handleAddCustom}
      />

      <View style={styles.mainArea}>
        {/* Category filter, then every product as a row that acts directly on
            the active customer's cart. The bill itself is the collapsed
            CartBillBar below — that's what frees this whole area for
            finding things instead of reading a draft. */}
        <CategoryChipRail
          categories={railCategories}
          selected={selectedCategory}
          onSelect={setSelectedCategory}
          totalCount={activeProducts.length}
          brands={brandChips}
          selectedBrand={selectedBrand}
          onSelectBrand={setSelectedBrand}
        />
        <ProductBrowseList
          products={activeProducts}
          category={selectedCategory}
          brand={selectedBrand}
          salesCount={salesCount}
          bottomInset={activeCart.items.length > 0 ? 110 : 24}
          onAdd={handleListAdd}
          onLoose={setLooseFor}
        />
      </View>

      {/* Collapsed bill bar — floats above the bottom nav, hidden when the active cart is empty */}
      <CartBillBar
        onUnmatchedProduct={handleUnmatchedProduct}
        onCheckoutSuccess={handleCheckoutSuccess}
        onAddMore={() => setTextModalVisible(true)}
      />

      {/* Scan: opened from the icon in the search bar; an overlay on this screen (not a route), so the customer tabs stay mounted underneath */}
      <BarcodeScanSheet
        visible={scanVisible}
        onClose={() => setScanVisible(false)}
        onAdd={(product) => {
          // A scanned loose item has to be weighed: close the scanner and ask how much.
          if (isLoose(product)) { setScanVisible(false); setLooseFor(product); return; }
          useCartStore.getState().addItem(buildCartItem(product));
        }}
      />
      <LooseQuantitySheet
        product={looseFor}
        currentGrams={looseLine?.quantity ?? 0}
        onClose={() => setLooseFor(null)}
        onConfirm={confirmLoose}
      />

      {/* ══ TEXT MODAL ══ */}
      <Modal visible={textModalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setTextModalVisible(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 0.5, borderBottomColor: COLORS.border }}>
            <TouchableOpacity onPress={() => setTextModalVisible(false)}><Ionicons name="close" size={24} color={COLORS.text} /></TouchableOpacity>
            <Text style={{ fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.text }}>
              {shop?.shop_type === 'cosmetics' || shop?.shop_type === 'imported'
                  ? activeCart.items.length > 0 ? 'Add More Products' : 'Enter Products'
                  : activeCart.items.length > 0 ? 'আরো পণ্য যোগ করুন' : 'এন্ট্রি লিখুন'}
            </Text>
            <View style={{ width: 24 }} />
          </View>
          <View style={{ padding: 20, gap: 14 }}>
            {activeCart.items.length > 0 && (
              <View style={{ backgroundColor: '#E8F5E9', padding: 10, borderRadius: 8 }}>
                <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.sale, fontWeight: '600' }}>✓ বিদ্যমান {activeCart.items.length} পণ্যের সাথে যোগ হবে</Text>
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
                ? activeCart.items.length > 0 ? 'Add →' : 'Process →'
                : activeCart.items.length > 0 ? 'যোগ করুন →' : 'প্রসেস করুন →'}
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
              { label: 'পণ্যের নাম *', value: pendingProductName, set: setPendingProductName, placeholder: 'যেমন: Fresh মরিচ গুঁড়া 200g', numeric: false, voice: true },
              { label: 'বিক্রয় মূল্য (৳) *', value: pendingProductPrice, set: setPendingProductPrice, placeholder: '0', numeric: true, voice: false },
            ].map((f, i) => (
              <View key={i} style={{ gap: 6 }}>
                <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.text }}>{f.label}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TextInput
                    style={{ flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, height: 48, paddingHorizontal: 14, fontSize: FONT_SIZES.md, color: COLORS.text, backgroundColor: COLORS.surfaceSecondary }}
                    value={f.value} onChangeText={f.set} placeholder={f.placeholder} placeholderTextColor={COLORS.textMuted} keyboardType={f.numeric ? 'numeric' : 'default'}
                  />
                  {f.voice && <VoiceDictationButton onResult={(t: string) => f.set(f.value?.trim() ? `${f.value.trim()} ${t}` : t)} />}
                </View>
              </View>
            ))}
            <DropdownSelect
              label="একক"
              title="একক বাছাই করুন"
              value={pendingProductUnit}
              options={unitOptions()}
              onChange={setPendingProductUnit}
            />
            <TouchableOpacity style={{ backgroundColor: COLORS.primary, borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center' }} onPress={handleAddNewProduct}>
              <Text style={{ color: '#fff', fontSize: FONT_SIZES.md, fontWeight: '700' }}>পণ্য যোগ করুন ✓</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
      
      {/* Per-item editing now lives inside CartBillBar's bill sheet, since it
          operates on the active cart's items via the cart store. */}

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
                      <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textMuted }}>{item.unit === 'gram' ? 'খোলা পণ্য' : `৳${item.unit_price}/${item.unit}`}</Text>
                    </View>
                    <Text style={{ flex: 1, fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, textAlign: 'center' }}>{item.unit === 'gram' ? formatWeight(item.quantity) : `${item.quantity}${item.unit}`}</Text>
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
  syncPill: {
    alignSelf: 'flex-start', marginLeft: 16, marginBottom: 8,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FCEFD8', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
  },
  syncPillTxt: { fontSize: FONT_SIZES.xs, fontWeight: '700', color: '#7A4E0F' },
  headerIconBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
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
  typeMultiBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 20, height: 44, borderRadius: 22,
    borderWidth: 1.5, borderColor: COLORS.primary, backgroundColor: '#fff',
  },
  typeMultiTxt: { fontSize: FONT_SIZES.sm, color: COLORS.primary, fontWeight: '700' },
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
