
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format, subDays, isToday, isYesterday, parseISO } from 'date-fns';
import { transactionService } from '@/services/supabase/transactionService';
import { billingApi } from '@/services/api/billingApi';
import { useAuthStore } from '@/store';
import { Transaction, PaymentMethod } from '@/types';
import { COLORS, FONT_SIZES } from '@/constants';
import { formatCurrency, formatTime, groupByDate } from '@/utils';

const DATE_FILTERS = [
  { label: 'আজ', days: 0 },
  { label: 'গতকাল', days: 1 },
  { label: '৭ দিন', days: 7 },
  { label: '৩০ দিন', days: 30 },
];

const PM_ICONS: Record<PaymentMethod, string> = {
  cash: '💵', bkash: '📱', nagad: '🔥', card: '💳', credit: '📝',
};
const PM_LABELS: Record<PaymentMethod, string> = {
  cash: 'নগদ', bkash: 'bKash', nagad: 'Nagad', card: 'Card', credit: 'বাকি',
};

interface InvoiceGroup {
  invoice_number: string | null;
  items: Transaction[];
  total: number;
  voided: boolean;
  payment_method?: PaymentMethod;
  customer_name?: string;
  created_at: string;
}

function buildInvoiceGroups(txns: Transaction[]): InvoiceGroup[] {
  const invoiceMap = new Map<string, Transaction[]>();
  const noInvoice: Transaction[] = [];

  for (const t of txns) {
    if (t.invoice_number) {
      const arr = invoiceMap.get(t.invoice_number) ?? [];
      arr.push(t);
      invoiceMap.set(t.invoice_number, arr);
    } else {
      noInvoice.push(t);
    }
  }

  const groups: InvoiceGroup[] = [];

  invoiceMap.forEach((items, invoice_number) => {
    groups.push({
      invoice_number,
      items,
      total: items.reduce((s, t) => s + t.total_amount, 0),
      voided: items.every(t => t.voided),
      payment_method: items[0].payment_method,
      customer_name: items[0].customer_name,
      created_at: items[0].created_at,
    });
  });

  for (const t of noInvoice) {
    groups.push({
      invoice_number: null,
      items: [t],
      total: t.total_amount,
      voided: !!t.voided,
      payment_method: t.payment_method,
      customer_name: t.customer_name,
      created_at: t.created_at,
    });
  }

  return groups.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export default function HistoryScreen() {
  const { user } = useAuthStore();
  const isOwner = user?.role === 'owner';

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState(0);
  const [typeFilter, setTypeFilter] = useState<'all' | 'sale' | 'purchase'>('all');
  const [loading, setLoading] = useState(false);
  const [voidingInvoice, setVoidingInvoice] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  useEffect(() => { loadTransactions(); }, [activeFilter]);

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const days = DATE_FILTERS[activeFilter].days;
      const from = format(subDays(new Date(), days), 'yyyy-MM-dd');
      const to = format(new Date(), 'yyyy-MM-dd');
      const data = await transactionService.fetchByDateRange(from, to);
      setTransactions(data);
    } finally { setLoading(false); }
  };

  const handleVoid = useCallback((group: InvoiceGroup) => {
    if (!group.invoice_number) return;
    const invoiceNo = group.invoice_number;
    Alert.alert(
      'বিল বাতিল করুন?',
      `বিল নং ${invoiceNo} বাতিল করলে স্টক ফেরত আসবে। এটি পূর্বাবস্থায় ফেরানো যাবে না।`,
      [
        { text: 'না', style: 'cancel' },
        {
          text: 'হ্যাঁ, বাতিল করুন',
          style: 'destructive',
          onPress: async () => {
            setVoidingInvoice(invoiceNo);
            try {
              await billingApi.voidInvoice(invoiceNo);
              setTransactions(prev =>
                prev.map(t =>
                  t.invoice_number === invoiceNo ? { ...t, voided: true } : t
                )
              );
            } catch (e: any) {
              Alert.alert('ত্রুটি', e.message ?? 'বাতিল করা যায়নি');
            } finally {
              setVoidingInvoice(null);
            }
          },
        },
      ]
    );
  }, []);

  const toggleExpand = (key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const filtered = transactions.filter(t => {
    const matchSearch = !search || t.product_name.toLowerCase().includes(search.toLowerCase()) || t.user_name.includes(search);
    const matchType = typeFilter === 'all' || t.type === typeFilter;
    return matchSearch && matchType;
  });

  const activeFiltered = filtered.filter(t => !t.voided);
  const totalSales = activeFiltered.filter(t => t.type === 'sale').reduce((s, t) => s + t.total_amount, 0);
  const totalPurchases = activeFiltered.filter(t => t.type === 'purchase').reduce((s, t) => s + t.total_amount, 0);
  const voidedCount = filtered.filter(t => t.voided && t.invoice_number).length > 0
    ? [...new Set(filtered.filter(t => t.voided && t.invoice_number).map(t => t.invoice_number))].length
    : 0;

  const grouped = groupByDate(filtered);

  function formatDateLabel(dateStr: string) {
    const date = parseISO(dateStr);
    if (isToday(date)) return 'আজ';
    if (isYesterday(date)) return 'গতকাল';
    return format(date, 'dd/MM/yyyy');
  }

  const renderGroup = (group: InvoiceGroup) => {
    const key = group.invoice_number ?? group.items[0].id;
    const isExpanded = expandedKeys.has(key);
    const isSale = group.items[0].type === 'sale';
    const isVoiding = voidingInvoice === group.invoice_number;
    const pm = group.payment_method ? PM_ICONS[group.payment_method] : null;
    const pmLabel = group.payment_method ? PM_LABELS[group.payment_method] : null;

    return (
      <TouchableOpacity
        key={key}
        style={[styles.txnCard, group.voided && styles.txnCardVoided]}
        onPress={() => toggleExpand(key)}
        onLongPress={() => isOwner && !group.voided && group.invoice_number && handleVoid(group)}
        delayLongPress={500}
        activeOpacity={0.75}
      >
        <View style={[styles.typeBar, { backgroundColor: group.voided ? COLORS.textMuted : isSale ? COLORS.sale : COLORS.purchase }]} />
        <View style={{ flex: 1, padding: 12, gap: 4 }}>
          {/* Row 1: Invoice # / product name + amount */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={[styles.invoiceNum, group.voided && { color: COLORS.textMuted, textDecorationLine: 'line-through' }]}>
                  {group.invoice_number ?? group.items[0].product_name}
                </Text>
                {group.voided && (
                  <View style={styles.voidBadge}>
                    <Text style={styles.voidBadgeTxt}>বাতিল</Text>
                  </View>
                )}
                {isOwner && !group.voided && group.invoice_number && (
                  <View style={styles.longPressTip}>
                    <Text style={styles.longPressTipTxt}>꾹</Text>
                  </View>
                )}
              </View>
              {group.invoice_number && (
                <Text style={styles.itemCount}>{group.items.length} পণ্য{group.customer_name ? ` • ${group.customer_name}` : ''}</Text>
              )}
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              {isVoiding ? (
                <ActivityIndicator size="small" color={COLORS.error} />
              ) : (
                <Text style={[styles.amount, { color: group.voided ? COLORS.textMuted : isSale ? COLORS.sale : COLORS.purchase }, group.voided && { textDecorationLine: 'line-through' }]}>
                  {isSale ? '+' : '-'}৳{formatCurrency(group.total)}
                </Text>
              )}
              {pm && (
                <Text style={{ fontSize: 11, color: COLORS.textMuted }}>{pm} {pmLabel}</Text>
              )}
            </View>
          </View>

          {/* Row 2: meta */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {!group.invoice_number ? (
              <Text style={styles.meta}>{group.items[0].quantity} {group.items[0].unit} × ৳{group.items[0].unit_price}</Text>
            ) : (
              <Text style={styles.meta}>{formatTime(group.created_at)}</Text>
            )}
            <Text style={styles.meta}>{group.items[0].user_name} • {formatTime(group.created_at)}</Text>
          </View>

          {/* Expanded items */}
          {isExpanded && group.invoice_number && (
            <View style={styles.expandedItems}>
              {group.items.map((item, i) => (
                <View key={i} style={styles.expandedRow}>
                  <Text style={styles.expandedName} numberOfLines={1}>{item.product_name}</Text>
                  <Text style={styles.expandedQty}>{item.quantity}{item.unit} × ৳{item.unit_price}</Text>
                  <Text style={styles.expandedAmt}>৳{item.total_amount}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Chevron */}
          {group.invoice_number && (
            <View style={{ alignItems: 'center', marginTop: 2 }}>
              <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={12} color={COLORS.textMuted} />
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>ইতিহাস</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
          <Text style={styles.summary}>
            বিক্রয়: <Text style={{ color: '#90EE90', fontWeight: '700' }}>৳{formatCurrency(totalSales)}</Text>
            {'  '}ক্রয়: <Text style={{ color: '#ADD8E6', fontWeight: '700' }}>৳{formatCurrency(totalPurchases)}</Text>
          </Text>
          {voidedCount > 0 && (
            <View style={styles.voidCountBadge}>
              <Text style={styles.voidCountTxt}>{voidedCount} বাতিল</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.searchRow}>
        <Ionicons name="search" size={16} color={COLORS.textMuted} style={{ marginLeft: 12 }} />
        <TextInput style={styles.searchInput} placeholder="পণ্য খুঁজুন..." placeholderTextColor={COLORS.textMuted} value={search} onChangeText={setSearch} />
        {search ? <TouchableOpacity onPress={() => setSearch('')} style={{ marginRight: 12 }}><Ionicons name="close-circle" size={16} color={COLORS.textMuted} /></TouchableOpacity> : null}
      </View>

      <View style={styles.filterRow}>
        {DATE_FILTERS.map((f, i) => (
          <TouchableOpacity key={i} style={[styles.chip, activeFilter === i && styles.chipActive]} onPress={() => setActiveFilter(i)}>
            <Text style={[styles.chipText, activeFilter === i && styles.chipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
        {(['all', 'sale', 'purchase'] as const).map(t => (
          <TouchableOpacity key={t} style={[styles.chip, typeFilter === t && { backgroundColor: t === 'sale' ? COLORS.sale : t === 'purchase' ? COLORS.purchase : COLORS.primary }]} onPress={() => setTypeFilter(t)}>
            <Text style={[styles.chipText, typeFilter === t && { color: COLORS.surface }]}>{t === 'all' ? 'সব' : t === 'sale' ? 'বিক্রয়' : 'ক্রয়'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {isOwner && (
        <View style={styles.ownerHint}>
          <Ionicons name="information-circle-outline" size={13} color={COLORS.textMuted} />
          <Text style={styles.ownerHintTxt}>বিল বাতিল করতে দীর্ঘ চাপ দিন</Text>
        </View>
      )}

      {loading ? <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} /> : (
        <FlatList
          data={Object.entries(grouped)}
          keyExtractor={([date]) => date}
          contentContainerStyle={{ padding: 16, gap: 16 }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <Ionicons name="document-text-outline" size={44} color={COLORS.textMuted} />
              <Text style={{ color: COLORS.textMuted, marginTop: 8 }}>কোনো লেনদেন নেই</Text>
            </View>
          }
          renderItem={({ item: [date, txns] }) => {
            const groups = buildInvoiceGroups(txns);
            return (
              <View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.text }}>{formatDateLabel(date)}</Text>
                  <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textSecondary }}>{groups.length} টি</Text>
                </View>
                {groups.map(group => renderGroup(group))}
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { backgroundColor: COLORS.primary, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  title: { fontSize: FONT_SIZES.xl, fontWeight: '700', color: COLORS.surface },
  summary: { fontSize: FONT_SIZES.sm, color: 'rgba(255,255,255,0.8)' },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, margin: 12, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, height: 44 },
  searchInput: { flex: 1, fontSize: FONT_SIZES.sm, color: COLORS.text, paddingHorizontal: 10 },
  filterRow: { flexDirection: 'row', paddingHorizontal: 12, gap: 6, marginBottom: 4, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary },
  chipTextActive: { color: COLORS.surface, fontWeight: '700' },
  ownerHint: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingBottom: 6 },
  ownerHintTxt: { fontSize: 11, color: COLORS.textMuted },
  txnCard: { flexDirection: 'row', backgroundColor: COLORS.surface, borderRadius: 12, marginBottom: 6, overflow: 'hidden', borderWidth: 0.5, borderColor: COLORS.border },
  txnCardVoided: { opacity: 0.6, borderStyle: 'dashed' },
  typeBar: { width: 4 },
  invoiceNum: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.text },
  itemCount: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted },
  amount: { fontSize: FONT_SIZES.sm, fontWeight: '700' },
  meta: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted },
  voidBadge: { backgroundColor: '#FEE2E2', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: '#FCA5A5' },
  voidBadgeTxt: { fontSize: 10, fontWeight: '700', color: COLORS.error },
  voidCountBadge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  voidCountTxt: { fontSize: 11, color: '#fff', fontWeight: '600' },
  longPressTip: { backgroundColor: COLORS.surfaceSecondary, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  longPressTipTxt: { fontSize: 10, color: COLORS.textMuted },
  expandedItems: { marginTop: 8, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: COLORS.border, gap: 4 },
  expandedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  expandedName: { flex: 1, fontSize: FONT_SIZES.xs, color: COLORS.text },
  expandedQty: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, textAlign: 'right' },
  expandedAmt: { fontSize: FONT_SIZES.xs, fontWeight: '700', color: COLORS.text, minWidth: 52, textAlign: 'right' },
});
