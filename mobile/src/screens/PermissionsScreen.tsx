import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  AppStateStatus,
  Linking,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ScalePressable } from '../components/ScalePressable';
import { GlassBackground } from '../components/GlassBackground';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import StarField from '../components/StarField';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';

type StepKey = 'foreground' | 'background' | 'notifications';

type StepState = 'locked' | 'pending' | 'granted' | 'denied';

function isFullAccuracy(foreground: Location.LocationPermissionResponse): boolean {
  // Accuracy is not in the base LocationPermissionResponse type but exists at runtime on iOS.
  // We use a safer check.
  const fg = foreground as Location.LocationPermissionResponse & { ios?: { accuracy?: string }; accuracy?: string };
  const value = String(fg.accuracy ?? fg.ios?.accuracy ?? '').toLowerCase();
  
  if (!value) {
    // Android does not expose the same reduced/full concept in Expo APIs.
    return Platform.OS !== 'ios';
  }

  return value === 'full';
}

function isNotificationsGranted(permission: Notifications.NotificationPermissionsStatus): boolean {
  if (permission.granted) return true;
  const status = String(permission.status || '').toLowerCase();
  return status === 'granted';
}

function resolveStepState(options: {
  granted: boolean;
  canAskAgain: boolean;
  locked?: boolean;
}): StepState {
  if (options.locked) return 'locked';
  if (options.granted) return 'granted';
  return options.canAskAgain ? 'pending' : 'denied';
}

export default function PermissionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);

  const [foregroundState, setForegroundState] = useState<StepState>('pending');
  const [backgroundState, setBackgroundState] = useState<StepState>('locked');
  const [notificationsState, setNotificationsState] = useState<StepState>('locked');

  const currentStep: StepKey = useMemo(() => {
    if (foregroundState !== 'granted') return 'foreground';
    if (backgroundState !== 'granted') return 'background';
    if (notificationsState !== 'granted') return 'notifications';
    return 'notifications';
  }, [foregroundState, backgroundState, notificationsState]);

  const allGranted =
    foregroundState === 'granted' &&
    backgroundState === 'granted' &&
    notificationsState === 'granted';

  const refreshPermissionStates = useCallback(async () => {
    const [fg, bg, notif] = await Promise.all([
      Location.getForegroundPermissionsAsync(),
      Location.getBackgroundPermissionsAsync(),
      Notifications.getPermissionsAsync(),
    ]);

    const foregroundGranted = fg.granted && isFullAccuracy(fg);
    const backgroundGranted = bg.granted;
    const notificationGranted = isNotificationsGranted(notif);

    const nextForeground = resolveStepState({
      granted: foregroundGranted,
      canAskAgain: !!fg.canAskAgain,
    });

    setForegroundState(nextForeground);

    if (nextForeground !== 'granted') {
      setBackgroundState(resolveStepState({ granted: false, canAskAgain: false, locked: true }));
      setNotificationsState(resolveStepState({ granted: false, canAskAgain: false, locked: true }));
    } else {
      const nextBackground = resolveStepState({
        granted: backgroundGranted,
        canAskAgain: !!bg.canAskAgain,
      });

      setBackgroundState(nextBackground);

      if (nextBackground !== 'granted') {
        setNotificationsState(resolveStepState({ granted: false, canAskAgain: false, locked: true }));
      } else {
        setNotificationsState(
          resolveStepState({
            granted: notificationGranted,
            canAskAgain: !!notif.canAskAgain,
          })
        );
      }
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      try {
        await refreshPermissionStates();
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    init();

    const sub = AppState.addEventListener('change', async (state: AppStateStatus) => {
      if (state === 'active') {
        await refreshPermissionStates();
      }
    });

    return () => {
      isMounted = false;
      sub.remove();
    };
  }, [refreshPermissionStates]);

  useEffect(() => {
    if (allGranted) {
      router.replace('/onboarding/simplefin');
    }
  }, [allGranted, router]);

  const requestForeground = useCallback(async () => {
    setRequesting(true);
    try {
      const result = await Location.requestForegroundPermissionsAsync();
      const granted = result.granted && isFullAccuracy(result);
      setForegroundState(resolveStepState({ granted, canAskAgain: !!result.canAskAgain }));
      if (granted) {
        setBackgroundState((prev) => (prev === 'granted' ? 'granted' : 'pending'));
      } else {
        setBackgroundState('locked');
        setNotificationsState('locked');
      }
      await refreshPermissionStates();
    } finally {
      setRequesting(false);
    }
  }, [refreshPermissionStates]);

  const requestBackground = useCallback(async () => {
    setRequesting(true);
    try {
      const result = await Location.requestBackgroundPermissionsAsync();
      const granted = result.granted;
      setBackgroundState(resolveStepState({ granted, canAskAgain: !!result.canAskAgain }));
      if (granted) {
        setNotificationsState((prev) => (prev === 'granted' ? 'granted' : 'pending'));
      } else {
        setNotificationsState('locked');
      }
      await refreshPermissionStates();
    } finally {
      setRequesting(false);
    }
  }, [refreshPermissionStates]);

  const requestNotifications = useCallback(async () => {
    setRequesting(true);
    try {
      const result = await Notifications.requestPermissionsAsync();
      const granted = isNotificationsGranted(result);
      setNotificationsState(resolveStepState({ granted, canAskAgain: !!result.canAskAgain }));
      await refreshPermissionStates();
    } finally {
      setRequesting(false);
    }
  }, [refreshPermissionStates]);

  const openSettings = useCallback(async () => {
    try {
      if (Platform.OS === 'ios') {
        const canOpen = await Linking.canOpenURL('app-settings:');
        if (canOpen) {
          await Linking.openURL('app-settings:');
          return;
        }
      }
      await Linking.openSettings();
    } catch {
      // no-op: if settings cannot open, user can retry via system settings manually.
    }
  }, []);

  const stepMeta = {
    foreground: {
      title: 'Step 1: Precise Location',
      subtitle: 'Allow precise location while using the app',
      icon: 'locate' as const,
      why: [
        'SwipeSmart uses precise location to correctly identify nearby merchants.',
        'Accurate merchant matching improves card recommendations and fraud checks.',
      ],
      deniedFix: [
        'Open Settings > SwipeSmart > Location.',
        "Set Location Access to 'While Using the App' (or higher).",
        "Enable 'Precise Location'.",
      ],
      onAllow: requestForeground,
      state: foregroundState,
    },
    background: {
      title: 'Step 2: Always-On Location',
      subtitle: 'Allow location in the background',
      icon: 'navigate-circle' as const,
      why: [
        'SwipeSmart needs background location to detect when you arrive at a store.',
        'This lets us proactively surface the best card before checkout.',
      ],
      deniedFix: [
        'Open Settings > SwipeSmart > Location.',
        "Change Location Access to 'Always'.",
        "Keep 'Precise Location' enabled.",
      ],
      onAllow: requestBackground,
      state: backgroundState,
    },
    notifications: {
      title: 'Step 3: Notifications',
      subtitle: 'Enable alerts and recommendations',
      icon: 'notifications' as const,
      why: [
        'Get real-time fraud alerts and transaction warnings.',
        'Receive timely card recommendations and budget reminders.',
      ],
      deniedFix: [
        'Open Settings > Notifications > SwipeSmart.',
        "Turn on 'Allow Notifications'.",
        'Enable alerts on Lock Screen, Notification Center, and Banners.',
      ],
      onAllow: requestNotifications,
      state: notificationsState,
    },
  };

  const active = stepMeta[currentStep];

  const canAllow =
    !requesting &&
    ((currentStep === 'foreground' && foregroundState !== 'granted') ||
      (currentStep === 'background' && foregroundState === 'granted' && backgroundState !== 'granted') ||
      (currentStep === 'notifications' && foregroundState === 'granted' && backgroundState === 'granted' && notificationsState !== 'granted'));

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <LinearGradient
          colors={[Colors.gradientStart, Colors.gradientMid, Colors.gradientEnd]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        <StarField />
        <ActivityIndicator size="large" color={Colors.accentBlueBright} />
        <Text style={styles.loadingText}>Checking permissions...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }]}>
      <StarField />

      <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.headerRow}>
        <View>
          <Text style={styles.headerEyebrow}>Swipe</Text>
          <Text style={styles.headerTitle}>Permissions</Text>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.stepperRow}>
        {(['foreground', 'background', 'notifications'] as StepKey[]).map((step, idx) => {
          const state = stepMeta[step].state;
          const isActive = currentStep === step;
          const done = state === 'granted';
          return (
            <View key={step} style={styles.stepperItem}>
              <View
                style={[
                  styles.stepDot,
                  done && styles.stepDotDone,
                  isActive && styles.stepDotActive,
                ]}
              />
              {idx < 2 ? <View style={[styles.stepLine, done && styles.stepLineDone]} /> : null}
            </View>
          );
        })}
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(300).springify()} style={{ flex: 1 }}>
        <GlassBackground
          blurIntensity={35}
          blurTint="systemChromeMaterialDark"
          style={styles.card}
          fallbackColor="rgba(15, 15, 18, 0.98)"
          tintColor="rgba(255,255,255,0.02)"
        >
          <View style={styles.iconWrap}>
            <Ionicons name={active.icon} size={26} color={Colors.accentBlueBright} />
          </View>

          <Text style={styles.title}>{active.title}</Text>
          <Text style={styles.subtitle}>{active.subtitle}</Text>

          <View style={styles.listWrap}>
            {active.why.map((line) => (
              <View key={line} style={styles.bulletRow}>
                <View style={styles.bullet} />
                <Text style={styles.bulletText}>{line}</Text>
              </View>
            ))}
          </View>

          {active.state === 'denied' ? (
            <>
              <View style={styles.deniedBox}>
                <Text style={styles.deniedTitle}>Permission blocked</Text>
                {active.deniedFix.map((line) => (
                  <View key={line} style={styles.bulletRow}>
                    <View style={[styles.bullet, styles.bulletMuted]} />
                    <Text style={styles.fixText}>{line}</Text>
                  </View>
                ))}
              </View>
              <ScalePressable onPress={openSettings} style={styles.secondaryBtn}>
                <Text style={styles.secondaryBtnText}>Open Settings</Text>
              </ScalePressable>
            </>
          ) : active.state === 'granted' && allGranted ? (
            <View style={styles.grantedRow}>
              <Ionicons name="checkmark-circle" size={22} color={Colors.accentEmerald} />
              <Text style={styles.grantedText}>All permissions granted. Redirecting...</Text>
            </View>
          ) : (
            <ScalePressable
              disabled={!canAllow}
              onPress={active.onAllow}
              style={styles.primaryBtn}
            >
              <LinearGradient
                colors={[Colors.gradientAccentStart, Colors.gradientAccentEnd]}
                style={styles.primaryBtnGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {requesting ? (
                  <ActivityIndicator color={Colors.textPrimary} />
                ) : (
                  <Text style={styles.primaryBtnText}>Allow Permission</Text>
                )}
              </LinearGradient>
            </ScalePressable>
          )}

          <Text style={styles.hardGateText}>
            SwipeSmart requires all 3 permissions to continue. Access to onboarding and the app remains locked until complete.
          </Text>
        </GlassBackground>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    backgroundColor: Colors.bgPrimary,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: Colors.bgPrimary,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerEyebrow: {
    ...Typography.caption1,
    color: Colors.accentBlueBright,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  headerTitle: {
    ...Typography.largeTitle,
    color: Colors.textPrimary,
  },
  loadingText: {
    ...Typography.footnote,
    color: Colors.textSecondary,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    paddingHorizontal: 8,
  },
  stepperItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: Colors.navGlassBorder,
  },
  stepDotActive: {
    backgroundColor: Colors.accentBlue,
    borderColor: Colors.accentBlueBright,
    shadowColor: Colors.accentBlue,
    shadowOpacity: 0.8,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  stepDotDone: {
    backgroundColor: Colors.accentEmerald,
    borderColor: Colors.accentEmerald,
  },
  stepLine: {
    width: 66,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.14)',
    marginHorizontal: 8,
  },
  stepLineDone: {
    backgroundColor: 'rgba(52,211,153,0.8)',
  },
  card: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.navGlassBorder,
    backgroundColor: Colors.navGlassBackground,
    padding: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.42,
    shadowRadius: 18,
    elevation: 8,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(248,113,113,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.4)',
    marginBottom: 14,
  },
  title: {
    ...Typography.title2,
    color: Colors.textPrimary,
  },
  subtitle: {
    ...Typography.subhead,
    color: Colors.textSecondary,
    marginTop: 8,
  },
  listWrap: {
    marginTop: 18,
    gap: 10,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.accentBlueBright,
    marginTop: 7,
  },
  bulletMuted: {
    backgroundColor: Colors.textMuted,
  },
  bulletText: {
    flex: 1,
    ...Typography.footnote,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  deniedBox: {
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.46)',
    backgroundColor: 'rgba(127,29,29,0.28)',
    padding: 14,
    gap: 8,
  },
  deniedTitle: {
    ...Typography.subhead,
    color: '#fecaca',
    marginBottom: 2,
  },
  fixText: {
    flex: 1,
    ...Typography.footnote,
    color: '#fecaca',
    lineHeight: 18,
  },
  primaryBtn: {
    marginTop: 18,
    borderRadius: 14,
    overflow: 'hidden',
  },
  primaryBtnGradient: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPressed: {
    opacity: 0.8,
  },
  primaryBtnText: {
    ...Typography.headline,
    color: '#fff',
  },
  secondaryBtn: {
    marginTop: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.navGlassBorder,
    backgroundColor: Colors.navGlassBackground,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    ...Typography.headline,
    color: Colors.textPrimary,
    fontSize: 15,
  },
  grantedRow: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  grantedText: {
    ...Typography.footnote,
    color: '#a7f3d0',
    fontWeight: '700',
  },
  hardGateText: {
    marginTop: 'auto',
    paddingTop: 20,
    ...Typography.caption1,
    color: Colors.textMuted,
    lineHeight: 18,
  },
});