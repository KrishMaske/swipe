import React, { createContext, useState, useContext, useCallback, useRef } from 'react';
import { api, Account, Transaction, FraudTransaction, Budget } from '../services/api';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

interface DataContextType {
  accounts: Account[];
  accountsLoading: boolean;
  fetchAccounts: (forceRefresh?: boolean) => Promise<void>;
  invalidateAccounts: () => void;
  transactionsCache: Record<string, { data: Transaction[]; timestamp: number }>;
  transactionsLoading: Record<string, boolean>;
  fetchTransactions: (accId: string, forceRefresh?: boolean) => Promise<void>;
  fraudAlertsCache: { data: FraudTransaction[]; timestamp: number } | null;
  fraudAlertsLoading: boolean;
  fetchFraudAlerts: (forceRefresh?: boolean) => Promise<void>;
  optimisticallyRemoveFraudAlert: (txnId: string) => void;
  budgetsCache: { data: Budget[]; timestamp: number } | null;
  budgetsLoading: boolean;
  fetchBudgets: (forceRefresh?: boolean) => Promise<void>;
  spendingByBudget: Record<string, number>; // budgetId -> total spent
  budgetTransactions: Record<string, Transaction[]>; // budgetId -> matching transactions
}

const DataContext = createContext<DataContextType>({
  accounts: [],
  accountsLoading: true,
  fetchAccounts: async () => {},
  invalidateAccounts: () => {},
  transactionsCache: {},
  transactionsLoading: {},
  fetchTransactions: async () => {},
  fraudAlertsCache: null,
  fraudAlertsLoading: true,
  fetchFraudAlerts: async () => {},
  optimisticallyRemoveFraudAlert: () => {},
  budgetsCache: null,
  budgetsLoading: true,
  fetchBudgets: async () => {},
  spendingByBudget: {},
  budgetTransactions: {},
});

export const useData = () => useContext(DataContext);

const CACHE_TTL_MS = 60_000; // 1 minute

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const lastFetchTime = useRef<number>(0);
  const fetchInFlight = useRef<Promise<void> | null>(null);

  const [transactionsCache, setTransactionsCache] = useState<Record<string, { data: Transaction[]; timestamp: number }>>({});
  const [transactionsLoading, setTransactionsLoading] = useState<Record<string, boolean>>({});
  const txFetchInFlight = useRef<Record<string, Promise<void> | undefined>>({});

  const [fraudAlertsCache, setFraudAlertsCache] = useState<{ data: FraudTransaction[]; timestamp: number } | null>(null);
  const [fraudAlertsLoading, setFraudAlertsLoading] = useState(true);
  const fraudFetchInFlight = useRef<Promise<void> | null>(null);

  const [budgetsCache, setBudgetsCache] = useState<{ data: Budget[]; timestamp: number } | null>(null);
  const [budgetsLoading, setBudgetsLoading] = useState(true);
  const budgetsFetchInFlight = useRef<Promise<void> | null>(null);
  
  const [spendingByBudget, setSpendingByBudget] = useState<Record<string, number>>({});
  const [budgetTransactions, setBudgetTransactions] = useState<Record<string, Transaction[]>>({});

  // Push Notification Helpers
  const notifyFraud = async (txn: FraudTransaction) => {
    const key = `notified_fraud_${txn.txn_id}`;
    const alreadyNotified = await SecureStore.getItemAsync(key);
    if (!alreadyNotified) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Suspicious Transaction Detected',
          body: `A transaction of $${txn.amount} at ${txn.merchant} was flagged as potentially fraudulent.`,
          data: { type: 'fraud', txnId: txn.txn_id },
        },
        trigger: null,
      });
      await SecureStore.setItemAsync(key, 'true');
    }
  };

  const notifyBudget = async (budget: Budget, percentage: number) => {
    // percentage should be 50, 80, or 100
    const key = `notified_budget_${budget.id}_${percentage}`;
    const alreadyNotified = await SecureStore.getItemAsync(key);
    if (!alreadyNotified) {
      let title = '';
      if (percentage >= 100) title = `Over Budget: ${budget.name}!`;
      else if (percentage >= 80) title = `Almost there: ${budget.name} (80%)`;
      else if (percentage >= 50) title = `Halfway there: ${budget.name} (50%)`;

      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body: `You have spent ${percentage}% of your ${budget.category} budget for this ${budget.period}.`,
          data: { type: 'budget', budgetId: budget.id },
        },
        trigger: null,
      });
      await SecureStore.setItemAsync(key, 'true');
    }
  };

  const calculateBudgetSpending = useCallback((budgets: Budget[], allTransactions: Transaction[]) => {
    const spending: Record<string, number> = {};
    const transactionsByBudget: Record<string, Transaction[]> = {};
    const now = new Date();

    console.log(`[BudgetCalc] Starting calculation for ${budgets.length} budgets and ${allTransactions.length} transactions`);
    budgets.forEach((b) => {
      if (!b.id) return;
      
      // Determine the start date of the current period
      let startDate = new Date();
      switch (b.period) {
        case 'daily':
          startDate.setHours(0,0,0,0);
          break;
        case 'weekly':
          // Start of current week (assuming Sunday start)
          startDate.setDate(now.getDate() - now.getDay());
          startDate.setHours(0,0,0,0);
          break;
        case 'biweekly':
          // Start of alternative week
          startDate.setDate(now.getDate() - 14);
          startDate.setHours(0,0,0,0);
          break;
        case 'monthly':
          startDate.setDate(1);
          startDate.setHours(0,0,0,0);
          break;
        case '3-month':
          // Start of current Quarter
          startDate.setMonth(Math.floor(now.getMonth() / 3) * 3, 1);
          startDate.setHours(0,0,0,0);
          break;
        case '6-month':
          // Start of current Half-Year
          startDate.setMonth(Math.floor(now.getMonth() / 6) * 6, 1);
          startDate.setHours(0,0,0,0);
          break;
        case 'yearly':
          startDate.setMonth(0, 1);
          startDate.setHours(0,0,0,0);
          break;
        default:
          startDate.setDate(1);
          startDate.setHours(0,0,0,0);
      }

      const startEpoch = Math.floor(startDate.getTime() / 1000);
      console.log(`[BudgetCalc] Budget '${b.name}' | Cat: '${b.category}' | Period: ${b.period} | StartDate: ${startDate.toISOString()} (Epoch: ${startEpoch})`);
      
      let matchedCount = 0;
      
      const spent = allTransactions
        .filter(t => {
           let txnEpoch = t.txn_date as number;
           const dateVal = t.txn_date as unknown as string | number;
           if (typeof dateVal === 'string') {
             const safeDateString = dateVal.includes(' ') ? dateVal.replace(' ', 'T') : dateVal;
             txnEpoch = new Date(safeDateString).getTime() / 1000;
           }
           
           // Detailed log for the first matched category to see why it might fail
           if (t.category === b.category) {
             console.log(`  -> Analyzing Txn [${t.merchant}]: Amount=${t.amount}, Has TxnEpoch=${txnEpoch} (Needs >= ${startEpoch})`);
           }
           
           const categoryMatch = t.category.trim().toLowerCase() === b.category.trim().toLowerCase();
           const amountMatch = t.amount < 0;
           const dateMatch = txnEpoch >= startEpoch;
           
           if (categoryMatch && amountMatch && dateMatch) {
             matchedCount++;
             if (b.id !== undefined) {
               if (!transactionsByBudget[b.id]) transactionsByBudget[b.id] = [];
               transactionsByBudget[b.id].push(t);
             }
             return true;
           }
           return false;
        })
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
        
      console.log(`[BudgetCalc] Budget '${b.name}' finished: Matched ${matchedCount} txns, Total Spent=$${spent.toFixed(2)}`);
      if (b.id !== undefined) {
        spending[b.id] = spent;
        if (!transactionsByBudget[b.id]) transactionsByBudget[b.id] = [];
      }

      // Check for notifications
      const pct = (spent / b.amount) * 100;
      if (pct >= 100) notifyBudget(b, 100);
      else if (pct >= 80) notifyBudget(b, 80);
      else if (pct >= 50) notifyBudget(b, 50);
    });
    
    setSpendingByBudget(spending);
    setBudgetTransactions(transactionsByBudget);
  }, []);

  // Update spending whenever transactions or budgets change
  React.useEffect(() => {
    const allTxns = Object.values(transactionsCache).flatMap(c => c.data);
    console.log(`[BudgetCalc] Trigger Tracker => Budgets Loaded: ${!!budgetsCache?.data}, TxnCount: ${allTxns.length}`);
    if (budgetsCache?.data) {
      calculateBudgetSpending(budgetsCache.data, allTxns);
    }
  }, [transactionsCache, budgetsCache, calculateBudgetSpending]);

  const fetchAccounts = useCallback(async (forceRefresh = false) => {
    const now = Date.now();

    // Return cached data if still fresh and not forced
    if (!forceRefresh && lastFetchTime.current > 0 && now - lastFetchTime.current < CACHE_TTL_MS) {
      setAccountsLoading(false);
      return;
    }

    // Deduplicate concurrent calls — if a fetch is already in progress, await it
    if (fetchInFlight.current) {
      await fetchInFlight.current;
      return;
    }

    const doFetch = async () => {
      try {
        setAccountsLoading(true);
        const data = await api.getAccounts();
        setAccounts(data || []);
        lastFetchTime.current = Date.now();
      } catch (err: any) {
        // Silently handle — user may not have linked bank yet
      } finally {
        setAccountsLoading(false);
        fetchInFlight.current = null;
      }
    };

    fetchInFlight.current = doFetch();
    await fetchInFlight.current;
  }, []);

  const invalidateAccounts = useCallback(() => {
    lastFetchTime.current = 0;
    setTransactionsCache({}); // also clear transaction cache on full cache invalidation
    setFraudAlertsCache(null);
    setBudgetsCache(null);
  }, []);

  const fetchTransactions = useCallback(async (accId: string, forceRefresh = false) => {
    const now = Date.now();
    const cached = transactionsCache[accId];

    if (!forceRefresh && cached && now - cached.timestamp < CACHE_TTL_MS) {
      return;
    }

    if (txFetchInFlight.current[accId]) {
      await txFetchInFlight.current[accId];
      return;
    }

    const doFetch = async () => {
      try {
        setTransactionsLoading((prev) => ({ ...prev, [accId]: true }));
        const data = await api.getTransactions(accId);
         const sorted = (data || []).sort((a, b) => {
           // Handle both string timestamps and epoch numbers for sorting
           const getTime = (val: unknown) => {
             if (typeof val === 'string') {
               return new Date((val as string).includes(' ') ? (val as string).replace(' ', 'T') : (val as string)).getTime();
             }
             return (val as number) * 1000;
           };
           return getTime(b.txn_date) - getTime(a.txn_date);
        });

        setTransactionsCache((prev) => ({
          ...prev,
          [accId]: { data: sorted, timestamp: Date.now() },
        }));
        console.log(`[BudgetCalc] Fetched and cached ${sorted.length} transactions for account ${accId}`);
      } catch (err) {
        // Silently handle
      } finally {
        setTransactionsLoading((prev) => ({ ...prev, [accId]: false }));
        delete txFetchInFlight.current[accId];
      }
    };

    txFetchInFlight.current[accId] = doFetch();
    await txFetchInFlight.current[accId];
  }, [transactionsCache]);

  const fetchFraudAlerts = useCallback(async (forceRefresh = false) => {
    const now = Date.now();

    if (!forceRefresh && fraudAlertsCache && now - fraudAlertsCache.timestamp < CACHE_TTL_MS) {
      setFraudAlertsLoading(false);
      return;
    }

    if (fraudFetchInFlight.current) {
      await fraudFetchInFlight.current;
      return;
    }

    const doFetch = async () => {
      try {
        setFraudAlertsLoading(true);
        const data = await api.getFraudulentTransactions();
        // pre-filter to unresolved alerts
        const unresolved = data.filter((t: FraudTransaction) => t.is_confirmed_fraud === null);
        setFraudAlertsCache({ data: unresolved, timestamp: Date.now() });

        // Trigger notifications for new fraud
        unresolved.forEach(notifyFraud);
      } catch (err) {
        // Silently handle
      } finally {
        setFraudAlertsLoading(false);
        fraudFetchInFlight.current = null;
      }
    };

    fraudFetchInFlight.current = doFetch();
    await fraudFetchInFlight.current;
  }, [fraudAlertsCache]);

  const fetchBudgets = useCallback(async (forceRefresh = false) => {
    const now = Date.now();

    if (!forceRefresh && budgetsCache && now - budgetsCache.timestamp < CACHE_TTL_MS) {
      setBudgetsLoading(false);
      return;
    }

    if (budgetsFetchInFlight.current) {
      await budgetsFetchInFlight.current;
      return;
    }

    const doFetch = async () => {
      try {
        setBudgetsLoading(true);
        const data = await api.getBudgets();
        setBudgetsCache({ data: data || [], timestamp: Date.now() });
      } catch (err) {
        // Silently handle
      } finally {
        setBudgetsLoading(false);
        budgetsFetchInFlight.current = null;
      }
    };

    budgetsFetchInFlight.current = doFetch();
    await budgetsFetchInFlight.current;
  }, [budgetsCache]);

  const optimisticallyRemoveFraudAlert = useCallback((txnId: string) => {
    setFraudAlertsCache((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        data: prev.data.filter((t) => t.txn_id !== txnId)
      };
    });
  }, []);

  return (
    <DataContext.Provider
      value={{
        accounts,
        accountsLoading,
        fetchAccounts,
        invalidateAccounts,
        transactionsCache,
        transactionsLoading,
        fetchTransactions,
        fraudAlertsCache,
        fraudAlertsLoading,
        fetchFraudAlerts,
        optimisticallyRemoveFraudAlert,
        budgetsCache,
        budgetsLoading,
        fetchBudgets,
        spendingByBudget,
        budgetTransactions,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}
