import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authApi } from '@/services/api/authApi';
import { shopApi } from '@/services/api/shopApi';
import { useAuthStore } from '@/store';
import { COLORS, FONT_SIZES } from '@/constants';
import { pinRateLimiter } from '@/utils/rateLimiter';

type LoginMode = 'owner' | 'staff';

const SHOP_ID_KEY = 'dokanai_device_shop_id';

export default function PinLoginScreen() {
  const [mode, setMode] = useState<LoginMode>('owner');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [shopId, setShopId] = useState('');
  const [shopIdLocked, setShopIdLocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(SHOP_ID_KEY).then(saved => {
      if (saved) { setShopId(saved); setShopIdLocked(true); }
    });
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, []);

  const startCountdown = (seconds: number) => {
    setLockoutSeconds(seconds);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setLockoutSeconds(prev => {
        if (prev <= 1) { clearInterval(countdownRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const switchMode = (m: LoginMode) => {
    setMode(m); setErrorMsg(null); setAttemptsLeft(null); setPin('');
  };

  const lockoutKey = `${phone}_${mode}`;

  const handlePinKey = async (key: string) => {
    if (lockoutSeconds > 0 || loading) return;
    if (key === '⌫') { setPin(p => p.slice(0, -1)); return; }
    const newPin = pin + key;
    setPin(newPin);
    if (newPin.length < 4) return;

    if (!/^01\d{9}$/.test(phone)) {
      setErrorMsg('সঠিক মোবাইল নম্বর দিন (01XXXXXXXXX)');
      setPin('');
      return;
    }
    if (mode === 'staff' && !shopId.trim()) {
      setErrorMsg('Shop ID দিন। মালিকের কাছ থেকে জানুন।');
      setPin('');
      return;
    }

    const { locked, secondsLeft } = await pinRateLimiter.check(lockoutKey);
    if (locked) { startCountdown(secondsLeft); setPin(''); return; }

    setLoading(true);
    setErrorMsg(null);
    setAttemptsLeft(null);

    try {
      if (mode === 'owner') {
        const res = await authApi.ownerLogin(phone, newPin);
        await authApi.saveTokens(res);
        useAuthStore.getState().setShop(res.shop);
        useAuthStore.getState().setUser(res.user);
        useAuthStore.getState().setTokens(res.accessToken, res.refreshToken);
      } else {
        const res = await authApi.staffLogin(phone, newPin, shopId.trim());
        await authApi.saveTokens(res);
        await AsyncStorage.setItem(SHOP_ID_KEY, shopId.trim());
        setShopIdLocked(true);
        // Staff login response has no shop — fetch it after saving the token
        const shop = await shopApi.getMe();
        useAuthStore.getState().setShop(shop);
        useAuthStore.getState().setUser(res.user);
        useAuthStore.getState().setTokens(res.accessToken, res.refreshToken);
      }
      await pinRateLimiter.recordSuccess(lockoutKey);
      router.replace('/(tabs)/home');
    } catch (e: any) {
      const { lockSec, attemptsLeft: left } = await pinRateLimiter.recordFailure(lockoutKey);
      if (lockSec > 0) {
        startCountdown(lockSec);
        setErrorMsg(`অনেকবার ভুল হয়েছে। ${lockSec} সেকেন্ড অপেক্ষা করুন।`);
        setAttemptsLeft(0);
      } else {
        setErrorMsg(e.message ?? 'আবার চেষ্টা করুন');
        setAttemptsLeft(left);
      }
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Brand */}
        <View style={styles.brand}>
          <Ionicons name="storefront" size={40} color={COLORS.surface} />
          <Text style={styles.brandTitle}>DokanAI POS</Text>
          <Text style={styles.brandSub}>দোকান চালাও সহজে</Text>
        </View>

        <View style={styles.card}>

          {/* Mode toggle — মালিক / কর্মচারী */}
          <View style={styles.modeToggle}>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'owner' && styles.modeBtnActive]}
              onPress={() => switchMode('owner')}
            >
              <Text style={[styles.modeBtnText, mode === 'owner' && styles.modeBtnTextActive]}>মালিক</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'staff' && styles.modeBtnActive]}
              onPress={() => switchMode('staff')}
            >
              <Text style={[styles.modeBtnText, mode === 'staff' && styles.modeBtnTextActive]}>কর্মচারী</Text>
            </TouchableOpacity>
          </View>

          {/* Shop ID — staff only, pre-filled after first login */}
          {mode === 'staff' && (
            <View style={styles.fieldGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Shop ID</Text>
                {shopIdLocked ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="lock-closed" size={11} color={COLORS.primary} />
                    <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.primary, fontWeight: '600' }}>ডিভাইস সেট আপ</Text>
                  </View>
                ) : (
                  <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textMuted }}>মালিকের কাছ থেকে নিন</Text>
                )}
              </View>
              <TextInput
                style={[styles.input, styles.monoInput, shopIdLocked && styles.inputLocked]}
                value={shopId}
                onChangeText={t => !shopIdLocked && setShopId(t.trim())}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                placeholderTextColor={COLORS.textMuted}
                editable={!shopIdLocked}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {shopIdLocked && (
                <TouchableOpacity onPress={async () => {
                  await AsyncStorage.removeItem(SHOP_ID_KEY);
                  setShopId('');
                  setShopIdLocked(false);
                }}>
                  <Text style={styles.resetText}>ভুল দোকান? রিসেট করুন</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Phone */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>মোবাইল নম্বর</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="01XXXXXXXXX"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="phone-pad"
              maxLength={11}
              autoFocus
              editable={!loading}
            />
          </View>

          {/* PIN dots */}
          <View style={styles.pinSection}>
            <Text style={styles.label}>৪ সংখ্যার PIN</Text>
            <View style={styles.pinDots}>
              {[0, 1, 2, 3].map(i => (
                <View
                  key={i}
                  style={[styles.dot, { backgroundColor: i < pin.length ? COLORS.primary : COLORS.border }]}
                />
              ))}
            </View>
          </View>

          {/* Error */}
          {errorMsg && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={COLORS.error} />
              <View style={{ flex: 1 }}>
                <Text style={styles.errorText}>{errorMsg}</Text>
                {attemptsLeft !== null && attemptsLeft > 0 && (
                  <Text style={styles.attemptsText}>{attemptsLeft}টি চেষ্টা বাকি</Text>
                )}
                {attemptsLeft === 0 && lockoutSeconds === 0 && (
                  <Text style={styles.attemptsText}>১৫ মিনিট পরে আবার চেষ্টা করুন</Text>
                )}
              </View>
            </View>
          )}

          {/* Lockout banner */}
          {lockoutSeconds > 0 && (
            <View style={styles.lockoutBox}>
              <Ionicons name="lock-closed" size={14} color={COLORS.error} />
              <Text style={styles.lockoutText}>{lockoutSeconds}s অপেক্ষা করুন</Text>
            </View>
          )}

          {/* Numpad */}
          {loading ? (
            <ActivityIndicator color={COLORS.primary} size="large" style={{ marginTop: 32 }} />
          ) : (
            <View style={[styles.numpad, lockoutSeconds > 0 && { opacity: 0.4 }]}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((key, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[styles.numKey, !key && styles.numKeyHidden]}
                  onPress={() => key && handlePinKey(key)}
                  disabled={!key || lockoutSeconds > 0 || loading}
                >
                  <Text style={[styles.numKeyText, key === '⌫' && { fontSize: 20 }]}>{key}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <TouchableOpacity onPress={() => router.push('/shop-setup')} style={{ marginTop: 20 }}>
            <Text style={styles.linkText}>নতুন দোকান তৈরি করুন →</Text>
          </TouchableOpacity>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.primary },
  scroll: { flexGrow: 1 },
  brand: { alignItems: 'center', paddingVertical: 32, gap: 6 },
  brandTitle: { fontSize: FONT_SIZES.xxl, fontWeight: '700', color: COLORS.surface },
  brandSub: { fontSize: FONT_SIZES.sm, color: 'rgba(255,255,255,0.75)' },
  card: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    alignItems: 'center',
  },
  modeToggle: {
    flexDirection: 'row',
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    marginBottom: 20,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
  },
  modeBtnActive: { backgroundColor: COLORS.primary },
  modeBtnText: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.textSecondary },
  modeBtnTextActive: { color: COLORS.surface },
  fieldGroup: { width: '100%', marginBottom: 16 },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.text, marginBottom: 6 },
  input: {
    width: '100%',
    height: 50,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    backgroundColor: COLORS.surface,
  },
  monoInput: { fontFamily: 'monospace', fontSize: FONT_SIZES.xs },
  inputLocked: { backgroundColor: '#F5F5F5', color: COLORS.textMuted },
  resetText: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 4 },
  pinSection: { width: '100%', alignItems: 'center', marginBottom: 12 },
  pinDots: { flexDirection: 'row', gap: 16, marginTop: 12 },
  dot: { width: 16, height: 16, borderRadius: 8 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    width: '100%',
    marginBottom: 8,
  },
  errorText: { fontSize: FONT_SIZES.sm, color: COLORS.error, fontWeight: '500' },
  attemptsText: { fontSize: FONT_SIZES.xs, color: COLORS.error, opacity: 0.8, marginTop: 2 },
  lockoutBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEE2E2',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 12,
  },
  lockoutText: { fontSize: FONT_SIZES.sm, color: COLORS.error, fontWeight: '600' },
  numpad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 240,
    gap: 12,
    justifyContent: 'center',
    marginTop: 8,
  },
  numKey: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: COLORS.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numKeyHidden: { opacity: 0 },
  numKeyText: { fontSize: FONT_SIZES.xxl, fontWeight: '400', color: COLORS.text },
  linkText: { fontSize: FONT_SIZES.sm, color: COLORS.primary, fontWeight: '600' },
});
