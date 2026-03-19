import React, { useMemo, useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { GlassBackground } from '../components/GlassBackground';
import { LinearGradient } from 'expo-linear-gradient';
import StarField from '../components/StarField';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useData } from '../context/DataContext';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScalePressable } from '../components/ScalePressable';
import { Swipeable } from 'react-native-gesture-handler';
import { api } from '../services/api';

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

const PERIOD_OPTIONS = ['monthly', 'weekly', 'biweekly', 'yearly'];

function formatCurrency(amount: number): string {
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return amount < 0 ? `-$${formatted}` : `$${formatted}`;
}

export default function BudgetTransactionsScreen() {
  const router = useRouter();
  const { 
    id: budgetId, 
    budgetName, 
    edit: editParam,
    amount: amountParam,
    category: categoryParam,
    period: periodParam 
  } = useLocalSearchParams<{ 
    id: string; 
    budgetName?: string; 
    edit?: string;
    amount?: string;
    category?: string;
    period?: string;
  }>();
  
  const insets = useSafeAreaInsets();
  const { budgetTransactions, fetchBudgets } = useData();

  const isNew = budgetId === 'create' || budgetId === 'new';
  const isEditing = editParam === 'true' || isNew;

  const [formData, setFormData] = useState({
    name: budgetName || '',
    amount: amountParam || '',
    category: categoryParam || 'Food & Dining',
    period: (periodParam || 'monthly') as 'monthly' | 'weekly' | 'yearly',
  });
  const [saving, setSaving] = useState(false);
  const [catDropdown, setCatDropdown] = useState(false);

  const transactions = useMemo(() => 
    budgetId && budgetTransactions[budgetId] ? budgetTransactions[budgetId] : []
  , [budgetId, budgetTransactions]);

  const handleSave = async () => {
    if (!formData.name || !formData.amount) {
      Alert.alert('Missing Info', 'Please provide a name and amount.');
      return;
    }

    setSaving(true);
    try {
      if (isNew) {
        await api.createBudget({
          name: formData.name,
          category: formData.category,
          amount: parseFloat(formData.amount),
          period: formData.period,
        });
      } else {
        await api.updateBudget(budgetId, {
          name: formData.name,
          category: formData.category,
          amount: parseFloat(formData.amount),
          period: formData.period,
        });
      }
      await fetchBudgets(true);
      router.back();
    } catch (error) {
      Alert.alert('Error', 'Failed to save budget');
    } finally {
      setSaving(false);
    }
  };

  const renderLeftActions = () => (
    <View style={styles.swipeActionEdit}>
      <View style={styles.swipeIconWrap}>
        <Ionicons name="pencil" size={20} color="#fff" />
        <Text style={styles.swipeText}>Edit</Text>
      </View>
    </View>
  );

  const renderRightActions = () => (
    <View style={styles.swipeActionDelete}>
      <View style={styles.swipeIconWrap}>
        <Ionicons name="trash" size={20} color="#fff" />
        <Text style={styles.swipeText}>Delete</Text>
      </View>
    </View>
  );

  const handleAction = (action: 'edit' | 'delete', txn: any) => {
    if (action === 'edit') {
      Alert.alert('Edit', 'Editing transaction: ' + txn.merchant);
    } else {
      Alert.alert('Delete', 'Are you sure you want to delete this transaction?', [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive', 
          onPress: async () => {
            Alert.alert('Delete', 'Transaction deletion for budgets is not yet implemented.');
          } 
        },
      ]);
    }
  };

  if (isEditing) {
    return (
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={styles.container}
      >
        <StarField />
        <Animated.ScrollView contentContainerStyle={[styles.formScroll, { paddingTop: insets.top + 20 }]}>
          <Animated.View entering={FadeInDown.springify()}>
            <GlassBackground
              blurIntensity={40}
              blurTint="systemChromeMaterialDark"
              style={styles.formCard}
            >
              <View style={styles.formHeader}>
                <Text style={styles.formTitle}>{isNew ? 'New Budget' : 'Edit Budget'}</Text>
                <ScalePressable onPress={() => router.back()}>
                  <Ionicons name="close" size={24} color={Colors.textMuted} />
                </ScalePressable>
              </View>

              <Text style={styles.label}>Budget Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Groceries"
                placeholderTextColor={Colors.textMuted}
                value={formData.name}
                onChangeText={(t) => setFormData({ ...formData, name: t })}
              />

              <View style={styles.dropdownWrap}>
                <Text style={styles.label}>Category</Text>
                <ScalePressable 
                  style={styles.dropdownBtn}
                  onPress={() => setCatDropdown(!catDropdown)}
                >
                  <Text style={styles.dropdownBtnText}>{formData.category}</Text>
                  <Ionicons name={catDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textMuted} />
                </ScalePressable>
                
                {catDropdown && (
                  <View style={styles.catList}>
                    {CATEGORIES.map(cat => (
                      <ScalePressable 
                        key={cat} 
                        style={styles.catItem}
                        onPress={() => {
                          setFormData({ ...formData, category: cat });
                          setCatDropdown(false);
                        }}
                      >
                        <Text style={styles.catText}>{cat}</Text>
                        {formData.category === cat && <Ionicons name="checkmark" size={16} color={Colors.accentBlueBright} />}
                      </ScalePressable>
                    ))}
                  </View>
                )}
              </View>

              <Text style={styles.label}>Amount ($)</Text>
              <TextInput
                style={styles.input}
                placeholder="0.00"
                placeholderTextColor={Colors.textMuted}
                keyboardType="decimal-pad"
                value={formData.amount}
                onChangeText={(t) => setFormData({ ...formData, amount: t })}
              />

              <Text style={styles.label}>Period</Text>
              <View style={styles.periodRow}>
                {PERIOD_OPTIONS.map(p => (
                  <ScalePressable
                    key={p}
                    style={[styles.periodTab, formData.period === p && styles.periodTabActive]}
                    onPress={() => setFormData({ ...formData, period: p as any })}
                  >
                    <Text style={[styles.periodTabText, formData.period === p && styles.periodTabTextActive]}>
                      {p}
                    </Text>
                  </ScalePressable>
                ))}
              </View>

              <ScalePressable
                onPress={handleSave}
                disabled={saving}
                style={styles.saveBtn}
              >
                <LinearGradient colors={[Colors.accentBlueBright, Colors.accentBlue]} style={styles.saveBtnGradient}>
                  {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
                </LinearGradient>
              </ScalePressable>
            </GlassBackground>
          </Animated.View>
        </Animated.ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.container}>
      <StarField />

      <Animated.View entering={FadeInDown.delay(100).springify()}>
        <GlassBackground
          blurIntensity={38}
          blurTint="systemChromeMaterialDark"
          style={[styles.header, { marginTop: insets.top + 8 }]}
          tintColor="rgba(0, 0, 0, 0.4)"
          tintOpacity={0.6}
        >
          <View style={styles.headerTopRow}>
            <View style={styles.headerTitleWrap}>
              <Text style={styles.headerTitle}>{budgetName || 'Budget'}</Text>
              <Text style={styles.headerProvider}>Transactions</Text>
            </View>
            <View style={styles.headerActions}>
              <View style={styles.headerCountPill}>
                <Text style={styles.headerCount}>
                  {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
                </Text>
              </View>
              <ScalePressable
                onPress={() => router.back()}
                style={styles.closeBtn}
              >
                <Ionicons name="close" size={20} color={Colors.textPrimary} />
              </ScalePressable>
            </View>
          </View>
        </GlassBackground>
      </Animated.View>

      {transactions.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No transactions found</Text>
          <Text style={styles.emptySubtext}>This budget has no matching transactions yet.</Text>
        </View>
      ) : (
        <Animated.FlatList
          data={transactions}
          keyExtractor={(item) => String(item.id)}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 80 }]}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(200 + index * 50).springify()}>
              <Swipeable 
                renderLeftActions={renderLeftActions}
                renderRightActions={renderRightActions}
                onSwipeableOpen={(direction) => handleAction(direction === 'left' ? 'edit' : 'delete', item)}
              >
                <GlassBackground
                  blurIntensity={38}
                  blurTint="systemChromeMaterialDark"
                  style={styles.txnCard}
                  tintColor="rgba(0, 0, 0, 0.4)"
                  tintOpacity={0.6}
                >
                  <View
                    style={[
                      styles.categoryDot,
                      { backgroundColor: Number(item.amount) < 0 ? Colors.negative : Colors.positive },
                    ]}
                  />
                  <View style={styles.txnInfo}>
                    <Text style={styles.txnMerchant} numberOfLines={1}>{item.merchant || 'Unknown'}</Text>
                    <Text style={styles.txnDate}>
                      {new Date(
                        typeof item.txn_date === 'string' ? item.txn_date : item.txn_date * 1000
                      ).toLocaleDateString()}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.txnAmount,
                      { color: Number(item.amount) < 0 ? Colors.negative : Colors.positive },
                    ]}
                  >
                    {formatCurrency(Number(item.amount) || 0)}
                  </Text>
                </GlassBackground>
              </Swipeable>
            </Animated.View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  header: {
    marginHorizontal: 16,
    marginTop: 36,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(10,10,12,0.38)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.42,
    shadowRadius: 20,
    elevation: 8,
    zIndex: 10,
    overflow: 'hidden',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    ...Typography.title3,
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  headerProvider: {
    ...Typography.caption1,
    color: Colors.textSecondary,
    marginTop: 3,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerCountPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  headerCount: {
    ...Typography.caption2,
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 100,
  },
  txnCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.navGlassBackground,
    padding: 16,
    borderRadius: 24,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.25)', // Red glow border
    shadowColor: '#DC2626', // Red glow shadow
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
    overflow: 'hidden',
  },
  categoryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 14,
  },
  txnInfo: {
    flex: 1,
  },
  txnMerchant: {
    ...Typography.subhead,
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  txnDate: {
    ...Typography.caption2,
    color: Colors.textMuted,
    marginTop: 4,
  },
  txnAmount: {
    ...Typography.headline,
    fontSize: 15,
    marginLeft: 8,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 30,
  },
  emptyText: {
    ...Typography.headline,
    color: Colors.textSecondary,
    marginTop: 16,
  },
  emptySubtext: {
    ...Typography.footnote,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
  },
  // Form Styles
  formScroll: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  formCard: {
    borderRadius: 28,
    padding: 24,
    borderWidth: 1,
    borderColor: Colors.navGlassBorder,
    backgroundColor: Colors.navGlassBackground,
  },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  formTitle: {
    ...Typography.title3,
    color: Colors.textPrimary,
  },
  label: {
    ...Typography.caption1,
    color: Colors.textMuted,
    marginBottom: 8,
    marginLeft: 4,
  },
  input: {
    ...Typography.body,
    color: Colors.textPrimary,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 18,
  },
  dropdownWrap: {
    marginBottom: 18,
    position: 'relative',
    zIndex: 10,
  },
  dropdownBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dropdownBtnText: {
    ...Typography.body,
    color: Colors.textPrimary,
  },
  catList: {
    marginTop: 6,
    borderRadius: 14,
    maxHeight: 250,
    overflow: 'hidden',
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  catItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  catText: {
    ...Typography.body,
    color: Colors.textPrimary,
  },
  periodRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 28,
  },
  periodTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(10,10,12,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  periodTabActive: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: Colors.accentBlueBright,
  },
  periodTabText: {
    ...Typography.caption1,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  periodTabTextActive: {
    color: Colors.accentBlueBright,
  },
  saveBtn: {
    marginTop: 8,
  },
  saveBtnGradient: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    ...Typography.subhead,
    color: '#fff',
    fontWeight: '700',
  },
  swipeActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    width: 90,
    marginBottom: 12,
  },
  verifyBtn: {
    backgroundColor: Colors.positive,
    width: 80,
    height: '100%',
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  swipeActionText: {
    ...Typography.caption2,
    color: '#fff',
    marginTop: 4,
    fontWeight: '700',
  },
  swipeActionEdit: {
    backgroundColor: Colors.accentBlue,
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
    borderRadius: 24,
    marginBottom: 12,
  },
  swipeActionDelete: {
    backgroundColor: Colors.negative,
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
    borderRadius: 24,
    marginBottom: 12,
  },
  swipeIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  swipeText: {
    ...Typography.caption2,
    color: '#fff',
    fontWeight: '700',
  },
});