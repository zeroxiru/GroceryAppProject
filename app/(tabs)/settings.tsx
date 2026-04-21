import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, TextInput, Modal, ActivityIndicator, Switch, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { format } from 'date-fns';
import { authService } from '@/services/supabase/authService';
import { transactionService } from '@/services/supabase/transactionService';
import { staffApi } from '@/services/api/staffApi';
import { shopApi, ShopSettings } from '@/services/api/shopApi';
import { useAuthStore, useTransactionStore } from '@/store';
import { User, ShopType } from '@/types';
import { COLORS, FONT_SIZES } from '@/constants';
import { formatCurrency } from '@/utils';

export default function SettingsScreen() {
  const { shop, user, logout } = useAuthStore();
  const { todayTransactions, pendingBills } = useTransactionStore();
  const [addUserModal, setAddUserModal] = useState(false);
  const [editShopModal, setEditShopModal] = useState(false);
  const [voiceFeedback, setVoiceFeedback] = useState(true);
  const [staffList, setStaffList] = useState<User[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);

  const isOwner = user?.role === 'owner';

  const todaySales = todayTransactions.filter(t => t.type === 'sale').reduce((s, t) => s + t.total_amount, 0);
  const todayPurchases = todayTransactions.filter(t => t.type === 'purchase').reduce((s, t) => s + t.total_amount, 0);

  const loadStaff = useCallback(async () => {
    setStaffLoading(true);
    try {
      const list = await staffApi.list();
      setStaffList(list);
    } catch (e: any) {
      console.warn('Staff load error:', e.message);
    } finally { setStaffLoading(false); }
  }, []);

  useEffect(() => { loadStaff(); }, []);

  const handleToggleStaff = (member: User) => {
    if (member.id === user?.id) {
      Alert.alert('সতর্কতা', 'নিজেকে নিষ্ক্রিয় করা যাবে না।');
      return;
    }
    const isActive = member.is_active;
    Alert.alert(
      isActive ? 'নিষ্ক্রিয় করুন' : 'সক্রিয় করুন',
      isActive
        ? `${member.name} কে নিষ্ক্রিয় করবেন? সে আর লগইন করতে পারবে না।`
        : `${member.name} কে আবার সক্রিয় করবেন?`,
      [
        { text: 'না', style: 'cancel' },
        {
          text: isActive ? 'নিষ্ক্রিয় করুন' : 'সক্রিয় করুন',
          style: isActive ? 'destructive' : 'default',
          onPress: async () => {
            try {
              if (isActive) {
                await staffApi.deactivate(member.id);
              } else {
                await staffApi.reactivate(member.id);
              }
              setStaffList(prev =>
                prev.map(s => s.id === member.id ? { ...s, is_active: !isActive } : s)
              );
            } catch (e: any) {
              Alert.alert('ত্রুটি', e.message);
            }
          },
        },
      ]
    );
  };

  const handleDayClose = () => {
    Alert.alert(
      'দিন বন্ধ করুন',
      `আজকের হিসাব:\nবিক্রয়: ৳${formatCurrency(todaySales)}\nক্রয়: ৳${formatCurrency(todayPurchases)}\nলাভ: ৳${formatCurrency(todaySales - todayPurchases)}`,
      [
        { text: 'না', style: 'cancel' },
        { text: 'সেভ করুন', onPress: async () => { await transactionService.syncPending(); Alert.alert('সম্পন্ন', 'আজকের হিসাব সেভ হয়েছে ✓'); } },
      ]
    );
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

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.shopIcon}>
            <Ionicons name="storefront" size={32} color={COLORS.surface} />
          </View>
          <Text style={styles.shopName}>{shop?.name}</Text>
          <Text style={styles.ownerName}>
            {user?.name} • {user?.role === 'owner' ? 'মালিক' : 'কর্মচারী'}
          </Text>
        </View>

        {/* Day summary */}
        <TouchableOpacity style={styles.daySummaryCard} onPress={handleDayClose}>
          <View>
            <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.text, marginBottom: 4 }}>
              আজকের সারাংশ — {format(new Date(), 'dd/MM/yyyy')}
            </Text>
            <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.textSecondary }}>
              বিক্রয়: <Text style={{ color: COLORS.sale, fontWeight: '700' }}>৳{formatCurrency(todaySales)}</Text>{'  '}
              ক্রয়: <Text style={{ color: COLORS.purchase, fontWeight: '700' }}>৳{formatCurrency(todayPurchases)}</Text>{'  '}
              লাভ: <Text style={{ color: COLORS.primary, fontWeight: '700' }}>৳{formatCurrency(todaySales - todayPurchases)}</Text>
            </Text>
          </View>
          <Ionicons name="checkmark-circle-outline" size={22} color={COLORS.primary} />
        </TouchableOpacity>

        {/* Pending sync banner */}
        {pendingBills.length > 0 && (
          <TouchableOpacity
            style={styles.syncBanner}
            onPress={() => transactionService.syncPending()}
          >
            <Ionicons name="cloud-upload-outline" size={18} color={COLORS.surface} />
            <Text style={{ color: COLORS.surface, fontSize: FONT_SIZES.sm, fontWeight: '600' }}>
              {pendingBills.length} টি বিল আপলোড বাকি — সিঙ্ক করুন
            </Text>
          </TouchableOpacity>
        )}

        {/* ── Staff Section ── */}
        <Section title="কর্মচারী ব্যবস্থাপনা">
          {staffLoading ? (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : (
            <>
              {staffList.length === 0 ? (
                <View style={{ padding: 20, alignItems: 'center', gap: 6 }}>
                  <Ionicons name="people-outline" size={32} color={COLORS.textMuted} />
                  <Text style={{ color: COLORS.textMuted, fontSize: FONT_SIZES.sm }}>
                    কোনো কর্মচারী নেই
                  </Text>
                </View>
              ) : (
                staffList.map((member, i) => (
                  <View
                    key={member.id}
                    style={[
                      styles.staffRow,
                      i < staffList.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: COLORS.border },
                      !member.is_active && { opacity: 0.5 },
                    ]}
                  >
                    {/* Avatar */}
                    <View style={[
                      styles.avatar,
                      { backgroundColor: member.role === 'owner' ? COLORS.primary : COLORS.primaryLight ?? COLORS.primary + '80' },
                    ]}>
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: FONT_SIZES.md }}>
                        {member.name[0].toUpperCase()}
                      </Text>
                    </View>

                    {/* Info */}
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.rowLabel, !member.is_active && { color: COLORS.textMuted }]}>
                          {member.name}
                        </Text>
                        {member.id === user?.id && (
                          <View style={{ backgroundColor: COLORS.primary + '20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                            <Text style={{ fontSize: 10, color: COLORS.primary, fontWeight: '700' }}>আপনি</Text>
                          </View>
                        )}
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                        <View style={[
                          styles.roleBadge,
                          member.role === 'owner' && { backgroundColor: COLORS.primary + '15', borderColor: COLORS.primary },
                        ]}>
                          <Text style={[
                            styles.roleBadgeTxt,
                            member.role === 'owner' && { color: COLORS.primary },
                          ]}>
                            {member.role === 'owner' ? 'মালিক' : 'কর্মচারী'}
                          </Text>
                        </View>
                        <View style={[
                          styles.statusBadge,
                          member.is_active
                            ? { backgroundColor: '#DCFCE7', borderColor: '#86EFAC' }
                            : { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
                        ]}>
                          <View style={[
                            { width: 6, height: 6, borderRadius: 3 },
                            { backgroundColor: member.is_active ? COLORS.sale : COLORS.error },
                          ]} />
                          <Text style={{ fontSize: 10, fontWeight: '600', color: member.is_active ? COLORS.sale : COLORS.error }}>
                            {member.is_active ? 'সক্রিয়' : 'নিষ্ক্রিয়'}
                          </Text>
                        </View>
                        {member.phone && (
                          <Text style={{ fontSize: 10, color: COLORS.textMuted }}>{member.phone}</Text>
                        )}
                      </View>
                    </View>

                    {/* Toggle (owner only, not self) */}
                    {isOwner && member.id !== user?.id && (
                      <TouchableOpacity
                        style={[
                          styles.toggleBtn,
                          member.is_active
                            ? { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }
                            : { backgroundColor: '#F0FFF4', borderColor: '#86EFAC' },
                        ]}
                        onPress={() => handleToggleStaff(member)}
                      >
                        <Ionicons
                          name={member.is_active ? 'pause-circle-outline' : 'play-circle-outline'}
                          size={16}
                          color={member.is_active ? COLORS.error : COLORS.sale}
                        />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: member.is_active ? COLORS.error : COLORS.sale }}>
                          {member.is_active ? 'নিষ্ক্রিয়' : 'সক্রিয়'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))
              )}

              {/* Add staff button */}
              {isOwner && (
                <TouchableOpacity
                  style={[styles.staffRow, { gap: 12, borderTopWidth: staffList.length > 0 ? 0.5 : 0, borderTopColor: COLORS.border }]}
                  onPress={() => setAddUserModal(true)}
                >
                  <View style={[styles.settingIcon, { backgroundColor: COLORS.primary + '15' }]}>
                    <Ionicons name="person-add-outline" size={18} color={COLORS.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowLabel, { color: COLORS.primary }]}>নতুন কর্মচারী যোগ করুন</Text>
                    <Text style={styles.rowSub}>PIN সহ নতুন স্টাফ অ্যাকাউন্ট</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
                </TouchableOpacity>
              )}
            </>
          )}
        </Section>

        {/* ── App Settings ── */}
        <Section title="অ্যাপ সেটিংস">
          <View style={styles.settingRow}>
            <View style={[styles.settingIcon, { backgroundColor: COLORS.surfaceSecondary }]}>
              <Ionicons name="mic-outline" size={18} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>ভয়েস নিশ্চিতকরণ</Text>
              <Text style={styles.rowSub}>এন্ট্রির পর AI পড়ে শোনায়</Text>
            </View>
            <Switch value={voiceFeedback} onValueChange={setVoiceFeedback} trackColor={{ true: COLORS.primary }} />
          </View>
        </Section>

        {/* ── Data ── */}
        <Section title="ডেটা">
          <Row
            icon="cloud-upload-outline"
            label="ক্লাউড সিঙ্ক"
            sub="অফলাইন ডেটা আপলোড"
            onPress={() => transactionService.syncPending().then(() => Alert.alert('সম্পন্ন', 'সিঙ্ক হয়েছে ✓'))}
          />
          <Row icon="log-out-outline" label="লগ আউট" onPress={handleLogout} destructive />
        </Section>

        {/* ── Shop Info ── */}
        <Section title="দোকান তথ্য">
          {([
            ['দোকানের নাম', shop?.name ?? ''],
            ['মালিক', shop?.owner_name ?? ''],
            ['ফোন', shop?.phone ?? ''],
            ['ঠিকানা', shop?.address ?? '—'],
            ['ধরন', shop?.shop_type ?? ''],
          ] as [string, string][]).map(([label, value]) => (
            <View key={label} style={[styles.settingRow, { justifyContent: 'space-between' }]}>
              <Text style={styles.rowSub}>{label}</Text>
              <Text style={[styles.rowLabel, { maxWidth: '60%', textAlign: 'right' }]}>{value}</Text>
            </View>
          ))}
          {isOwner && (
            <TouchableOpacity
              style={[styles.settingRow, { gap: 12, borderTopWidth: 0.5, borderTopColor: COLORS.border }]}
              onPress={() => setEditShopModal(true)}
            >
              <View style={[styles.settingIcon, { backgroundColor: COLORS.primary + '15' }]}>
                <Ionicons name="pencil-outline" size={18} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: COLORS.primary }]}>দোকানের তথ্য আপডেট করুন</Text>
                <Text style={styles.rowSub}>নাম, ঠিকানা, ধরন পরিবর্তন</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
            </TouchableOpacity>
          )}
        </Section>

        <Text style={{ textAlign: 'center', fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 24 }}>
          দোকান AI v1.0.0
        </Text>
      </ScrollView>

      <AddUserModal
        visible={addUserModal}
        onClose={() => setAddUserModal(false)}
        onSaved={() => { setAddUserModal(false); loadStaff(); }}
      />
      <EditShopModal
        visible={editShopModal}
        shop={shop}
        onClose={() => setEditShopModal(false)}
        onSaved={(updated) => {
          useAuthStore.getState().setShop(updated);
          setEditShopModal(false);
        }}
      />
    </SafeAreaView>
  );
}

// ── Section wrapper ──
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

// ── Generic row ──
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

// ── Add User Modal ──
function AddUserModal({ visible, onClose, onSaved }: any) {
  const [name, setName]   = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin]     = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) { setName(''); setPhone(''); setPin(''); }
  }, [visible]);

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('সতর্কতা', 'নাম দিন'); return; }
    if (pin.length !== 4) { Alert.alert('সতর্কতা', '৪ সংখ্যার PIN দিন'); return; }
    setSaving(true);
    try {
      await authService.addHelper({ name: name.trim(), phone: phone.trim() || undefined, pin });
      Alert.alert('সম্পন্ন', `${name.trim()} যোগ হয়েছে ✓`);
      onSaved();
    } catch (e: any) {
      Alert.alert('ত্রুটি', e.message);
    } finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={{ fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.text }}>
            নতুন কর্মচারী
          </Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            {saving
              ? <ActivityIndicator color={COLORS.primary} size="small" />
              : <Text style={{ color: COLORS.primary, fontWeight: '700', fontSize: FONT_SIZES.md }}>যোগ করুন</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>নাম *</Text>
            <TextInput
              style={styles.modalInput}
              value={name}
              onChangeText={setName}
              placeholder="কর্মচারীর নাম"
              placeholderTextColor={COLORS.textMuted}
              autoFocus
            />
          </View>

          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>মোবাইল নম্বর (ঐচ্ছিক)</Text>
            <TextInput
              style={styles.modalInput}
              value={phone}
              onChangeText={setPhone}
              placeholder="01XXXXXXXXX"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="phone-pad"
              maxLength={11}
            />
          </View>

          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>৪ সংখ্যার PIN *</Text>
            <TextInput
              style={styles.modalInput}
              value={pin}
              onChangeText={setPin}
              placeholder="••••"
              placeholderTextColor={COLORS.textMuted}
              secureTextEntry
              keyboardType="numeric"
              maxLength={4}
            />
          </View>

          <View style={{ backgroundColor: '#EFF6FF', borderRadius: 10, padding: 12, gap: 4 }}>
            <Text style={{ fontSize: FONT_SIZES.xs, fontWeight: '700', color: '#1E40AF' }}>নোট</Text>
            <Text style={{ fontSize: FONT_SIZES.xs, color: '#1E40AF' }}>
              কর্মচারী লগইন স্ক্রীনে তার নাম দেখতে পাবে এবং PIN দিয়ে প্রবেশ করতে পারবে।
              মালিক যেকোনো সময় নিষ্ক্রিয় করতে পারবেন।
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Edit Shop Modal ──
const SHOP_TYPE_OPTIONS: { type: ShopType; label: string; icon: string }[] = [
  { type: 'grocery',   label: 'কিরানা দোকান',    icon: '🛒' },
  { type: 'cosmetics', label: 'প্রসাধনী',         icon: '💄' },
  { type: 'imported',  label: 'বিদেশী পণ্য',      icon: '🌍' },
  { type: 'mixed',     label: 'মিশ্র দোকান',      icon: '🏪' },
];

function EditShopModal({ visible, shop, onClose, onSaved }: {
  visible: boolean;
  shop: any;
  onClose: () => void;
  onSaved: (updated: any) => void;
}) {
  const [name, setName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [address, setAddress] = useState('');
  const [shopType, setShopType] = useState<ShopType>('grocery');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible && shop) {
      setName(shop.name ?? '');
      setOwnerName(shop.owner_name ?? '');
      setAddress(shop.address ?? '');
      setShopType(shop.shop_type ?? 'grocery');
    }
  }, [visible, shop]);

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('সতর্কতা', 'দোকানের নাম দিন'); return; }
    setSaving(true);
    try {
      const updated = await shopApi.update({
        name: name.trim(),
        owner_name: ownerName.trim() || undefined,
        address: address.trim() || undefined,
        shop_type: shopType,
      });
      Alert.alert('সম্পন্ন', 'দোকানের তথ্য আপডেট হয়েছে ✓');
      onSaved(updated);
    } catch (e: any) {
      Alert.alert('ত্রুটি', e.message ?? 'আপডেট করা যায়নি');
    } finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={{ fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.text }}>
            দোকানের তথ্য
          </Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            {saving
              ? <ActivityIndicator color={COLORS.primary} size="small" />
              : <Text style={{ color: COLORS.primary, fontWeight: '700', fontSize: FONT_SIZES.md }}>সেভ</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>

          {[
            { label: 'দোকানের নাম *', value: name, set: setName, placeholder: 'বিক্রমপুর গ্রোসারী' },
            { label: 'মালিকের নাম', value: ownerName, set: setOwnerName, placeholder: 'আপনার নাম' },
            { label: 'ঠিকানা', value: address, set: setAddress, placeholder: 'দোকানের ঠিকানা' },
          ].map((f, i) => (
            <View key={i} style={{ gap: 6 }}>
              <Text style={styles.fieldLabel}>{f.label}</Text>
              <TextInput
                style={styles.modalInput}
                value={f.value}
                onChangeText={f.set}
                placeholder={f.placeholder}
                placeholderTextColor={COLORS.textMuted}
              />
            </View>
          ))}

          <View style={{ gap: 8 }}>
            <Text style={styles.fieldLabel}>দোকানের ধরন</Text>
            {SHOP_TYPE_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.type}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  borderWidth: 1.5, borderRadius: 12, padding: 14,
                  borderColor: shopType === opt.type ? COLORS.primary : COLORS.border,
                  backgroundColor: shopType === opt.type ? COLORS.primary + '10' : COLORS.surfaceSecondary,
                }}
                onPress={() => setShopType(opt.type)}
              >
                <Text style={{ fontSize: 22 }}>{opt.icon}</Text>
                <Text style={{
                  flex: 1, fontSize: FONT_SIZES.sm, fontWeight: '600',
                  color: shopType === opt.type ? COLORS.primary : COLORS.text,
                }}>
                  {opt.label}
                </Text>
                {shopType === opt.type && (
                  <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ backgroundColor: '#FEF3C7', borderRadius: 10, padding: 12, gap: 4 }}>
            <Text style={{ fontSize: FONT_SIZES.xs, fontWeight: '700', color: '#92400E' }}>নোট</Text>
            <Text style={{ fontSize: FONT_SIZES.xs, color: '#92400E' }}>
              ফোন নম্বর পরিবর্তন করতে সহায়তা টিমের সাথে যোগাযোগ করুন।
            </Text>
          </View>

        </ScrollView>
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
  syncBanner: { margin: 12, marginTop: 0, backgroundColor: COLORS.warning ?? '#F59E0B', borderRadius: 10, flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
  section: { marginHorizontal: 12, marginTop: 16 },
  sectionTitle: { fontSize: FONT_SIZES.xs, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 6, marginLeft: 4, textTransform: 'uppercase' },
  sectionCard: { backgroundColor: COLORS.surface, borderRadius: 14, overflow: 'hidden', borderWidth: 0.5, borderColor: COLORS.border },
  settingRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.border },
  staffRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  settingIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: COLORS.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  roleBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surfaceSecondary },
  roleBadgeTxt: { fontSize: 10, fontWeight: '600', color: COLORS.textSecondary },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  toggleBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  rowLabel: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.text },
  rowSub: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 0.5, borderBottomColor: COLORS.border },
  modalInput: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, height: 50, paddingHorizontal: 14, fontSize: FONT_SIZES.md, color: COLORS.text, backgroundColor: COLORS.surfaceSecondary },
  fieldLabel: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.text },
});
