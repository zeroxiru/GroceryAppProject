import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator, FlatList } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { authService } from '@/services/supabase/authService';
import { authApi } from '@/services/api/authApi';
import { useAuthStore } from '@/store';
import { User } from '@/types';
import { COLORS, FONT_SIZES } from '@/constants';

export default function PinLoginScreen() {
  const { shop, logout } = useAuthStore();
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);

  useEffect(() => { if (shop) loadUsers(shop.id); }, [shop]);

  const loadUsers = async (shopId: string) => {
    try { const u = await authService.getShopUsers(shopId); setUsers(u); } catch {}
  };

  const handleShopLookup = async () => {
    setLookupLoading(true);
    try {
      // Try to validate phone against backend via login pre-check
      // Just set the phone as shop identifier so PIN screen loads
      if (phoneInput.length < 11) {
        Alert.alert('সতর্কতা', 'সঠিক মোবাইল নম্বর দিন');
        return;
      }
      // Store a minimal shop stub so the PIN screen renders
      useAuthStore.getState().setShop({ id: '', name: '', phone: phoneInput } as any);
      setUsers([{ id: 'owner', name: 'মালিক', role: 'owner', phone: phoneInput, pin: '', shop_id: '', is_active: true, created_at: '' }]);
    } catch (e: any) { Alert.alert('ত্রুটি', e.message); }
    finally { setLookupLoading(false); }
  };

  const handlePinKey = async (key: string) => {
    if (key === '⌫') { setPin(p => p.slice(0, -1)); return; }
    const newPin = pin + key;
    setPin(newPin);
    if (newPin.length === 4 && selectedUser) {
      setLoading(true);
      try {
        const phone = selectedUser.phone ?? shop?.phone ?? '';
        const res = selectedUser.role === 'owner'
          ? await authApi.ownerLogin(phone, newPin)
          : await authApi.staffLogin(phone, newPin, shop?.id ?? '');
        await authApi.saveTokens(res);
        useAuthStore.getState().setShop(res.shop);
        useAuthStore.getState().setUser(res.user);
        useAuthStore.getState().setTokens(res.accessToken, res.refreshToken);
        router.replace('/(tabs)/home');
      } catch (e: any) {
        Alert.alert('ভুল PIN', e.message ?? 'আবার চেষ্টা করুন');
        setPin('');
      } finally { setLoading(false); }
    }
  };

  if (!shop) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.card}>
          <Ionicons name="storefront" size={40} color={COLORS.primary} />
          <Text style={styles.title}>দোকান খুঁজুন</Text>
          <View style={styles.phoneRow}>
            <TextInput style={styles.phoneInput} placeholder="01XXXXXXXXX" placeholderTextColor={COLORS.textMuted} keyboardType="phone-pad" maxLength={11} value={phoneInput} onChangeText={setPhoneInput} />
            <TouchableOpacity style={styles.lookupBtn} onPress={handleShopLookup} disabled={lookupLoading}>
              {lookupLoading ? <ActivityIndicator color={COLORS.surface} size="small" /> : <Ionicons name="search" size={20} color={COLORS.surface} />}
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={() => router.push('/shop-setup')}>
            <Text style={styles.linkText}>নতুন দোকান তৈরি করুন →</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.shopHeader}>
        <View style={styles.shopIcon}><Ionicons name="storefront" size={28} color={COLORS.surface} /></View>
        <Text style={styles.shopName}>{shop.name}</Text>
        <TouchableOpacity style={styles.changeShopBtn} onPress={() => { logout(); }}>
          <Ionicons name="swap-horizontal" size={14} color="rgba(255,255,255,0.8)" />
          <Text style={styles.changeShopText}>দোকান পরিবর্তন</Text>
        </TouchableOpacity>
      </View>

      {!selectedUser ? (
        <View style={styles.card}>
          <Text style={styles.title}>কে প্রবেশ করছেন?</Text>
          <FlatList data={users} keyExtractor={u => u.id}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.userRow} onPress={() => setSelectedUser(item)}>
                <View style={[styles.avatar, { backgroundColor: item.role === 'owner' ? COLORS.primary : COLORS.primaryLight }]}>
                  <Text style={styles.avatarText}>{item.name[0]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.userName}>{item.name}</Text>
                  <Text style={styles.userRole}>{item.role === 'owner' ? 'মালিক' : 'কর্মচারী'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: COLORS.border }} />}
          />
        </View>
      ) : (
        <View style={styles.card}>
          <TouchableOpacity onPress={() => { setSelectedUser(null); setPin(''); }} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={18} color={COLORS.primary} />
            <Text style={{ color: COLORS.primary, fontSize: FONT_SIZES.sm, fontWeight: '600' }}>ফিরে যান</Text>
          </TouchableOpacity>
          <View style={[styles.avatar, { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.primary, alignSelf: 'center' }]}>
            <Text style={[styles.avatarText, { fontSize: 28 }]}>{selectedUser.name[0]}</Text>
          </View>
          <Text style={[styles.title, { marginTop: 12 }]}>{selectedUser.name}</Text>
          <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 24 }}>৪ সংখ্যার PIN দিন</Text>
          <View style={styles.pinDots}>
            {[0,1,2,3].map(i => <View key={i} style={[styles.dot, { backgroundColor: i < pin.length ? COLORS.primary : COLORS.border }]} />)}
          </View>
          {loading && <ActivityIndicator color={COLORS.primary} style={{ marginBottom: 16 }} />}
          <View style={styles.numpad}>
            {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((key, idx) => (
              <TouchableOpacity key={idx} style={[styles.numKey, !key && { opacity: 0 }]} onPress={() => key && handlePinKey(key)} disabled={!key}>
                <Text style={[styles.numKeyText, key === '⌫' && { fontSize: 20 }]}>{key}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.primary },
  shopHeader: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  changeShopBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', marginTop: 4 },
  changeShopText: { fontSize: FONT_SIZES.xs, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },
  shopIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  shopName: { fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.surface, textAlign: 'center', paddingHorizontal: 20 },
  card: { flex: 1, backgroundColor: COLORS.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, alignItems: 'center' },
  title: { fontSize: FONT_SIZES.xl, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, width: '100%' },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: COLORS.surface, fontSize: FONT_SIZES.lg, fontWeight: '700' },
  userName: { fontSize: FONT_SIZES.md, fontWeight: '600', color: COLORS.text },
  userRole: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginBottom: 20 },
  pinDots: { flexDirection: 'row', gap: 16, marginVertical: 24 },
  dot: { width: 16, height: 16, borderRadius: 8 },
  numpad: { flexDirection: 'row', flexWrap: 'wrap', width: 240, gap: 12, justifyContent: 'center' },
  numKey: { width: 68, height: 68, borderRadius: 34, backgroundColor: COLORS.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  numKeyText: { fontSize: FONT_SIZES.xxl, fontWeight: '400', color: COLORS.text },
  phoneRow: { flexDirection: 'row', width: '100%', gap: 8, marginVertical: 16 },
  phoneInput: { flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, height: 52, paddingHorizontal: 16, fontSize: FONT_SIZES.md, color: COLORS.text },
  lookupBtn: { width: 52, height: 52, borderRadius: 12, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  linkText: { color: COLORS.primary, fontSize: FONT_SIZES.sm, fontWeight: '600', marginTop: 12 },
});