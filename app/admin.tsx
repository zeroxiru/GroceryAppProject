import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, FlatList, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { adminApi, AdminShop, AdminStats } from '@/services/api/adminApi';
import { COLORS, FONT_SIZES } from '@/constants';
import { formatCurrency } from '@/utils';

type AdminTab = 'stats' | 'shops' | 'users';

export default function AdminScreen() {
  const [activeTab, setActiveTab] = useState<AdminTab>('stats');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [shops, setShops] = useState<AdminShop[]>([]);
  const [shopSearch, setShopSearch] = useState('');
  const [shopsTotal, setShopsTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [shopPage, setShopPage] = useState(1);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const s = await adminApi.stats();
      setStats(s);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setLoading(false); }
  }, []);

  const loadShops = useCallback(async (page = 1, search = '', append = false) => {
    setLoading(true);
    try {
      const res = await adminApi.listShops(page, search || undefined);
      setShops(prev => append ? [...prev, ...res.shops] : res.shops);
      setShopsTotal(res.total);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadStats(); }, []);
  useEffect(() => {
    if (activeTab === 'shops') { setShopPage(1); loadShops(1, shopSearch); }
  }, [activeTab]);

  const handleShopSearch = (text: string) => {
    setShopSearch(text);
    setShopPage(1);
    loadShops(1, text);
  };

  const handleToggleShop = (shop: AdminShop) => {
    const isSuspended = shop.is_suspended;
    Alert.alert(
      isSuspended ? 'Reactivate Shop' : 'Suspend Shop',
      `${isSuspended ? 'Reactivate' : 'Suspend'} "${shop.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isSuspended ? 'Reactivate' : 'Suspend',
          style: isSuspended ? 'default' : 'destructive',
          onPress: async () => {
            try {
              if (isSuspended) {
                await adminApi.reactivateShop(shop.id);
              } else {
                await adminApi.suspendShop(shop.id);
              }
              setShops(prev => prev.map(s =>
                s.id === shop.id ? { ...s, is_suspended: !isSuspended } : s
              ));
            } catch (e: any) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={22} color={COLORS.surface} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Platform Admin</Text>
        <TouchableOpacity onPress={loadStats} style={{ padding: 4 }}>
          <Ionicons name="refresh" size={20} color={COLORS.surface} />
        </TouchableOpacity>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {([
          { key: 'stats', label: 'Stats', icon: 'stats-chart-outline' },
          { key: 'shops', label: 'Shops', icon: 'storefront-outline' },
          { key: 'users', label: 'Users', icon: 'people-outline' },
        ] as { key: AdminTab; label: string; icon: any }[]).map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tabBtn, activeTab === tab.key && styles.tabBtnActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Ionicons name={tab.icon} size={14} color={activeTab === tab.key ? COLORS.primary : COLORS.textMuted} />
            <Text style={[styles.tabTxt, activeTab === tab.key && { color: COLORS.primary, fontWeight: '700' }]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── STATS TAB ── */}
      {activeTab === 'stats' && (
        <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
          {loading ? (
            <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
          ) : stats ? (
            <>
              {/* KPI grid */}
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {[
                  { label: 'Total Shops',    value: stats.total_shops,       color: COLORS.primary },
                  { label: 'Active Shops',   value: stats.active_shops,      color: COLORS.sale },
                  { label: 'Suspended',      value: stats.suspended_shops,   color: COLORS.error },
                  { label: 'Total Users',    value: stats.total_users,       color: COLORS.purchase },
                  { label: 'Products',       value: stats.total_products,    color: '#7C3AED' },
                  { label: 'Transactions',   value: stats.total_transactions, color: '#F59E0B' },
                ].map((kpi, i) => (
                  <View key={i} style={[styles.kpiCard, { width: '30.5%' }]}>
                    <Text style={{ fontSize: FONT_SIZES.xl, fontWeight: '700', color: kpi.color }}>
                      {kpi.value >= 1000 ? `${(kpi.value / 1000).toFixed(1)}k` : kpi.value}
                    </Text>
                    <Text style={{ fontSize: 10, color: COLORS.textMuted, textAlign: 'center' }}>{kpi.label}</Text>
                  </View>
                ))}
              </View>

              {/* Revenue & growth */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Today's Revenue</Text>
                <Text style={{ fontSize: FONT_SIZES.xxl, fontWeight: '700', color: COLORS.sale }}>
                  ৳{formatCurrency(stats.revenue_today)}
                </Text>
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>New Shops This Month</Text>
                <Text style={{ fontSize: FONT_SIZES.xxl, fontWeight: '700', color: COLORS.primary }}>
                  {stats.new_shops_this_month}
                </Text>
              </View>
            </>
          ) : (
            <View style={{ alignItems: 'center', paddingTop: 60, gap: 8 }}>
              <Ionicons name="stats-chart-outline" size={48} color={COLORS.textMuted} />
              <Text style={{ color: COLORS.textMuted }}>No data</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* ── SHOPS TAB ── */}
      {activeTab === 'shops' && (
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', margin: 12, gap: 8 }}>
            <View style={[styles.searchBox, { flex: 1 }]}>
              <Ionicons name="search" size={16} color={COLORS.textMuted} />
              <TextInput
                style={{ flex: 1, fontSize: FONT_SIZES.sm, color: COLORS.text }}
                placeholder="Search shops..."
                placeholderTextColor={COLORS.textMuted}
                value={shopSearch}
                onChangeText={handleShopSearch}
              />
            </View>
            <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textMuted }}>{shopsTotal} total</Text>
          </View>

          {loading && shops.length === 0 ? (
            <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={shops}
              keyExtractor={s => s.id}
              contentContainerStyle={{ paddingHorizontal: 12, gap: 8, paddingBottom: 40 }}
              onEndReached={() => {
                if (shops.length < shopsTotal && !loading) {
                  const next = shopPage + 1;
                  setShopPage(next);
                  loadShops(next, shopSearch, true);
                }
              }}
              onEndReachedThreshold={0.3}
              renderItem={({ item }) => (
                <View style={[styles.shopCard, item.is_suspended && { opacity: 0.6, borderColor: COLORS.error }]}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.text }}>
                        {item.name}
                      </Text>
                      {item.is_suspended && (
                        <View style={{ backgroundColor: '#FEE2E2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                          <Text style={{ fontSize: 9, color: COLORS.error, fontWeight: '700' }}>SUSPENDED</Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 2 }}>
                      {item.phone} • {item.shop_type}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
                      {[
                        { label: 'Users',    value: item.user_count },
                        { label: 'Products', value: item.product_count },
                        { label: 'Txns',     value: item.transaction_count },
                      ].map((s, i) => (
                        <View key={i}>
                          <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.primary }}>{s.value}</Text>
                          <Text style={{ fontSize: 9, color: COLORS.textMuted }}>{s.label}</Text>
                        </View>
                      ))}
                    </View>
                    {item.last_activity && (
                      <Text style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 4 }}>
                        Last active: {format(parseISO(item.last_activity), 'dd/MM/yyyy HH:mm')}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.actionBadge,
                      { backgroundColor: item.is_suspended ? '#F0FFF4' : '#FEF2F2' },
                    ]}
                    onPress={() => handleToggleShop(item)}
                  >
                    <Ionicons
                      name={item.is_suspended ? 'play-circle-outline' : 'pause-circle-outline'}
                      size={18}
                      color={item.is_suspended ? COLORS.sale : COLORS.error}
                    />
                  </TouchableOpacity>
                </View>
              )}
            />
          )}
        </View>
      )}

      {/* ── USERS TAB ── */}
      {activeTab === 'users' && (
        <UsersTab />
      )}
    </SafeAreaView>
  );
}

function UsersTab() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => { load(1); }, []);

  const load = async (p: number, append = false) => {
    setLoading(true);
    try {
      const res = await adminApi.listUsers(p);
      setUsers(prev => append ? [...prev, ...res.users] : res.users);
      setTotal(res.total);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setLoading(false); }
  };

  if (loading && users.length === 0) {
    return <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />;
  }

  return (
    <FlatList
      data={users}
      keyExtractor={u => u.id}
      contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40 }}
      ListHeaderComponent={
        <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginBottom: 4 }}>
          {total} users total
        </Text>
      }
      onEndReached={() => {
        if (users.length < total && !loading) {
          const next = page + 1;
          setPage(next);
          load(next, true);
        }
      }}
      onEndReachedThreshold={0.3}
      renderItem={({ item }) => (
        <View style={styles.shopCard}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: item.role === 'owner' ? COLORS.primary : COLORS.primaryLight ?? '#2D6A4F', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: FONT_SIZES.md }}>{item.name[0].toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.text }}>{item.name}</Text>
            <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textMuted }}>{item.phone} • {item.role}</Text>
            {item.shop_name && (
              <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.primary, marginTop: 2 }}>{item.shop_name}</Text>
            )}
          </View>
          <View style={[
            { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
            item.is_active ? { backgroundColor: '#DCFCE7' } : { backgroundColor: '#FEF2F2' },
          ]}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: item.is_active ? COLORS.sale : COLORS.error }}>
              {item.is_active ? 'Active' : 'Inactive'}
            </Text>
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  headerTitle: { fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.surface },
  tabBar: { flexDirection: 'row', backgroundColor: COLORS.surface, borderBottomWidth: 0.5, borderBottomColor: COLORS.border },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 12 },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: COLORS.primary },
  tabTxt: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted },
  kpiCard: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 12, alignItems: 'center', gap: 4, borderWidth: 0.5, borderColor: COLORS.border },
  card: { backgroundColor: COLORS.surface, borderRadius: 14, padding: 16, borderWidth: 0.5, borderColor: COLORS.border },
  cardTitle: { fontSize: FONT_SIZES.xs, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 6 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.surface, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 10, height: 40 },
  shopCard: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 0.5, borderColor: COLORS.border },
  actionBadge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
