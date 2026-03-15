import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { DataProvider } from './src/context/DataContext';
import { SettingsProvider, useSettings } from './src/context/SettingsContext';
import AppNavigator from './src/navigation/AppNavigator';
import { useLocationTracking } from './src/hooks/useLocationTracking';
import './src/services/LocationService';

function LocationTrackingController() {
  const { session, simplefinLinked } = useAuth();
  const { locationTrackingEnabled, loadingSettings } = useSettings();
  useLocationTracking(Boolean(session && simplefinLinked) && !loadingSettings && locationTrackingEnabled);
  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <DataProvider>
          <LocationTrackingController />
          <StatusBar style="light" />
          <AppNavigator />
        </DataProvider>
      </SettingsProvider>
    </AuthProvider>
  );
}
