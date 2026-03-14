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
import { api, FraudTransaction } from '../services/api';
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
  if (score >= 0.75) return { text: 'Critical', color: Colors.negative };
  if (score >= 0.5) return { text: 'High', color: '#FFB347' };
  if (score >= 0.25) return { text: 'Medium', color: Colors.accentAmber };
  return { text: 'Low', color: Colors.accentEmerald };
}

export default function FraudAlertsScreen() {
  const insets = useSafeAreaInsets();
  const {
    fraudAlertsCache,
    fraudAlertsLoading,
    fetchFraudAlerts,
    optimisticallyRemoveFraudAlert,
  } = useData();

  const [refreshing, setRefreshing] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);

  const transactions = fraudAlertsCache?.data || [];
  const loading = fraudAlertsLoading && transactions.length === 0;

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
    () => transactions.filter((t) => (t.risk_score ?? 0) >= 0.75).length,
    [transactions]
  );

  const flaggedCount = transactions.filter((t) => (t.risk_score ?? 0) >= 0.5).length;

  const recentScans = useMemo(() => {
    return transactions.slice(0, 8).map((t) => ({
      ...t,
      status: (t.risk_score ?? 0) >= 0.5 ? 'Flagged' : 'Verified',
    }));
  }, [transactions]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchFraudAlerts(true);
    setRefreshing(false);
  };

  useFocusEffect(
    useCallback(() => {
      fetchFraudAlerts();
    }, [fetchFraudAlerts])
  );

  const handleAction = async (txnId: string, isConfirmedFraud: boolean) => {
    setUpdating(txnId);
    optimisticallyRemoveFraudAlert(txnId);

    try {
      api.updateFraudStatus(txnId, isConfirmedFraud).catch((err: any) => {
        Alert.alert('Error', err.message || 'Failed to update status');
      });
    } finally {
      setUpdating(null);
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
            <Text style={styles.headerTitle}>SwipeGuard</Text>
          </View>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>Scanning</Text>
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
            {transactions.length} transactions scanned in this cycle
          </Text>
        </View>

        <View style={styles.metricRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Scanned</Text>
            <Text style={styles.metricValue}>{transactions.length}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Flagged</Text>
            <Text style={[styles.metricValue, { color: Colors.negative }]}>{flaggedCount}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Critical</Text>
            <Text style={[styles.metricValue, { color: '#FFB3B3' }]}>{criticalCount}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Recent Scans</Text>
        <View style={styles.scanList}>
          {recentScans.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="shield-checkmark" size={44} color={Colors.accentEmerald} />
              <Text style={styles.emptyTitle}>No alerts right now</Text>
              <Text style={styles.emptySubtitle}>SwipeGuard is actively monitoring for anomalies.</Text>
            </View>
          ) : (
            recentScans.map((item, index) => {
              const flagged = item.status === 'Flagged';
              const badgeColor = flagged ? Colors.negative : Colors.accentEmerald;
              return (
                <Animated.View key={item.txn_id} entering={FadeInDown.delay(index * 55).springify()} style={styles.scanItem}>
                  <View style={styles.scanItemLeft}>
                    <View style={styles.scanIconWrap}>
                      <Ionicons name={flagged ? 'warning-outline' : 'checkmark-done-outline'} size={16} color={badgeColor} />
                    </View>
                    <View>
                      <Text style={styles.scanMerchant} numberOfLines={1}>
                        {item.merchant || 'Unknown Merchant'}
                      </Text>
                      <Text style={styles.scanMeta}>{formatDate(item.txn_date)} · {formatAmount(item.amount)}</Text>
                    </View>
                  </View>
                  <View style={[styles.scanBadge, { backgroundColor: badgeColor + '20' }]}>
                    <Text style={[styles.scanBadgeText, { color: badgeColor }]}>{item.status}</Text>
                  </View>
                </Animated.View>
              );
            })
          )}
        </View>

        {transactions.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Action Queue</Text>
            <View style={styles.queueList}>
              {transactions.map((item, index) => {
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

                    <Text style={styles.queueMeta}>{formatAmount(item.amount)} · {formatDate(item.txn_date)}</Text>

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
                            <Ionicons name="checkmark-circle-outline" size={16} color={Colors.accentEmerald} />
                            <Text style={[styles.actionText, { color: Colors.accentEmerald }]}>Mark Safe</Text>
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
    paddingHorizontal: 16,
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
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyTitle: {
    ...Typography.headline,
    color: Colors.textPrimary,
    marginTop: 10,
  },
  emptySubtitle: {
    ...Typography.footnote,
    color: Colors.textMuted,
    marginTop: 4,
  },
});
