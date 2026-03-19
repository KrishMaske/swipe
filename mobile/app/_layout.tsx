import { Stack, useSegments, useRouter } from "expo-router";
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useEffect } from "react";
import { AuthProvider, useAuth } from "../src/context/AuthContext";
import { DataProvider } from "../src/context/DataContext";
import { Colors } from "../src/theme/colors";

function InitialLayout() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === "auth";
    const inOnboardingGroup = segments[0] === "onboarding";

    if (!session && !inAuthGroup) {
      router.replace("/auth/landing");
    } else if (session && inAuthGroup) {
      // If we're logged in but on the auth screens, index.tsx will guide us to onboarding or tabs
      router.replace("/");
    }
  }, [session, loading, segments, router]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="auth/landing" />
      <Stack.Screen name="auth/login" />
      <Stack.Screen name="auth/signup" />
      <Stack.Screen name="onboarding/permissions" />
      <Stack.Screen name="onboarding/simplefin" />
      <Stack.Screen
        name="dashboard/account/[id]"
        options={{
          presentation: "formSheet",
          headerShown: false,
          sheetAllowedDetents: [0.95],
          sheetGrabberVisible: true,
          sheetCornerRadius: 30,
          contentStyle: { backgroundColor: "#000000" },
        }}
      />
      <Stack.Screen
        name="dashboard/budget/[id]"
        options={{
          presentation: "formSheet",
          headerShown: false,
          sheetAllowedDetents: [0.65, 0.95],
          sheetGrabberVisible: true,
          sheetCornerRadius: 30,
          contentStyle: { backgroundColor: "#000000" },
        }}
      />
      <Stack.Screen
        name="dashboard/settings"
        options={{
          presentation: "formSheet",
          headerShown: false,
          sheetAllowedDetents: [0.95],
          sheetGrabberVisible: true,
          sheetCornerRadius: 30,
          contentStyle: { backgroundColor: "#000000" },
        }}
      />
      <Stack.Screen
        name="swipesmart/card-details"
        options={{
          presentation: "formSheet",
          headerShown: false,
          sheetAllowedDetents: [0.65, 0.95],
          sheetGrabberVisible: true,
          sheetCornerRadius: 30,
          contentStyle: { backgroundColor: "#000000" },
        }}
      />
      <Stack.Screen
        name="guard/recent-scans"
        options={{
          presentation: "formSheet",
          headerShown: false,
          sheetAllowedDetents: [0.95],
          sheetGrabberVisible: true,
          sheetCornerRadius: 30,
          contentStyle: { backgroundColor: "#000000" },
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <DataProvider>
          <InitialLayout />
        </DataProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
