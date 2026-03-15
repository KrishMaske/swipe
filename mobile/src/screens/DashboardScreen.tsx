import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgUri } from 'react-native-svg';
import { api } from '../services/api';
import { useData } from '../context/DataContext';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';
import { getProviderLogoUrl, normalizeProviderKey } from '../utils/providerLogos';

const CATEGORIES = [
  'Food & Dining',
  'Transportation',
  'Shopping & Retail',
  'Entertainment & Recreation',
  'Healthcare & Medical',
  'Utilities & Services',
  'Financial Services',
  'Income',
  'Government & Legal',
  'Charity & Donations',
];

const PERIOD_OPTIONS = ['daily', 'weekly', 'biweekly', 'monthly', '3-month', '6-month', 'yearly'];

const LOGO_BASE_SIZE = 52;
const PROVIDER_LOGO_SCALE: Record<string, number> = {
  chase: 3.2,
  'jp morgan': 2.2,
  'bank of america': 1.65,
  bofa: 1.65,
};

function ScalePressable({
  onPress,
  onLongPress,
  delayLongPress,
  style,
  children,
}: {
  onPress?: () => void;
  onLongPress?: () => void;
  delayLongPress?: number;
  style?: any;
  children: React.ReactNode;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(scale.value, { damping: 15, stiffness: 400 }) }],
  }));
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      onPressIn={() => { scale.value = 0.965; }}
      onPressOut={() => { scale.value = 1; }}
    >
      <Animated.View style={[style, animStyle]}>{children}</Animated.View>
    </Pressable>
  );
}

export default function DashboardScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const {
    accounts,
    accountsLoading: loading,
    fetchAccounts,
    invalidateAccounts,
    budgetsCache,
    fetchBudgets,
    fetchFraudAlerts,
    spendingByBudget,
    budgetTransactions,
    fetchTransactions,
  } = useData();

  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [budgetModalVisible, setBudgetModalVisible] = useState(false);
  const [newBudget, setNewBudget] = useState({
    name: '',
    amount: '',
    category: 'Food & Dining',
    period: 'monthly',
  });
  const [creatingBudget, setCreatingBudget] = useState(false);
  const [categoryDropdownVisible, setCategoryDropdownVisible] = useState(false);

  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [contextMenuBudget, setContextMenuBudget] = useState<any>(null);
  const [failedLogoProviders, setFailedLogoProviders] = useState<Record<string, boolean>>({});

  useFocusEffect(
    useCallback(() => {
      fetchAccounts();
      fetchBudgets();
    }, [fetchAccounts, fetchBudgets])
  );

  useEffect(() => {
    if (accounts && accounts.length > 0) {
      accounts.forEach((acc) => {
        if (acc.acc_id) {
          fetchTransactions(acc.acc_id);
        }
      });
    }
  }, [accounts, fetchTransactions]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAccounts(true);
    await fetchBudgets(true);
    if (accounts) {
      await Promise.all(accounts.map((acc) => fetchTransactions(acc.acc_id, true)));
    }
    setRefreshing(false);
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await api.syncAccounts();
      Alert.alert(
        'Sync Started',
        result.success || 'Account sync initiated. Transactions will update in the background.'
      );
      setTimeout(async () => {
        invalidateAccounts();
        await fetchAccounts(true);
        await fetchBudgets(true);
        await fetchFraudAlerts(true);
        await Promise.all((accounts || []).map((acc) => fetchTransactions(acc.acc_id, true)));
      }, 3000);
    } catch (err: any) {
      Alert.alert('Sync Failed', err.message || 'Could not sync accounts');
    } finally {
      setSyncing(false);
    }
  };

  const handleCreateBudget = async () => {
    if (!newBudget.name || !newBudget.amount || !newBudget.category) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }

    setCreatingBudget(true);
    try {
      if (editingBudgetId) {
        await api.updateBudget(editingBudgetId, {
          name: newBudget.name,
          amount: parseFloat(newBudget.amount),
          category: newBudget.category,
          period: newBudget.period,
        });
      } else {
        await api.createBudget({
          name: newBudget.name,
          amount: parseFloat(newBudget.amount),
          category: newBudget.category,
          period: newBudget.period,
        });
      }
      setBudgetModalVisible(false);
      setEditingBudgetId(null);
      setNewBudget({ name: '', amount: '', category: 'Food & Dining', period: 'monthly' });
      setCategoryDropdownVisible(false);
      await fetchBudgets(true);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save budget.');
    } finally {
      setCreatingBudget(false);
    }
  };

  const handleDeleteBudget = async (id?: string | any) => {
    const targetId = typeof id === 'string' ? id : editingBudgetId;
    if (!targetId) return;

    Alert.alert('Delete Budget', 'Are you sure you want to delete this budget?', [
      { 
        text: 'Cancel', 
        style: 'cancel',
        onPress: () => {
          setContextMenuBudget(null);
        }
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setCreatingBudget(true);
          try {
            await api.deleteBudget(targetId);
            setBudgetModalVisible(false);
            setEditingBudgetId(null);
            setContextMenuBudget(null);
            setNewBudget({ name: '', amount: '', category: 'Food & Dining', period: 'monthly' });
            await fetchBudgets(true);
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to delete budget.');
          } finally {
            setCreatingBudget(false);
          }
        },
      },
    ]);
  };

  const totalBalance = accounts.reduce((sum, a) => sum + (a.balance || 0), 0);

  const formatCurrency = (amount: number) => {
    const abs = Math.abs(amount);
    const formatted = abs.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return amount < 0 ? `-$${formatted}` : `$${formatted}`;
  };

  const linkedAccountLabel = `${accounts.length} linked account${accounts.length !== 1 ? 's' : ''}`;
  const budgets = budgetsCache || [];

  const accountLogos = useMemo(
    () => ['business-outline', 'card-outline', 'wallet-outline', 'albums-outline'] as const,
    []
  );

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#000000', '#000000']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 120 + insets.bottom }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.accentBlue}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.headerRow, { paddingTop: insets.top + 8 }]}>
          <View>
            <Text style={styles.headerEyebrow}>Swipe</Text>
            <Text style={styles.headerTitle}>Overview</Text>
          </View>
          <TouchableOpacity
            style={styles.settingsBtn}
            onPress={() => navigation.navigate('Settings')}
            activeOpacity={0.8}
          >
            <Ionicons name="settings-outline" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <View style={styles.heroSection}> 
          <Text style={styles.heroLabel}>Total Balance</Text>
          <Text style={styles.heroBalance}>{loading ? '...' : formatCurrency(totalBalance)}</Text>
          <Text style={styles.heroMeta}>{linkedAccountLabel}</Text>

          <TouchableOpacity
            style={styles.syncPillWrap}
            onPress={handleSync}
            disabled={syncing}
            activeOpacity={0.8}
          >
            <BlurView intensity={28} tint="dark" style={styles.syncPill}>
              {syncing ? (
                <ActivityIndicator size="small" color={Colors.textPrimary} />
              ) : (
                <>
                  <Ionicons name="sync" size={15} color={Colors.textPrimary} />
                  <Text style={styles.syncText}>Sync</Text>
                </>
              )}
            </BlurView>
          </TouchableOpacity>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Budgets</Text>
          <TouchableOpacity
            onPress={() => {
              setEditingBudgetId(null);
              setNewBudget({ name: '', amount: '', category: 'Food & Dining', period: 'monthly' });
              setCategoryDropdownVisible(false);
              setBudgetModalVisible(true);
            }}
            hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
          >
            <Ionicons name="add-circle" size={26} color={Colors.accentBlueBright} />
          </TouchableOpacity>
        </View>

        {budgets.length === 0 ? (
          <View style={styles.emptyBudgets}>
            <Text style={styles.emptySubtitle}>No budgets yet. Create one to track your spending flow.</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.budgetList}>
            {budgets.map((budget, index) => {
              const spent = spendingByBudget[budget.id!] || 0;
              const progress = Math.min(spent / budget.amount, 1);
              const gradient =
                progress >= 1
                  ? ['#FF6B6B', '#FF8A8A']
                  : progress >= 0.8
                    ? ['#FFB347', '#FFD27A']
                    : [Colors.gradientAccentStart, Colors.gradientAccentEnd];

              return (
                <Animated.View key={budget.id} entering={FadeInDown.delay(index * 70).springify()}>
                  <ScalePressable
                    onLongPress={() => setContextMenuBudget(budget)}
                    delayLongPress={500}
                    style={styles.budgetCard}
                  >
                  <View style={styles.budgetHeadRow}>
                    <Text style={styles.budgetName}>{budget.name}</Text>
                    <Text style={styles.budgetPeriod}>{budget.period}</Text>
                  </View>
                  <Text style={styles.budgetCategory}>{budget.category}</Text>
                  <View style={styles.progressTrack}>
                    <LinearGradient
                      colors={gradient as [string, string]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[styles.progressFill, { width: `${progress * 100}%` }]}
                    />
                  </View>
                  <Text style={styles.budgetAmountText}>
                    {formatCurrency(spent)} / {formatCurrency(budget.amount)}
                  </Text>
                  </ScalePressable>
                </Animated.View>
              );
            })}
          </ScrollView>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Accounts</Text>
        </View>

        {loading ? (
          <>
            {[0, 1, 2].map((i) => (
              <Animated.View
                key={i}
                entering={FadeInDown.delay(i * 80).springify()}
                style={styles.skeletonAccountRow}
              >
                <View style={styles.skeletonLogo} />
                <View style={styles.skeletonInfo}>
                  <View style={styles.skeletonLine} />
                  <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
                </View>
                <View style={[styles.skeletonLine, { width: 60 }]} />
              </Animated.View>
            ))}
          </>
        ) : accounts.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="business-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No Accounts Linked</Text>
            <Text style={styles.emptySubtitle}>Go to Settings to link your bank with SimpleFIN.</Text>
            <TouchableOpacity style={styles.linkButton} onPress={() => navigation.navigate('Settings')}>
              <LinearGradient
                colors={[Colors.gradientAccentStart, Colors.gradientAccentEnd]}
                style={styles.linkButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Ionicons name="link" size={18} color="#fff" />
                <Text style={styles.linkButtonText}>Link Bank Account</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : (
          accounts.map((account, index) => {
            const providerKey = normalizeProviderKey(account.provider);
            const logoUrl = getProviderLogoUrl(account.provider);
            const showProviderLogo = !!logoUrl && !failedLogoProviders[providerKey];
            const logoScale = PROVIDER_LOGO_SCALE[providerKey] ?? 1;
            const logoSize = Math.round(LOGO_BASE_SIZE * logoScale);

            return (
            <Animated.View key={account.acc_id} entering={FadeInDown.delay(index * 80).springify()}>
              <TouchableOpacity
                style={styles.accountRow}
                activeOpacity={0.85}
                onPress={() =>
                  navigation.navigate('AccountDetail', {
                    accId: account.acc_id,
                    accType: account.acc_type,
                    provider: account.provider,
                  })
                }
              >
              <View style={styles.accountLeft}>
                {showProviderLogo ? (
                  <View style={styles.accountLogoImageWrap}>
                    <SvgUri
                      uri={logoUrl}
                      width={logoSize}
                      height={logoSize}
                      onError={() => {
                        if (!providerKey) return;
                        setFailedLogoProviders((prev) => ({ ...prev, [providerKey]: true }));
                      }}
                    />
                  </View>
                ) : (
                  <LinearGradient
                    colors={['rgba(130,166,255,0.25)', 'rgba(46,230,166,0.15)']}
                    style={styles.accountLogo}
                  >
                    <Ionicons
                      name={accountLogos[index % accountLogos.length]}
                      size={18}
                      color={Colors.accentBlueBright}
                    />
                  </LinearGradient>
                )}
                <View>
                  <Text style={styles.accountName}>{account.acc_type}</Text>
                  <Text style={styles.accountProvider}>{account.provider}</Text>
                </View>
              </View>

              <View style={styles.accountRight}>
                <Text
                  style={[
                    styles.accountBalance,
                    { color: account.balance >= 0 ? Colors.textPrimary : Colors.negative },
                  ]}
                >
                  {formatCurrency(account.balance)}
                </Text>
                <Text style={styles.accountCurrency}>{account.currency}</Text>
              </View>
              </TouchableOpacity>
            </Animated.View>
            );
          })
        )}
      </ScrollView>

      <Modal visible={!!contextMenuBudget} transparent animationType="fade">
        <View style={styles.centeredCardOverlay}>
          <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={() => setContextMenuBudget(null)} />
          <BlurView intensity={65} tint="dark" style={styles.contextMenu}>
            <TouchableOpacity
              style={styles.contextMenuItem}
              onPress={() => {
                setSelectedBudgetId(contextMenuBudget.id!);
                setContextMenuBudget(null);
              }}
            >
              <Ionicons name="list" size={20} color={Colors.textPrimary} />
              <Text style={styles.contextMenuText}>Show Transactions</Text>
            </TouchableOpacity>
            <View style={styles.contextMenuDivider} />
            <TouchableOpacity
              style={styles.contextMenuItem}
              onPress={() => {
                 setEditingBudgetId(contextMenuBudget.id!);
                 setNewBudget({
                   name: contextMenuBudget.name,
                   amount: contextMenuBudget.amount.toString(),
                   category: contextMenuBudget.category,
                   period: contextMenuBudget.period,
                 });
                 setBudgetModalVisible(true);
                 setContextMenuBudget(null);
              }}
            >
              <Ionicons name="pencil" size={20} color={Colors.textPrimary} />
              <Text style={styles.contextMenuText}>Edit Budget</Text>
            </TouchableOpacity>
            <View style={styles.contextMenuDivider} />
            <TouchableOpacity
              style={styles.contextMenuItem}
              onPress={() => {
                const idToDel = contextMenuBudget.id!;
                handleDeleteBudget(idToDel);
              }}
            >
              <Ionicons name="trash-outline" size={20} color={Colors.negative} />
              <Text style={[styles.contextMenuText, { color: Colors.negative }]}>Delete Budget</Text>
            </TouchableOpacity>
          </BlurView>
        </View>
      </Modal>

      <Modal visible={budgetModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.centeredCardOverlay}
        >
          <TouchableOpacity
            style={styles.sheetBackdrop}
            activeOpacity={1}
            onPress={() => {
              setBudgetModalVisible(false);
              setEditingBudgetId(null);
            }}
          />
          <BlurView intensity={65} tint="dark" style={styles.staticSquareCard}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{editingBudgetId ? 'Edit Budget' : 'Create Budget'}</Text>
              <View style={styles.modalActionsRow}>
                <TouchableOpacity
                  onPress={() => {
                    setBudgetModalVisible(false);
                    setEditingBudgetId(null);
                  }}
                  style={{ marginRight: 16 }}
                >
                  <Ionicons name="close" size={26} color={Colors.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleCreateBudget} disabled={creatingBudget}>
                  {creatingBudget ? (
                    <ActivityIndicator color={Colors.accentBlueBright} size="small" />
                  ) : (
                    <Ionicons name="checkmark" size={26} color={Colors.accentBlueBright} />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            <Text style={styles.inputLabel}>Budget Name</Text>
            <TextInput
              style={styles.sheetInput}
              placeholder="e.g., Grocery Limit"
              placeholderTextColor={Colors.textMuted}
              value={newBudget.name}
              onChangeText={(text) => setNewBudget({ ...newBudget, name: text })}
            />

            <Text style={styles.inputLabel}>Category</Text>
            <View style={styles.dropdownContainer}>
              <TouchableOpacity
                style={styles.dropdownButton}
                activeOpacity={0.85}
                onPress={() => setCategoryDropdownVisible(!categoryDropdownVisible)}
              >
                <Text style={styles.dropdownButtonText}>{newBudget.category || 'Select a Category'}</Text>
                <Ionicons
                  name={categoryDropdownVisible ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={Colors.textMuted}
                />
              </TouchableOpacity>

              {categoryDropdownVisible && (
                <View style={styles.dropdownList}>
                  <ScrollView nestedScrollEnabled style={styles.dropdownScroll} keyboardShouldPersistTaps="handled">
                    {CATEGORIES.map((cat) => (
                      <TouchableOpacity
                        key={cat}
                        style={styles.dropdownItem}
                        onPress={() => {
                          setNewBudget({ ...newBudget, category: cat });
                          setCategoryDropdownVisible(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.dropdownItemText,
                            newBudget.category === cat && styles.dropdownItemTextSelected,
                          ]}
                        >
                          {cat}
                        </Text>
                        {newBudget.category === cat && (
                          <Ionicons name="checkmark" size={18} color={Colors.accentBlueBright} />
                        )}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            <Text style={styles.inputLabel}>Amount Limit ($)</Text>
            <TextInput
              style={styles.sheetInput}
              placeholder="e.g., 500"
              placeholderTextColor={Colors.textMuted}
              keyboardType="numeric"
              value={newBudget.amount}
              onChangeText={(text) => setNewBudget({ ...newBudget, amount: text })}
            />

            <Text style={styles.inputLabel}>Period</Text>
            <View style={styles.segmentedRail}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.segmentedInner}>
                {PERIOD_OPTIONS.map((period) => {
                  const active = newBudget.period === period;
                  return (
                    <TouchableOpacity
                      key={period}
                      style={[styles.segmentChip, active && styles.segmentChipActive]}
                      onPress={() => setNewBudget({ ...newBudget, period })}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.segmentChipText, active && styles.segmentChipTextActive]}>{period}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </BlurView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={selectedBudgetId !== null} transparent animationType="slide">
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={() => setSelectedBudgetId(null)} />
          <BlurView intensity={35} tint="dark" style={[styles.sheetContent, styles.transactionsSheet]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                {selectedBudgetId !== null && budgets.find((b) => b.id === selectedBudgetId)?.name} Transactions
              </Text>
              <View style={styles.modalActionsRow}>
                <TouchableOpacity onPress={() => setSelectedBudgetId(null)}>
                  <Ionicons name="close" size={26} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView contentContainerStyle={styles.transactionsList} showsVerticalScrollIndicator={false}>
              {selectedBudgetId !== null && budgetTransactions[selectedBudgetId]?.length > 0 ? (
                budgetTransactions[selectedBudgetId].map((txn) => (
                  <View key={txn.id} style={styles.transactionRow}>
                    <View style={styles.transactionIcon}>
                      <Ionicons name="receipt-outline" size={16} color={Colors.accentBlueBright} />
                    </View>
                    <View style={styles.transactionInfo}>
                      <Text style={styles.transactionMerchant}>{txn.merchant}</Text>
                      <Text style={styles.transactionDate}>
                        {new Date(
                          typeof txn.txn_date === 'string' ? txn.txn_date : txn.txn_date * 1000
                        ).toLocaleDateString()}
                      </Text>
                    </View>
                    <Text style={styles.transactionAmount}>-${Math.abs(txn.amount).toFixed(2)}</Text>
                  </View>
                ))
              ) : (
                <View style={styles.emptyTransactions}>
                  <Ionicons name="search-outline" size={36} color={Colors.textMuted} />
                  <Text style={styles.emptyTransactionsText}>No transactions found for this period.</Text>
                </View>
              )}
            </ScrollView>
          </BlurView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  scroll: {
    paddingBottom: 120,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  headerEyebrow: {
    ...Typography.caption1,
    color: Colors.accentBlueBright,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  headerTitle: {
    ...Typography.largeTitle,
    color: Colors.textPrimary,
  },
  settingsBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  heroSection: {
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  heroLabel: {
    ...Typography.footnote,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  heroBalance: {
    ...Typography.largeTitle,
    color: Colors.textPrimary,
    marginTop: 10,
    fontSize: 44,
    letterSpacing: -1,
  },
  heroMeta: {
    ...Typography.subhead,
    color: Colors.textMuted,
    marginTop: 6,
  },
  syncPillWrap: {
    marginTop: 18,
    alignSelf: 'flex-start',
    borderRadius: 999,
    overflow: 'hidden',
  },
  syncPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  syncText: {
    ...Typography.footnote,
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  sectionTitle: {
    ...Typography.headline,
    color: Colors.textPrimary,
  },
  emptyBudgets: {
    marginHorizontal: 20,
    borderRadius: 18,
    paddingVertical: 22,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  budgetList: {
    gap: 12,
    paddingHorizontal: 20,
    paddingRight: 28,
  },
  budgetCard: {
    width: 280,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  budgetHeadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  budgetName: {
    ...Typography.subhead,
    color: Colors.textPrimary,
    fontWeight: '700',
    flex: 1,
  },
  budgetPeriod: {
    ...Typography.caption2,
    color: Colors.textMuted,
    textTransform: 'capitalize',
  },
  budgetCategory: {
    ...Typography.caption1,
    color: Colors.textMuted,
    marginTop: 3,
  },
  progressTrack: {
    marginTop: 12,
    height: 6,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.09)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  budgetAmountText: {
    ...Typography.footnote,
    color: Colors.textSecondary,
    marginTop: 10,
  },
  centered: {
    paddingVertical: 36,
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    ...Typography.headline,
    color: Colors.textPrimary,
    marginTop: 14,
  },
  emptySubtitle: {
    ...Typography.footnote,
    color: Colors.textMuted,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  linkButton: {
    marginTop: 20,
  },
  linkButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: 14,
  },
  linkButtonText: {
    ...Typography.subhead,
    color: '#fff',
    fontWeight: '700',
  },
  accountRow: {
    marginHorizontal: 20,
    marginBottom: 10,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  accountLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  accountLogo: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  accountLogoImageWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    overflow: 'visible',
  },
  accountName: {
    ...Typography.subhead,
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  accountProvider: {
    ...Typography.caption1,
    color: Colors.textMuted,
    marginTop: 2,
  },
  accountRight: {
    alignItems: 'flex-end',
    marginLeft: 10,
  },
  accountBalance: {
    ...Typography.headline,
    fontSize: 18,
    letterSpacing: -0.3,
  },
  accountCurrency: {
    ...Typography.caption2,
    color: Colors.textMuted,
    marginTop: 2,
  },
  skeletonAccountRow: {
    marginHorizontal: 20,
    marginBottom: 10,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  skeletonLogo: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  skeletonInfo: {
    flex: 1,
    gap: 6,
  },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.07)',
    width: '55%',
  },
  skeletonLineShort: {
    width: '35%' as any,
    opacity: 0.6,
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.glassOverlay,
  },
  centeredCardOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contextMenu: {
    width: 250,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(30,30,30,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  contextMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  contextMenuDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 16,
  },
  contextMenuText: {
    ...Typography.body,
    color: '#FFF',
    marginLeft: 12,
    fontSize: 16,
  },
  staticSquareCard: {
    width: '85%',
    maxWidth: 400,
    backgroundColor: 'rgba(30,30,30,0.85)',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    overflow: 'hidden',
  },
  sheetContent: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 18,
    paddingBottom: 30,
    paddingTop: 8,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderColor: Colors.glassBorder,
    backgroundColor: 'rgba(23,28,36,0.82)',
  },
  budgetFormSheet: {
    maxHeight: '76%',
  },
  transactionsSheet: {
    height: '72%',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.22)',
    marginVertical: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    ...Typography.title3,
    color: Colors.textPrimary,
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
  dropdownContainer: {
    marginBottom: 14,
    position: 'relative',
    zIndex: 10,
  },
  dropdownButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dropdownButtonText: {
    ...Typography.body,
    color: Colors.textPrimary,
  },
  dropdownList: {
    marginTop: 6,
    borderRadius: 14,
    maxHeight: 200,
    overflow: 'hidden',
    backgroundColor: '#222936',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  dropdownScroll: {
    paddingVertical: 6,
  },
  dropdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  dropdownItemText: {
    ...Typography.subhead,
    color: Colors.textSecondary,
  },
  dropdownItemTextSelected: {
    color: Colors.textPrimary,
  },
  segmentedRail: {
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    padding: 4,
    marginBottom: 18,
  },
  segmentedInner: {
    gap: 6,
  },
  segmentChip: {
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  segmentChipActive: {
    backgroundColor: 'rgba(130,166,255,0.25)',
  },
  segmentChipText: {
    ...Typography.caption1,
    color: Colors.textMuted,
    textTransform: 'capitalize',
  },
  segmentChipTextActive: {
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  primaryButtonWrap: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  primaryButton: {
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    backgroundColor: '#2E3440',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  primaryButtonText: {
    ...Typography.headline,
    color: '#fff',
    fontWeight: '700',
  },
  destructiveTextButton: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  destructiveText: {
    ...Typography.subhead,
    color: Colors.negative,
    fontWeight: '600',
  },
  modalActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  transactionsList: {
    paddingBottom: 22,
  },
  transactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  transactionIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(130,166,255,0.12)',
    marginRight: 10,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionMerchant: {
    ...Typography.subhead,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  transactionDate: {
    ...Typography.caption1,
    color: Colors.textMuted,
    marginTop: 2,
  },
  transactionAmount: {
    ...Typography.subhead,
    color: Colors.negative,
    fontWeight: '700',
  },
  emptyTransactions: {
    alignItems: 'center',
    paddingVertical: 34,
  },
  emptyTransactionsText: {
    ...Typography.footnote,
    color: Colors.textMuted,
    marginTop: 10,
  },
});
