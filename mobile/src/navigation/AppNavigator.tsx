import React from 'react';
import { ActivityIndicator, View, StyleSheet, Dimensions, Platform, TouchableOpacity, Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../theme/colors';

// Screens
import LoginScreen from '../screens/LoginScreen';
import SignupScreen from '../screens/SignupScreen';
import AuthLandingScreen from '../screens/AuthLandingScreen';
import DashboardScreen from '../screens/DashboardScreen';
import AccountDetailScreen from '../screens/AccountDetailScreen';
import ChatScreen from '../screens/ChatScreen';
import SettingsScreen from '../screens/SettingsScreen';
import FraudAlertsScreen from '../screens/FraudAlertsScreen';
import SwipeSmartScreen from '../screens/SwipeSmartScreen';
import SimplefinOnboardingScreen from '../screens/SimplefinOnboardingScreen';

const { width } = Dimensions.get('window');
const TAB_BAR_WIDTH = width - 32;
const TAB_BAR_HEIGHT = 62;

const TAB_CONFIG: Record<string, { activeIcon: string; inactiveIcon: string; label: string }> = {
  Dashboard: { activeIcon: 'grid', inactiveIcon: 'grid-outline', label: 'Home' },
  SwipeSmart: { activeIcon: 'card', inactiveIcon: 'card-outline', label: 'SwipeSmart' },
  FraudAlerts: { activeIcon: 'shield', inactiveIcon: 'shield-outline', label: 'SwipeGuard' },
  Chat: { activeIcon: 'chatbubbles', inactiveIcon: 'chatbubbles-outline', label: 'SwipeChat' },
};

export function LiquidGlassTabBar({ state, navigation }: Readonly<BottomTabBarProps>) {
  const routes = state.routes;
  const tabWidth = TAB_BAR_WIDTH / routes.length;
  const activeIndex = state.index;

  const PILL_WIDTH = tabWidth - 10;
  const PILL_HEIGHT = 42;

  const pillX = useSharedValue(
    activeIndex * tabWidth + (tabWidth - PILL_WIDTH) / 2
  );

  React.useEffect(() => {
    pillX.value = withSpring(
      activeIndex * tabWidth + (tabWidth - PILL_WIDTH) / 2,
      { damping: 20, stiffness: 160, mass: 0.6 }
    );
  }, [activeIndex, tabWidth, PILL_WIDTH, pillX]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillX.value }],
  }));

  return (
    <View style={tabStyles.wrapper}>
      <View style={tabStyles.container}>
        {Platform.OS === 'ios' ? (
          <BlurView
            intensity={85}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <View
          style={[
            tabStyles.glassOverlay,
            Platform.OS === 'android' && tabStyles.glassOverlayAndroid,
          ]}
        />

        <Animated.View
          style={[
            tabStyles.pillOuter,
            { width: PILL_WIDTH, height: PILL_HEIGHT },
            pillStyle,
          ]}
        >
          <View style={[tabStyles.pill, { width: PILL_WIDTH, height: PILL_HEIGHT }]} />
        </Animated.View>

        <View style={tabStyles.tabRow}>
          {routes.map((route: any, index: number) => {
            const config = TAB_CONFIG[route.name] || {
              activeIcon: 'help-circle',
              inactiveIcon: 'help-circle-outline',
              label: route.name,
            };
            const isFocused = state.index === index;

            const handlePress = () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            };

            return (
              <TouchableOpacity
                key={route.key}
                style={tabStyles.tab}
                onPress={handlePress}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={(isFocused ? config.activeIcon : config.inactiveIcon) as any}
                  size={isFocused ? 22 : 19}
                  color={isFocused ? '#dc2626' : 'rgba(255,255,255,0.45)'}
                />
                {config.label ? (
                  <Text style={[tabStyles.label, isFocused && tabStyles.labelActive]}>
                    {config.label}
                  </Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const AuthStack = createNativeStackNavigator();
const MainStack = createNativeStackNavigator();
const OnboardingStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="AuthLanding" component={AuthLandingScreen} />
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Signup" component={SignupScreen} />
    </AuthStack.Navigator>
  );
}

function DashboardStack() {
  return (
    <MainStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: Colors.bgPrimary },
        headerTintColor: Colors.textPrimary,
        headerTitleStyle: { fontWeight: '600' },
        headerShadowVisible: false,
      }}
    >
      <MainStack.Screen
        name="DashboardHome"
        component={DashboardScreen}
        options={{ headerShown: false }}
      />
      <MainStack.Screen
        name="AccountDetail"
        component={AccountDetailScreen}
        options={({ route }: any) => ({
          title: route.params?.accType || 'Account',
          headerBackTitle: 'Back',
        })}
      />
      <MainStack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ headerShown: false, presentation: 'modal' }}
      />
    </MainStack.Navigator>
  );
}

function OnboardingNavigator() {
  return (
    <OnboardingStack.Navigator screenOptions={{ headerShown: false }}>
      <OnboardingStack.Screen name="SimplefinOnboarding" component={SimplefinOnboardingScreen} />
    </OnboardingStack.Navigator>
  );
}

function TabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <LiquidGlassTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardStack}
        options={{ tabBarLabel: 'Home' }}
      />
      <Tab.Screen
        name="SwipeSmart"
        component={SwipeSmartScreen}
        options={{ tabBarLabel: 'SwipeSmart' }}
      />
      <Tab.Screen
        name="FraudAlerts"
        component={FraudAlertsScreen}
        options={{ tabBarLabel: 'SwipeGuard' }}
      />
      <Tab.Screen
        name="Chat"
        component={ChatScreen}
        options={{ tabBarLabel: 'SwipeChat' }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { session, loading, simplefinLinked, simplefinStatusLoading } = useAuth();

  if (loading || (session && simplefinStatusLoading)) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.accentBlue} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {!session ? <AuthNavigator /> : simplefinLinked ? <TabNavigator /> : <OnboardingNavigator />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.bgPrimary,
  },
});

const tabStyles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 28 : 16,
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  container: {
    width: TAB_BAR_WIDTH,
    height: TAB_BAR_HEIGHT,
    borderRadius: 32,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.65,
    shadowRadius: 28,
    elevation: 18,
  },
  glassOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 10, 12, 0.35)',
  },
  glassOverlayAndroid: {
    backgroundColor: 'rgba(8, 8, 10, 0.95)',
  },

  // Pill
  pillOuter: {
    position: 'absolute',
    top: (TAB_BAR_HEIGHT - 42) / 2,
    left: 0,
    zIndex: 0,
  },
  pill: {
    borderRadius: 21,
    backgroundColor: 'rgba(220, 38, 38, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.2)',
  },

  // Tabs
  tabRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1,
  },
  tab: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
    gap: 3,
  },
  label: {
    fontSize: 10,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.4)',
  },
  labelActive: {
    color: '#dc2626',
    fontWeight: '700',
  },
});
