import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { reportsApi, ReportSummary, TopProduct, StockValuation, ReportPeriod } from '@/services/api/reportsApi';
import { useAuthStore } from '@/store';
import { COLORS, FONT_SIZES } from '@/constants';
import { formatCurrency } from '@/utils';

const PERIODS: { label: string; labelEn: string; key: ReportPeriod }[] = [
  { label: 'আজ',        labelEn: 'Today',      key: 'today' },
  { label: 'এই সপ্তাহ', labelEn: 'This Week',  key: 'week' },
  { label: 'এই মাস',    labelEn: 'This Month', key: 'month' },
];

const PAYMENT_COLORS: Record<string, string> = {
  cash:   '#16A34A',
  bkash:  '#E11D48',
  nagad:  '#F97316',
  card:   '#2563EB',
  credit: '#7C3AED',
};
const PAYMENT_LABELS: Record<string, string> = {
  cash: 'নগদ', bkash: 'bKash', nagad: 'Nagad', card: 'Card', credit: 'বাকি',
};

export default function ReportsScreen() {
  const { shop } = useAuthStore();
  const isCosmetics = shop?.shop_type === 'cosmetics' || shop?.shop_type === 'imported';

  const [period, setPeriod] = useState<ReportPeriod>('today');
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [valuation, setValuation] = useState<StockValuation | null>(null);
  const [loading, setLoading] = useState(false);
  const [valuationLoading, setValuationLoading] = useState(false);

  const load = useCallback(async (p: ReportPeriod) => {
    setLoading(true);
    try {
      const [s, tp] = await Promise.all([
        reportsApi.summary(p),
        reportsApi.topProducts(),
      ]);
      setSummary(s);
      setTopProducts(tp);
    } catch (e: any) {
      console.warn('Reports fetch error:', e.message);
    } finally { setLoading(false); }
  }, []);

  const loadValuation = useCallback(async () => {
    setValuationLoading(true);
    try {
      const v = await reportsApi.stockValuation();
      setValuation(v);
    } catch (e: any) {
      console.warn('Valuation fetch error:', e.message);
    } finally { setValuationLoading(false); }
  }, []);

  useEffect(() => { load(period); }, [period]);
  useEffect(() => { loadValuation(); }, []);

  const maxRevenue = Math.max(...topProducts.map(p => p.total_revenue), 1);
  const maxDailySale = Math.max(...(summary?.daily_breakdown ?? []).map(d => d.sales), 1);

  const paymentTotal = summary
    ? Object.values(summary.payment_breakdown).reduce((s, v) => s + v, 0)
    : 0;

  const T = (bn: string, en: string) => isCosmetics ? en : bn;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={styles.title}>{T('রিপোর্ট', 'Reports')}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            {PERIODS.map(p => (
              <TouchableOpacity
                key={p.key}
                style={[styles.periodChip, period === p.key && styles.periodChipActive]}
                onPress={() => setPeriod(p.key)}
              >
                <Text style={[styles.periodText, period === p.key && styles.periodTextActive]}>
                  {T(p.label, p.labelEn)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginTop: 48 }} />
        ) : summary ? (
          <>
            {/* ── KPI Row 1: Sales / Purchases / Profit ── */}
            <View style={{ flexDirection: 'row', padding: 12, gap: 8 }}>
              {[
                { label: T('মোট বিক্রয়', 'Total Sales'),   value: summary.total_sales,     color: COLORS.sale },
                { label: T('মোট ক্রয়', 'Purchases'),       value: summary.total_purchases,  color: COLORS.purchase },
                { label: T('মোট লাভ', 'Gross Profit'),     value: summary.gross_profit,     color: summary.gross_profit >= 0 ? COLORS.sale : COLORS.error },
              ].map((k, i) => (
                <View key={i} style={styles.kpiCard}>
                  <Text style={[styles.kpiAmount, { color: k.color }]}>৳{formatCurrency(k.value)}</Text>
                  <Text style={styles.kpiLabel}>{k.label}</Text>
                </View>
              ))}
            </View>

            {/* ── KPI Row 2: Avg Bill / Discount / Voided ── */}
            <View style={{ flexDirection: 'row', paddingHorizontal: 12, gap: 8, marginBottom: 4 }}>
              {[
                {
                  icon: 'receipt-outline' as const,
                  label: T('গড় বিল', 'Avg Bill'),
                  value: `৳${formatCurrency(summary.average_bill_value)}`,
                  color: COLORS.primary,
                },
                {
                  icon: 'pricetag-outline' as const,
                  label: T('মোট ছাড়', 'Discount'),
                  value: `৳${formatCurrency(summary.total_discount)}`,
                  color: '#F59E0B',
                },
                {
                  icon: 'close-circle-outline' as const,
                  label: T('বাতিল বিল', 'Voided'),
                  value: `${summary.voided_count} (৳${formatCurrency(summary.voided_amount)})`,
                  color: COLORS.error,
                },
              ].map((k, i) => (
                <View key={i} style={[styles.kpiCard, { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 }]}>
                  <Ionicons name={k.icon} size={18} color={k.color} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.kpiAmount, { fontSize: FONT_SIZES.sm, color: k.color }]} numberOfLines={1}>
                      {k.value}
                    </Text>
                    <Text style={[styles.kpiLabel, { textAlign: 'left' }]}>{k.label}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* ── Payment Breakdown ── */}
            {paymentTotal > 0 && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>
                  {T('পেমেন্ট বিভাজন', 'Payment Breakdown')}
                </Text>
                {/* Stacked bar */}
                <View style={{ flexDirection: 'row', height: 20, borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
                  {Object.entries(summary.payment_breakdown)
                    .filter(([, v]) => v > 0)
                    .map(([method, value]) => (
                      <View
                        key={method}
                        style={{ flex: value / paymentTotal, backgroundColor: PAYMENT_COLORS[method] ?? COLORS.primary }}
                      />
                    ))}
                </View>
                {/* Legend rows */}
                {Object.entries(summary.payment_breakdown)
                  .filter(([, v]) => v > 0)
                  .sort(([, a], [, b]) => b - a)
                  .map(([method, value]) => (
                    <View key={method} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 5 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: PAYMENT_COLORS[method] ?? COLORS.primary }} />
                        <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.text, fontWeight: '600' }}>
                          {PAYMENT_LABELS[method] ?? method}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.text }}>
                          ৳{formatCurrency(value)}
                        </Text>
                        <Text style={{ fontSize: 10, color: COLORS.textMuted }}>
                          {paymentTotal > 0 ? Math.round((value / paymentTotal) * 100) : 0}%
                        </Text>
                      </View>
                    </View>
                  ))}
              </View>
            )}

            {/* ── Daily Breakdown Chart ── */}
            {summary.daily_breakdown.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>{T('দৈনিক বিক্রয়', 'Daily Sales')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingBottom: 4, minHeight: 120 }}>
                    {[...summary.daily_breakdown].reverse().map((d, i) => (
                      <View key={i} style={{ alignItems: 'center', gap: 4, width: 36 }}>
                        <Text style={{ fontSize: 9, color: COLORS.textMuted }}>
                          {d.sales >= 1000 ? `৳${Math.round(d.sales / 1000)}k` : `৳${Math.round(d.sales)}`}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
                          <View style={{ width: 14, borderRadius: 4, backgroundColor: COLORS.sale, height: Math.max(4, (d.sales / maxDailySale) * 90) }} />
                          <View style={{ width: 14, borderRadius: 4, backgroundColor: COLORS.purchase, opacity: 0.6, height: Math.max(4, (d.purchases / maxDailySale) * 90) }} />
                        </View>
                        <Text style={{ fontSize: 9, color: COLORS.textMuted }}>
                          {format(parseISO(d.date), 'dd/MM')}
                        </Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>
                <View style={{ flexDirection: 'row', gap: 16, justifyContent: 'center', marginTop: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: COLORS.sale }} />
                    <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textSecondary }}>{T('বিক্রয়', 'Sales')}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: COLORS.purchase, opacity: 0.6 }} />
                    <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textSecondary }}>{T('ক্রয়', 'Purchases')}</Text>
                  </View>
                </View>
              </View>
            )}

            {/* ── Transaction count ── */}
            <View style={{ marginHorizontal: 12, marginBottom: 4 }}>
              <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, textAlign: 'center' }}>
                {T(`মোট ${summary.transaction_count} টি লেনদেন`, `${summary.transaction_count} transactions`)}
              </Text>
            </View>
          </>
        ) : (
          <View style={{ alignItems: 'center', paddingTop: 60, gap: 8 }}>
            <Ionicons name="stats-chart-outline" size={48} color={COLORS.textMuted} />
            <Text style={{ color: COLORS.textMuted }}>{T('কোনো তথ্য নেই', 'No data available')}</Text>
          </View>
        )}

        {/* ── Top Products ── */}
        {topProducts.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{T('সেরা পণ্য', 'Top Products')}</Text>
            {topProducts.slice(0, 8).map((p, i) => (
              <View key={p.product_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
                <View style={[styles.rankBadge, i < 3 && { backgroundColor: COLORS.primary }]}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: i < 3 ? '#fff' : COLORS.textSecondary }}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.text }} numberOfLines={1}>
                    {p.product_name}
                  </Text>
                  <View style={{ height: 6, backgroundColor: COLORS.border, borderRadius: 3, overflow: 'hidden' }}>
                    <View style={{ height: 6, backgroundColor: COLORS.primary, borderRadius: 3, width: `${(p.total_revenue / maxRevenue) * 100}%` }} />
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.sale }}>
                    ৳{formatCurrency(p.total_revenue)}
                  </Text>
                  <Text style={{ fontSize: 10, color: COLORS.textMuted }}>
                    {p.total_quantity} {T('টি', 'pcs')}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── Stock Valuation ── */}
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={styles.sectionTitle}>{T('স্টক মূল্যায়ন', 'Stock Valuation')}</Text>
            <TouchableOpacity onPress={loadValuation}>
              <Ionicons name="refresh" size={16} color={COLORS.primary} />
            </TouchableOpacity>
          </View>

          {valuationLoading ? (
            <ActivityIndicator color={COLORS.primary} />
          ) : valuation ? (
            <>
              {/* Total value */}
              <View style={{ backgroundColor: COLORS.primary + '12', borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ fontSize: 11, color: COLORS.primary, fontWeight: '600' }}>
                  {T('মোট ইনভেন্টরি মূল্য', 'Total Inventory Value')}
                </Text>
                <Text style={{ fontSize: FONT_SIZES.xxl, fontWeight: '700', color: COLORS.primary, marginTop: 4 }}>
                  ৳{formatCurrency(valuation.total_value)}
                </Text>
              </View>

              {/* Product counts */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                {[
                  { label: T('মোট', 'Total'),       value: valuation.product_count,    color: COLORS.text },
                  { label: T('স্টকে', 'In Stock'),   value: valuation.in_stock_count,   color: COLORS.sale },
                  { label: T('কম স্টক', 'Low'),      value: valuation.low_stock_count,  color: '#F59E0B' },
                  { label: T('শেষ', 'Out'),          value: valuation.out_of_stock_count, color: COLORS.error },
                ].map((s, i) => (
                  <View key={i} style={[styles.kpiCard, { flex: 1, paddingVertical: 10, gap: 2 }]}>
                    <Text style={{ fontSize: FONT_SIZES.lg, fontWeight: '700', color: s.color }}>{s.value}</Text>
                    <Text style={{ fontSize: 10, color: COLORS.textMuted, textAlign: 'center' }}>{s.label}</Text>
                  </View>
                ))}
              </View>

              {/* Top value products */}
              {valuation.top_value_products.length > 0 && (
                <>
                  <Text style={{ fontSize: FONT_SIZES.xs, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 8 }}>
                    {T('সর্বোচ্চ মূল্যের পণ্য', 'Highest Value Products')}
                  </Text>
                  {valuation.top_value_products.slice(0, 5).map((p, i) => (
                    <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: i < 4 ? 0.5 : 0, borderBottomColor: COLORS.border }}>
                      <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.text, flex: 1 }} numberOfLines={1}>{p.name}</Text>
                      <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.primary }}>৳{formatCurrency(p.value)}</Text>
                    </View>
                  ))}
                </>
              )}
            </>
          ) : (
            <View style={{ alignItems: 'center', padding: 24 }}>
              <Text style={{ color: COLORS.textMuted, fontSize: FONT_SIZES.sm }}>
                {T('তথ্য লোড করতে পারেনি', 'Could not load valuation')}
              </Text>
            </View>
          )}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { backgroundColor: COLORS.primary, padding: 20, paddingBottom: 24 },
  title: { fontSize: FONT_SIZES.xl, fontWeight: '700', color: COLORS.surface },
  periodChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)' },
  periodChipActive: { backgroundColor: COLORS.surface },
  periodText: { fontSize: FONT_SIZES.sm, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  periodTextActive: { color: COLORS.primary, fontWeight: '700' },
  card: { margin: 12, backgroundColor: COLORS.surface, borderRadius: 14, padding: 16, borderWidth: 0.5, borderColor: COLORS.border, marginBottom: 4 },
  sectionTitle: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.text, marginBottom: 14 },
  kpiCard: { flex: 1, backgroundColor: COLORS.surface, borderRadius: 12, padding: 12, alignItems: 'center', gap: 4, borderWidth: 0.5, borderColor: COLORS.border },
  kpiAmount: { fontSize: FONT_SIZES.lg, fontWeight: '700' },
  kpiLabel: { fontSize: 10, color: COLORS.textSecondary, textAlign: 'center' },
  rankBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.surfaceSecondary, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
});
