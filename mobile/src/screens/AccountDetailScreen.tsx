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
  Pressable,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming, interpolate, FadeInDown } from 'react-native-reanimated';
import { Swipeable } from 'react-native-gesture-handler';
import { ScalePressable } from '../components/ScalePressable';
import { Ionicons } from '@expo/vector-icons';
import { GlassBackground } from '../components/GlassBackground';
import { LinearGradient } from 'expo-linear-gradient';
import StarField from '../components/StarField';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, Transaction, TransactionUpdate } from '../services/api';
import { useData } from '../context/DataContext';
import { Colors } from '../theme/colors';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { GlassRefreshHeader } from '../components/GlassRefreshHeader';
import { useAnimatedScrollHandler, runOnJS } from 'react-native-reanimated';
import { Skeleton } from '../components/Skeleton';

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

export default function AccountDetailScreen() {
  const router = useRouter();
  const { id: accId, accType, provider } = useLocalSearchParams<{ id: string; accType: string; provider: string }>();
  const insets = useSafeAreaInsets();
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
  const [refreshing, setRefreshing] = useState(false);

  const scrollY = useSharedValue(0);
  const REFRESH_THRESHOLD = 80;

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
    onEndDrag: (event) => {
      if (event.contentOffset.y < -REFRESH_THRESHOLD && !refreshing) {
        runOnJS(handleRefresh)();
      }
    },
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchTransactions(accId, true);
    } finally {
      setRefreshing(false);
    }
  };

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
    // navigation.setOptions is removed as navigation prop is no longer passed
    // If title needs to be set, it should be done via expo-router's _layout.tsx or screen options
    fetchTransactions(accId);
  }, [accId]); // Added accId to dependency array

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

  const handleAction = (txnId: string, isFlag: boolean) => {
    Alert.alert(
      isFlag ? 'Flag Transaction' : 'Verify Transaction',
      `Are you sure you want to ${isFlag ? 'flag' : 'verify'} this transaction? (ID: ${txnId})`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'OK', onPress: () => console.log(`${isFlag ? 'Flagged' : 'Verified'} transaction ${txnId}`) },
      ],
    );
  };

  const renderRightActions = (_prog: Animated.SharedValue<number>, _drag: Animated.SharedValue<number>, txn: Transaction) => {
    return (
      <ScalePressable
        style={styles.swipeActionRight}
        onPress={() => handleAction(txn.txn_id, true)}
      >
        <View style={styles.swipeIconWrap}>
          <Ionicons name="alert-circle" size={24} color="#fff" />
          <Text style={styles.swipeText}>Flag</Text>
        </View>
      </ScalePressable>
    );
  };

  const renderLeftActions = (_prog: Animated.SharedValue<number>, _drag: Animated.SharedValue<number>, txn: Transaction) => {
    return (
      <ScalePressable
        style={styles.swipeActionLeft}
        onPress={() => handleAction(txn.txn_id, false)}
      >
        <View style={styles.swipeIconWrap}>
          <Ionicons name="checkmark-circle" size={24} color="#fff" />
          <Text style={styles.swipeText}>Verify</Text>
        </View>
      </ScalePressable>
    );
  };

  const renderTransaction = ({ item, index }: { item: Transaction; index: number }) => {
    const catColor = getCategoryColor(item.category);
    const isNegative = item.amount < 0;

    return (
      <Animated.View entering={FadeInDown.delay(index * 60).duration(400)}>
        <Swipeable
          renderLeftActions={(prog, drag) => renderLeftActions(prog, drag, item)}
          renderRightActions={(prog, drag) => renderRightActions(prog, drag, item)}
          friction={2}
          enableTrackpadTwoFingerGesture
          rightThreshold={40}
          leftThreshold={40}
          containerStyle={styles.swipeContainer}
        >
          <ScalePressable onLongPress={(event) => openTransactionMenu(item, event)} delayLongPress={1000}>
            <GlassBackground
              blurIntensity={38}
              blurTint="systemChromeMaterialDark"
              style={styles.txnCard}
              tintColor="rgba(0, 0, 0, 0.4)"
              tintOpacity={0.6}
            >
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
            </GlassBackground>
          </ScalePressable>
        </Swipeable>
      </Animated.View>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <StarField />
        <View style={styles.header}>
           <Skeleton width={120} height={28} borderRadius={6} />
           <Skeleton width={80} height={14} borderRadius={4} style={{ marginTop: 8 }} />
           <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
             <Skeleton width={50} height={30} borderRadius={15} />
             <Skeleton width={50} height={30} borderRadius={15} />
             <Skeleton width={50} height={30} borderRadius={15} />
           </View>
        </View>
        <View style={styles.list}>
          {[0, 1, 2, 3, 4].map(i => (
            <Skeleton key={i} width="100%" height={80} borderRadius={20} style={{ marginBottom: 12 }} />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StarField />

      <Modal visible={transactionMenuTarget !== null} transparent animationType="fade" onRequestClose={closeTransactionMenu}>
        <View style={styles.menuOverlay}>
          <Pressable style={styles.sheetBackdrop} onPress={closeTransactionMenu} />
          <GlassBackground blurIntensity={65} blurTint="systemChromeMaterialDark" style={[styles.contextMenu, { left: transactionMenuPosition.x, top: transactionMenuPosition.y }]}>
            <ScalePressable
              style={styles.contextMenuItem}
              onPress={() => transactionMenuTarget && openEditModal(transactionMenuTarget)}
            >
              <Ionicons name="create-outline" size={20} color={Colors.textPrimary} />
              <Text style={styles.contextMenuText}>Edit Transaction</Text>
            </ScalePressable>
          </GlassBackground>
        </View>
      </Modal>

      <Modal visible={editingTransaction !== null} transparent animationType="fade" onRequestClose={closeEditModal}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
          style={[styles.centeredCardOverlay, keyboardOpen && styles.keyboardOpenOverlay]}
        >
          <Pressable style={styles.sheetBackdrop} onPress={closeEditModal} />
          <GlassBackground
            blurIntensity={65}
            blurTint="systemChromeMaterialDark"
            style={styles.editModalCard}
            tintColor="rgba(0, 0, 0, 0.4)"
            tintOpacity={0.6}
          >
            <ScrollView
              contentContainerStyle={[styles.editModalScrollContent, { paddingBottom: insets.bottom + 6 }]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>Edit Transaction</Text>
                <View style={styles.modalActionsRow}>
                  <ScalePressable onPress={closeEditModal} disabled={savingEdit}>
                    <Ionicons name="close" size={26} color={Colors.textMuted} />
                  </ScalePressable>
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

              <ScalePressable onPress={saveTransactionEdit} disabled={savingEdit}>
                <LinearGradient
                  colors={[Colors.gradientAccentStart, Colors.gradientAccentEnd]}
                  style={styles.saveButton}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {savingEdit ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save Changes</Text>}
                </LinearGradient>
              </ScalePressable>
            </ScrollView>
          </GlassBackground>
        </KeyboardAvoidingView>
      </Modal>

      {/* Account Header */}
      <GlassBackground blurIntensity={38} blurTint="systemChromeMaterialDark" style={styles.header}>
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
              <ScalePressable
                key={String(option.value)}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setSelectedRange(option.value)}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {option.label}
                </Text>
              </ScalePressable>
            );
          })}
        </ScrollView>
      </GlassBackground>

      <GlassRefreshHeader scrollY={scrollY} refreshing={refreshing} threshold={REFRESH_THRESHOLD} />

      {filteredTransactions.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="receipt-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyText}>No transactions found</Text>
          <Text style={styles.emptySubtext}>
            Try a different date range or sync your account for newer activity.
          </Text>
        </View>
      ) : (
        <Animated.FlatList
          data={filteredTransactions}
          keyExtractor={(item) => item.txn_id}
          renderItem={renderTransaction}
          contentContainerStyle={styles.list}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
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
    borderRadius: 20,
    marginBottom: 0, // Removed for swipe container gap
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 18,
    elevation: 7,
    overflow: 'hidden',
  },
  swipeContainer: {
    marginBottom: 12,
    borderRadius: 20,
    overflow: 'hidden',
  },
  swipeActionLeft: {
    backgroundColor: Colors.positive,
    width: 90,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  swipeActionRight: {
    backgroundColor: Colors.negative,
    width: 90,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  swipeIconWrap: {
    alignItems: 'center',
    gap: 4,
  },
  swipeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
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
