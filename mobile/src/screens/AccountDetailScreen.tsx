import React, { useMemo, useState, useEffect } from 'react';
import {
  Alert,
  Dimensions,
  Keyboard,
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import StarField from '../components/StarField';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, Transaction, TransactionUpdate } from '../services/api';
import { useData } from '../context/DataContext';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';
import { DashboardNavigationProp, AccountDetailRouteProp } from '../types/navigation';

type DateRangeOption = 7 | 14 | 30 | 60 | 90 | 'all';

const DATE_RANGE_OPTIONS: Array<{ label: string; value: DateRangeOption }> = [
  { label: '7D', value: 7 },
  { label: '14D', value: 14 },
  { label: '30D', value: 30 },
  { label: '60D', value: 60 },
  { label: '90D', value: 90 },
  { label: 'All', value: 'all' },
];

const CATEGORY_COLORS: Record<string, string> = {
  'Food & Dining': '#EF4444',
  Transportation: '#B91C1C',
  Shopping: '#F43F5E',
  Entertainment: '#E11D48',
  Bills: '#EF4444',
  Healthcare: '#DC2626',
  Travel: '#F87171',
  Income: '#FB7185',
  Uncategorized: '#6B7280',
};

function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] || Colors.accentBlue;
}

function parseTxnDate(txnDate: unknown): Date | null {
  if (txnDate === null || txnDate === undefined) {
    return null;
  }

  if (typeof txnDate === 'number') {
    const millis = txnDate < 1_000_000_000_000 ? txnDate * 1000 : txnDate;
    const parsed = new Date(millis);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(String(txnDate));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(txnDate: any): string {
  const d = parseTxnDate(txnDate);
  if (!d) {
    return 'Unknown';
  }

  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatAmount(amount: number): string {
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return amount < 0 ? `-$${formatted}` : `$${formatted}`;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const TRANSACTION_MENU_WIDTH = 240;

export default function AccountDetailScreen({ route, navigation }: {
  route: AccountDetailRouteProp;
  navigation: DashboardNavigationProp;
}) {
  const insets = useSafeAreaInsets();
  const { accId, accType, provider } = route.params;
  const { transactionsCache, transactionsLoading, fetchTransactions } = useData();
  const [selectedRange, setSelectedRange] = useState<DateRangeOption>(30);
  const [transactionMenuTarget, setTransactionMenuTarget] = useState<Transaction | null>(null);
  const [transactionMenuPosition, setTransactionMenuPosition] = useState({ x: 0, y: 0 });
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [editMerchant, setEditMerchant] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editState, setEditState] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  const transactions = transactionsCache[accId] || [];
  const loading = transactionsLoading[accId] && transactions.length === 0;

  const filteredTransactions = useMemo(() => {
    if (selectedRange === 'all') {
      return [...transactions].sort((a, b) => {
        const left = parseTxnDate(a.txn_date)?.getTime() || 0;
        const right = parseTxnDate(b.txn_date)?.getTime() || 0;
        return right - left;
      });
    }

    const now = Date.now();
    const cutoff = now - selectedRange * 24 * 60 * 60 * 1000;

    return transactions
      .filter((txn) => {
        const txnTime = parseTxnDate(txn.txn_date)?.getTime();
        return typeof txnTime === 'number' && txnTime >= cutoff;
      })
      .sort((a, b) => {
        const left = parseTxnDate(a.txn_date)?.getTime() || 0;
        const right = parseTxnDate(b.txn_date)?.getTime() || 0;
        return right - left;
      });
  }, [transactions, selectedRange]);

  useEffect(() => {
    navigation.setOptions({
      title: accType || 'Account',
    });
    fetchTransactions(accId);
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, () => setKeyboardOpen(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardOpen(false));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const closeTransactionMenu = () => {
    setTransactionMenuTarget(null);
  };

  const openTransactionMenu = (transaction: Transaction, event: any) => {
    const pageX = event?.nativeEvent?.pageX ?? SCREEN_WIDTH / 2;
    const pageY = event?.nativeEvent?.pageY ?? SCREEN_HEIGHT / 2;
    const left = Math.min(
      Math.max(pageX - TRANSACTION_MENU_WIDTH / 2, 16),
      SCREEN_WIDTH - TRANSACTION_MENU_WIDTH - 16,
    );
    const top = Math.min(
      Math.max(pageY - 28, insets.top + 12),
      SCREEN_HEIGHT - 120,
    );

    setTransactionMenuPosition({ x: left, y: top });
    setTransactionMenuTarget(transaction);
  };

  const openEditModal = (transaction: Transaction) => {
    setTransactionMenuTarget(null);
    setEditingTransaction(transaction);
    setEditMerchant(transaction.merchant || '');
    setEditDescription(transaction.description || '');
    setEditCategory(transaction.category || '');
    setEditCity(transaction.city === 'REMOTE' ? '' : transaction.city || '');
    setEditState(transaction.state === 'REMOTE' ? '' : transaction.state || '');
  };

  const closeEditModal = () => {
    if (savingEdit) {
      return;
    }
    setEditingTransaction(null);
    setEditMerchant('');
    setEditDescription('');
    setEditCategory('');
    setEditCity('');
    setEditState('');
  };

  const saveTransactionEdit = async () => {
    if (!editingTransaction) {
      return;
    }

    const merchant = editMerchant.trim();
    const description = editDescription.trim();
    const category = editCategory.trim();
    const city = editCity.trim();
    const state = editState.trim();

    if (!merchant) {
      Alert.alert('Missing Merchant', 'Merchant name is required.');
      return;
    }

    if (!category) {
      Alert.alert('Missing Category', 'Category is required.');
      return;
    }

    const payload: TransactionUpdate = {
      merchant,
      description,
      category,
      city: city || 'REMOTE',
      state: state || 'REMOTE',
    };

    setSavingEdit(true);
    try {
      await api.updateTransaction(editingTransaction.txn_id, payload);
      await fetchTransactions(accId, true);
      closeEditModal();
    } catch (err: any) {
      Alert.alert('Update Failed', err?.message || 'Could not update this transaction.');
    } finally {
      setSavingEdit(false);
    }
  };

  const renderTransaction = ({ item }: { item: Transaction }) => {
    const catColor = getCategoryColor(item.category);
    const isNegative = item.amount < 0;

    return (
      <TouchableOpacity activeOpacity={0.9} onLongPress={(event) => openTransactionMenu(item, event)} delayLongPress={1000}>
        <BlurView intensity={38} tint="dark" style={styles.txnCard}>
          <View style={[styles.categoryDot, { backgroundColor: isNegative ? Colors.negative : Colors.positive }]} />
          <View style={styles.txnInfo}>
            <Text style={styles.txnMerchant} numberOfLines={1}>
              {item.merchant || 'Unknown'}
            </Text>
            <View style={styles.txnMeta}>
              <Text style={styles.txnCategory}>{item.category}</Text>
              {item.city && item.city !== 'REMOTE' && (
                <>
                  <Text style={styles.txnDot}>·</Text>
                  <Text style={styles.txnLocation}>
                    {item.city}{item.state && item.state !== 'REMOTE' ? `, ${item.state}` : ''}
                  </Text>
                </>
              )}
            </View>
            <Text style={styles.txnDate}>{formatDate(item.txn_date)}</Text>
          </View>
          <Text
            style={[
              styles.txnAmount,
              { color: isNegative ? Colors.negative : Colors.positive },
            ]}
          >
            {formatAmount(item.amount)}
          </Text>
        </BlurView>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={Colors.accentBlue} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StarField />

      <Modal visible={transactionMenuTarget !== null} transparent animationType="fade" onRequestClose={closeTransactionMenu}>
        <View style={styles.menuOverlay}>
          <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={closeTransactionMenu} />
          <BlurView intensity={65} tint="dark" style={[styles.contextMenu, { left: transactionMenuPosition.x, top: transactionMenuPosition.y }]}>
            <TouchableOpacity
              style={styles.contextMenuItem}
              onPress={() => transactionMenuTarget && openEditModal(transactionMenuTarget)}
            >
              <Ionicons name="create-outline" size={20} color={Colors.textPrimary} />
              <Text style={styles.contextMenuText}>Edit Transaction</Text>
            </TouchableOpacity>
          </BlurView>
        </View>
      </Modal>

      <Modal visible={editingTransaction !== null} transparent animationType="fade" onRequestClose={closeEditModal}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
          style={[styles.centeredCardOverlay, keyboardOpen && styles.keyboardOpenOverlay]}
        >
          <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={closeEditModal} />
          <BlurView intensity={65} tint="dark" style={styles.editModalCard}>
            <ScrollView
              contentContainerStyle={[styles.editModalScrollContent, { paddingBottom: insets.bottom + 6 }]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>Edit Transaction</Text>
                <View style={styles.modalActionsRow}>
                  <TouchableOpacity onPress={closeEditModal} disabled={savingEdit}>
                    <Ionicons name="close" size={26} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={styles.modalHelperText}>Long-press any transaction card for about 1 second to edit it.</Text>

              <Text style={styles.inputLabel}>Merchant</Text>
              <TextInput
                style={styles.sheetInput}
                value={editMerchant}
                onChangeText={setEditMerchant}
                placeholder="Merchant"
                placeholderTextColor={Colors.textMuted}
              />

              <Text style={styles.inputLabel}>Category</Text>
              <TextInput
                style={styles.sheetInput}
                value={editCategory}
                onChangeText={setEditCategory}
                placeholder="Category"
                placeholderTextColor={Colors.textMuted}
              />

              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                style={[styles.sheetInput, styles.sheetInputMultiline]}
                value={editDescription}
                onChangeText={setEditDescription}
                placeholder="Description"
                placeholderTextColor={Colors.textMuted}
                multiline
              />

              <View style={styles.editLocationRow}>
                <View style={styles.editLocationField}>
                  <Text style={styles.inputLabel}>City</Text>
                  <TextInput
                    style={styles.sheetInput}
                    value={editCity}
                    onChangeText={setEditCity}
                    placeholder="City"
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>
                <View style={styles.editLocationField}>
                  <Text style={styles.inputLabel}>State</Text>
                  <TextInput
                    style={styles.sheetInput}
                    value={editState}
                    onChangeText={setEditState}
                    placeholder="State"
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="characters"
                    maxLength={2}
                  />
                </View>
              </View>

              <TouchableOpacity onPress={saveTransactionEdit} disabled={savingEdit} activeOpacity={0.85}>
                <LinearGradient
                  colors={[Colors.gradientAccentStart, Colors.gradientAccentEnd]}
                  style={styles.saveButton}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {savingEdit ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save Changes</Text>}
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </BlurView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Account Header */}
      <BlurView intensity={38} tint="dark" style={styles.header}>
        <View style={styles.headerTopRow}>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>Transactions</Text>
            <Text style={styles.headerProvider}>{provider}</Text>
          </View>
          <View style={styles.headerCountPill}>
            <Text style={styles.headerCount}>
              {filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {DATE_RANGE_OPTIONS.map((option) => {
            const active = selectedRange === option.value;
            return (
              <TouchableOpacity
                key={String(option.value)}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setSelectedRange(option.value)}
                activeOpacity={0.85}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </BlurView>

      {filteredTransactions.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="receipt-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyText}>No transactions found</Text>
          <Text style={styles.emptySubtext}>
            Try a different date range or sync your account for newer activity.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredTransactions}
          keyExtractor={(item) => item.txn_id}
          renderItem={renderTransaction}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
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
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 6,
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
  filterRow: {
    gap: 8,
    paddingTop: 12,
    paddingBottom: 2,
  },
  filterChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  filterChipActive: {
    backgroundColor: 'rgba(248,113,113,0.22)',
    borderColor: 'rgba(248,113,113,0.62)',
  },
  filterChipText: {
    ...Typography.caption1,
    color: Colors.textSecondary,
    fontWeight: '700',
  },
  filterChipTextActive: {
    color: Colors.textPrimary,
  },
  list: {
    padding: 16,
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
    borderColor: Colors.navGlassBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 18,
    elevation: 7,
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
  txnMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  txnCategory: {
    ...Typography.caption1,
    color: Colors.textSecondary,
  },
  txnDot: {
    color: Colors.textMuted,
    marginHorizontal: 5,
  },
  txnLocation: {
    ...Typography.caption1,
    color: Colors.textMuted,
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
  },
  centeredCardOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyboardOpenOverlay: {
    justifyContent: 'flex-end',
  },
  menuOverlay: {
    flex: 1,
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.glassOverlay,
  },
  contextMenu: {
    position: 'absolute',
    width: TRANSACTION_MENU_WIDTH,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: Colors.navGlassBackground,
    borderWidth: 1,
    borderColor: Colors.navGlassBorder,
  },
  contextMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  contextMenuText: {
    ...Typography.body,
    color: '#FFF',
    fontSize: 16,
  },
  editModalCard: {
    width: '85%',
    maxWidth: 400,
    maxHeight: '76%',
    backgroundColor: Colors.navGlassBackground,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.navGlassBorder,
    overflow: 'hidden',
  },
  editModalScrollContent: {
    padding: 24,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sheetTitle: {
    ...Typography.title3,
    color: Colors.textPrimary,
  },
  modalActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  modalHelperText: {
    ...Typography.footnote,
    color: Colors.textMuted,
    marginBottom: 14,
    lineHeight: 20,
  },
  inputLabel: {
    ...Typography.caption1,
    color: Colors.textMuted,
    marginBottom: 8,
    marginLeft: 4,
  },
  sheetInput: {
    ...Typography.body,
    color: Colors.textPrimary,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  sheetInputMultiline: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  editLocationRow: {
    flexDirection: 'row',
    gap: 10,
  },
  editLocationField: {
    flex: 1,
  },
  saveButton: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    ...Typography.headline,
    color: '#fff',
    fontSize: 15,
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
});
