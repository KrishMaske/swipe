import React, { createContext, useState, useContext, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, FraudTransaction } from '../services/api';

interface FraudContextType {
  fraudAlertsCache: FraudTransaction[] | null;
  fraudAlertsLoading: boolean;
  fetchFraudAlerts: (forceRefresh?: boolean) => Promise<void>;
  optimisticallyRemoveFraudAlert: (txnId: string) => void;
}

const FraudContext = createContext<FraudContextType | undefined>(undefined);

export const useFraud = () => {
  const context = useContext(FraudContext);
  if (!context) throw new Error('useFraud must be used within FraudProvider');
  return context;
};

export function FraudProvider({ children, checkForScheduledSync, syncTrigger }: {
  children: React.ReactNode,
  checkForScheduledSync: (force?: boolean) => Promise<boolean>,
  syncTrigger: number 
}) {
  const [fraudAlertsCache, setFraudAlertsCache] = useState<FraudTransaction[] | null>(null);
  const [fraudAlertsLoading, setFraudAlertsLoading] = useState(true);
  const fraudFetchInFlight = useRef<Promise<void> | null>(null);
  const fraudAlertsCacheRef = useRef<FraudTransaction[] | null>(null);

  React.useEffect(() => {
    if (syncTrigger > 0) {
      fraudAlertsCacheRef.current = null;
      setFraudAlertsCache(null);
    }
  }, [syncTrigger]);

  React.useEffect(() => {
    fraudAlertsCacheRef.current = fraudAlertsCache;
  }, [fraudAlertsCache]);

  const notifyFraud = async (txn: FraudTransaction) => {
    const { granted } = await Notifications.getPermissionsAsync();
    if (!granted) return;

    const key = `notified_fraud_${txn.txn_id}`;
    const alreadyNotified = await AsyncStorage.getItem(key);
    if (!alreadyNotified) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Suspicious Transaction Detected',
          body: `A transaction of $${txn.amount} at ${txn.merchant} was flagged as potentially fraudulent.`,
          data: { type: 'fraud', txnId: txn.txn_id },
        },
        trigger: null,
      });
      await AsyncStorage.setItem(key, 'true');
    }
  };

  const fetchFraudAlerts = useCallback(async (forceRefresh = false) => {
    const isInitialLoad = fraudAlertsCacheRef.current === null;

    if (!forceRefresh && !isInitialLoad) {
      setFraudAlertsLoading(false);
      return;
    }

    const detectedSync = await checkForScheduledSync(forceRefresh);
    if (!isInitialLoad && !detectedSync) {
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
        const unresolved = data.filter((t: FraudTransaction) => t.is_confirmed_fraud === null);
        fraudAlertsCacheRef.current = unresolved;
        setFraudAlertsCache(unresolved);
        unresolved.forEach(notifyFraud);
      } catch (err) {
        // Silent background failure
      } finally {
        setFraudAlertsLoading(false);
        fraudFetchInFlight.current = null;
      }
    };

    fraudFetchInFlight.current = doFetch();
    await fraudFetchInFlight.current;
  }, [checkForScheduledSync]);

  const optimisticallyRemoveFraudAlert = useCallback((txnId: string) => {
    setFraudAlertsCache((prev) => {
      if (!prev) return prev;
      return prev.filter((t) => t.txn_id !== txnId);
    });
  }, []);

  const value = React.useMemo(() => ({
    fraudAlertsCache,
    fraudAlertsLoading,
    fetchFraudAlerts,
    optimisticallyRemoveFraudAlert
  }), [fraudAlertsCache, fraudAlertsLoading, fetchFraudAlerts, optimisticallyRemoveFraudAlert]);

  return (
    <FraudContext.Provider value={value}>
      {children}
    </FraudContext.Provider>
  );
}
