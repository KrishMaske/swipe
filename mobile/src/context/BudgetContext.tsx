import React, { createContext, useState, useContext, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, Budget, Transaction } from '../services/api';

interface BudgetContextType {
  budgetsCache: Budget[] | null;
  budgetsLoading: boolean;
  fetchBudgets: (forceRefresh?: boolean) => Promise<void>;
  spendingByBudget: Record<string, number>;
  budgetTransactions: Record<string, Transaction[]>;
}

const BudgetContext = createContext<BudgetContextType | undefined>(undefined);

export const useBudgets = () => {
  const context = useContext(BudgetContext);
  if (!context) throw new Error('useBudgets must be used within BudgetProvider');
  return context;
};

export function BudgetProvider({ children, checkForScheduledSync, transactionsCache, syncTrigger }: {
  children: React.ReactNode,
  checkForScheduledSync: (force?: boolean) => Promise<boolean>,
  transactionsCache: Record<string, Transaction[]>,
  syncTrigger: number
}) {
  const [budgetsCache, setBudgetsCache] = useState<Budget[] | null>(null);
  const [budgetsLoading, setBudgetsLoading] = useState(true);
  const budgetsFetchInFlight = useRef<Promise<void> | null>(null);

  React.useEffect(() => {
    if (syncTrigger > 0) {
      setBudgetsCache(null);
    }
  }, [syncTrigger]);
  
  const [spendingByBudget, setSpendingByBudget] = useState<Record<string, number>>({});
  const [budgetTransactions, setBudgetTransactions] = useState<Record<string, Transaction[]>>({});

  const notifyBudget = async (budget: Budget, percentage: number) => {
    const { granted } = await Notifications.getPermissionsAsync();
    if (!granted) return;

    const key = `notified_budget_${budget.id}_${percentage}`;
    const alreadyNotified = await AsyncStorage.getItem(key);
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
      await AsyncStorage.setItem(key, 'true');
    }
  };

  const calculateBudgetSpending = useCallback((budgets: Budget[], allTransactions: Transaction[]) => {
    const spending: Record<string, number> = {};
    const transactionsByBudget: Record<string, Transaction[]> = {};
    const now = new Date();

    budgets.forEach((b) => {
      if (!b.id) return;
      
      let startDate = new Date();
      switch (b.period) {
        case 'daily':
          startDate.setHours(0,0,0,0);
          break;
        case 'weekly':
          startDate.setDate(now.getDate() - now.getDay());
          startDate.setHours(0,0,0,0);
          break;
        case 'biweekly':
          {
            // Fixed anchor point: Jan 7, 2024 (a Sunday)
            // This anchor ensures that biweekly cycles are consistent across the entire app
            // regardless of when the user first signs up or links an account.
            const anchorDate = new Date(2024, 0, 7);
            anchorDate.setHours(0, 0, 0, 0);
            const diffMs = now.getTime() - anchorDate.getTime();
            const msPer14Days = 14 * 24 * 60 * 60 * 1000;
            const periodCount = Math.floor(diffMs / msPer14Days);
            startDate = new Date(anchorDate.getTime() + periodCount * msPer14Days);
          }
          break;
        case 'monthly':
          startDate.setDate(1);
          startDate.setHours(0,0,0,0);
          break;
        case '3-month':
          startDate.setMonth(Math.floor(now.getMonth() / 3) * 3, 1);
          startDate.setHours(0,0,0,0);
          break;
        case '6-month':
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
      
      const spent = allTransactions
        .filter(t => {
           let txnEpoch = t.txn_date as number;
           const dateVal = t.txn_date as unknown as string | number;
           if (typeof dateVal === 'string') {
             const safeDateString = dateVal.includes(' ') ? dateVal.replace(' ', 'T') : dateVal;
             txnEpoch = new Date(safeDateString).getTime() / 1000;
           }
           
           const categoryMatch = t.category.trim().toLowerCase() === b.category.trim().toLowerCase();
           const amountMatch = t.amount < 0;
           const dateMatch = txnEpoch >= startEpoch;
           
           if (categoryMatch && amountMatch && dateMatch) {
             if (b.id !== undefined) {
               if (!transactionsByBudget[b.id]) transactionsByBudget[b.id] = [];
               transactionsByBudget[b.id].push(t);
             }
             return true;
           }
           return false;
        })
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
        
      if (b.id !== undefined) {
        spending[b.id] = spent;
      }

      const pct = (spent / b.amount) * 100;
      if (pct >= 100) notifyBudget(b, 100);
      else if (pct >= 80) notifyBudget(b, 80);
      else if (pct >= 50) notifyBudget(b, 50);
    });
    
    setSpendingByBudget(spending);
    setBudgetTransactions(transactionsByBudget);
  }, []);

  const fetchBudgets = useCallback(async (forceRefresh = false) => {
    const isInitialLoad = budgetsCache === null;

    if (!forceRefresh && !isInitialLoad) {
      setBudgetsLoading(false);
      return;
    }

    const detectedSync = await checkForScheduledSync(forceRefresh);
    if (!isInitialLoad && !detectedSync) {
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
        setBudgetsCache(data || []);
      } catch (err) {
        // Budget sync error - silent
      } finally {
        setBudgetsLoading(false);
        budgetsFetchInFlight.current = null;
      }
    };

    budgetsFetchInFlight.current = doFetch();
    await budgetsFetchInFlight.current;
  }, [checkForScheduledSync, budgetsCache]);

  const value = React.useMemo(() => ({ 
    budgetsCache, 
    budgetsLoading, 
    fetchBudgets, 
    spendingByBudget, 
    budgetTransactions 
  }), [budgetsCache, budgetsLoading, fetchBudgets, spendingByBudget, budgetTransactions]);

  return (
    <BudgetContext.Provider value={value}>
      {children}
    </BudgetContext.Provider>
  );
}
