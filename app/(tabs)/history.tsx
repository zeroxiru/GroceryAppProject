
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format, subDays, isToday, isYesterday, parseISO } from 'date-fns';
import { transactionService } from '@/services/supabase/transactionService';
import { Transaction } from '@/types';
import { COLORS, FONT_SIZES } from '@/constants';
import { formatCurrency, formatTime, groupByDate } from '@/utils';

const DATE_FILTERS = [
  { label: 'আজ', days: 0 },
  { label: 'গতকাল', days: 1 },
  { label: '৭ দিন', days: 7 },
  { label: '৩০ দিন', days: 30 },
];

export default function HistoryScreen() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState(0);
  const [typeFilter, setTypeFilter] = useState<'all' | 'sale' | 'purchase'>('all');
  const [loading, setLoading] = useState(false);

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

  const filtered = transactions.filter(t => {
    const matchSearch = !search || t.product_name.includes(search) || t.user_name.includes(search);
    const matchType = typeFilter === 'all' || t.type === typeFilter;
    return matchSearch && matchType;
  });

  const totalSales = filtered.filter(t => t.type === 'sale').reduce((s, t) => s + t.total_amount, 0);
  const totalPurchases = filtered.filter(t => t.type === 'purchase').reduce((s, t) => s + t.total_amount, 0);
  const grouped = groupByDate(filtered);

  function formatDateLabel(dateStr: string) {
    const date = parseISO(dateStr);
    if (isToday(date)) return 'আজ';
    if (isYesterday(date)) return 'গতকাল';
    return format(date, 'dd/MM/yyyy');
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>ইতিহাস</Text>
        <Text style={styles.summary}>
          বিক্রয়: <Text style={{ color: '#90EE90', fontWeight: '700' }}>৳{formatCurrency(totalSales)}</Text>
          {'  '}ক্রয়: <Text style={{ color: '#ADD8E6', fontWeight: '700' }}>৳{formatCurrency(totalPurchases)}</Text>
        </Text>
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

      {loading ? <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} /> : (
        <FlatList
          data={Object.entries(grouped)}
          keyExtractor={([date]) => date}
          contentContainerStyle={{ padding: 16, gap: 16 }}
          ListEmptyComponent={<View style={{ alignItems: 'center', paddingTop: 60 }}><Ionicons name="document-text-outline" size={44} color={COLORS.textMuted} /><Text style={{ color: COLORS.textMuted, marginTop: 8 }}>কোনো লেনদেন নেই</Text></View>}
          renderItem={({ item: [date, txns] }) => (
            <View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.text }}>{formatDateLabel(date)}</Text>
                <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textSecondary }}>{txns.length} টি</Text>
              </View>
              {txns.map(txn => {
                const isSale = txn.type === 'sale';
                return (
                  <View key={txn.id} style={styles.txnCard}>
                    <View style={[styles.typeBar, { backgroundColor: isSale ? COLORS.sale : COLORS.purchase }]} />
                    <View style={{ flex: 1, padding: 12, gap: 4 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.text }}>{txn.product_name}</Text>
                        <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: '700', color: isSale ? COLORS.sale : COLORS.purchase }}>{isSale ? '+' : '-'}৳{formatCurrency(txn.total_amount)}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textMuted }}>{txn.quantity} {txn.unit} × ৳{txn.unit_price}</Text>
                        <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textMuted }}>{txn.user_name} • {formatTime(txn.created_at)}</Text>
                      </View>
                      {txn.voice_raw_text ? <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontStyle: 'italic' }}>🎙 "{txn.voice_raw_text}"</Text> : null}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { backgroundColor: COLORS.primary, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  title: { fontSize: FONT_SIZES.xl, fontWeight: '700', color: COLORS.surface },
  summary: { fontSize: FONT_SIZES.sm, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, margin: 12, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, height: 44 },
  searchInput: { flex: 1, fontSize: FONT_SIZES.sm, color: COLORS.text, paddingHorizontal: 10 },
  filterRow: { flexDirection: 'row', paddingHorizontal: 12, gap: 6, marginBottom: 8, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary },
  chipTextActive: { color: COLORS.surface, fontWeight: '700' },
  txnCard: { flexDirection: 'row', backgroundColor: COLORS.surface, borderRadius: 12, marginBottom: 6, overflow: 'hidden', borderWidth: 0.5, borderColor: COLORS.border },
  typeBar: { width: 4 },
});