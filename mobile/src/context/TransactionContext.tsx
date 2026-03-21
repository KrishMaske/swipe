import React, { createContext, useState, useContext, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import { api, Transaction } from '../services/api';

interface TransactionContextType {
  transactionsCache: Record<string, Transaction[]>;
  transactionsLoading: Record<string, boolean>;
  fetchTransactions: (accId: string, forceRefresh?: boolean) => Promise<void>;
}

const TransactionContext = createContext<TransactionContextType | undefined>(undefined);

export const useTransactions = () => {
  const context = useContext(TransactionContext);
  if (!context) throw new Error('useTransactions must be used within TransactionProvider');
  return context;
};

export function TransactionProvider({ children, checkForScheduledSync, syncTrigger }: {
  children: React.ReactNode,
  checkForScheduledSync: (force?: boolean) => Promise<boolean>,
  syncTrigger: number
}) {
  const [transactionsCache, setTransactionsCache] = useState<Record<string, Transaction[]>>({});
  const [transactionsLoading, setTransactionsLoading] = useState<Record<string, boolean>>({});
  const transactionsCacheRef = useRef<Record<string, Transaction[]>>({});
  const txFetchInFlight = useRef<Record<string, Promise<void> | undefined>>({});

  React.useEffect(() => {
    if (syncTrigger > 0) {
      transactionsCacheRef.current = {};
      setTransactionsCache({});
    }
  }, [syncTrigger]);



  const fetchTransactions = useCallback(async (accId: string, forceRefresh = false) => {
    const isInitialLoad = !transactionsCacheRef.current[accId];

    if (!forceRefresh && !isInitialLoad) {
      return;
    }

    const detectedSync = await checkForScheduledSync(forceRefresh);
    if (!isInitialLoad && !detectedSync) {
      return;
    }

    if (txFetchInFlight.current[accId]) {
      await txFetchInFlight.current[accId];
      return;
    }

    const doFetch = async () => {
      try {
        setTransactionsLoading((prev) => {
          if (prev[accId]) return prev;
          return { ...prev, [accId]: true };
        });

        const data = await api.getTransactions(accId);
        const sorted = (data || []).sort((a, b) => {
          const getTime = (val: unknown) => {
            if (typeof val === 'string') {
              return new Date((val as string).includes(' ') ? (val as string).replace(' ', 'T') : (val as string)).getTime();
            }
            return (val as number) * 1000;
          };
          return getTime(b.txn_date) - getTime(a.txn_date);
        });

        setTransactionsCache((prev) => {
          const existing = prev[accId];
          if (existing && existing.length === sorted.length && JSON.stringify(existing[0]) === JSON.stringify(sorted[0])) {
            return prev;
          }
          const next = { ...prev, [accId]: sorted };
          transactionsCacheRef.current = next;
          return next;
        });
      } catch (err) {
        // Silent failure for transactions to avoid spamming alerts on focus
      } finally {
        setTransactionsLoading((prev) => {
          if (!prev[accId]) return prev;
          const next = { ...prev };
          delete next[accId];
          return next;
        });
        delete txFetchInFlight.current[accId];
      }
    };

    txFetchInFlight.current[accId] = doFetch();
    await txFetchInFlight.current[accId];
  }, [checkForScheduledSync]);

  const value = React.useMemo(() => ({
    transactionsCache,
    transactionsLoading,
    fetchTransactions
  }), [transactionsCache, transactionsLoading, fetchTransactions]);

  return (
    <TransactionContext.Provider value={value}>
      {children}
    </TransactionContext.Provider>
  );
}
