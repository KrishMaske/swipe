import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
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

export default function AccountDetailScreen({ route, navigation }: any) {
  const { accId, accType, provider } = route.params;
  const { transactionsCache, transactionsLoading, fetchTransactions } = useData();
  const [selectedRange, setSelectedRange] = useState<DateRangeOption>(30);

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

  const renderTransaction = ({ item }: { item: Transaction }) => {
    const catColor = getCategoryColor(item.category);
    const isNegative = item.amount < 0;

    return (
      <BlurView intensity={38} tint="dark" style={styles.txnCard}>
        <View style={[styles.categoryDot, { backgroundColor: catColor }]} />
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
      <LinearGradient
        colors={[Colors.gradientStart, Colors.gradientMid, Colors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

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
});
