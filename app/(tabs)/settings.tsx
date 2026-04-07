import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput, Modal, ActivityIndicator, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { format } from 'date-fns';
import { authService } from '@/services/supabase/authService';
import { transactionService } from '@/services/supabase/transactionService';
import { useAuthStore, useTransactionStore } from '@/store';
import { COLORS, FONT_SIZES } from '@/constants';
import { formatCurrency } from '@/utils';

export default function SettingsScreen() {
  const { shop, user, logout } = useAuthStore();
  const { todayTransactions, pendingSync } = useTransactionStore();
  const [addUserModal, setAddUserModal] = useState(false);
  const [voiceFeedback, setVoiceFeedback] = useState(true);

  const todaySales = todayTransactions.filter(t => t.type === 'sale').reduce((s, t) => s + t.total_amount, 0);
  const todayPurchases = todayTransactions.filter(t => t.type === 'purchase').reduce((s, t) => s + t.total_amount, 0);

  const handleDayClose = () => {
    Alert.alert('দিন বন্ধ করুন', `আজকের হিসাব:\nবিক্রয়: ৳${formatCurrency(todaySales)}\nক্রয়: ৳${formatCurrency(todayPurchases)}\nলাভ: ৳${formatCurrency(todaySales - todayPurchases)}`, [
      { text: 'না', style: 'cancel' },
      { text: 'সেভ করুন', onPress: async () => { await transactionService.syncPending(); Alert.alert('সম্পন্ন', 'আজকের হিসাব সেভ হয়েছে ✓'); } },
    ]);
  };

  const handleLogout = () => {
    Alert.alert('লগ আউট', 'এই ব্যবহারকারী লগ আউট হবে।', [
      { text: 'না', style: 'cancel' },
      { text: 'লগ আউট', style: 'destructive', onPress: () => { logout(); router.replace('/pin-login'); } },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.header}>
          <View style={styles.shopIcon}><Ionicons name="storefront" size={32} color={COLORS.surface} /></View>
          <Text style={styles.shopName}>{shop?.name}</Text>
          <Text style={styles.ownerName}>{user?.name} • {user?.role === 'owner' ? 'মালিক' : 'কর্মচারী'}</Text>
        </View>

        <TouchableOpacity style={styles.daySummaryCard} onPress={handleDayClose}>
          <View>
            <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.text, marginBottom: 4 }}>আজকের সারাংশ — {format(new Date(), 'dd/MM/yyyy')}</Text>
            <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textSecondary }}>
              বিক্রয়: <Text style={{ color: COLORS.sale, fontWeight: '700' }}>৳{formatCurrency(todaySales)}</Text>{'  '}
              ক্রয়: <Text style={{ color: COLORS.purchase, fontWeight: '700' }}>৳{formatCurrency(todayPurchases)}</Text>{'  '}
              লাভ: <Text style={{ color: COLORS.primary, fontWeight: '700' }}>৳{formatCurrency(todaySales - todayPurchases)}</Text>
            </Text>
          </View>
          <Ionicons name="checkmark-circle-outline" size={22} color={COLORS.primary} />
        </TouchableOpacity>

        {pendingSync.length > 0 && (
          <TouchableOpacity style={styles.syncBanner} onPress={() => transactionService.syncPending()}>
            <Ionicons name="cloud-upload-outline" size={18} color={COLORS.surface} />
            <Text style={{ color: COLORS.surface, fontSize: FONT_SIZES.sm, fontWeight: '600' }}>{pendingSync.length} টি এন্ট্রি আপলোড বাকি</Text>
          </TouchableOpacity>
        )}

        <Section title="ব্যবহারকারী">
          <Row icon="person-add-outline" label="নতুন ব্যবহারকারী" sub="সর্বোচ্চ ৩ জন" onPress={() => setAddUserModal(true)} />
          <Row icon="log-out-outline" label="লগ আউট" onPress={handleLogout} destructive />
        </Section>

        <Section title="অ্যাপ সেটিংস">
          <View style={styles.settingRow}>
            <View style={[styles.settingIcon, { backgroundColor: COLORS.surfaceSecondary }]}><Ionicons name="mic-outline" size={18} color={COLORS.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>ভয়েস নিশ্চিতকরণ</Text>
              <Text style={styles.rowSub}>এন্ট্রির পর AI পড়ে শোনায়</Text>
            </View>
            <Switch value={voiceFeedback} onValueChange={setVoiceFeedback} trackColor={{ true: COLORS.primary }} />
          </View>
        </Section>

        <Section title="ডেটা">
          <Row icon="cloud-upload-outline" label="ক্লাউড সিঙ্ক" sub="অফলাইন ডেটা আপলোড" onPress={() => transactionService.syncPending().then(() => Alert.alert('সম্পন্ন', 'সিঙ্ক হয়েছে ✓'))} />
        </Section>

        <Section title="দোকান তথ্য">
          {[['দোকানের নাম', shop?.name ?? ''], ['মালিক', shop?.owner_name ?? ''], ['ফোন', shop?.phone ?? '']].map(([label, value]) => (
            <View key={label} style={[styles.settingRow, { justifyContent: 'space-between' }]}>
              <Text style={styles.rowSub}>{label}</Text>
              <Text style={styles.rowLabel}>{value}</Text>
            </View>
          ))}
        </Section>

        <Text style={{ textAlign: 'center', fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 24 }}>দোকান AI v1.0.0</Text>
      </ScrollView>

      <AddUserModal visible={addUserModal} onClose={() => setAddUserModal(false)} />
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function Row({ icon, label, sub, onPress, destructive }: any) {
  return (
    <TouchableOpacity style={styles.settingRow} onPress={onPress}>
      <View style={[styles.settingIcon, destructive && { backgroundColor: '#FFF0F0' }]}>
        <Ionicons name={icon} size={18} color={destructive ? COLORS.error : COLORS.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, destructive && { color: COLORS.error }]}>{label}</Text>
        {sub && <Text style={styles.rowSub}>{sub}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
    </TouchableOpacity>
  );
}

function AddUserModal({ visible, onClose }: any) {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || pin.length !== 4) { Alert.alert('সতর্কতা', 'নাম এবং ৪ সংখ্যার PIN দিন'); return; }
    setSaving(true);
    try {
      await authService.addHelper({ name, pin });
      Alert.alert('সম্পন্ন', `${name} যোগ হয়েছে ✓`);
      setName(''); setPin(''); onClose();
    } catch (e: any) { Alert.alert('ত্রুটি', e.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={COLORS.text} /></TouchableOpacity>
          <Text style={{ fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.text }}>নতুন ব্যবহারকারী</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color={COLORS.primary} size="small" /> : <Text style={{ color: COLORS.primary, fontWeight: '700' }}>যোগ করুন</Text>}
          </TouchableOpacity>
        </View>
        <View style={{ padding: 20, gap: 16 }}>
          {[{ label: 'নাম *', value: name, set: setName, placeholder: 'কর্মচারীর নাম' }, { label: '৪ সংখ্যার PIN *', value: pin, set: setPin, placeholder: '৪ সংখ্যা', secure: true, numeric: true }].map((f, i) => (
            <View key={i} style={{ gap: 6 }}>
              <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.text }}>{f.label}</Text>
              <TextInput style={styles.modalInput} value={f.value} onChangeText={f.set} placeholder={f.placeholder} placeholderTextColor={COLORS.textMuted} secureTextEntry={f.secure} keyboardType={f.numeric ? 'numeric' : 'default'} maxLength={f.numeric ? 4 : undefined} />
            </View>
          ))}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { backgroundColor: COLORS.primary, alignItems: 'center', padding: 28, gap: 6 },
  shopIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  shopName: { fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.surface, textAlign: 'center' },
  ownerName: { fontSize: FONT_SIZES.sm, color: 'rgba(255,255,255,0.7)' },
  daySummaryCard: { margin: 12, backgroundColor: COLORS.surface, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 0.5, borderColor: COLORS.border },
  syncBanner: { margin: 12, marginTop: 0, backgroundColor: COLORS.warning, borderRadius: 10, flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
  section: { marginHorizontal: 12, marginTop: 16 },
  sectionTitle: { fontSize: FONT_SIZES.xs, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 6, marginLeft: 4, textTransform: 'uppercase' },
  sectionCard: { backgroundColor: COLORS.surface, borderRadius: 14, overflow: 'hidden', borderWidth: 0.5, borderColor: COLORS.border },
  settingRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.border },
  settingIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: COLORS.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.text },
  rowSub: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 0.5, borderBottomColor: COLORS.border },
  modalInput: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, height: 50, paddingHorizontal: 14, fontSize: FONT_SIZES.md, color: COLORS.text, backgroundColor: COLORS.surfaceSecondary },
});