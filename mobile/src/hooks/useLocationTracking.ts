import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import {
  MERCHANT_SEED_TASK,
  ensureLocationNotificationChannelAsync,
} from '../services/LocationService';

interface LocationTrackingState {
  hasForegroundPermission: boolean;
  hasBackgroundPermission: boolean;
  hasNotificationPermission: boolean;
  isTracking: boolean;
  error: string | null;
}

const initialState: LocationTrackingState = {
  hasForegroundPermission: false,
  hasBackgroundPermission: false,
  hasNotificationPermission: false,
  isTracking: false,
  error: null,
};

export function useLocationTracking(enabled = true) {
  const [state, setState] = useState<LocationTrackingState>(initialState);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;

    const initializeTracking = async () => {
      try {
        const isExpoGo = Constants.appOwnership === 'expo';

        if (isExpoGo) {
          if (!cancelled) {
            setState({
              hasForegroundPermission: false,
              hasBackgroundPermission: false,
              hasNotificationPermission: false,
              isTracking: false,
              error: 'Background location requires a development build or standalone app. Expo Go is not supported.',
            });
          }
          return;
        }

        await ensureLocationNotificationChannelAsync();

        const notificationPermissions = await Notifications.requestPermissionsAsync({
          ios: {
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
          },
        });

        if (notificationPermissions.status !== 'granted') {
          if (!cancelled) {
            setState({
              hasForegroundPermission: false,
              hasBackgroundPermission: false,
              hasNotificationPermission: false,
              isTracking: false,
              error: 'Notification permission was denied.',
            });
          }
          return;
        }

        const foregroundPermissions = await Location.requestForegroundPermissionsAsync();
        if (foregroundPermissions.status !== 'granted') {
          if (!cancelled) {
            setState({
              hasForegroundPermission: false,
              hasBackgroundPermission: false,
              hasNotificationPermission: notificationPermissions.status === 'granted',
              isTracking: false,
              error: 'Foreground location permission was denied.',
            });
          }
          return;
        }

        const backgroundPermissions = await Location.requestBackgroundPermissionsAsync();
        if (backgroundPermissions.status !== 'granted') {
          if (!cancelled) {
            setState({
              hasForegroundPermission: true,
              hasBackgroundPermission: false,
              hasNotificationPermission: notificationPermissions.status === 'granted',
              isTracking: false,
              error: 'Background location permission was denied.',
            });
          }
          return;
        }

        const isTrackingActive = await Location.hasStartedLocationUpdatesAsync(
          MERCHANT_SEED_TASK,
        );

        if (!isTrackingActive) {
          await Location.startLocationUpdatesAsync(MERCHANT_SEED_TASK, {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 150,
            deferredUpdatesDistance: 150,
            pausesUpdatesAutomatically: true,
            showsBackgroundLocationIndicator: Platform.OS === 'ios',
            foregroundService: {
              notificationTitle: 'SwipeSmart Smart Suggestions',
              notificationBody: 'Location tracking is active for card recommendations.',
            },
          });
        }

        if (!cancelled) {
          setState({
            hasForegroundPermission: true,
            hasBackgroundPermission: true,
            hasNotificationPermission: notificationPermissions.status === 'granted',
            isTracking: true,
            error: null,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            hasForegroundPermission: false,
            hasBackgroundPermission: false,
            hasNotificationPermission: false,
            isTracking: false,
            error: error instanceof Error ? error.message : 'Unable to start location tracking.',
          });
        }
      }
    };

    initializeTracking();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return state;
}