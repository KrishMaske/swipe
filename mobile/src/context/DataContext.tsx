import React, { createContext, useState, useContext, useCallback, useRef } from 'react';
import { api, Account, Transaction, FraudTransaction } from '../services/api';

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
           const timeA = typeof a.txn_date === 'string' ? new Date(a.txn_date).getTime() : (a.txn_date * 1000);
           const timeB = typeof b.txn_date === 'string' ? new Date(b.txn_date).getTime() : (b.txn_date * 1000);
           return timeB - timeA;
        });

        setTransactionsCache((prev) => ({
          ...prev,
          [accId]: { data: sorted, timestamp: Date.now() },
        }));
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
      }}
    >
      {children}
    </DataContext.Provider>
  );
}
