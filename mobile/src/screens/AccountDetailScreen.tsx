import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api, Transaction } from '../services/api';
import { useData } from '../context/DataContext';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';

const CATEGORY_COLORS: Record<string, string> = {
  'Food & Dining': '#F59E0B',
  Transportation: '#3B82F6',
  Shopping: '#EC4899',
  Entertainment: '#8B5CF6',
  Bills: '#EF4444',
  Healthcare: '#14B8A6',
  Travel: '#06B6D4',
  Income: '#10B981',
  Uncategorized: '#6B7280',
};

function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] || Colors.accentBlue;
}

function formatDate(txnDate: any): string {
  try {
    // Try parsing as a date string first (Supabase returns timestamps as strings)
    const d = new Date(txnDate);
    if (!isNaN(d.getTime())) {
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

export default function AccountDetailScreen({ route, navigation }: any) {
  const { accId, accType, provider } = route.params;
  const { transactionsCache, transactionsLoading, fetchTransactions } = useData();

  const transactions = transactionsCache[accId]?.data || [];
  const loading = transactionsLoading[accId] && transactions.length === 0;

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
      <View style={styles.txnCard}>
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
      </View>
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
      {/* Account Header */}
      <View style={styles.header}>
        <Text style={styles.headerProvider}>{provider}</Text>
        <Text style={styles.headerCount}>
          {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {transactions.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="receipt-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyText}>No transactions found</Text>
          <Text style={styles.emptySubtext}>
            Try syncing your accounts to pull latest data
          </Text>
        </View>
      ) : (
        <FlatList
          data={transactions}
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
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerProvider: {
    ...Typography.headline,
    color: Colors.textSecondary,
  },
  headerCount: {
    ...Typography.caption1,
    color: Colors.textMuted,
    marginTop: 4,
  },
  list: {
    padding: 16,
    paddingBottom: 100,
  },
  txnCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    padding: 16,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
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
    fontWeight: '600',
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
