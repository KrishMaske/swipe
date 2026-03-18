import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, FraudTransaction } from '../services/api';
import { AppStackParamList } from '../types/navigation';
import { useData } from '../context/DataContext';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';

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
  if (score >= 0.5) return { text: 'High', color: Colors.negative };
  if (score >= 0.35) return { text: 'Medium', color: '#FFB347' };
  return { text: 'No Risk', color: Colors.accentEmerald };
}

type NavigationProp = NativeStackNavigationProp<AppStackParamList>;

export default function FraudAlertsScreen({ navigation }: { navigation: NavigationProp }) {
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
  const queueTransactions = fraudAlertsCache || [];
  const scannedCount = useMemo(
    () => Object.values(transactionsCache).flat().length,
    [transactionsCache]
  );

  const loading = fraudAlertsLoading && queueTransactions.length === 0 && scannedCount === 0;

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
        await refreshAllTransactions();
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
          onPress={() => navigation.navigate('RecentScans')}
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
    backgroundColor: Colors.navGlassBackground,
    borderWidth: 1,
    borderColor: Colors.navGlassBorder,
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
    backgroundColor: Colors.navGlassBackground,
    borderWidth: 1,
    borderColor: Colors.navGlassBorder,
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
    borderColor: Colors.navGlassBorder,
    backgroundColor: Colors.navGlassBackground,
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
    borderColor: Colors.navGlassBorder,
    backgroundColor: Colors.navGlassBackground,
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
    borderColor: Colors.navGlassBorder,
    backgroundColor: Colors.navGlassBackground,
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
    alignItems: 'center',
    paddingHorizontal: 22,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  scanActionCard: {
    width: '85%',
    maxWidth: 400,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.navGlassBorder,
    backgroundColor: Colors.navGlassBackground,
    padding: 24,
    gap: 8,
    overflow: 'hidden',
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
});
