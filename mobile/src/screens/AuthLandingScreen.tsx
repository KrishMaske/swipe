import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';
import { AuthNavigationProp } from '../types/navigation';
import StarField from '../components/StarField';

type Props = {
  navigation: AuthNavigationProp;
};

export default function AuthLandingScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const compact = width < 370 || height < 760;
  const logoSize = compact ? 148 : 176;
  const heroTop = compact ? 42 : 72;
  const subtitleMaxWidth = Math.min(width - 64, 320);

  return (
    <View style={styles.container}>
      <StarField />

      <View style={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 26 }]}> 
        <View style={[styles.hero, { marginTop: heroTop }]}> 
          <Image
            source={require('../../images/AppIcons/swipelogo_transparent.png')}
            style={[styles.logoImage, { width: logoSize, height: logoSize }]}
            resizeMode="contain"
          />

          <Text style={styles.title}>SWIPE</Text>
          <Text style={[styles.subtitle, { maxWidth: subtitleMaxWidth }]}>A smart payments system. One secure connection.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Get Started</Text>
          <Text style={styles.cardBody}>
            Sign in to continue, or create a new account. You will connect your bank securely with SimpleFIN before entering the app.
          </Text>

          <TouchableOpacity
            onPress={() => navigation.replace('Login')}
            activeOpacity={0.86}
            style={styles.actionButtonWrap}
          >
            <LinearGradient
              colors={[Colors.gradientAccentStart, Colors.gradientAccentEnd]}
              style={styles.primaryButton}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.primaryButtonText}>Sign In</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigation.replace('Signup')}
            activeOpacity={0.86}
            style={styles.secondaryButton}
          >
            <Ionicons name="person-add-outline" size={18} color={Colors.textPrimary} />
            <Text style={styles.secondaryButtonText}>Create Account</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 22,
  },
  hero: {
    marginTop: 72,
    alignItems: 'center',
  },
  logoImage: {
    width: 176,
    height: 176,
    marginBottom: -30,
    alignSelf: 'center',
  },
  title: {
    ...Typography.largeTitle,
    color: '#bd1e3b',
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    ...Typography.subhead,
    color: Colors.textSecondary,
    textAlign: 'center',
    maxWidth: 280,
  },
  card: {
    backgroundColor: Colors.navGlassBackground,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.navGlassBorder,
    padding: 22,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.42,
    shadowRadius: 18,
    elevation: 8,
  },
  cardTitle: {
    ...Typography.title3,
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  cardBody: {
    ...Typography.footnote,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
  },
  actionButtonWrap: {
    marginBottom: 10,
  },
  primaryButton: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    ...Typography.headline,
    color: '#fff',
  },
  secondaryButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.navGlassBorder,
    backgroundColor: Colors.navGlassBackground,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  secondaryButtonText: {
    ...Typography.headline,
    color: Colors.textPrimary,
    fontSize: 15,
  },
});
