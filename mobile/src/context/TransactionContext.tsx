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
  checkForScheduledSync: () => Promise<boolean>,
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

  React.useEffect(() => {
    transactionsCacheRef.current = transactionsCache;
  }, [transactionsCache]);

  const fetchTransactions = useCallback(async (accId: string, forceRefresh = false) => {
    const detectedSync = await checkForScheduledSync();
    const cached = transactionsCacheRef.current[accId];

    if (!forceRefresh && !detectedSync && cached) {
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
           const getTime = (val: unknown) => {
             if (typeof val === 'string') {
               return new Date((val as string).includes(' ') ? (val as string).replace(' ', 'T') : (val as string)).getTime();
             }
             return (val as number) * 1000;
           };
           return getTime(b.txn_date) - getTime(a.txn_date);
        });

        transactionsCacheRef.current[accId] = sorted;
        setTransactionsCache({ ...transactionsCacheRef.current });
      } catch (err) {
        Alert.alert("Sync Error", "Failed to load transactions for this account.");
      } finally {
        setTransactionsLoading((prev) => ({ ...prev, [accId]: false }));
        delete txFetchInFlight.current[accId];
      }
    };

    txFetchInFlight.current[accId] = doFetch();
    await txFetchInFlight.current[accId];
  }, [checkForScheduledSync]);

  return (
    <TransactionContext.Provider value={{ transactionsCache, transactionsLoading, fetchTransactions }}>
      {children}
    </TransactionContext.Provider>
  );
}
