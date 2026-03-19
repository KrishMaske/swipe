import { Platform } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import {
  getApiBaseUrl,
  getAuthHeaders,
  LocationEvaluationResponse,
} from './api';

// Task 1: fires every ~150m to discover nearby merchants and seed geofences
export const MERCHANT_SEED_TASK = 'MERCHANT_SEED_TASK';

// Task 2: fires when the user physically enters a merchant's geofence boundary
export const GEOFENCE_ENTER_TASK = 'GEOFENCE_ENTER_TASK';

const LOCATION_NOTIFICATION_CHANNEL = 'smart-card-suggestions';
const LAST_SUGGESTION_KEY = 'swipesmart.last-suggestion';
const SUGGESTION_COOLDOWN_MS = 20 * 60 * 1000;
const GEOFENCE_RADIUS_M = 80;  // ~store footprint
const MAX_GEOFENCES = 18;       // iOS caps at 20; keep a buffer

export async function ensureLocationNotificationChannelAsync() {
  if (Platform.OS !== 'android') {
    return;
  }

  await Notifications.setNotificationChannelAsync(LOCATION_NOTIFICATION_CHANNEL, {
    name: 'Smart Card Suggestions',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 200, 250],
    lightColor: '#EF4444',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

async function shouldNotifySuggestion(evaluation: LocationEvaluationResponse) {
  const nextKey = `${evaluation.place_name || 'unknown'}|${evaluation.best_card_name || 'none'}|${evaluation.category || 'other'}`;
  const stored = await SecureStore.getItemAsync(LAST_SUGGESTION_KEY);

  if (!stored) {
    await SecureStore.setItemAsync(LAST_SUGGESTION_KEY, JSON.stringify({ key: nextKey, timestamp: Date.now() }));
    return true;
  }

  try {
    const parsed = JSON.parse(stored) as { key?: string; timestamp?: number };
    if (parsed.key === nextKey && Date.now() - (parsed.timestamp || 0) < SUGGESTION_COOLDOWN_MS) {
      return false;
    }
  } catch {
    // ignore malformed cache
  }

  await SecureStore.setItemAsync(LAST_SUGGESTION_KEY, JSON.stringify({ key: nextKey, timestamp: Date.now() }));
  return true;
}

async function sendCardNotification(evaluation: LocationEvaluationResponse) {
  await ensureLocationNotificationChannelAsync();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `💸 SwipeSmart at ${evaluation.place_name || 'this merchant'}`,
      body: `Use your ${evaluation.best_card_name} here to earn ${evaluation.multiplier || 1}x points on ${evaluation.category || 'this purchase'}!`,
      sound: 'default',
      data: {
        type: 'smart-card-suggestion',
        placeName: evaluation.place_name,
        category: evaluation.category,
        bestCardName: evaluation.best_card_name,
        multiplier: evaluation.multiplier,
      },
    },
    trigger: null,
  });
}

// ─── Task 1: Merchant Seeder ──────────────────────────────────────────────────
// Fires every ~150m of movement. Fetches nearby commercial POIs from the backend
// and atomically replaces the active geofence set.
if (!TaskManager.isTaskDefined(MERCHANT_SEED_TASK)) {
  TaskManager.defineTask(MERCHANT_SEED_TASK, async ({ data, error }) => {
    if (error) {
      if (__DEV__) {
        console.warn('[LocationService] Seed task error:', error.message);
      }
      return;
    }

    const taskData = data as { locations?: Location.LocationObject[] } | undefined;
    const loc = taskData?.locations?.[0];
    if (!loc?.coords) return;

    try {
      const headers = await getAuthHeaders();
      const response = await fetch(
        `${getApiBaseUrl()}/api/location/nearby-merchants?lat=${loc.coords.latitude}&lon=${loc.coords.longitude}`,
        { method: 'GET', headers },
      );
      if (!response.ok) return;

      const merchants = (await response.json()) as Array<{
        name: string;
        latitude: number;
        longitude: number;
      }>;

      if (!merchants.length) return;

      const regions: Location.LocationRegion[] = merchants.slice(0, MAX_GEOFENCES).map((m) => ({
        identifier: m.name,
        latitude: m.latitude,
        longitude: m.longitude,
        radius: GEOFENCE_RADIUS_M,
        notifyOnEnter: true,
        notifyOnExit: false,
      }));

      // Atomically replace the geofence set
      const isGeofencing = await Location.hasStartedGeofencingAsync(GEOFENCE_ENTER_TASK);
      if (isGeofencing) {
        await Location.stopGeofencingAsync(GEOFENCE_ENTER_TASK);
      }
      await Location.startGeofencingAsync(GEOFENCE_ENTER_TASK, regions);
    } catch (err) {
      if (__DEV__) {
        console.warn('[LocationService] Failed to seed geofences:', err);
      }
    }
  });
}

// ─── Task 2: Geofence Entry Handler ──────────────────────────────────────────
// Fires only when the user physically crosses into a merchant's 80m radius.
// Evaluates the best card for that location and sends a push notification.
if (!TaskManager.isTaskDefined(GEOFENCE_ENTER_TASK)) {
  TaskManager.defineTask(GEOFENCE_ENTER_TASK, async ({ data, error }) => {
    if (error) {
      if (__DEV__) {
        console.warn('[LocationService] Geofence task error:', error.message);
      }
      return;
    }

    const taskData = data as {
      eventType?: Location.GeofencingEventType;
      region?: Location.LocationRegion;
    } | undefined;

    if (taskData?.eventType !== Location.GeofencingEventType.Enter) return;

    const region = taskData.region;
    if (!region?.latitude || !region?.longitude) return;

    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${getApiBaseUrl()}/api/location/evaluate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          latitude: region.latitude,
          longitude: region.longitude,
        }),
      });

      if (!response.ok) return;

      const evaluation = (await response.json()) as LocationEvaluationResponse;

      if (!evaluation.is_commercial || !evaluation.best_card_name) return;
      if (!(await shouldNotifySuggestion(evaluation))) return;

      await sendCardNotification(evaluation);
    } catch (err) {
      if (__DEV__) {
        console.warn('[LocationService] Failed to evaluate geofence entry:', err);
      }
    }
  });
}

