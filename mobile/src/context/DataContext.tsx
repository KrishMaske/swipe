import React, { createContext, useState, useContext, useCallback, useRef } from 'react';
import { api, Account, Transaction } from '../services/api';

interface DataContextType {
  accounts: Account[];
  accountsLoading: boolean;
  fetchAccounts: (forceRefresh?: boolean) => Promise<void>;
  invalidateAccounts: () => void;
  transactionsCache: Record<string, { data: Transaction[]; timestamp: number }>;
  transactionsLoading: Record<string, boolean>;
  fetchTransactions: (accId: string, forceRefresh?: boolean) => Promise<void>;
}

const DataContext = createContext<DataContextType>({
  accounts: [],
  accountsLoading: true,
  fetchAccounts: async () => {},
  invalidateAccounts: () => {},
  transactionsCache: {},
  transactionsLoading: {},
  fetchTransactions: async () => {},
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
      }}
    >
      {children}
    </DataContext.Provider>
  );
}
