import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';
import { useData } from '../context/DataContext';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';

export default function DashboardScreen({ navigation }: any) {
  const { accounts, accountsLoading: loading, fetchAccounts, invalidateAccounts } = useData();
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchAccounts(); // uses cache — no duplicate calls
    }, [fetchAccounts])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAccounts(true); // force refresh
    setRefreshing(false);
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await api.syncAccounts();
      Alert.alert('Sync Started', result.success || 'Account sync initiated. Transactions will update in the background.');
      // Invalidate cache and refresh after background sync has time to write
      setTimeout(async () => {
        invalidateAccounts();
        await fetchAccounts(true);
      }, 3000);
    } catch (err: any) {
      Alert.alert('Sync Failed', err.message || 'Could not sync accounts');
    } finally {
      setSyncing(false);
    }
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

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.accentBlue}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.greeting}>SwipeSmart</Text>
          <Text style={styles.headerSubtitle}>Financial Overview</Text>
        </View>

        {/* Balance Card */}
        <LinearGradient
          colors={[Colors.gradientAccentStart, Colors.gradientAccentEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.balanceCard}
        >
          <Text style={styles.balanceLabel}>Total Balance</Text>
          <Text style={styles.balanceAmount}>
            {loading ? '...' : formatCurrency(totalBalance)}
          </Text>
          <Text style={styles.accountCount}>
            {accounts.length} linked account{accounts.length !== 1 ? 's' : ''}
          </Text>

          <View style={styles.balanceActions}>
            <TouchableOpacity
              style={styles.balanceButton}
              onPress={handleSync}
              disabled={syncing}
            >
              {syncing ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <>
                  <Ionicons name="sync" size={16} color="#FFF" />
                  <Text style={styles.balanceButtonText}>Sync</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* Quick Stats */}
        {accounts.length > 0 && (
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Ionicons name="trending-up" size={22} color={Colors.accentEmerald} />
              <Text style={styles.statValue}>{accounts.length}</Text>
              <Text style={styles.statLabel}>Accounts</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="card" size={22} color={Colors.accentCyan} />
              <Text style={styles.statValue}>
                {[...new Set(accounts.map((a) => a.provider))].length}
              </Text>
              <Text style={styles.statLabel}>Providers</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="wallet" size={22} color={Colors.accentAmber} />
              <Text style={styles.statValue}>
                {[...new Set(accounts.map((a) => a.currency))].length}
              </Text>
              <Text style={styles.statLabel}>Currencies</Text>
            </View>
          </View>
        )}

        {/* Section Title */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Your Accounts</Text>
        </View>

        {/* Accounts List */}
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={Colors.accentBlue} />
          </View>
        ) : accounts.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="business-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No Accounts Linked</Text>
            <Text style={styles.emptySubtitle}>
              Go to Settings to link your bank with SimpleFIN
            </Text>
            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => navigation.navigate('Settings')}
            >
              <LinearGradient
                colors={[Colors.gradientAccentStart, Colors.gradientAccentEnd]}
                style={styles.linkButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Ionicons name="link" size={18} color="#FFF" />
                <Text style={styles.linkButtonText}>Link Bank Account</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : (
          accounts.map((account) => (
            <TouchableOpacity
              key={account.acc_id}
              style={styles.accountCard}
              activeOpacity={0.7}
              onPress={() =>
                navigation.navigate('AccountDetail', {
                  accId: account.acc_id,
                  accType: account.acc_type,
                  provider: account.provider,
                })
              }
            >
              <View style={styles.accountIcon}>
                <Ionicons name="card" size={22} color={Colors.accentBlue} />
              </View>
              <View style={styles.accountInfo}>
                <Text style={styles.accountName}>{account.acc_type}</Text>
                <Text style={styles.accountProvider}>{account.provider}</Text>
              </View>
              <View style={styles.accountBalanceContainer}>
                <Text
                  style={[
                    styles.accountBalance,
                    { color: account.balance >= 0 ? Colors.positive : Colors.negative },
                  ]}
                >
                  {formatCurrency(account.balance)}
                </Text>
                <Text style={styles.accountCurrency}>{account.currency}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          ))
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
  scroll: {
    paddingBottom: 100,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  greeting: {
    ...Typography.largeTitle,
    color: Colors.textPrimary,
  },
  headerSubtitle: {
    ...Typography.subhead,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  balanceCard: {
    margin: 20,
    borderRadius: 24,
    padding: 28,
    shadowColor: Colors.accentBlue,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 12,
  },
  balanceLabel: {
    ...Typography.footnote,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  balanceAmount: {
    ...Typography.largeTitle,
    color: '#FFF',
    fontSize: 38,
    marginTop: 8,
  },
  accountCount: {
    ...Typography.footnote,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 8,
  },
  balanceActions: {
    flexDirection: 'row',
    marginTop: 20,
    gap: 12,
  },
  balanceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 6,
  },
  balanceButtonText: {
    ...Typography.footnote,
    color: '#FFF',
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  statValue: {
    ...Typography.title3,
    color: Colors.textPrimary,
    marginTop: 8,
  },
  statLabel: {
    ...Typography.caption1,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 12,
  },
  sectionTitle: {
    ...Typography.headline,
    color: Colors.textPrimary,
  },
  centered: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    ...Typography.headline,
    color: Colors.textSecondary,
    marginTop: 16,
  },
  emptySubtitle: {
    ...Typography.footnote,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  linkButton: {
    marginTop: 24,
  },
  linkButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    gap: 8,
  },
  linkButtonText: {
    ...Typography.headline,
    color: '#FFF',
    fontSize: 15,
  },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    marginHorizontal: 20,
    marginBottom: 10,
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  accountIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.bgCardElevated,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    ...Typography.subhead,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  accountProvider: {
    ...Typography.caption1,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  accountBalanceContainer: {
    alignItems: 'flex-end',
    marginRight: 8,
  },
  accountBalance: {
    ...Typography.headline,
    fontSize: 16,
  },
  accountCurrency: {
    ...Typography.caption2,
    color: Colors.textMuted,
    marginTop: 2,
  },
});
