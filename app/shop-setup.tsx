
import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { authService } from '@/services/supabase/authService';
import { COLORS, FONT_SIZES } from '@/constants';

export default function ShopSetupScreen() {
  const [shopName, setShopName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);

  const handleNext = () => {
    if (!shopName.trim() || !ownerName.trim() || !phone.trim()) {
      Alert.alert('সতর্কতা', 'দোকানের নাম, মালিকের নাম এবং ফোন নম্বর দিন');
      return;
    }
    setStep(2);
  };

  const handleRegister = async () => {
    if (pin.length !== 4) { Alert.alert('সতর্কতা', 'চার সংখ্যার PIN দিন'); return; }
    if (pin !== confirmPin) { Alert.alert('সতর্কতা', 'PIN দুটি মিলছে না'); return; }
    setLoading(true);
    try {
      await authService.registerShop({ shopName, ownerName, phone, address, pin });
      router.replace('/(tabs)/home');
    } catch (e: any) {
      Alert.alert('ত্রুটি', e.message ?? 'রেজিস্ট্রেশন ব্যর্থ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          {step === 2 && <TouchableOpacity onPress={() => setStep(1)}><Ionicons name="arrow-back" size={22} color={COLORS.surface} /></TouchableOpacity>}
          <Text style={styles.headerTitle}>নতুন দোকান সেটআপ</Text>
          <Text style={styles.stepLabel}>ধাপ {step}/২</Text>
        </View>

        <ScrollView style={styles.form} contentContainerStyle={{ padding: 24, gap: 16 }}>
          {step === 1 ? (
            <>
              <Text style={styles.sectionLabel}>দোকানের তথ্য</Text>
              <Field label="দোকানের নাম *" placeholder="বিক্রমপুর গ্রোসারী স্টোর" value={shopName} onChangeText={setShopName} icon="storefront-outline" />
              <Field label="মালিকের নাম *" placeholder="আপনার পুরো নাম" value={ownerName} onChangeText={setOwnerName} icon="person-outline" />
              <Field label="মোবাইল নম্বর *" placeholder="01XXXXXXXXX" value={phone} onChangeText={setPhone} keyboardType="phone-pad" icon="call-outline" maxLength={11} />
              <Field label="ঠিকানা" placeholder="দোকানের ঠিকানা" value={address} onChangeText={setAddress} icon="location-outline" />
              <TouchableOpacity style={styles.primaryBtn} onPress={handleNext}>
                <Text style={styles.primaryBtnText}>পরবর্তী ধাপ</Text>
                <Ionicons name="arrow-forward" size={18} color={COLORS.surface} />
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.sectionLabel}>PIN সেট করুন</Text>
              <Text style={styles.hint}>৪ সংখ্যার PIN — প্রতিদিন লগইনে ব্যবহার হবে</Text>
              <Field label="নতুন PIN *" placeholder="৪ সংখ্যা" value={pin} onChangeText={setPin} keyboardType="numeric" secureTextEntry icon="lock-closed-outline" maxLength={4} />
              <Field label="PIN নিশ্চিত করুন *" placeholder="আবার দিন" value={confirmPin} onChangeText={setConfirmPin} keyboardType="numeric" secureTextEntry icon="checkmark-circle-outline" maxLength={4} />
              <TouchableOpacity style={[styles.primaryBtn, loading && { opacity: 0.6 }]} onPress={handleRegister} disabled={loading}>
                {loading ? <ActivityIndicator color={COLORS.surface} /> : <><Ionicons name="checkmark-circle" size={18} color={COLORS.surface} /><Text style={styles.primaryBtnText}>দোকান তৈরি করুন</Text></>}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, placeholder, value, onChangeText, icon, keyboardType, secureTextEntry, maxLength }: any) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={styles.inputRow}>
        <Ionicons name={icon} size={18} color={COLORS.textSecondary} style={{ marginLeft: 14 }} />
        <TextInput style={styles.input} placeholder={placeholder} placeholderTextColor={COLORS.textMuted} value={value} onChangeText={onChangeText} keyboardType={keyboardType ?? 'default'} secureTextEntry={secureTextEntry} maxLength={maxLength} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.primary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
  headerTitle: { fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.surface, flex: 1, marginLeft: 8 },
  stepLabel: { fontSize: FONT_SIZES.sm, color: 'rgba(255,255,255,0.7)' },
  form: { flex: 1, backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  sectionLabel: { fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.text },
  hint: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, lineHeight: 20 },
  inputLabel: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.text },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, backgroundColor: COLORS.surfaceSecondary, height: 52, gap: 10 },
  input: { flex: 1, fontSize: FONT_SIZES.md, color: COLORS.text, paddingRight: 14 },
  primaryBtn: { backgroundColor: COLORS.primary, borderRadius: 14, height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 },
  primaryBtnText: { color: COLORS.surface, fontSize: FONT_SIZES.md, fontWeight: '700' },
});