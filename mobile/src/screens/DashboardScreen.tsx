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
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  interpolate,
  runOnJS,
} from 'react-native-reanimated';
import { GlassBackground } from '../components/GlassBackground';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgUri } from 'react-native-svg';
import { api, Account, Budget } from '../services/api';
import { useData } from '../context/DataContext';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';
import { getProviderLogoUrl, normalizeProviderKey } from '../utils/providerLogos';
import StarField from '../components/StarField';
import { useRouter } from 'expo-router';
import { ScalePressable } from '../components/ScalePressable';
import { GlassRefreshHeader } from '../components/GlassRefreshHeader';
import { useAnimatedScrollHandler } from 'react-native-reanimated';
import { Skeleton } from '../components/Skeleton';
import { BudgetFormModal, BudgetData } from '../components/BudgetFormModal';

const SIMPLEFIN_ACCOUNT_URL = 'https://beta-bridge.simplefin.org/my-account';

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

export default function DashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const budgetCardWidth = Math.min(Math.max(width - 96, 240), 320);
  const {
    accounts,
    accountsLoading: loading,
    fetchAccounts,
    invalidateAccounts,
    budgetsCache,
    fetchBudgets,
    fetchFraudAlerts,
    spendingByBudget,
    fetchTransactions,
  } = useData();

  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [contextMenuBudget, setContextMenuBudget] = useState<Budget | null>(null);
  const [failedLogoProviders, setFailedLogoProviders] = useState<Record<string, boolean>>({});
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [creatingBudget, setCreatingBudget] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [updatingBudget, setUpdatingBudget] = useState(false);
  
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
    onEndDrag: (event) => {
      if (event.contentOffset.y < -REFRESH_THRESHOLD && !refreshing) {
        runOnJS(onRefresh)();
      }
    },
  });

  const REFRESH_THRESHOLD = 80;

  useFocusEffect(
    useCallback(() => {
      fetchAccounts();
      fetchBudgets();
      fetchFraudAlerts();
    }, [fetchAccounts, fetchBudgets, fetchFraudAlerts])
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
    try {
      await runBackendSync(true); // pass true to skip initial alert
    } finally {
      setRefreshing(false);
    }
  };

  const runBackendSync = async (silent = false) => {
    setSyncing(true);
    try {
      // Get initial sync status to detect completion
      const initialStatus = await api.getAccountSyncStatus();
      const initialSyncTime = initialStatus?.last_sync ?? 0;

      const result = await api.syncAccounts();
      if (!silent) {
        Alert.alert(
          'Sync Started',
          result.success || 'Account sync initiated. Transactions will update in the background.'
        );
      }

      // Poll for sync completion
      let attempts = 0;
      const MAX_ATTEMPTS = 10;
      const poll = async () => {
        if (attempts >= MAX_ATTEMPTS) {
          refreshDataAfterSync();
          return;
        }

        attempts++;
        const currentStatus = await api.getAccountSyncStatus();
        const currentSyncTime = currentStatus?.last_sync ?? 0;

        if (currentSyncTime > initialSyncTime) {
          refreshDataAfterSync();
        } else {
          setTimeout(poll, 3000);
        }
      };

      const refreshDataAfterSync = async () => {
        invalidateAccounts();
        await fetchAccounts(true);
        await fetchBudgets(true);
        await fetchFraudAlerts(true);
        if (accounts && accounts.length > 0) {
          await Promise.all(accounts.map((acc) => fetchTransactions(acc.acc_id, true)));
        }
      };

      poll();
    } catch (err: any) {
      if (!silent) {
        Alert.alert('Sync Failed', err.message || 'Could not sync accounts');
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleSync = async () => {
    await runBackendSync();
  };

  const handleForceSync = async () => {
    try {
      await WebBrowser.openBrowserAsync(SIMPLEFIN_ACCOUNT_URL, {
        controlsColor: Colors.accentBlueBright,
        toolbarColor: Colors.bgPrimary,
        secondaryToolbarColor: Colors.bgPrimary,
        showTitle: true,
        enableBarCollapsing: true,
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      });
    } catch {
      Alert.alert('SimpleFIN', 'Could not open SimpleFIN account page.');
      return;
    }

    await runBackendSync();
  };

  const handleDeleteBudget = async (id: string) => {
    Alert.alert('Delete Budget', 'Are you sure you want to delete this budget and its transaction tracking?', [
      { 
        text: 'Cancel', 
        style: 'cancel',
        onPress: () => {
          setContextMenuBudget?.(null);
        }
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteBudget(id);
            await fetchBudgets(true);
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to delete budget.');
          }
        },
      },
    ]);
  };

  const handleCreateBudget = async (data: any) => {
    setCreatingBudget(true);
    try {
      await api.createBudget(data);
      setCreateModalVisible(false);
      await fetchBudgets(true);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create budget');
    } finally {
      setCreatingBudget(false);
    }
  };

  const handleUpdateBudget = async (data: any) => {
    if (!editingBudget?.id) return;
    setUpdatingBudget(true);
    try {
      await api.updateBudget(editingBudget.id, data);
      setEditModalVisible(false);
      setEditingBudget(null);
      await fetchBudgets(true);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update budget');
    } finally {
      setUpdatingBudget(false);
    }
  };

  const hasAvailableBalance = accounts.some((a) => a.available_balance !== null);
  const totalAvailableBalance = accounts.reduce((sum, a) => sum + (a.available_balance || 0), 0);

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
      <StarField />

      <GlassRefreshHeader scrollY={scrollY} refreshing={refreshing} threshold={REFRESH_THRESHOLD} />

      <Animated.ScrollView
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={[styles.scroll, { paddingBottom: 120 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.headerRow, { paddingTop: insets.top + 8 }]}>
          <View>
            <Text style={styles.headerEyebrow}>Swipe</Text>
            <Text style={styles.headerTitle}>Overview</Text>
          </View>
          <ScalePressable
            style={styles.settingsBtn}
            onPress={() => router.push('/dashboard/settings')}
          >
            <Ionicons name="settings-outline" size={24} color={Colors.textPrimary} />
          </ScalePressable>
        </View>

        <View style={styles.heroSection}> 
          <Text style={styles.heroLabel}>Total Available Balance</Text>
          <Text style={styles.heroBalance}>
            {loading ? (
              <Skeleton width={180} height={42} borderRadius={10} style={{ marginTop: 4 }} />
            ) : hasAvailableBalance ? (
              formatCurrency(totalAvailableBalance)
            ) : (
              'N/A'
            )}
          </Text>
          <Text style={styles.heroMeta}>{linkedAccountLabel}</Text>

          <View style={styles.syncButtonsContainer}>
            <ScalePressable
              style={styles.syncPillWrap}
              onPress={handleSync}
              disabled={syncing}
            >
              <GlassBackground
                blurIntensity={28}
                blurTint="systemChromeMaterialDark"
                style={styles.syncPill}
                tintColor="rgba(0, 0, 0, 0.4)"
                tintOpacity={0.6}
              >
                {syncing ? (
                  <ActivityIndicator size="small" color={Colors.textPrimary} />
                ) : (
                  <>
                    <Ionicons name="sync" size={15} color={Colors.textPrimary} />
                    <Text style={styles.syncText}>Sync</Text>
                  </>
                )}
              </GlassBackground>
            </ScalePressable>

            <ScalePressable
              style={styles.syncPillWrap}
              onPress={handleForceSync}
              disabled={syncing}
            >
              <GlassBackground
                blurIntensity={28}
                blurTint="systemChromeMaterialDark"
                style={styles.syncPill}
                tintColor="rgba(0, 0, 0, 0.4)"
                tintOpacity={0.6}
              >
                {syncing ? (
                  <ActivityIndicator size="small" color={Colors.textPrimary} />
                ) : (
                  <>
                    <Ionicons name="sync" size={15} color={Colors.textPrimary} />
                    <Text style={styles.syncText}>Force Sync</Text>
                  </>
                )}
              </GlassBackground>
            </ScalePressable>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Budgets</Text>
          <ScalePressable
            onPress={() => {
              setCreateModalVisible(true);
            }}
          >
            <Ionicons name="add-circle" size={26} color={Colors.accentBlueBright} />
          </ScalePressable>
        </View>

        {budgets.length === 0 ? (
          <View style={styles.emptyBudgets}>
            <Text style={styles.emptySubtitle}>No budgets yet. Create one to track your spending flow.</Text>
          </View>
        ) : (
          <Animated.ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.budgetList}>
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
                    onPress={() =>
                      router.push({
                        pathname: '/dashboard/budget/[id]',
                        params: { id: budget.id!, budgetName: budget.name }
                      })
                    }
                    onLongPress={() => setContextMenuBudget(budget)}
                    delayLongPress={1200}
                    style={[styles.budgetCard, { width: budgetCardWidth }]}
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
          </Animated.ScrollView>
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
                <Skeleton width={44} height={44} borderRadius={14} />
                <View style={styles.skeletonInfo}>
                  <Skeleton width="100%" height={12} borderRadius={6} />
                  <Skeleton width="60%" height={12} borderRadius={6} />
                </View>
                <Skeleton width={60} height={18} borderRadius={6} />
              </Animated.View>
            ))}
          </>
        ) : accounts.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="business-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No Accounts Linked</Text>
            <Text style={styles.emptySubtitle}>Go to Settings to link your bank with SimpleFIN.</Text>
            <ScalePressable style={styles.linkButton} onPress={() => router.push('/dashboard/settings')}>
              <LinearGradient
                colors={[Colors.gradientAccentStart, Colors.gradientAccentEnd]}
                style={styles.linkButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Ionicons name="link" size={18} color="#fff" />
                <Text style={styles.linkButtonText}>Link Bank Account</Text>
              </LinearGradient>
            </ScalePressable>
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
                <ScalePressable
                  style={styles.accountRow}
                  onPress={() =>
                    router.push({
                      pathname: '/dashboard/account/[id]',
                      params: { id: account.acc_id, accType: account.acc_type, provider: account.provider }
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
                        {
                          color:
                            account.available_balance === null
                              ? Colors.textMuted
                              : account.available_balance! >= 0
                                ? Colors.textPrimary
                                : Colors.negative,
                        },
                      ]}
                    >
                      {account.available_balance !== null ? formatCurrency(account.available_balance) : 'N/A'}
                    </Text>
                    <Text style={styles.accountCurrency}>{account.currency}</Text>
                  </View>
                </ScalePressable>
              </Animated.View>
            );
          })
        )}
      </Animated.ScrollView>

      <Modal visible={!!contextMenuBudget} transparent animationType="fade">
        <View style={styles.centeredCardOverlay}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setContextMenuBudget(null)} />
          <GlassBackground blurIntensity={65} blurTint="systemChromeMaterialDark" style={styles.contextMenu}>
            <ScalePressable
              style={styles.contextMenuItem}
              onPress={() => {
                const budget = contextMenuBudget;
                if (!budget) return;
                setContextMenuBudget(null);
                setEditingBudget(budget);
                setEditModalVisible(true);
              }}
            >
              <Ionicons name="pencil" size={20} color={Colors.textPrimary} />
              <Text style={styles.contextMenuText}>Edit Budget</Text>
            </ScalePressable>
            <View style={styles.contextMenuDivider} />
            <ScalePressable
              style={styles.contextMenuItem}
              onPress={() => {
                const idToDel = contextMenuBudget?.id;
                if (idToDel) {
                  setContextMenuBudget(null);
                  handleDeleteBudget(idToDel);
                }
              }}
            >
              <Ionicons name="trash-outline" size={20} color={Colors.negative} />
              <Text style={[styles.contextMenuText, { color: Colors.negative }]}>Delete Budget</Text>
            </ScalePressable>
          </GlassBackground>
        </View>
      </Modal>

      <BudgetFormModal
        visible={createModalVisible}
        onClose={() => setCreateModalVisible(false)}
        onSave={handleCreateBudget}
        isSaving={creatingBudget}
      />

      <BudgetFormModal
        visible={editModalVisible}
        onClose={() => {
          setEditModalVisible(false);
          setEditingBudget(null);
        }}
        onSave={handleUpdateBudget}
        initialData={editingBudget ?? undefined}
        isSaving={updatingBudget}
      />

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
  heroAvailableBalance: {
    ...Typography.footnote,
    color: Colors.textSecondary,
    marginTop: 6,
  },
  syncPillWrap: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    overflow: 'hidden',
  },
  syncButtonsContainer: {
    marginTop: 18,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
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
    backgroundColor: Colors.navGlassBackground,
    borderWidth: 1,
    borderColor: Colors.navGlassBorder,
  },
  budgetList: {
    gap: 12,
    paddingHorizontal: 20,
    paddingRight: 28,
  },
  budgetCard: {
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: Colors.navGlassBackground,
    borderWidth: 1,
    borderColor: Colors.navGlassBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 18,
    elevation: 7,
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
    backgroundColor: Colors.navGlassBackground,
    borderWidth: 1,
    borderColor: Colors.navGlassBorder,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
  },
  accountRowSkeleton: {
    marginHorizontal: 20,
    marginBottom: 10,
    borderRadius: 22,
    backgroundColor: Colors.navGlassBackground,
    borderWidth: 1,
    borderColor: Colors.navGlassBorder,
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
  accountAvailableBalance: {
    ...Typography.caption1,
    color: Colors.textSecondary,
    marginTop: 2,
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
    backgroundColor: Colors.navGlassBackground,
    borderWidth: 1,
    borderColor: Colors.navGlassBorder,
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
    backgroundColor: Colors.navGlassBackground,
    borderWidth: 1,
    borderColor: Colors.navGlassBorder,
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
    backgroundColor: Colors.navGlassBackground,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: Colors.navGlassBorder,
    overflow: 'hidden',
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
});
