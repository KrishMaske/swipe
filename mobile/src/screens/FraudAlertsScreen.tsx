import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api, FraudTransaction } from '../services/api';
import { useData } from '../context/DataContext';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';

function formatDate(txnDate: any): string {
  try {
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

function riskLabel(score: number): { text: string; color: string } {
  if (score >= 0.75) return { text: 'Critical', color: '#EF4444' };
  if (score >= 0.5) return { text: 'High', color: '#F97316' };
  if (score >= 0.25) return { text: 'Medium', color: Colors.accentAmber };
  return { text: 'Low', color: Colors.accentEmerald };
}

export default function FraudAlertsScreen() {
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
    
    // Optimistic UI update - remove instantly from the screen
    optimisticallyRemoveFraudAlert(txnId);
    
    try {
      // Fire-and-forget the API call so the UI doesn't block
      api.updateFraudStatus(txnId, isConfirmedFraud).catch((err: any) => {
        // Only show error if the background call fails
        Alert.alert('Error', err.message || 'Failed to update status');
        // A robust app might revert the optimistic update here, 
        // but for now we'll just show the error.
      });
    } finally {
      setUpdating(null);
    }
  };

  const renderTransaction = ({ item }: { item: FraudTransaction }) => {
    const risk = riskLabel(item.risk_score ?? 0);
    const isNegative = item.amount < 0;
    const isProcessing = updating === item.txn_id;

    return (
      <View style={styles.card}>
        {/* Risk badge */}
        <View style={styles.cardHeader}>
          <View style={styles.merchantRow}>
            <View style={[styles.riskDot, { backgroundColor: risk.color }]} />
            <Text style={styles.merchantName} numberOfLines={1}>
              {item.merchant || 'Unknown Merchant'}
            </Text>
          </View>
          <View style={[styles.riskBadge, { backgroundColor: risk.color + '22' }]}>
            <Text style={[styles.riskText, { color: risk.color }]}>
              {risk.text} Risk
            </Text>
          </View>
        </View>

        {/* Transaction details */}
        <View style={styles.detailsRow}>
          <View style={styles.detailItem}>
            <Ionicons name="cash-outline" size={14} color={Colors.textMuted} />
            <Text
              style={[
                styles.detailValue,
                { color: isNegative ? Colors.negative : Colors.positive },
              ]}
            >
              {formatAmount(item.amount)}
            </Text>
          </View>
          <View style={styles.detailItem}>
            <Ionicons name="calendar-outline" size={14} color={Colors.textMuted} />
            <Text style={styles.detailValue}>{formatDate(item.txn_date)}</Text>
          </View>
          {item.category && (
            <View style={styles.detailItem}>
              <Ionicons name="pricetag-outline" size={14} color={Colors.textMuted} />
              <Text style={styles.detailValue}>{item.category}</Text>
            </View>
          )}
        </View>

        {item.city && item.city !== 'REMOTE' && (
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={14} color={Colors.textMuted} />
            <Text style={styles.locationText}>
              {item.city}
              {item.state && item.state !== 'REMOTE' ? `, ${item.state}` : ''}
            </Text>
          </View>
        )}

        {/* Risk score bar */}
        <View style={styles.riskBarContainer}>
          <Text style={styles.riskBarLabel}>Risk Score</Text>
          <View style={styles.riskBarTrack}>
            <LinearGradient
              colors={['#34D399', '#FBBF24', '#EF4444']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.riskBarFill, { width: `${Math.min((item.risk_score ?? 0) * 100, 100)}%` }]}
            />
          </View>
          <Text style={[styles.riskBarValue, { color: risk.color }]}>
            {((item.risk_score ?? 0) * 100).toFixed(0)}%
          </Text>
        </View>

        {/* Action buttons */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.dismissBtn]}
            onPress={() => handleAction(item.txn_id, false)}
            disabled={isProcessing}
            activeOpacity={0.7}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color={Colors.accentEmerald} />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={18} color={Colors.accentEmerald} />
                <Text style={[styles.actionText, { color: Colors.accentEmerald }]}>Not Fraud</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.confirmBtn]}
            onPress={() => handleAction(item.txn_id, true)}
            disabled={isProcessing}
            activeOpacity={0.7}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color={Colors.negative} />
            ) : (
              <>
                <Ionicons name="alert-circle-outline" size={18} color={Colors.negative} />
                <Text style={[styles.actionText, { color: Colors.negative }]}>Confirm Fraud</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
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
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="shield" size={28} color={Colors.accentCoral} />
        </View>
        <View>
          <Text style={styles.headerTitle}>Fraud Alerts</Text>
          <Text style={styles.headerSubtitle}>
            {transactions.length} flagged transaction{transactions.length !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>

      {transactions.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons name="shield-checkmark" size={56} color={Colors.accentEmerald} />
          </View>
          <Text style={styles.emptyTitle}>All Clear</Text>
          <Text style={styles.emptySubtitle}>
            No suspicious transactions detected. We'll alert you if anything looks off.
          </Text>
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.txn_id}
          renderItem={renderTransaction}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.accentBlue}
            />
          }
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 64,
    paddingHorizontal: 24,
    paddingBottom: 16,
    gap: 14,
  },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.accentCoral + '18',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    ...Typography.title2,
    color: Colors.textPrimary,
  },
  headerSubtitle: {
    ...Typography.caption1,
    color: Colors.textMuted,
    marginTop: 2,
  },
  list: {
    padding: 16,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  merchantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  riskDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  merchantName: {
    ...Typography.headline,
    color: Colors.textPrimary,
    flex: 1,
  },
  riskBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  riskText: {
    ...Typography.caption2,
    fontWeight: '700',
  },
  detailsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 10,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  detailValue: {
    ...Typography.footnote,
    color: Colors.textSecondary,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 12,
  },
  locationText: {
    ...Typography.caption1,
    color: Colors.textMuted,
  },
  riskBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  riskBarLabel: {
    ...Typography.caption2,
    color: Colors.textMuted,
  },
  riskBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.bgCardElevated,
    borderRadius: 3,
    overflow: 'hidden',
  },
  riskBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  riskBarValue: {
    ...Typography.caption2,
    fontWeight: '700',
    width: 34,
    textAlign: 'right',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  dismissBtn: {
    backgroundColor: Colors.accentEmerald + '14',
    borderWidth: 1,
    borderColor: Colors.accentEmerald + '30',
  },
  confirmBtn: {
    backgroundColor: Colors.negative + '14',
    borderWidth: 1,
    borderColor: Colors.negative + '30',
  },
  actionText: {
    ...Typography.footnote,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.accentEmerald + '14',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    ...Typography.title2,
    color: Colors.textPrimary,
  },
  emptySubtitle: {
    ...Typography.subhead,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
  },
});
