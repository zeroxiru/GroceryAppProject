import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format, subDays, parseISO } from 'date-fns';
import { db } from '@/services/supabase/client';
import { useAuthStore } from '@/store';
import { DailySummary } from '@/types';
import { COLORS, FONT_SIZES } from '@/constants';
import { formatCurrency } from '@/utils';

const PERIODS = [{ label: '৭ দিন', days: 7 }, { label: '১৫ দিন', days: 15 }, { label: '৩০ দিন', days: 30 }];

export default function ReportsScreen() {
  const { shop } = useAuthStore();
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [period, setPeriod] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetchSummaries(); }, [period]);

  const fetchSummaries = async () => {
    if (!shop) return;
    setLoading(true);
    try {
      const from = format(subDays(new Date(), PERIODS[period].days), 'yyyy-MM-dd');
      const { data } = await db.daily_summaries().select('*').eq('shop_id', shop.id).gte('date', from).order('date', { ascending: false });
      setSummaries((data as DailySummary[]) ?? []);
    } finally { setLoading(false); }
  };

  const totalSales = summaries.reduce((s, d) => s + d.total_sales, 0);
  const totalPurchases = summaries.reduce((s, d) => s + d.total_purchases, 0);
  const totalProfit = summaries.reduce((s, d) => s + d.gross_profit, 0);
  const maxSale = Math.max(...summaries.map(s => s.total_sales), 1);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        <View style={styles.header}>
          <Text style={styles.title}>রিপোর্ট</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            {PERIODS.map((p, i) => (
              <TouchableOpacity key={i} style={[styles.periodChip, period === i && styles.periodChipActive]} onPress={() => setPeriod(i)}>
                <Text style={[styles.periodText, period === i && styles.periodTextActive]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {loading ? <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} /> : (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 10 }}>
              {[
                { label: 'মোট বিক্রয়', amount: totalSales, color: COLORS.sale },
                { label: 'মোট ক্রয়', amount: totalPurchases, color: COLORS.purchase },
                { label: 'মোট লাভ', amount: totalProfit, color: totalProfit >= 0 ? COLORS.sale : COLORS.error },
              ].map((item, i) => (
                <View key={i} style={styles.summaryCard}>
                  <Text style={[styles.summaryAmount, { color: item.color }]}>৳{formatCurrency(item.amount)}</Text>
                  <Text style={styles.summaryLabel}>{item.label}</Text>
                </View>
              ))}
            </View>

            <View style={styles.chartSection}>
              <Text style={styles.sectionTitle}>দৈনিক বিক্রয়</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingBottom: 4, minHeight: 140 }}>
                  {summaries.slice().reverse().map((s, i) => (
                    <View key={i} style={{ alignItems: 'center', gap: 4, width: 36 }}>
                      <Text style={{ fontSize: 9, color: COLORS.textMuted }}>৳{Math.round(s.total_sales / 1000)}k</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
                        <View style={{ width: 14, borderRadius: 4, backgroundColor: COLORS.sale, height: Math.max(4, (s.total_sales / maxSale) * 100) }} />
                        <View style={{ width: 14, borderRadius: 4, backgroundColor: COLORS.purchase, opacity: 0.6, height: Math.max(4, (s.total_purchases / maxSale) * 100) }} />
                      </View>
                      <Text style={{ fontSize: 9, color: COLORS.textMuted }}>{format(parseISO(s.date), 'dd/MM')}</Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
              <View style={{ flexDirection: 'row', gap: 16, justifyContent: 'center', marginTop: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: COLORS.sale }} /><Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textSecondary }}>বিক্রয়</Text></View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: COLORS.purchase, opacity: 0.6 }} /><Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textSecondary }}>ক্রয়</Text></View>
              </View>
            </View>

            <View style={styles.tableSection}>
              <Text style={styles.sectionTitle}>দৈনিক বিবরণ</Text>
              <View style={[styles.tableRow, { backgroundColor: COLORS.surfaceSecondary }]}>
                <Text style={[styles.th, { flex: 1.2 }]}>তারিখ</Text>
                <Text style={[styles.th, { flex: 1, textAlign: 'right', color: COLORS.sale }]}>বিক্রয়</Text>
                <Text style={[styles.th, { flex: 1, textAlign: 'right', color: COLORS.purchase }]}>ক্রয়</Text>
                <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>লাভ</Text>
              </View>
              {summaries.length === 0 && <View style={{ alignItems: 'center', padding: 32 }}><Text style={{ color: COLORS.textMuted }}>কোনো তথ্য নেই</Text></View>}
              {summaries.map((s, i) => (
                <View key={i} style={[styles.tableRow, i % 2 === 0 && { backgroundColor: COLORS.surfaceSecondary }]}>
                  <Text style={[styles.td, { flex: 1.2 }]}>{format(parseISO(s.date), 'dd/MM/yy')}</Text>
                  <Text style={[styles.td, { flex: 1, textAlign: 'right', color: COLORS.sale }]}>৳{formatCurrency(s.total_sales)}</Text>
                  <Text style={[styles.td, { flex: 1, textAlign: 'right', color: COLORS.purchase }]}>৳{formatCurrency(s.total_purchases)}</Text>
                  <Text style={[styles.td, { flex: 1, textAlign: 'right', color: s.gross_profit >= 0 ? COLORS.sale : COLORS.error, fontWeight: '700' }]}>৳{formatCurrency(s.gross_profit)}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { backgroundColor: COLORS.primary, padding: 20 },
  title: { fontSize: FONT_SIZES.xl, fontWeight: '700', color: COLORS.surface },
  periodChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)' },
  periodChipActive: { backgroundColor: COLORS.surface },
  periodText: { fontSize: FONT_SIZES.sm, color: 'rgba(255,255,255,0.8)' },
  periodTextActive: { color: COLORS.primary, fontWeight: '700' },
  summaryCard: { flex: 1, minWidth: 130, backgroundColor: COLORS.surface, borderRadius: 14, padding: 14, alignItems: 'center', gap: 6, borderWidth: 0.5, borderColor: COLORS.border },
  summaryAmount: { fontSize: FONT_SIZES.xxl, fontWeight: '700' },
  summaryLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, textAlign: 'center' },
  chartSection: { margin: 12, backgroundColor: COLORS.surface, borderRadius: 14, padding: 16, borderWidth: 0.5, borderColor: COLORS.border },
  sectionTitle: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.text, marginBottom: 16 },
  tableSection: { margin: 12, backgroundColor: COLORS.surface, borderRadius: 14, overflow: 'hidden', borderWidth: 0.5, borderColor: COLORS.border, marginBottom: 32 },
  tableRow: { flexDirection: 'row', padding: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.border },
  th: { fontSize: FONT_SIZES.xs, fontWeight: '700', color: COLORS.text },
  td: { fontSize: FONT_SIZES.xs, color: COLORS.text },
});