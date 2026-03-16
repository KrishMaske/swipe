import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import StarField from '../components/StarField';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { api, FraudTransaction, Transaction } from '../services/api';
import { useData } from '../context/DataContext';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';

type DateRangeOption = 7 | 14 | 30 | 60 | 90 | 'all';

const DATE_RANGE_OPTIONS: Array<{ label: string; value: DateRangeOption }> = [
  { label: '7D', value: 7 },
  { label: '14D', value: 14 },
  { label: '30D', value: 30 },
  { label: '60D', value: 60 },
  { label: '90D', value: 90 },
  { label: 'All', value: 'all' },
];

function formatDate(txnDate: any): string {
  try {
    const d = new Date(txnDate);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }
    return 'Unknown';
  } catch {
    return 'Unknown';
  }
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

function formatAmount(amount: number): string {
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return amount < 0 ? `-$${formatted}` : `$${formatted}`;
}

function riskLabel(score: number): { text: string; color: string } {
  if (score >= 0.75) return { text: 'Critical', color: '#FF4D4F' };
  if (score >= 0.5) return { text: 'Critical', color: Colors.negative };
  if (score >= 0.35) return { text: 'Medium', color: '#FFB347' };
  return { text: 'No Risk', color: Colors.accentEmerald };
}

function scanStatus(txn: Transaction): { text: string; color: string; flagged: boolean } {
  const risk = txn.risk_score ?? 0;
  const flagged = Boolean(txn.is_flagged_fraud) || risk >= 0.35;
  if (!flagged) {
    return { text: 'No Risk', color: Colors.accentEmerald, flagged: false };
  }
  if (risk >= 0.75) {
    return { text: 'Critical', color: '#FF4D4F', flagged: true };
  }
  if (risk >= 0.5) {
    return { text: 'Critical', color: Colors.negative, flagged: true };
  }
  return { text: 'Medium', color: '#FFB347', flagged: true };
}

export default function FraudAlertsScreen() {
  const insets = useSafeAreaInsets();
  const {
    accounts,
    fetchAccounts,
    transactionsCache,
    fetchTransactions,
    fraudAlertsCache,
    fraudAlertsLoading,
    fetchFraudAlerts,
    optimisticallyRemoveFraudAlert,
  } = useData();

  const [refreshing, setRefreshing] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [showRecentScans, setShowRecentScans] = useState(false);
  const [selectedScanTxn, setSelectedScanTxn] = useState<Transaction | null>(null);
  const [selectedRange, setSelectedRange] = useState<DateRangeOption>(30);

  const queueTransactions = fraudAlertsCache || [];

  const allTransactions = useMemo(() => {
    return Object.values(transactionsCache)
      .flat()
      .sort((a, b) => {
        const left = parseTxnDate(a.txn_date)?.getTime() || 0;
        const right = parseTxnDate(b.txn_date)?.getTime() || 0;
        return right - left;
      });
  }, [transactionsCache]);

  const loading = fraudAlertsLoading && queueTransactions.length === 0 && allTransactions.length === 0;

  const pulse = useSharedValue(0.9);
  React.useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1.08, {
        duration: 1800,
        easing: Easing.inOut(Easing.quad),
      }),
      -1,
      true
    );
  }, [pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    opacity: 0.2 + (pulse.value - 0.9) * 1.2,
  }));

  const criticalCount = useMemo(
    () => queueTransactions.filter((t) => (t.risk_score ?? 0) >= 0.5).length,
    [queueTransactions]
  );

  const flaggedCount = useMemo(
    () => queueTransactions.filter((t) => Boolean(t.is_flagged_fraud) || (t.risk_score ?? 0) >= 0.35).length,
    [queueTransactions]
  );

  const scannedCount = allTransactions.length;

  const recentScans = useMemo(() => {
    if (selectedRange === 'all') {
      return allTransactions;
    }

    const now = Date.now();
    const cutoff = now - selectedRange * 24 * 60 * 60 * 1000;
    return allTransactions.filter((txn) => {
      const ts = parseTxnDate(txn.txn_date)?.getTime();
      return typeof ts === 'number' && ts >= cutoff;
    });
  }, [allTransactions, selectedRange]);

  const closeRecentScansModal = () => {
    setShowRecentScans(false);
    setSelectedScanTxn(null);
  };

  const openScanActionModal = (txn: Transaction) => {
    setSelectedScanTxn(txn);
  };

  const refreshAllTransactions = useCallback(async (forceRefresh = false) => {
    const loadedAccounts = accounts || [];
    await Promise.all(loadedAccounts.map((acc) => fetchTransactions(acc.acc_id, forceRefresh)));
  }, [accounts, fetchTransactions]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAccounts(true);
    await Promise.all([
      fetchFraudAlerts(true),
      refreshAllTransactions(true),
    ]);
    setRefreshing(false);
  };

  useFocusEffect(
    useCallback(() => {
      let mounted = true;

      const load = async () => {
        await fetchAccounts();
        if (!mounted) {
          return;
        }
        await refreshAllTransactions(true);
        await fetchFraudAlerts();
      };

      load();
      return () => {
        mounted = false;
      };
    }, [fetchAccounts, fetchFraudAlerts, refreshAllTransactions])
  );

  const handleAction = async (txnId: string, isConfirmedFraud: boolean) => {
    setUpdating(txnId);
    if (!isConfirmedFraud) {
      optimisticallyRemoveFraudAlert(txnId);
    }

    try {
      await api.updateFraudStatus(txnId, isConfirmedFraud);
      setSelectedScanTxn(null);
      Promise.all([
        fetchFraudAlerts(true),
        refreshAllTransactions(),
      ]).finally(() => setUpdating(null));
    } catch (err: any) {
      setUpdating(null);
      Alert.alert('Error', err?.message || 'Failed to update status');
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={Colors.accentBlueBright} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#000000', '#000000', '#000000']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <StarField />
      <View style={styles.bgGlow} />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 8, paddingBottom: 110 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.accentBlueBright}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerEyebrow}>Swipe</Text>
            <Text style={styles.headerTitle}>Guard</Text>
          </View>
        </View>

        <View style={styles.statusCard}>
          <Animated.View style={[styles.pulseRing, pulseStyle]} />
          <LinearGradient
            colors={['rgba(79,124,255,0.28)', 'rgba(46,230,166,0.22)']}
            style={styles.systemShield}
          >
            <Ionicons name="shield-checkmark" size={36} color={Colors.textPrimary} />
          </LinearGradient>
          <Text style={styles.systemLabel}>System Status</Text>
          <Text style={styles.systemValue}>{flaggedCount > 0 ? 'Threats Detected' : 'Protected'}</Text>
          <Text style={styles.systemSubtitle}>
            {scannedCount} transactions scanned in this cycle
          </Text>
        </View>

        <View style={styles.metricRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Scanned</Text>
            <Text style={styles.metricValue}>{scannedCount}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Flagged</Text>
            <Text style={[styles.metricValue, { color: '#FFB347' }]}>{flaggedCount}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Critical</Text>
            <Text style={[styles.metricValue, { color: '#FFB3B3' }]}>{criticalCount}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Recent Scans</Text>
        <TouchableOpacity
          style={styles.viewScansButton}
          onPress={() => setShowRecentScans(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="list-outline" size={16} color={Colors.textPrimary} />
          <Text style={styles.viewScansText}>View Recent Scans</Text>
        </TouchableOpacity>

        {queueTransactions.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Action Queue</Text>
            <View style={styles.queueList}>
              {queueTransactions.map((item, index) => {
                const risk = riskLabel(item.risk_score ?? 0);
                const isProcessing = updating === item.txn_id;
                return (
                  <Animated.View key={item.txn_id} entering={FadeInDown.delay(index * 80).springify()} style={styles.queueCard}>
                    <View style={styles.queueHeader}>
                      <Text style={styles.queueMerchant}>{item.merchant || 'Unknown Merchant'}</Text>
                      <View style={[styles.riskBadge, { backgroundColor: risk.color + '1F' }]}>
                        <Text style={[styles.riskBadgeText, { color: risk.color }]}>{risk.text}</Text>
                      </View>
                    </View>

                    <Text style={[styles.queueMeta, { color: item.amount < 0 ? Colors.negative : Colors.positive }]}>{formatAmount(item.amount)}<Text style={styles.queueMeta}> · {formatDate(item.txn_date)}</Text></Text>

                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.safeButton]}
                        onPress={() => handleAction(item.txn_id, false)}
                        disabled={isProcessing}
                        activeOpacity={0.85}
                      >
                        {isProcessing ? (
                          <ActivityIndicator size="small" color={Colors.accentEmerald} />
                        ) : (
                          <>
                            <Ionicons name="checkmark-circle-outline" size={16} color="#2EE6A6" />
                            <Text style={[styles.actionText, { color: Colors.textPrimary }]}>Mark Safe</Text>
                          </>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.actionButton, styles.fraudButton]}
                        onPress={() => handleAction(item.txn_id, true)}
                        disabled={isProcessing}
                        activeOpacity={0.85}
                      >
                        {isProcessing ? (
                          <ActivityIndicator size="small" color={Colors.negative} />
                        ) : (
                          <>
                            <Ionicons name="alert-circle-outline" size={16} color={Colors.negative} />
                            <Text style={[styles.actionText, { color: Colors.negative }]}>Confirm Fraud</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  </Animated.View>
                );
              })}
            </View>
          </>
        )}

      </ScrollView>

      <Modal visible={showRecentScans} transparent animationType="slide" onRequestClose={closeRecentScansModal}>
        <View style={styles.recentScansModalOverlay}>
          <View style={styles.recentScansModalFullScreen}>
            <BlurView intensity={38} tint="dark" style={styles.recentScansHeader}>
              <View style={styles.recentScansHeaderTopRow}>
                <View style={styles.recentScansHeaderTitleWrap}>
                  <Text style={styles.recentScansHeaderTitle}>Transactions</Text>
                  <Text style={styles.recentScansHeaderProvider}>Recent Scans</Text>
                </View>
                <View style={styles.recentScansHeaderActions}>
                  <View style={styles.recentScansHeaderCountPill}>
                    <Text style={styles.recentScansHeaderCount}>
                      {recentScans.length} transaction{recentScans.length !== 1 ? 's' : ''}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={closeRecentScansModal}>
                    <Ionicons name="close" size={24} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.recentScansFilterRow}
              >
                {DATE_RANGE_OPTIONS.map((option) => {
                  const active = selectedRange === option.value;
                  return (
                    <TouchableOpacity
                      key={String(option.value)}
                      style={[styles.recentScansFilterChip, active && styles.recentScansFilterChipActive]}
                      onPress={() => setSelectedRange(option.value)}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.recentScansFilterChipText, active && styles.recentScansFilterChipTextActive]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </BlurView>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.recentScansList}>
              {recentScans.length === 0 ? (
                <View style={styles.recentScansEmptyState}>
                  <Ionicons name="shield-checkmark" size={44} color={Colors.accentEmerald} />
                  <Text style={styles.recentScansEmptyText}>No transactions found</Text>
                  <Text style={styles.recentScansEmptySubtext}>Try a different date range or sync your account for newer activity.</Text>
                </View>
              ) : (
                recentScans.map((item, index) => {
                  const status = scanStatus(item);
                  return (
                    <TouchableOpacity
                      key={item.txn_id}
                      activeOpacity={0.9}
                      onLongPress={() => openScanActionModal(item)}
                      delayLongPress={1000}
                    >
                      <Animated.View entering={FadeInDown.delay(index * 22).springify()}>
                        <BlurView intensity={38} tint="dark" style={styles.recentTxnCard}>
                          <View style={[styles.recentCategoryDot, { backgroundColor: status.color }]} />
                          <View style={styles.recentTxnInfo}>
                            <Text style={styles.recentTxnMerchant} numberOfLines={1}>
                              {item.merchant || 'Unknown'}
                            </Text>
                            <View style={styles.recentTxnMeta}>
                              <Text style={styles.recentTxnCategory}>{status.text}</Text>
                              <Text style={styles.recentTxnDot}>·</Text>
                              <Text style={styles.recentTxnLocation}>score {(item.risk_score ?? 0).toFixed(2)}</Text>
                            </View>
                            <Text style={styles.recentTxnDate}>{formatDate(item.txn_date)}</Text>
                          </View>
                          <View style={styles.recentTxnRight}>
                            <Text style={[styles.recentTxnAmount, { color: item.amount < 0 ? Colors.negative : Colors.positive }]}>{formatAmount(item.amount)}</Text>
                            <View style={[styles.recentTxnBadge, { backgroundColor: `${status.color}20` }]}>
                              <Text style={[styles.recentTxnBadgeText, { color: status.color }]}>{status.text}</Text>
                            </View>
                          </View>
                        </BlurView>
                      </Animated.View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            {selectedScanTxn && (
              <View style={styles.inlineActionOverlay}>
                <TouchableOpacity
                  style={StyleSheet.absoluteFillObject}
                  activeOpacity={1}
                  onPress={() => setSelectedScanTxn(null)}
                />

                <View style={styles.scanActionCard}>
                  <Text style={styles.scanActionTitle} numberOfLines={2}>{selectedScanTxn.merchant || 'Unknown Merchant'}</Text>
                  <Text style={styles.scanActionMeta}>
                    Update this transaction's fraud status.
                  </Text>

                  <TouchableOpacity
                    style={[styles.scanActionButton, styles.safeButton]}
                    onPress={() => handleAction(selectedScanTxn.txn_id, false)}
                    disabled={updating === selectedScanTxn.txn_id}
                  >
                    <Ionicons name="checkmark-circle-outline" size={18} color={Colors.textPrimary} />
                    <Text style={[styles.actionText, { color: Colors.textPrimary }]}>Set as Safe</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.scanActionButton, styles.fraudButton]}
                    onPress={() => handleAction(selectedScanTxn.txn_id, true)}
                    disabled={updating === selectedScanTxn.txn_id}
                  >
                    <Ionicons name="alert-circle-outline" size={18} color={Colors.negative} />
                    <Text style={[styles.actionText, { color: Colors.negative }]}>Set as Fraud</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.scanActionCancel}
                    onPress={() => setSelectedScanTxn(null)}
                  >
                    <Text style={styles.scanActionCancelText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
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
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  bgGlow: {
    display: 'none',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    backgroundColor: 'rgba(46,230,166,0.12)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.accentEmerald,
  },
  liveText: {
    ...Typography.caption2,
    color: Colors.accentEmerald,
    fontWeight: '700',
  },
  statusCard: {
    alignItems: 'center',
    borderRadius: 24,
    paddingTop: 22,
    paddingBottom: 18,
    marginBottom: 14,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    overflow: 'hidden',
  },
  pulseRing: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 1,
    borderColor: 'rgba(130,166,255,0.55)',
    top: -6,
  },
  systemShield: {
    width: 94,
    height: 94,
    borderRadius: 47,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  systemLabel: {
    ...Typography.caption1,
    color: Colors.textMuted,
    marginTop: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  systemValue: {
    ...Typography.headline,
    color: Colors.textPrimary,
    marginTop: 4,
  },
  systemSubtitle: {
    ...Typography.footnote,
    color: Colors.textMuted,
    marginTop: 4,
  },
  metricRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  metricLabel: {
    ...Typography.caption2,
    color: Colors.textMuted,
    textTransform: 'uppercase',
  },
  metricValue: {
    ...Typography.title3,
    color: Colors.textPrimary,
    marginTop: 4,
  },
  sectionTitle: {
    ...Typography.headline,
    color: Colors.textPrimary,
    marginTop: 8,
    marginBottom: 10,
  },
  scanList: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 10,
    gap: 8,
  },
  scanItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  scanItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 8,
  },
  scanInfoWrap: {
    flex: 1,
    minWidth: 0,
  },
  scanIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  scanMerchant: {
    ...Typography.subhead,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  scanMeta: {
    ...Typography.caption1,
    color: Colors.textMuted,
    marginTop: 2,
  },
  scanBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginLeft: 8,
    flexShrink: 0,
  },
  scanBadgeText: {
    ...Typography.caption2,
    fontWeight: '700',
  },
  queueList: {
    gap: 10,
  },
  queueCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  queueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  queueMerchant: {
    ...Typography.subhead,
    color: Colors.textPrimary,
    fontWeight: '700',
    flex: 1,
  },
  queueMeta: {
    ...Typography.caption1,
    color: Colors.textMuted,
    marginTop: 4,
  },
  riskBadge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  riskBadgeText: {
    ...Typography.caption2,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  actionButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  safeButton: {
    backgroundColor: 'rgba(46,230,166,0.11)',
    borderWidth: 1,
    borderColor: 'rgba(46,230,166,0.3)',
  },
  fraudButton: {
    backgroundColor: 'rgba(255,107,107,0.11)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,107,0.3)',
  },
  actionText: {
    ...Typography.footnote,
    fontWeight: '700',
  },
  viewScansButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 10,
  },
  viewScansText: {
    ...Typography.footnote,
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  inlineActionOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    paddingHorizontal: 22,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  scanActionCard: {
    width: '100%',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    backgroundColor: 'rgba(18,20,26,0.95)',
    padding: 14,
    gap: 8,
  },
  scanActionTitle: {
    ...Typography.subhead,
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  scanActionMeta: {
    ...Typography.caption1,
    color: Colors.textMuted,
    marginBottom: 6,
  },
  scanActionButton: {
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  scanActionCancel: {
    marginTop: 6,
    alignItems: 'center',
    paddingVertical: 10,
  },
  scanActionCancelText: {
    ...Typography.footnote,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  recentScansModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
  },
  recentScansModalFullScreen: {
    flex: 1,
    paddingBottom: 16,
  },
  recentScansHeader: {
    marginHorizontal: 16,
    marginTop: 52,
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
  recentScansHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  recentScansHeaderTitleWrap: {
    flex: 1,
  },
  recentScansHeaderTitle: {
    ...Typography.title3,
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  recentScansHeaderProvider: {
    ...Typography.caption1,
    color: Colors.textSecondary,
    marginTop: 3,
  },
  recentScansHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  recentScansHeaderCountPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  recentScansHeaderCount: {
    ...Typography.caption2,
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  recentScansFilterRow: {
    gap: 8,
    paddingTop: 12,
    paddingBottom: 2,
  },
  recentScansFilterChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  recentScansFilterChipActive: {
    backgroundColor: 'rgba(248,113,113,0.22)',
    borderColor: 'rgba(248,113,113,0.62)',
  },
  recentScansFilterChipText: {
    ...Typography.caption1,
    color: Colors.textSecondary,
    fontWeight: '700',
  },
  recentScansFilterChipTextActive: {
    color: Colors.textPrimary,
  },
  recentScansList: {
    padding: 16,
    paddingTop: 8,
    paddingBottom: 100,
  },
  recentTxnCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(10,10,12,0.38)',
    padding: 16,
    borderRadius: 24,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 18,
    elevation: 7,
    overflow: 'hidden',
  },
  recentCategoryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 14,
  },
  recentTxnInfo: {
    flex: 1,
  },
  recentTxnMerchant: {
    ...Typography.subhead,
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  recentTxnMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  recentTxnCategory: {
    ...Typography.caption1,
    color: Colors.textSecondary,
  },
  recentTxnDot: {
    color: Colors.textMuted,
    marginHorizontal: 5,
  },
  recentTxnLocation: {
    ...Typography.caption1,
    color: Colors.textMuted,
  },
  recentTxnDate: {
    ...Typography.caption2,
    color: Colors.textMuted,
    marginTop: 4,
  },
  recentTxnRight: {
    alignItems: 'flex-end',
    marginLeft: 8,
    gap: 8,
  },
  recentTxnAmount: {
    ...Typography.headline,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  recentTxnBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  recentTxnBadgeText: {
    ...Typography.caption2,
    fontWeight: '700',
  },
  recentScansEmptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingTop: 80,
  },
  recentScansEmptyText: {
    ...Typography.headline,
    color: Colors.textSecondary,
    marginTop: 16,
  },
  recentScansEmptySubtext: {
    ...Typography.footnote,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
  },
});
