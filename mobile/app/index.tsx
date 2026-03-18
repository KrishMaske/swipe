import { Redirect } from "expo-router";
import { useAuth } from "../src/context/AuthContext";
import { useEffect, useState } from "react";
import { View, ActivityIndicator, Platform } from "react-native";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { Colors } from "../src/theme/colors";

export default function Index() {
  const { session, loading: authLoading, simplefinLinked, simplefinStatusLoading } = useAuth();
  const [checkingPerms, setCheckingPerms] = useState(true);
  const [permissionsGranted, setPermissionsGranted] = useState(false);

  useEffect(() => {
    (async () => {
      const { status: fg } = await Location.getForegroundPermissionsAsync();
      const { status: bg } = await Location.getBackgroundPermissionsAsync();
      const { status: notif } = await Notifications.getPermissionsAsync();
      
      const okFg = fg === "granted";
      const okBg = bg === "granted";
      const okNotif = notif === "granted";

      setPermissionsGranted(okFg && okBg && okNotif);
      setCheckingPerms(false);
    })();
  }, []);

  if (authLoading || checkingPerms || (session && simplefinStatusLoading)) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#dc2626" />
      </View>
    );
  }

  if (!session) return <Redirect href="/auth/landing" />;
  if (!permissionsGranted) return <Redirect href="/onboarding/permissions" />;
  if (!simplefinLinked) return <Redirect href="/onboarding/simplefin" />;
  
  return <Redirect href="/(tabs)" />;
}
