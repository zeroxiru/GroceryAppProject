import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, KeyboardAvoidingView,
  Platform, ScrollView
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONT_SIZES } from '@/constants';
import { useAuthStore } from '@/store';
import { authApi } from '@/services/api/authApi';
import { Shop, ShopType } from '@/types';

type Screen = 'welcome' | 'login_phone' | 'register_phone' | 'verify_otp' | 'shop_setup' | 'shop_type' | 'set_pin';

const SHOP_TYPES: { type: ShopType; icon: string; title: string; description: string }[] = [
  { type: 'grocery',   icon: '🛒', title: 'কিরানা দোকান',     description: 'চাল, ডাল, তেল, মসলা' },
  { type: 'cosmetics', icon: '💄', title: 'প্রসাধনী দোকান',   description: 'শ্যাম্পু, ক্রিম, স্কিন কেয়ার' },
  { type: 'imported',  icon: '🌍', title: 'বিদেশী পণ্য',      description: 'Chocolate, Noodles, Foreign Foods' },
  { type: 'mixed',     icon: '🏪', title: 'মিশ্র দোকান',      description: 'সব ধরনের পণ্য' },
];

export default function OnboardingScreen() {
  const [screen, setScreen] = useState<Screen>('welcome');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [otpInputs, setOtpInputs] = useState(['', '', '', '', '', '']);
  const [shopName, setShopName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [address, setAddress] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [shopType, setShopType] = useState<ShopType | null>(null);
  const [loading, setLoading] = useState(false);
  const [generatedOtp, setGeneratedOtp] = useState('');
  const [existingShop, setExistingShop] = useState<Shop | null>(null);
  const [resendCountdown, setResendCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startResendTimer = () => {
    setResendCountdown(60);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setResendCountdown(prev => {
        if (prev <= 1) { clearInterval(countdownRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => () => { if (countdownRef.current) clearInterval(countdownRef.current); }, []);

  const otpRefs = useRef<(TextInput | null)[]>([]);

  const handleOtpChange = (value: string, index: number) => {
    const cleaned = value.replace(/\D/g, '');
    const newInputs = [...otpInputs];

    if (cleaned.length > 1) {
      // Handle paste — fill all boxes
      const digits = cleaned.slice(0, 6).split('');
      digits.forEach((d, i) => {
        if (i < 6) newInputs[i] = d;
      });
      setOtpInputs(newInputs);
      otpRefs.current[5]?.focus();
      return;
    }

    newInputs[index] = cleaned;
    setOtpInputs(newInputs);

    // Auto move to next box
    if (cleaned && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !otpInputs[index] && index > 0) {
      const newInputs = [...otpInputs];
      newInputs[index - 1] = '';
      setOtpInputs(newInputs);
      otpRefs.current[index - 1]?.focus();
    }
  };

  const getOtpValue = () => otpInputs.join('');

  const handleSendOTP = async (isLogin: boolean) => {
    if (phone.length < 11) {
      Alert.alert('সতর্কতা', 'সঠিক মোবাইল নম্বর দিন (১১ ডিজিট)');
      return;
    }

    if (isLogin) {
      // Existing users log in with PIN — no OTP needed
      router.replace('/pin-login');
      return;
    }

    setLoading(true);
    try {
      await authApi.sendSignupOtp(phone);
      setOtpInputs(['', '', '', '', '', '']);
      startResendTimer();
      setScreen('verify_otp');
      setTimeout(() => otpRefs.current[0]?.focus(), 300);
    } catch (e: any) {
      Alert.alert('ত্রুটি', e.message ?? 'OTP পাঠাতে সমস্যা হয়েছে');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    if (resendCountdown > 0 || loading) return;
    setLoading(true);
    try {
      await authApi.sendSignupOtp(phone);
      setOtpInputs(['', '', '', '', '', '']);
      startResendTimer();
      otpRefs.current[0]?.focus();
      Alert.alert('পাঠানো হয়েছে', 'নতুন OTP পাঠানো হয়েছে।');
    } catch (e: any) {
      Alert.alert('ত্রুটি', e.message ?? 'OTP পাঠাতে সমস্যা হয়েছে');
    } finally { setLoading(false); }
  };

  const handleVerifyOTP = () => {
    const enteredOtp = getOtpValue();
    if (enteredOtp.length !== 6) {
      Alert.alert('সতর্কতা', '৬ সংখ্যার OTP দিন');
      return;
    }
    // OTP stored here; consumed server-side at verifySignup
    setGeneratedOtp(enteredOtp);
    setScreen('shop_setup');
  };

  const handleShopSetup = () => {
    if (!shopName.trim() || !ownerName.trim()) {
      Alert.alert('সতর্কতা', 'দোকানের নাম ও মালিকের নাম দিন');
      return;
    }
    setScreen('shop_type');
  };

  const handleShopTypeNext = () => {
    if (!shopType) {
      Alert.alert('সতর্কতা', 'দোকানের ধরন বেছে নিন');
      return;
    }
    setScreen('set_pin');
  };

  const handleSetPin = async () => {
    if (pin.length !== 4) {
      Alert.alert('সতর্কতা', 'চার সংখ্যার PIN দিন');
      return;
    }
    if (pin !== confirmPin) {
      Alert.alert('সতর্কতা', 'PIN দুটি মিলছে না');
      return;
    }
    setLoading(true);
    try {
      const res = await authApi.verifySignup({
        phone,
        otp: generatedOtp,
        pin,
        shopName,
        ownerName,
        address: address || undefined,
        shopType: shopType ?? 'grocery',
      });
      await authApi.saveTokens(res);
      useAuthStore.getState().setShop(res.shop);
      useAuthStore.getState().setUser(res.user);
      useAuthStore.getState().setTokens(res.accessToken, res.refreshToken);
      router.replace('/(tabs)/home');
    } catch (e: any) {
      Alert.alert('ত্রুটি', e.message ?? 'রেজিস্ট্রেশন ব্যর্থ হয়েছে');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        {/* Welcome */}
        {screen === 'welcome' && (
          <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
            <View style={styles.logoArea}>
              <View style={styles.logoCircle}>
                <Ionicons name="storefront" size={52} color={COLORS.surface} />
              </View>
              <Text style={styles.appName}>দোকান AI</Text>
              <Text style={styles.tagline}>বাংলাদেশের গ্রোসারি দোকানের{'\n'}স্মার্ট সহকারী</Text>
            </View>
            <View style={styles.card}>
              {[
                { icon: 'mic', text: 'ভয়েসে বিক্রয় এন্ট্রি' },
                { icon: 'receipt-outline', text: 'স্বয়ংক্রিয় বিল তৈরি' },
                { icon: 'stats-chart', text: 'দৈনিক আয়-ব্যয় হিসাব' },
                { icon: 'wifi', text: 'অফলাইনেও কাজ করে' },
              ].map((f, i) => (
                <View key={i} style={styles.featureRow}>
                  <View style={styles.featureIcon}>
                    <Ionicons name={f.icon as any} size={20} color={COLORS.primary} />
                  </View>
                  <Text style={styles.featureText}>{f.text}</Text>
                </View>
              ))}
              <View style={{ gap: 12, marginTop: 8 }}>
                <TouchableOpacity style={styles.primaryBtn} onPress={() => setScreen('register_phone')}>
                  <Ionicons name="add-circle-outline" size={20} color={COLORS.surface} />
                  <Text style={styles.primaryBtnText}>নতুন দোকান শুরু করুন</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryBtn} onPress={() => setScreen('login_phone')}>
                  <Ionicons name="log-in-outline" size={20} color={COLORS.primary} />
                  <Text style={styles.secondaryBtnText}>আগের দোকানে প্রবেশ করুন</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        )}

        {/* Login Phone */}
        {screen === 'login_phone' && (
          <View style={{ flex: 1 }}>
            <TouchableOpacity style={styles.backBtn} onPress={() => setScreen('welcome')}>
              <Ionicons name="arrow-back" size={22} color={COLORS.surface} />
            </TouchableOpacity>
            <Text style={styles.formTitle}>লগইন করুন</Text>
            <Text style={styles.formSubtitle}>দোকানের রেজিস্টার করা নম্বর দিন</Text>
            <View style={styles.card}>
              <FormInput label="মোবাইল নম্বর *" placeholder="01XXXXXXXXX" value={phone} onChangeText={setPhone} keyboardType="phone-pad" icon="call-outline" maxLength={11} />
              <View style={{ backgroundColor: '#EFF6FF', borderRadius: 10, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="information-circle-outline" size={16} color="#1E40AF" />
                <Text style={{ flex: 1, fontSize: FONT_SIZES.xs, color: '#1E40AF', lineHeight: 18 }}>
                  রেজিস্টার করা নম্বর দিন। PIN দিয়ে প্রবেশ করবেন।
                </Text>
              </View>
              <TouchableOpacity style={[styles.primaryBtn, loading && { opacity: 0.6 }]} onPress={() => handleSendOTP(true)} disabled={loading}>
                {loading ? <ActivityIndicator color={COLORS.surface} /> : <Text style={styles.primaryBtnText}>PIN দিয়ে প্রবেশ করুন →</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Register Phone */}
        {screen === 'register_phone' && (
          <View style={{ flex: 1 }}>
            <TouchableOpacity style={styles.backBtn} onPress={() => setScreen('welcome')}>
              <Ionicons name="arrow-back" size={22} color={COLORS.surface} />
            </TouchableOpacity>
            <Text style={styles.formTitle}>নতুন দোকান</Text>
            <Text style={styles.formSubtitle}>মোবাইল নম্বর দিয়ে শুরু করুন</Text>
            <ScrollView style={styles.card} contentContainerStyle={{ gap: 14, padding: 24 }}>
              <FormInput label="মোবাইল নম্বর *" placeholder="01XXXXXXXXX" value={phone} onChangeText={setPhone} keyboardType="phone-pad" icon="call-outline" maxLength={11} />
              <FormInput label="ইমেইল (ঐচ্ছিক)" placeholder="example@gmail.com" value={email} onChangeText={setEmail} keyboardType="email-address" icon="mail-outline" />
              <View style={styles.infoBox}>
                <Ionicons name="information-circle-outline" size={16} color={COLORS.info} />
                <Text style={styles.infoText}>একই মোবাইল নম্বরে দুটি দোকান হবে না।</Text>
              </View>
              <TouchableOpacity style={[styles.primaryBtn, loading && { opacity: 0.6 }]} onPress={() => handleSendOTP(false)} disabled={loading}>
                {loading ? <ActivityIndicator color={COLORS.surface} /> : <Text style={styles.primaryBtnText}>OTP পাঠান →</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}

        {/* OTP Verify */}
        {screen === 'verify_otp' && (
          <View style={{ flex: 1 }}>
            <TouchableOpacity style={styles.backBtn} onPress={() => setScreen('register_phone')}>
              <Ionicons name="arrow-back" size={22} color={COLORS.surface} />
            </TouchableOpacity>
            <Text style={styles.formTitle}>OTP যাচাই</Text>
            <Text style={styles.formSubtitle}>{phone} নম্বরে পাঠানো ৬ সংখ্যার কোড দিন</Text>
            <View style={[styles.card, { padding: 24, gap: 20 }]}>

              {/* OTP boxes */}
              <View style={styles.otpRow}>
                {otpInputs.map((digit, index) => (
                  <TextInput
                    key={index}
                    ref={ref => { otpRefs.current[index] = ref; }}
                    style={[styles.otpBox, digit && styles.otpBoxFilled]}
                    value={digit}
                    onChangeText={v => handleOtpChange(v, index)}
                    onKeyPress={({ nativeEvent }) => handleOtpKeyPress(nativeEvent.key, index)}
                    keyboardType="numeric"
                    maxLength={1}
                    selectTextOnFocus
                    textAlign="center"
                    autoFocus={index === 0}
                  />
                ))}
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, getOtpValue().length < 6 && { opacity: 0.4 }]}
                onPress={handleVerifyOTP}
                disabled={getOtpValue().length < 6}
              >
                <Text style={styles.primaryBtnText}>যাচাই করুন ✓</Text>
              </TouchableOpacity>

              {/* Resend with countdown */}
              <View style={{ alignItems: 'center', gap: 4 }}>
                {resendCountdown > 0 ? (
                  <Text style={{ color: COLORS.textMuted, fontSize: FONT_SIZES.sm }}>
                    পুনরায় পাঠাতে অপেক্ষা করুন ({resendCountdown}s)
                  </Text>
                ) : (
                  <TouchableOpacity onPress={handleResendOTP} disabled={loading}>
                    <Text style={{ color: COLORS.primary, fontSize: FONT_SIZES.sm, fontWeight: '600' }}>
                      {loading ? 'পাঠানো হচ্ছে...' : 'OTP পাননি? আবার পাঠান'}
                    </Text>
                  </TouchableOpacity>
                )}
                <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textMuted }}>
                  SMS আসতে ১–২ মিনিট লাগতে পারে
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Shop Setup */}
        {screen === 'shop_setup' && (
          <View style={{ flex: 1 }}>
            <Text style={[styles.formTitle, { paddingTop: 16 }]}>দোকানের তথ্য</Text>
            <Text style={styles.formSubtitle}>আপনার দোকান সেটআপ করুন</Text>
            <ScrollView style={styles.card} contentContainerStyle={{ gap: 14, padding: 24 }}>
              <FormInput label="দোকানের নাম *" placeholder="বিক্রমপুর গ্রোসারী স্টোর" value={shopName} onChangeText={setShopName} icon="storefront-outline" />
              <FormInput label="মালিকের নাম *" placeholder="আপনার পুরো নাম" value={ownerName} onChangeText={setOwnerName} icon="person-outline" />
              <FormInput label="ঠিকানা (ঐচ্ছিক)" placeholder="দোকানের ঠিকানা" value={address} onChangeText={setAddress} icon="location-outline" />
              <TouchableOpacity style={styles.primaryBtn} onPress={handleShopSetup}>
                <Text style={styles.primaryBtnText}>পরবর্তী →</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}

        {/* Shop Type Selection */}
        {screen === 'shop_type' && (
          <View style={{ flex: 1 }}>
            <TouchableOpacity style={styles.backBtn} onPress={() => setScreen('shop_setup')}>
              <Ionicons name="arrow-back" size={22} color={COLORS.surface} />
            </TouchableOpacity>
            <Text style={[styles.formTitle, { paddingTop: 8 }]}>দোকানের ধরন</Text>
            <Text style={styles.formSubtitle}>আপনার দোকানে কী বিক্রি হয়?</Text>
            <ScrollView style={styles.card} contentContainerStyle={{ gap: 12, padding: 24 }}>
              {SHOP_TYPES.map(({ type, icon, title, description }) => {
                const selected = shopType === type;
                return (
                  <TouchableOpacity
                    key={type}
                    style={[styles.shopTypeCard, selected && styles.shopTypeCardSelected]}
                    onPress={() => setShopType(type)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.shopTypeIcon}>{icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.shopTypeTitle, selected && styles.shopTypeTextSelected]}>{title}</Text>
                      <Text style={[styles.shopTypeDesc, selected && styles.shopTypeDescSelected]}>{description}</Text>
                    </View>
                    {selected && (
                      <Ionicons name="checkmark-circle" size={24} color={COLORS.surface} />
                    )}
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={[styles.primaryBtn, !shopType && { opacity: 0.4 }, { marginTop: 8 }]}
                onPress={handleShopTypeNext}
                disabled={!shopType}
              >
                <Text style={styles.primaryBtnText}>পরবর্তী →</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}

        {/* Set PIN */}
        {screen === 'set_pin' && (
          <View style={{ flex: 1 }}>
            <TouchableOpacity style={styles.backBtn} onPress={() => setScreen('shop_type')}>
              <Ionicons name="arrow-back" size={22} color={COLORS.surface} />
            </TouchableOpacity>
            <Text style={styles.formTitle}>PIN সেট করুন</Text>
            <Text style={styles.formSubtitle}>প্রতিদিন দ্রুত লগইনের জন্য ৪ সংখ্যার PIN</Text>
            <View style={[styles.card, { padding: 24, gap: 16 }]}>
              <FormInput label="নতুন PIN *" placeholder="৪ সংখ্যা" value={pin} onChangeText={setPin} keyboardType="numeric" secureTextEntry icon="lock-closed-outline" maxLength={4} />
              <FormInput label="PIN নিশ্চিত করুন *" placeholder="আবার দিন" value={confirmPin} onChangeText={setConfirmPin} keyboardType="numeric" secureTextEntry icon="checkmark-circle-outline" maxLength={4} />
              <TouchableOpacity
                style={[styles.primaryBtn, loading && { opacity: 0.6 }]}
                onPress={handleSetPin}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color={COLORS.surface} />
                  : <Text style={styles.primaryBtnText}>দোকান তৈরি করুন ✓</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FormInput({ label, placeholder, value, onChangeText, icon, keyboardType, secureTextEntry, maxLength }: any) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={styles.inputRow}>
        <Ionicons name={icon} size={18} color={COLORS.textSecondary} style={{ marginLeft: 14 }} />
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textMuted}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType ?? 'default'}
          secureTextEntry={secureTextEntry}
          maxLength={maxLength}
          autoCapitalize="none"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.primary },
  logoArea: { alignItems: 'center', paddingTop: 40, paddingBottom: 28 },
  logoCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  appName: { fontSize: 36, fontWeight: '700', color: COLORS.surface, letterSpacing: 1 },
  tagline: { fontSize: FONT_SIZES.md, color: 'rgba(255,255,255,0.8)', textAlign: 'center', marginTop: 8, lineHeight: 24 },
  card: { flex: 1, backgroundColor: COLORS.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, gap: 14 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  featureIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: COLORS.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  featureText: { fontSize: FONT_SIZES.md, color: COLORS.text, fontWeight: '500' },
  backBtn: { paddingHorizontal: 20, paddingBottom: 8, paddingTop: 8 },
  formTitle: { fontSize: FONT_SIZES.xxl, fontWeight: '700', color: COLORS.surface, paddingHorizontal: 20, marginBottom: 4 },
  formSubtitle: { fontSize: FONT_SIZES.sm, color: 'rgba(255,255,255,0.75)', paddingHorizontal: 20, marginBottom: 16 },
  inputLabel: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.text },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, backgroundColor: COLORS.surfaceSecondary, height: 52, gap: 10 },
  input: { flex: 1, fontSize: FONT_SIZES.md, color: COLORS.text, paddingRight: 14 },
  primaryBtn: { backgroundColor: COLORS.primary, borderRadius: 14, height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryBtnText: { color: COLORS.surface, fontSize: FONT_SIZES.md, fontWeight: '700' },
  secondaryBtn: { borderWidth: 1.5, borderColor: COLORS.primary, borderRadius: 14, height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondaryBtnText: { color: COLORS.primary, fontSize: FONT_SIZES.md, fontWeight: '700' },
  infoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#E3F2FD', padding: 12, borderRadius: 10 },
  infoText: { flex: 1, fontSize: FONT_SIZES.xs, color: COLORS.info, lineHeight: 18 },
  otpRow: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  otpBox: {
    width: 46, height: 56, borderRadius: 12,
    borderWidth: 1.5, borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceSecondary,
    fontSize: FONT_SIZES.xxl, fontWeight: '700', color: COLORS.text,
    textAlign: 'center',
  },
  otpBoxFilled: { borderColor: COLORS.primary, backgroundColor: '#E8F5E9' },
  shopTypeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 14,
    padding: 16, backgroundColor: COLORS.surfaceSecondary,
  },
  shopTypeCardSelected: {
    borderColor: COLORS.primary, backgroundColor: COLORS.primary,
  },
  shopTypeIcon: { fontSize: 28 },
  shopTypeTitle: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.text, marginBottom: 2 },
  shopTypeTextSelected: { color: COLORS.surface },
  shopTypeDesc: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, lineHeight: 18 },
  shopTypeDescSelected: { color: 'rgba(255,255,255,0.8)' },
});
