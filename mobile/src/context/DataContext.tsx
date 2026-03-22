import React, { createContext, useContext, useCallback, useRef } from 'react';
import { api } from '../services/api';
import * as Notifications from 'expo-notifications';
import { AccountProvider, useAccounts } from './AccountContext';
import { TransactionProvider, useTransactions } from './TransactionContext';
import { FraudProvider, useFraud } from './FraudContext';
import { BudgetProvider, useBudgets } from './BudgetContext';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const SYNC_STATUS_POLL_COOLDOWN_MS = 1_800_000; // 30 minutes cooldown

// DataContext now just serves as a way to access all contexts via useData()
export const useData = () => {
  const accounts = useAccounts();
  const transactions = useTransactions();
  const fraud = useFraud();
  const budgets = useBudgets();

  return {
    ...accounts,
    ...transactions,
    ...fraud,
    ...budgets,
  };
};

export function DataProvider({ children }: { children: React.ReactNode }) {
  const lastKnownSync = useRef<number | null>(null);
  const syncCheckInFlight = useRef<Promise<boolean> | null>(null);
  const lastSyncStatusCheckAt = useRef<number>(0);
  const [syncTrigger, setSyncTrigger] = React.useState(0);

  const checkForScheduledSync = useCallback(async (force = false): Promise<boolean> => {
    const now = Date.now();
    if (!force && (now - lastSyncStatusCheckAt.current < SYNC_STATUS_POLL_COOLDOWN_MS)) {
      return false;
    }
    if (syncCheckInFlight.current) {
      return syncCheckInFlight.current;
    }
    lastSyncStatusCheckAt.current = now;

    const checkPromise = (async () => {
      try {
        const status = await api.getAccountSyncStatus();
        const remoteSync = status?.last_sync ?? null;
        if (remoteSync == null) return false;
        if (lastKnownSync.current == null) {
          lastKnownSync.current = remoteSync;
          return false;
        }
        if (remoteSync > lastKnownSync.current) {
          lastKnownSync.current = remoteSync;
          setSyncTrigger(v => v + 1);
          return true;
        }
        return false;
      } catch {
        return false;
      } finally {
        syncCheckInFlight.current = null;
      }
    })();

    syncCheckInFlight.current = checkPromise;
    return checkPromise;
  }, []);

  const clearDataCaches = useCallback(() => {
    setSyncTrigger(v => v + 1);
  }, []);

  return (
    <TransactionProvider checkForScheduledSync={checkForScheduledSync} syncTrigger={syncTrigger}>
      <AccountProvider checkForScheduledSync={checkForScheduledSync} clearAllCaches={clearDataCaches} syncTrigger={syncTrigger}>
        <SyncWrappedFraudProvider checkForScheduledSync={checkForScheduledSync} syncTrigger={syncTrigger}>
          <SyncWrappedBudgetProvider checkForScheduledSync={checkForScheduledSync} syncTrigger={syncTrigger}>
            {children}
          </SyncWrappedBudgetProvider>
        </SyncWrappedFraudProvider>
      </AccountProvider>
    </TransactionProvider>
  );
}


function SyncWrappedFraudProvider({ children, checkForScheduledSync, syncTrigger }: { 
  children: React.ReactNode, 
  checkForScheduledSync: () => Promise<boolean>,
  syncTrigger: number
}) {
  return (
    <FraudProvider checkForScheduledSync={checkForScheduledSync} syncTrigger={syncTrigger}>
      {children}
    </FraudProvider>
  );
}

function SyncWrappedBudgetProvider({ children, checkForScheduledSync, syncTrigger }: { 
  children: React.ReactNode, 
  checkForScheduledSync: () => Promise<boolean>,
  syncTrigger: number
}) {
  const { transactionsCache } = useTransactions();
  return (
    <BudgetProvider checkForScheduledSync={checkForScheduledSync} transactionsCache={transactionsCache} syncTrigger={syncTrigger}>
      {children}
    </BudgetProvider>
  );
}

