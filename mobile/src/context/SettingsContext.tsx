import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

const LOCATION_TRACKING_KEY = 'settings:location-tracking-enabled';

interface SettingsContextType {
  locationTrackingEnabled: boolean;
  loadingSettings: boolean;
  setLocationTrackingEnabled: (enabled: boolean) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType>({
  locationTrackingEnabled: true,
  loadingSettings: true,
  setLocationTrackingEnabled: async () => {},
});

export const useSettings = () => useContext(SettingsContext);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [locationTrackingEnabled, setLocationTrackingEnabledState] = useState(true);
  const [loadingSettings, setLoadingSettings] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadSettings = async () => {
      try {
        const raw = await SecureStore.getItemAsync(LOCATION_TRACKING_KEY);
        if (!mounted) return;
        setLocationTrackingEnabledState(raw === null ? true : raw === 'true');
      } finally {
        if (mounted) {
          setLoadingSettings(false);
        }
      }
    };

    loadSettings();

    return () => {
      mounted = false;
    };
  }, []);

  const setLocationTrackingEnabled = async (enabled: boolean) => {
    setLocationTrackingEnabledState(enabled);
    await SecureStore.setItemAsync(LOCATION_TRACKING_KEY, enabled ? 'true' : 'false');
  };

  return (
    <SettingsContext.Provider
      value={{
        locationTrackingEnabled,
        loadingSettings,
        setLocationTrackingEnabled,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}
