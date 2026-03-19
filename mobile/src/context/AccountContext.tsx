import React, { createContext, useState, useContext, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import { api, Account } from '../services/api';

interface AccountContextType {
  accounts: Account[];
  accountsLoading: boolean;
  fetchAccounts: (forceRefresh?: boolean) => Promise<void>;
  invalidateAccounts: () => void;
  // Shared sync checking bit
  checkForScheduledSync: () => Promise<boolean>;
}

const AccountContext = createContext<AccountContextType | undefined>(undefined);

export const useAccounts = () => {
  const context = useContext(AccountContext);
  if (!context) throw new Error('useAccounts must be used within AccountProvider');
  return context;
};

export function AccountProvider({ children, checkForScheduledSync, clearAllCaches, syncTrigger }: { 
  children: React.ReactNode, 
  checkForScheduledSync: (force?: boolean) => Promise<boolean>,
  clearAllCaches: () => void,
  syncTrigger: number
}) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const accountsLoaded = useRef(false);
  const fetchInFlight = useRef<Promise<void> | null>(null);

  React.useEffect(() => {
    if (syncTrigger > 0) {
      accountsLoaded.current = false;
      setAccounts([]);
    }
  }, [syncTrigger]);

  const fetchAccounts = useCallback(async (forceRefresh = false) => {
    const isInitialLoad = !accountsLoaded.current;
    
    // If not a force refresh and we already have attempted load, skip.
    if (!forceRefresh && !isInitialLoad) {
      setAccountsLoading(false);
      return;
    }

    // Check for sync status. Pass forceRefresh to ignore the cooldown.
    const detectedSync = await checkForScheduledSync(forceRefresh);

    // Only fetch data if it's the first load OR if a sync was detected.
    if (!isInitialLoad && !detectedSync) {
      setAccountsLoading(false);
      return;
    }

    if (fetchInFlight.current) {
      await fetchInFlight.current;
      return;
    }

    const doFetch = async () => {
      try {
        setAccountsLoading(true);
        const data = await api.getAccounts();
        setAccounts(data || []);
        accountsLoaded.current = true;
      } catch (err: any) {
        Alert.alert("Sync Error", "Failed to fetch accounts. Using cached data.");
      } finally {
        setAccountsLoading(false);
        fetchInFlight.current = null;
      }
    };

    fetchInFlight.current = doFetch();
    await fetchInFlight.current;
  }, [checkForScheduledSync]);

  const invalidateAccounts = useCallback(() => {
    clearAllCaches();
    accountsLoaded.current = false;
    setAccounts([]);
  }, [clearAllCaches]);

  const contextValue = React.useMemo(() => ({
    accounts,
    accountsLoading,
    fetchAccounts,
    invalidateAccounts,
    checkForScheduledSync
  }), [accounts, accountsLoading, fetchAccounts, invalidateAccounts, checkForScheduledSync]);

  return (
    <AccountContext.Provider value={contextValue}>
      {children}
    </AccountContext.Provider>
  );
}
