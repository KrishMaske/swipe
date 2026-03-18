import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  ScalePressable,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassBackground } from '../components/GlassBackground';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ScalePressable } from '../components/ScalePressable';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import StarField from '../components/StarField';
import { api, Transaction } from '../services/api';
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

function parseTxnDate(txnDate: unknown): Date | null {
  if (txnDate === null || txnDate === undefined) return null;
  if (typeof txnDate === 'number') {
    const millis = txnDate < 1_000_000_000_000 ? txnDate * 1000 : txnDate;
    const parsed = new Date(millis);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(String(txnDate));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(txnDate: unknown): string {
  const d = parseTxnDate(txnDate);
  if (!d) return 'Unknown';
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

export default function RecentScansScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    accounts,
    transactionsCache,
    fetchAccounts,
    fetchTransactions,
    fetchFraudAlerts,
    optimisticallyRemoveFraudAlert,
  } = useData();

  const [loading, setLoading] = useState(true);
  const [selectedRange, setSelectedRange] = useState<DateRangeOption>(30);
  const [selectedScanTxn, setSelectedScanTxn] = useState<Transaction | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const allTransactions = useMemo(() => {
    return Object.values(transactionsCache)
      .flat()
      .sort((a, b) => {
        const left = parseTxnDate(a.txn_date)?.getTime() || 0;
        const right = parseTxnDate(b.txn_date)?.getTime() || 0;
        return right - left;
      });
  }, [transactionsCache]);

  const recentScans = useMemo(() => {
    if (selectedRange === 'all') return allTransactions;
    const now = Date.now();
    const cutoff = now - selectedRange * 24 * 60 * 60 * 1000;
    return allTransactions.filter((txn) => {
      const ts = parseTxnDate(txn.txn_date)?.getTime();
      return typeof ts === 'number' && ts >= cutoff;
    });
  }, [allTransactions, selectedRange]);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      const load = async () => {
        setLoading(true);
        await fetchAccounts();
        if (!mounted) return;
        const loadedAccounts = accounts || [];
        await Promise.all(loadedAccounts.map((acc) => fetchTransactions(acc.acc_id)));
        if (mounted) setLoading(false);
      };
      load();
      return () => {
        mounted = false;
      };
    }, [accounts, fetchAccounts, fetchTransactions])
  );

  const handleAction = async (txnId: string, isConfirmedFraud: boolean) => {
    setUpdating(txnId);
    if (!isConfirmedFraud) {
      optimisticallyRemoveFraudAlert(txnId);
    }
    try {
      await api.updateFraudStatus(txnId, isConfirmedFraud);
      setSelectedScanTxn(null);
      await Promise.all([fetchFraudAlerts(true), Promise.all((accounts || []).map((acc) => fetchTransactions(acc.acc_id)))]);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update status');
    } finally {
      setUpdating(null);
    }
  };

  return (
    <View style={styles.container}>
      <StarField />

      <GlassBackground
        blurIntensity={38}
        blurTint="systemChromeMaterialDark"
        style={[styles.header, { marginTop: insets.top + 8 }]}
        tintColor="rgba(0,0,0,0.4)"
        tintOpacity={0.6}
      >
        <View style={styles.headerTopRow}>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>Recent Scans</Text>
            <Text style={styles.headerProvider}>Transactions</Text>
          </View>
          <View style={styles.headerActions}>
            <View style={styles.headerCountPill}>
              <Text style={styles.headerCount}>
                {recentScans.length} transaction{recentScans.length !== 1 ? 's' : ''}
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

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
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

      {loading ? (
        <View style={[styles.container, styles.centered]}>
          <ActivityIndicator size="large" color={Colors.accentBlueBright} />
        </View>
      ) : recentScans.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="shield-checkmark" size={44} color={Colors.accentEmerald} />
          <Text style={styles.emptyText}>No transactions found</Text>
          <Text style={styles.emptySubtext}>Try a different date range or sync your account for newer activity.</Text>
        </View>
      ) : (
        <FlatList
          data={recentScans}
          keyExtractor={(item) => item.txn_id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
          renderItem={({ item, index }) => (
            <ScalePressable onLongPress={() => setSelectedScanTxn(item)} delayLongPress={1000}>
              <Animated.View entering={FadeInDown.delay(index * 22).springify()}>
                <GlassBackground
                  blurIntensity={38}
                  blurTint="systemChromeMaterialDark"
                  style={styles.txnCard}
                  tintColor="rgba(0,0,0,0.4)"
                  tintOpacity={0.6}
                >
                  <View style={[styles.categoryDot, { backgroundColor: item.amount < 0 ? Colors.negative : Colors.positive }]} />
                  <View style={styles.txnInfo}>
                    <Text style={styles.txnMerchant} numberOfLines={1}>{item.merchant || 'Unknown'}</Text>
                    <View style={styles.txnMeta}>
                      <Text style={styles.txnCategory}>{item.category || 'Uncategorized'}</Text>
                      {item.city && item.city !== 'REMOTE' && (
                        <>
                          <Text style={styles.txnDot}>·</Text>
                          <Text style={styles.txnLocation}>
                            {item.city}
                            {item.state && item.state !== 'REMOTE' ? `, ${item.state}` : ''}
                          </Text>
                        </>
                      )}
                    </View>
                    <Text style={styles.txnDate}>{formatDate(item.txn_date)}</Text>
                  </View>
                  <Text style={[styles.txnAmount, { color: item.amount < 0 ? Colors.negative : Colors.positive }]}>
                    {formatAmount(item.amount)}
                  </Text>
                </GlassBackground>
              </Animated.View>
            </ScalePressable>
          )}
        />
      )}

      <Modal visible={selectedScanTxn !== null} transparent animationType="fade">
        <View style={styles.inlineActionOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setSelectedScanTxn(null)} />
          <GlassBackground
            blurIntensity={65}
            blurTint="systemChromeMaterialDark"
            style={styles.scanActionCard}
            tintColor="rgba(0,0,0,0.4)"
            tintOpacity={0.6}
          >
            <Text style={styles.scanActionTitle} numberOfLines={2}>{selectedScanTxn?.merchant || 'Unknown Merchant'}</Text>
            <Text style={styles.scanActionMeta}>Update this transaction's fraud status.</Text>

            <ScalePressable
              style={[styles.scanActionButton, styles.safeButton]}
              onPress={() => selectedScanTxn && handleAction(selectedScanTxn.txn_id, false)}
              disabled={!!selectedScanTxn && updating === selectedScanTxn.txn_id}
            >
              <Ionicons name="checkmark-circle-outline" size={18} color={Colors.textPrimary} />
              <Text style={[styles.actionText, { color: Colors.textPrimary }]}>Set as Safe</Text>
            </ScalePressable>

            <ScalePressable
              style={[styles.scanActionButton, styles.fraudButton]}
              onPress={() => selectedScanTxn && handleAction(selectedScanTxn.txn_id, true)}
              disabled={!!selectedScanTxn && updating === selectedScanTxn.txn_id}
            >
              <Ionicons name="alert-circle-outline" size={18} color={Colors.negative} />
              <Text style={[styles.actionText, { color: Colors.negative }]}>Set as Fraud</Text>
            </ScalePressable>

            <ScalePressable style={styles.scanActionCancel} onPress={() => setSelectedScanTxn(null)}>
              <Text style={styles.scanActionCancelText}>Cancel</Text>
            </ScalePressable>
          </GlassBackground>
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
  header: {
    marginHorizontal: 16,
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