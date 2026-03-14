import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';
import { useData } from '../context/DataContext';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';

const CATEGORIES = [
  "Food & Dining",
  "Transportation",
  "Shopping & Retail",
  "Entertainment & Recreation",
  "Healthcare & Medical",
  "Utilities & Services",
  "Financial Services",
  "Income",
  "Government & Legal",
  "Charity & Donations"
];

export default function DashboardScreen({ navigation }: any) {
  const { 
    accounts, 
    accountsLoading: loading, 
    fetchAccounts, 
    invalidateAccounts,
    budgetsCache,
    fetchBudgets,
    spendingByBudget,
    budgetTransactions,
    fetchTransactions,
  } = useData();
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  
  // Budget Modal State
  const [budgetModalVisible, setBudgetModalVisible] = useState(false);
  const [newBudget, setNewBudget] = useState({ name: '', amount: '', category: 'Food & Dining', period: 'monthly' });
  const [creatingBudget, setCreatingBudget] = useState(false);
  const [categoryDropdownVisible, setCategoryDropdownVisible] = useState(false);
  
  // Transaction Modal State
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      fetchAccounts(); // uses cache — no duplicate calls
      fetchBudgets();
    }, [fetchAccounts, fetchBudgets])
  );

  // Pre-fetch transactions for all accounts so the budget tracker has data
  useEffect(() => {
    if (accounts && accounts.length > 0) {
      accounts.forEach(acc => {
        if (acc.acc_id) {
          fetchTransactions(acc.acc_id);
        }
      });
    }
  }, [accounts, fetchTransactions]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAccounts(true); // force refresh
    await fetchBudgets(true);
    if (accounts) {
      await Promise.all(accounts.map(acc => fetchTransactions(acc.acc_id, true)));
    }
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

  const handleCreateBudget = async () => {
    if (!newBudget.name || !newBudget.amount || !newBudget.category) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }
    
    setCreatingBudget(true);
    try {
      if (editingBudgetId) {
        await api.updateBudget(editingBudgetId, {
          name: newBudget.name,
          amount: parseFloat(newBudget.amount),
          category: newBudget.category,
          period: newBudget.period
        });
      } else {
        await api.createBudget({
          name: newBudget.name,
          amount: parseFloat(newBudget.amount),
          category: newBudget.category,
          period: newBudget.period
        });
      }
      setBudgetModalVisible(false);
      setEditingBudgetId(null);
      setNewBudget({ name: '', amount: '', category: 'Food & Dining', period: 'monthly' });
      await fetchBudgets(true); // refresh budgets list
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save budget.');
    } finally {
      setCreatingBudget(false);
    }
  };

  const handleDeleteBudget = async () => {
    if (!editingBudgetId) return;
    Alert.alert(
      "Delete Budget",
      "Are you sure you want to delete this budget?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive",
          onPress: async () => {
            setCreatingBudget(true);
            try {
              await api.deleteBudget(editingBudgetId);
              setBudgetModalVisible(false);
              setEditingBudgetId(null);
              setNewBudget({ name: '', amount: '', category: 'Food & Dining', period: 'monthly' });
              await fetchBudgets(true);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete budget.');
            } finally {
              setCreatingBudget(false);
            }
          }
        }
      ]
    );
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
          <Text style={styles.sectionTitle}>Budgets</Text>
          <TouchableOpacity onPress={() => {
            setEditingBudgetId(null);
            setNewBudget({ name: '', amount: '', category: 'Food & Dining', period: 'monthly' });
            setBudgetModalVisible(true);
          }}>
            <Ionicons name="add-circle" size={24} color={Colors.accentBlue} />
          </TouchableOpacity>
        </View>

        {/* Budgets List */}
        {!budgetsCache?.data || budgetsCache.data.length === 0 ? (
          <View style={styles.emptyBudgets}>
            <Text style={styles.emptySubtitle}>No budgets set. Track your spending!</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.budgetsScroll}>
            {budgetsCache.data.map(budget => {
              const spent = spendingByBudget[budget.id!] || 0;
            const progress = Math.min(spent / budget.amount, 1);
            let progressColor = Colors.accentBlue;
            if (progress >= 1) progressColor = Colors.negative;
            else if (progress >= 0.8) progressColor = Colors.accentAmber;
            
            return (
              <TouchableOpacity 
                key={budget.id} 
                style={styles.budgetCard}
                activeOpacity={0.7}
                onPress={() => setSelectedBudgetId(budget.id!)}
              >
                <View style={styles.budgetHeaderRow}>
                  <Text style={styles.budgetName}>{budget.name}</Text>
                  <Text style={styles.budgetPeriod}>({budget.period})</Text>
                </View>
                <Text style={styles.budgetCategory}>{budget.category}</Text>
                <View style={styles.budgetProgressContainer}>
                  <View style={[styles.budgetProgressBar, { width: `${progress * 100}%`, backgroundColor: progressColor }]} />
                </View>
                <View style={styles.budgetAmounts}>
                  <Text style={styles.budgetSpent}>{formatCurrency(spent)} spent</Text>
                  <Text style={styles.budgetTotal}>{formatCurrency(budget.amount)}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
          </ScrollView>
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

      {/* Budget Creation Modal */}
      <Modal visible={budgetModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingBudgetId ? 'Edit Budget' : 'Create Budget'}</Text>
              <TouchableOpacity onPress={() => {
                setBudgetModalVisible(false);
                setEditingBudgetId(null);
              }}>
                <Ionicons name="close" size={24} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Budget Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Grocery Limit"
              placeholderTextColor={Colors.textMuted}
              value={newBudget.name}
              onChangeText={(text) => setNewBudget({ ...newBudget, name: text })}
            />

            <Text style={styles.inputLabel}>Category</Text>
            <View style={styles.dropdownContainer}>
              <TouchableOpacity
                style={styles.dropdownButton}
                activeOpacity={0.7}
                onPress={() => setCategoryDropdownVisible(!categoryDropdownVisible)}
              >
                <Text style={newBudget.category ? styles.dropdownButtonText : styles.dropdownButtonTextPlaceholder}>
                  {newBudget.category || "Select a Category"}
                </Text>
                <Ionicons name={categoryDropdownVisible ? "chevron-up" : "chevron-down"} size={20} color={Colors.textMuted} />
              </TouchableOpacity>
              
              {categoryDropdownVisible && (
                <View style={styles.dropdownList}>
                  <ScrollView nestedScrollEnabled style={styles.dropdownScroll} keyboardShouldPersistTaps="handled">
                    {CATEGORIES.map(cat => (
                      <TouchableOpacity 
                        key={cat} 
                        style={styles.dropdownItem}
                        onPress={() => {
                          setNewBudget({ ...newBudget, category: cat });
                          setCategoryDropdownVisible(false);
                        }}
                      >
                        <Text style={[styles.dropdownItemText, newBudget.category === cat && styles.dropdownItemTextSelected]}>{cat}</Text>
                        {newBudget.category === cat && <Ionicons name="checkmark" size={18} color={Colors.accentBlue} />}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            <Text style={styles.inputLabel}>Amount Limit ($)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., 500"
              placeholderTextColor={Colors.textMuted}
              keyboardType="numeric"
              value={newBudget.amount}
              onChangeText={(text) => setNewBudget({ ...newBudget, amount: text })}
            />
            
            <View style={styles.periodSelector}>
               <Text style={styles.periodLabel}>Period</Text>
               <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.periodScroll}>
                 {['daily', 'weekly', 'biweekly', 'monthly', '3-month', '6-month', 'yearly'].map(p => (
                   <TouchableOpacity 
                     key={p} 
                     style={[styles.periodPill, newBudget.period === p && styles.periodPillActive]}
                     onPress={() => setNewBudget({ ...newBudget, period: p })}
                   >
                     <Text style={[styles.periodPillText, newBudget.period === p && styles.periodPillTextActive]}>{p}</Text>
                   </TouchableOpacity>
                 ))}
               </ScrollView>
            </View>

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
              {editingBudgetId && (
                <TouchableOpacity
                  style={[styles.createButton, { flex: 1, marginTop: 0 }, creatingBudget && { opacity: 0.7 }]}
                  onPress={handleDeleteBudget}
                  disabled={creatingBudget}
                >
                  <View style={[styles.createButtonGradient, { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.negative }]}>
                    <Text style={[styles.createButtonText, { color: Colors.negative }]}>Delete</Text>
                  </View>
                </TouchableOpacity>
              )}
              
              <TouchableOpacity
                style={[styles.createButton, { flex: 2, marginTop: 0 }, creatingBudget && { opacity: 0.7 }]}
                onPress={handleCreateBudget}
                disabled={creatingBudget}
              >
                <LinearGradient
                  colors={[Colors.gradientAccentStart, Colors.gradientAccentEnd]}
                  style={styles.createButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {creatingBudget ? (
                    <ActivityIndicator color="#FFF" size="small" />
                  ) : (
                    <Text style={styles.createButtonText}>{editingBudgetId ? 'Update' : 'Create'}</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Budget Transactions Details Modal */}
      <Modal visible={selectedBudgetId !== null} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { height: '70%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedBudgetId !== null && budgetsCache?.data?.find(b => b.id === selectedBudgetId)?.name} Spending
              </Text>
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 16}}>
                <TouchableOpacity onPress={() => {
                   const b = budgetsCache?.data?.find(b => b.id === selectedBudgetId);
                   if (b) {
                     setEditingBudgetId(b.id!);
                     setNewBudget({
                       name: b.name,
                       amount: b.amount.toString(),
                       category: b.category,
                       period: b.period,
                     });
                     setSelectedBudgetId(null);
                     setBudgetModalVisible(true);
                   }
                }}>
                  <Ionicons name="pencil" size={22} color={Colors.accentBlue} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setSelectedBudgetId(null)}>
                  <Ionicons name="close" size={24} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView contentContainerStyle={styles.transactionsScroll}>
              {selectedBudgetId !== null && budgetTransactions[selectedBudgetId]?.length > 0 ? (
                budgetTransactions[selectedBudgetId].map(txn => (
                  <View key={txn.id} style={styles.transactionItem}>
                    <View style={styles.transactionIcon}>
                      <Ionicons name="receipt" size={20} color={Colors.accentBlue} />
                    </View>
                    <View style={styles.transactionInfo}>
                      <Text style={styles.transactionMerchant}>{txn.merchant}</Text>
                      <Text style={styles.transactionDate}>
                        {new Date(typeof txn.txn_date === 'string' ? txn.txn_date : txn.txn_date * 1000).toLocaleDateString()}
                      </Text>
                    </View>
                    <Text style={[styles.transactionAmount, { color: Colors.negative }]}>
                      -${Math.abs(txn.amount).toFixed(2)}
                    </Text>
                  </View>
                ))
              ) : (
                <View style={styles.emptyTransactions}>
                   <Ionicons name="search-outline" size={40} color={Colors.textMuted} />
                   <Text style={styles.emptyTransactionsText}>No transactions found for this period.</Text>
                </View>
              )}
            </ScrollView>
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
  emptyBudgets: {
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  budgetsScroll: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  budgetCard: {
    backgroundColor: Colors.bgCard,
    width: 280,
    marginRight: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  budgetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  budgetName: {
    ...Typography.headline,
    color: Colors.textPrimary,
  },
  budgetPeriod: {
    ...Typography.caption2,
    color: Colors.textMuted,
    textTransform: 'capitalize',
  },
  budgetCategory: {
    ...Typography.caption1,
    color: Colors.textSecondary,
    marginBottom: 12,
  },
  budgetProgressContainer: {
    height: 8,
    backgroundColor: Colors.bgCardElevated,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  budgetProgressBar: {
    height: '100%',
    borderRadius: 4,
  },
  budgetAmounts: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  budgetSpent: {
    ...Typography.footnote,
    color: Colors.textPrimary,
  },
  budgetTotal: {
    ...Typography.footnote,
    color: Colors.textMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.bgPrimary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    ...Typography.title2,
    color: Colors.textPrimary,
  },
  inputLabel: {
    ...Typography.caption1,
    color: Colors.textSecondary,
    marginBottom: 6,
    marginLeft: 4,
    fontWeight: '500',
  },
  input: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    borderRadius: 12,
    padding: 16,
    color: Colors.textPrimary,
    marginBottom: 16,
    ...Typography.body,
  },
  dropdownContainer: {
    position: 'relative',
    marginBottom: 16,
    zIndex: 10,
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    borderRadius: 12,
    padding: 16,
  },
  dropdownButtonText: {
    ...Typography.body,
    color: Colors.textPrimary,
  },
  dropdownButtonTextPlaceholder: {
    ...Typography.body,
    color: Colors.textMuted,
  },
  dropdownList: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    backgroundColor: Colors.bgCardElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
    maxHeight: 200,
    zIndex: 100,
  },
  dropdownScroll: {
    paddingVertical: 8,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  dropdownItemText: {
    ...Typography.body,
    color: Colors.textPrimary,
  },
  dropdownItemTextSelected: {
    color: Colors.accentBlue,
    fontWeight: '600',
  },
  periodSelector: {
    marginVertical: 4,
  },
  periodLabel: {
    ...Typography.subhead,
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  periodScroll: {
    flexDirection: 'row',
  },
  periodPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.bgCardElevated,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  periodPillActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderColor: Colors.accentBlue,
  },
  periodPillText: {
    ...Typography.footnote,
    color: Colors.textMuted,
    textTransform: 'capitalize',
  },
  periodPillTextActive: {
    color: Colors.accentBlue,
    fontWeight: '600',
  },
  createButton: {
    marginTop: 24,
  },
  createButtonGradient: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  createButtonText: {
    ...Typography.headline,
    color: '#FFF',
    fontSize: 16,
  },
  transactionsScroll: {
    paddingBottom: 20,
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.glassBorder,
  },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionMerchant: {
    ...Typography.body,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  transactionDate: {
    ...Typography.caption1,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  transactionAmount: {
    ...Typography.headline,
    fontSize: 15,
  },
  emptyTransactions: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTransactionsText: {
    ...Typography.subhead,
    color: Colors.textSecondary,
    marginTop: 12,
  },
});
