import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassBackground } from './GlassBackground';
import { ScalePressable } from './ScalePressable';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';
import { Budget } from '../services/api';

interface BudgetFormModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (data: BudgetData) => Promise<void>;
  initialData?: Budget;
  isSaving?: boolean;
}

export interface BudgetData {
  name: string;
  amount: number;
  category: string;
  period: string;
}

const CATEGORIES = [
  'Food & Dining',
  'Shopping',
  'Housing',
  'Transportation',
  'Health & Fitness',
  'Entertainment',
  'Personal Care',
  'Education',
  'Gifts & Donations',
  'Fees & Charges',
  'Business Services',
  'Taxes',
  'Investment',
];

const PERIOD_OPTIONS = ['daily', 'weekly', 'biweekly', 'monthly', 'yearly'];

export function BudgetFormModal({
  visible,
  onClose,
  onSave,
  initialData,
  isSaving = false,
}: BudgetFormModalProps) {
  const [name, setName] = useState(initialData?.name || '');
  const [amount, setAmount] = useState(initialData?.amount?.toString() || '');
  const [category, setCategory] = useState(initialData?.category || 'Food & Dining');
  const [period, setPeriod] = useState(initialData?.period || 'monthly');
  const [catDropdown, setCatDropdown] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(initialData?.name || '');
      setAmount(initialData?.amount?.toString() || '');
      setCategory(initialData?.category || 'Food & Dining');
      setPeriod(initialData?.period || 'monthly');
      setCatDropdown(false);
    }
  }, [visible, initialData]);

  const handleSave = async () => {
    const numAmount = parseFloat(amount);
    if (!name || isNaN(numAmount)) return;
    await onSave({ name, amount: numAmount, category, period });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardWrap}
        >
          <GlassBackground
            blurIntensity={65}
            blurTint="systemChromeMaterialDark"
            style={styles.card}
            tintColor="rgba(0, 0, 0, 0.4)"
            tintOpacity={.7}
          >
            <View style={styles.header}>
              <Text style={styles.title}>{initialData ? 'Edit Budget' : 'New Budget'}</Text>
              <View style={styles.headerActions}>
                <ScalePressable onPress={onClose} disabled={isSaving} style={styles.actionBtn}>
                  <Ionicons name="close" size={24} color={isSaving ? Colors.textMuted + '55' : Colors.textMuted} />
                </ScalePressable>
                <ScalePressable
                  onPress={handleSave}
                  disabled={isSaving}
                  style={[styles.actionBtn, styles.actionBtnSpacing]}
                >
                  {isSaving ? (
                    <ActivityIndicator size="small" color={Colors.accentBlueBright} />
                  ) : (
                    <Ionicons name="checkmark" size={24} color={Colors.accentBlueBright} />
                  )}
                </ScalePressable>
              </View>

            </View>

            <ScrollView 
              showsVerticalScrollIndicator={false} 
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.scrollContent}
            >
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Groceries"
                placeholderTextColor={Colors.textMuted}
              />

              <View style={styles.dropdownSection}>
                <Text style={styles.label}>Category</Text>
                <ScalePressable
                  style={styles.dropdownBtn}
                  onPress={() => setCatDropdown(!catDropdown)}
                >
                  <Text style={styles.dropdownBtnText}>{category}</Text>
                  <Ionicons name={catDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textMuted} />
                </ScalePressable>

                {catDropdown && (
                  <ScrollView
                    style={styles.catPicker}
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={false}
                  >
                    {CATEGORIES.map((cat) => (
                      <ScalePressable
                        key={cat}
                        style={styles.catItem}
                        onPress={() => {
                          setCategory(cat);
                          setCatDropdown(false);
                        }}
                      >
                        <Text style={[styles.catText, category === cat && styles.catTextActive]}>
                          {cat}
                        </Text>
                        {category === cat && <Ionicons name="checkmark" size={16} color={Colors.accentBlueBright} />}
                      </ScalePressable>
                    ))}
                  </ScrollView>
                )}
              </View>

              <Text style={styles.label}>Amount ($)</Text>
              <TextInput
                style={styles.input}
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                placeholderTextColor={Colors.textMuted}
                keyboardType="decimal-pad"
              />

              <Text style={styles.label}>Period</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.periodRow}>
                {PERIOD_OPTIONS.map((p) => (
                  <ScalePressable
                    key={p}
                    style={[styles.periodChip, period === p && styles.periodChipActive]}
                    onPress={() => setPeriod(p)}
                  >
                    <Text style={[styles.periodChipText, period === p && styles.periodChipTextActive]}>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </Text>
                  </ScalePressable>
                ))}
              </ScrollView>
            </ScrollView>
          </GlassBackground>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyboardWrap: {
    width: '90%',
    maxWidth: 400,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxHeight: '90%',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: Colors.navGlassBorder,
    overflow: 'hidden',
    paddingTop: 24,
    paddingBottom: 28,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  headerActions: { 
    flexDirection: 'row', 
    alignItems: 'center' 
  },
  actionBtn: { 
    
  },
  actionBtnSpacing: { 
    marginLeft: 20 
  },
  title: {
    ...Typography.title3,
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  label: {
    ...Typography.caption1,
    color: Colors.textMuted,
    marginBottom: 8,
    marginLeft: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    ...Typography.body,
    color: Colors.textPrimary,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  dropdownSection: {
    marginBottom: 20,
    zIndex: 50,
  },
  dropdownBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  dropdownBtnText: {
    ...Typography.body,
    color: Colors.textPrimary,
  },
  catPicker: {
    marginTop: 8,
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    maxHeight: 200,
    borderWidth: 1,
    borderColor: Colors.navGlassBorder,
  },
  catItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  catText: {
    ...Typography.body,
    color: Colors.textSecondary,
  },
  catTextActive: {
    color: Colors.accentBlueBright,
    fontWeight: '700',
  },
  periodRow: {
    gap: 8,
    paddingBottom: 24,
  },
  periodChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  periodChipActive: {
    backgroundColor: 'rgba(248,113,113,0.22)',
    borderColor: 'rgba(248,113,113,0.62)',
  },
  periodChipText: {
    ...Typography.caption1,
    color: Colors.textSecondary,
    fontWeight: '700',
  },
  periodChipTextActive: {
    color: Colors.textPrimary,
  },
  saveBtnWrap: {
    marginTop: 8,
  },
  saveBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    ...Typography.headline,
    color: '#fff',
    fontSize: 16,
  },
});