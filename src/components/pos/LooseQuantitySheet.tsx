import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Product } from '@/types';
import { POS } from '@/constants/posTokens';
import { FONT_SIZES } from '@/constants';
import { formatPricePerKg, formatWeight } from '@/utils/looseUnits';

interface Props {
  product: Product | null;
  /** Grams already in this customer's bill for the product (editing), or 0 when adding. */
  currentGrams: number;
  onClose: () => void;
  /** grams = quantity, unitPrice = price per gram, total = what the customer pays. */
  onConfirm: (grams: number, unitPrice: number, total: number) => void;
}

type Mode = 'weight' | 'price';

const WEIGHT_CHIPS = [100, 250, 500, 1000];
const PRICE_CHIPS = [20, 50, 100, 200];

/**
 * Sale dialog for loose items (design ref: SaleWithAmount&Price 1/2). The customer either says
 * "half a kilo" (ওজন দিয়ে) or "give me ৳50 worth" (টাকা দিয়ে). Either way the bill line is stored
 * in GRAMS at the per-gram price, exactly like web-pos, so stock is deducted in grams.
 */
export default function LooseQuantitySheet({ product, currentGrams, onClose, onConfirm }: Props) {
  const [mode, setMode] = useState<Mode>('weight');
  const [text, setText] = useState('');

  useEffect(() => {
    if (!product) return;
    setMode('weight');
    setText(currentGrams > 0 ? String(Math.round(currentGrams)) : '');
  }, [product, currentGrams]);

  const perGram = Number(product?.sale_price ?? 0);
  const stock = Number(product?.current_stock ?? 0);
  const typed = parseFloat(text.replace(',', '.'));
  const valid = !isNaN(typed) && typed > 0;

  const calc = useMemo(() => {
    if (!product || !valid || perGram <= 0) return null;
    if (mode === 'weight') {
      const grams = Math.round(typed);
      if (grams <= 0) return null;
      // Whole-taka bill: 500 g at ৳0.065/g = ৳32.5 is rounded to ৳33. unit price is total/grams so the server agrees.
      const total = Math.max(1, Math.round(grams * perGram));
      return { grams, total, unitPrice: total / grams };
    }
    // Amount mode: the customer's money is exact; grams are derived and rounded, and the unit
    // price is adjusted so quantity × price is exactly the money handed over.
    const money = Math.round(typed);
    const grams = Math.round(money / perGram);
    if (money <= 0 || grams <= 0) return null;
    return { grams, total: money, unitPrice: money / grams };
  }, [product, valid, typed, mode, perGram]);

  const overStock = !!calc && stock > 0 && calc.grams > stock;
  // Loose stock is deducted by the server exactly as sent, so a loose row NOT stored in grams would be
  // over-deducted (500 g taken off 25 kg). Refuse to sell it until the row is fixed.
  const wrongUnit = !!product && product.unit !== 'gram';
  const canConfirm = !!calc && !overStock && !wrongUnit;

  if (!product) return null;
  const name = product.name_bangla || product.name_english || 'পণ্য';
  const stockKnown = stock > 0;
  const min = Number(product.min_stock_alert ?? 0);
  const low = stockKnown && min > 0 && stock <= min;
  const chips = mode === 'weight' ? WEIGHT_CHIPS : PRICE_CHIPS;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={2}>{name}</Text>
              {!!product.name_english && !!product.name_bangla && <Text style={styles.sub} numberOfLines={1}>{product.name_english}</Text>}
              <View style={styles.metaRow}>
                <Text style={styles.price}>{formatPricePerKg(perGram)}</Text>
                <View style={[styles.stockPill, { backgroundColor: !stockKnown ? POS.surface200 : low ? POS.warning100 : POS.brand100 }]}>
                  <Text style={[styles.stockTxt, { color: !stockKnown ? POS.ink600 : low ? POS.warning600 : POS.brand600 }]}>
                    {stockKnown ? `স্টক: ${formatWeight(stock)}` : 'স্টক নেই'}
                  </Text>
                </View>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={POS.ink600} />
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            <View style={styles.toggle}>
              {([['weight', 'scale-outline', 'ওজন দিয়ে'], ['price', 'pricetag-outline', 'টাকা দিয়ে']] as const).map(([m, icon, label]) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.toggleBtn, mode === m && styles.toggleBtnOn]}
                  onPress={() => { setMode(m); setText(''); }}
                  activeOpacity={0.8}
                >
                  <Ionicons name={icon} size={16} color={mode === m ? POS.brand600 : POS.ink600} />
                  <Text style={[styles.toggleTxt, mode === m && { color: POS.brand600 }]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>{mode === 'weight' ? 'পরিমাণ (গ্রাম)' : 'টাকার পরিমাণ (৳)'}</Text>
            <View style={styles.inputBox}>
              <TextInput
                style={styles.input}
                value={text}
                onChangeText={setText}
                keyboardType="decimal-pad"
                autoFocus
                selectTextOnFocus
                placeholder={mode === 'weight' ? 'যেমন: 500' : 'যেমন: 50'}
                placeholderTextColor={POS.ink400}
              />
              <Text style={styles.unitTxt}>{mode === 'weight' ? 'গ্রাম' : '৳'}</Text>
            </View>

            <View style={styles.chipRow}>
              {chips.map(c => (
                <TouchableOpacity key={c} style={styles.chip} onPress={() => setText(String(c))} activeOpacity={0.7}>
                  <Text style={styles.chipTxt}>{mode === 'weight' ? formatWeight(c) : `৳${c}`}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={[styles.summary, (overStock || wrongUnit) && { backgroundColor: POS.danger100 }]}>
              {wrongUnit ? (
                <Text style={[styles.summaryTxt, { color: POS.danger600, textAlign: 'center', paddingHorizontal: 12 }]}>এই পণ্যের একক গ্রাম নয় — ডাটা ঠিক করা দরকার</Text>
              ) : overStock ? (
                <Text style={[styles.summaryTxt, { color: POS.danger600 }]}>স্টকে আছে মাত্র {formatWeight(stock)}</Text>
              ) : calc ? (
                <Text style={styles.summaryTxt}>
                  {mode === 'weight' ? `${formatWeight(calc.grams)} = ৳${calc.total}` : `৳${calc.total} = ${formatWeight(calc.grams)}`}
                </Text>
              ) : (
                <Text style={[styles.summaryTxt, { color: POS.ink400 }]}>
                  {perGram <= 0 ? 'এই পণ্যের দাম দেওয়া নেই' : mode === 'weight' ? 'কত গ্রাম দিতে হবে লিখুন' : 'কত টাকার দিতে হবে লিখুন'}
                </Text>
              )}
            </View>

            <TouchableOpacity
              style={[styles.confirm, !canConfirm && { opacity: 0.4 }]}
              disabled={!canConfirm}
              onPress={() => calc && onConfirm(calc.grams, calc.unitPrice, calc.total)}
              activeOpacity={0.85}
            >
              <Text style={styles.confirmTxt}>{currentGrams > 0 ? 'আপডেট করুন' : 'বিলে যোগ করুন'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  card: { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 18, backgroundColor: POS.surface200, borderBottomWidth: 1, borderBottomColor: POS.border200 },
  title: { fontSize: FONT_SIZES.lg, fontWeight: '800', color: POS.ink900 },
  sub: { fontSize: FONT_SIZES.sm, color: POS.ink600, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' },
  price: { fontSize: FONT_SIZES.md, fontWeight: '800', color: POS.ink900 },
  stockPill: { paddingHorizontal: 10, paddingVertical: 2, borderRadius: 999 },
  stockTxt: { fontSize: 12, fontWeight: '700' },
  body: { padding: 18, gap: 12 },
  toggle: { flexDirection: 'row', backgroundColor: POS.surface200, borderRadius: 14, padding: 4, gap: 4 },
  toggleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 11 },
  toggleBtnOn: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, elevation: 2 },
  toggleTxt: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: POS.ink600 },
  label: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: POS.ink900, marginTop: 2 },
  inputBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderColor: POS.ink900, borderRadius: 14, paddingHorizontal: 14 },
  input: { flex: 1, fontSize: 26, fontWeight: '700', color: POS.ink900, paddingVertical: 12, fontVariant: ['tabular-nums'] },
  unitTxt: { fontSize: FONT_SIZES.md, fontWeight: '600', color: POS.ink600 },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 999, backgroundColor: POS.surface200, borderWidth: 1, borderColor: POS.border200 },
  chipTxt: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: POS.ink900 },
  summary: { alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: POS.surface200 },
  summaryTxt: { fontSize: FONT_SIZES.md, fontWeight: '800', color: POS.ink900 },
  confirm: { backgroundColor: POS.brand600, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginBottom: 6 },
  confirmTxt: { color: '#fff', fontSize: FONT_SIZES.md, fontWeight: '800' },
});
