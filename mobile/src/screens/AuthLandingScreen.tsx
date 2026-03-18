import React from 'react';
import { Image, StyleSheet, Text, useWindowDimensions, View, Platform } from 'react-native';
import { ScalePressable } from '../components/ScalePressable';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassBackground } from '../components/GlassBackground';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';
import { AuthNavigationProp } from '../types/navigation';
import StarField from '../components/StarField';

import { useRouter } from 'expo-router';

export default function AuthLandingScreen() {
  const router = useRouter();
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

        <GlassBackground
          blurIntensity={26}
          blurTint="systemChromeMaterialDark"
          style={styles.cardContainer}
          fallbackColor="rgba(15, 15, 18, 0.98)"
          tintColor="rgba(255,255,255,0.02)"
        >
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Get Started</Text>
            <Text style={styles.cardBody}>
              Join a smart scanning payments system. Access your premium finance dashboard and scan for security vulnerabilities.
            </Text>

            <ScalePressable
              onPress={() => router.replace('/auth/login')}
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
            </ScalePressable>

            <ScalePressable
              onPress={() => router.replace('/auth/signup')}
              style={styles.secondaryButton}
            >
              <Ionicons name="person-add-outline" size={18} color={Colors.textPrimary} />
              <Text style={styles.secondaryButtonText}>Create Account</Text>
            </ScalePressable>
          </View>
        </GlassBackground>
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
  cardContainer: {
    width: '100%',
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    backgroundColor: 'rgba(255,255,255,0.02)',
    marginBottom: 10,
  },
  card: {
    padding: 26,
  },
  cardAndroid: {
    backgroundColor: 'rgba(15, 15, 18, 0.98)',
  },
  cardTitle: {
    ...Typography.title3,
    color: Colors.textPrimary,
    marginBottom: 8,
    fontWeight: '700',
  },
  cardBody: {
    ...Typography.footnote,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: 20,
    opacity: 0.85,
  },
  actionButtonWrap: {
    marginBottom: 12,
  },
  primaryButton: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.accentBlue,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  primaryButtonText: {
    ...Typography.headline,
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryButton: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  secondaryButtonText: {
    ...Typography.headline,
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
});
