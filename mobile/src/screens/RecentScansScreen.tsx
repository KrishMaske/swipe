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
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassBackground } from '../components/GlassBackground';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ScalePressable } from '../components/ScalePressable';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, useAnimatedScrollHandler, runOnJS } from 'react-native-reanimated';
import { Swipeable } from 'react-native-gesture-handler';
import { GlassRefreshHeader } from '../components/GlassRefreshHeader';
import { Skeleton } from '../components/Skeleton';
import StarField from '../components/StarField';
import { api, Transaction } from '../services/api';
import { useAccounts } from '../context/AccountContext';
import { useTransactions } from '../context/TransactionContext';
import { useFraud } from '../context/FraudContext';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';
import { parseTxnDate, formatDate, formatAmount } from '../utils/format';

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

function getRiskColor(score: number): string {
  if (score >= 0.75) return '#FF4D4F';
  if (score >= 0.5) return Colors.negative;
  if (score >= 0.35) return '#FFB347';
  return Colors.accentEmerald;
}

const TransactionRow = React.memo(({
  item,
  index,
  updating,
  setSelectedScanTxn,
  renderLeftActions,
  renderRightActions,
  onAction,
}: {
  item: Transaction;
  index: number;
  updating: string | null;
  setSelectedScanTxn: (txn: Transaction) => void;
  renderLeftActions: (prog: any, drag: any, txn: Transaction) => React.ReactNode;
  renderRightActions: (prog: any, drag: any, txn: Transaction) => React.ReactNode;
  onAction: (id: string, isFraud: boolean) => void;
}) => {
  const location = item.city && item.city !== 'REMOTE'
    ? (item.state && item.state !== 'REMOTE' ? `${item.city}, ${item.state}` : item.city)
    : '';

  return (
    <Swipeable
      renderLeftActions={(prog, drag) => renderLeftActions(prog, drag, item)}
      renderRightActions={(prog, drag) => renderRightActions(prog, drag, item)}
      containerStyle={styles.swipeContainer}
      friction={2}
      leftThreshold={40}
      rightThreshold={40}
    >
      <ScalePressable
        onPress={() => setSelectedScanTxn(item)}
        disabled={updating === item.txn_id}
      >
        <Animated.View entering={FadeInDown.delay(index * 60).springify()}>
          <GlassBackground
            blurIntensity={30}
            blurTint="systemChromeMaterialDark"
            style={[styles.txnCard, updating === item.txn_id && { opacity: 0.6 }]}
            tintColor="rgba(0,0,0,0.5)"
            tintOpacity={0.7}
          >
            <View style={[styles.categoryDot, { backgroundColor: getCategoryColor(item.category) }]} />
            <View style={styles.txnInfo}>
              <Text style={styles.txnMerchant} numberOfLines={1}>{item.merchant || 'Unknown'}</Text>
              <View style={styles.txnMeta}>
                <Text style={styles.txnCategory}>{item.category || 'Uncategorized'}</Text>
                {!!location && (
                  <>
                    <Text style={styles.txnDot}>•</Text>
                    <Text style={styles.txnLocation} numberOfLines={1}>{location}</Text>
                  </>
                )}
              </View>
              <View style={styles.txnDateRow}>
                <Text style={styles.txnDate}>{formatDate(item.txn_date)}</Text>
                <Text style={styles.txnDot}>•</Text>
                <Text style={[styles.txnRisk, { color: getRiskColor(item.risk_score || 0) }]}>
                  {Math.round((item.risk_score || 0) * 100)}% Risk
                </Text>
              </View>
            </View>
            <Text style={[styles.txnAmount, { color: item.amount < 0 ? Colors.negative : Colors.positive }]}>
              {formatAmount(item.amount)}
            </Text>
          </GlassBackground>
        </Animated.View>
      </ScalePressable>
    </Swipeable>
  );
});

export default function RecentScansScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { accounts, fetchAccounts } = useAccounts();
  const { transactionsCache, fetchTransactions } = useTransactions();
  const { fetchFraudAlerts, optimisticallyRemoveFraudAlert } = useFraud();

  const [loading, setLoading] = useState(true);
  const [selectedRange, setSelectedRange] = useState<DateRangeOption>(30);
  const [selectedScanTxn, setSelectedScanTxn] = useState<Transaction | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const scrollY = useSharedValue(0);
  const REFRESH_THRESHOLD = 80;

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchAccounts();
      const loadedAccounts = accounts || [];
      await Promise.all(loadedAccounts.map((acc) => fetchTransactions(acc.acc_id, true)));
    } finally {
      setRefreshing(false);
    }
  };

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
      await Promise.all([
        fetchFraudAlerts(true),
        Promise.all((accounts || []).map((acc) => fetchTransactions(acc.acc_id, true))),
      ]);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update status');
    } finally {
      setUpdating(null);
    }
  };

  const renderLeftActions = useCallback((_prog: any, _drag: any, txn: Transaction) => {
    return (
      <ScalePressable
        style={styles.swipeActionSafe}
        onPress={() => handleAction(txn.txn_id, false)}
      >
        <View style={styles.swipeIconWrap}>
          <Ionicons name="checkmark-circle-outline" size={24} color={Colors.accentEmerald} />
          <Text style={[styles.swipeText, { color: Colors.accentEmerald }]}>Safe</Text>
        </View>
      </ScalePressable>
    );
  }, [accounts]);

  const renderRightActions = useCallback((_prog: any, _drag: any, txn: Transaction) => {
    return (
      <ScalePressable
        style={styles.swipeActionFraud}
        onPress={() => handleAction(txn.txn_id, true)}
      >
        <View style={styles.swipeIconWrap}>
          <Ionicons name="alert-circle-outline" size={24} color={Colors.negative} />
          <Text style={[styles.swipeText, { color: Colors.negative }]}>Fraud</Text>
        </View>
      </ScalePressable>
    );
  }, [accounts]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <StarField />
      </View>
      <GlassBackground
        collapsable={false}
        blurIntensity={38}
        blurTint="systemChromeMaterialDark"
        style={styles.header}
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

      {!loading && (
        <GlassRefreshHeader scrollY={scrollY} refreshing={refreshing} threshold={REFRESH_THRESHOLD} />
      )}

      {loading ? (
        <View style={styles.list}>
          {[0, 1, 2, 3].map(i => (
            <Skeleton key={i} width="100%" height={90} borderRadius={24} style={{ marginBottom: 12 }} />
          ))}
        </View>
      ) : recentScans.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="shield-checkmark" size={44} color={Colors.accentEmerald} />
          <Text style={styles.emptyText}>No transactions found</Text>
          <Text style={styles.emptySubtext}>Try a different date range or sync your account for newer activity.</Text>
        </View>
      ) : (
        <Animated.FlatList
          data={recentScans}
          keyExtractor={(item) => item.txn_id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          renderItem={({ item, index }) => (
            <TransactionRow
              item={item}
              index={index}
              updating={updating}
              setSelectedScanTxn={setSelectedScanTxn}
              renderLeftActions={renderLeftActions}
              renderRightActions={renderRightActions}
              onAction={handleAction}
            />
          )}
        />
      )}
    </SafeAreaView>
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
    marginBottom: 0,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
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
    ...Typography.caption2,
    color: Colors.textSecondary,
    flexShrink: 1,
  },
  txnRisk: {
    ...Typography.caption2,
    fontWeight: '700',
  },
  txnDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
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
  swipeContainer: {
    borderRadius: 24,
    marginBottom: 12,
    overflow: 'hidden',
  },
  swipeActionSafe: {
    backgroundColor: 'rgba(46,230,166,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(46,230,166,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    width: 90,
    height: '100%',
    borderRadius: 24,
  },
  swipeActionFraud: {
    backgroundColor: 'rgba(255,107,107,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,107,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    width: 90,
    height: '100%',
    borderRadius: 24,
  },
  swipeIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  swipeText: {
    ...Typography.caption2,
    fontWeight: '700',
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
  inlineActionOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 22,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
});