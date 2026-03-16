import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';

type Props = {
  navigation: NativeStackNavigationProp<any>;
};

export default function AuthLandingScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#000000', '#000000']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 26 }]}> 
        <View style={styles.hero}>
          <Image
            source={require('../../images/AppIcons/swipelogo_transparent.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />

          <Text style={styles.title}>SWIPE</Text>
          <Text style={styles.subtitle}>A smart payments system. One secure connection.</Text>
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
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    padding: 22,
    marginBottom: 10,
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
    borderColor: Colors.glassBorder,
    backgroundColor: 'rgba(255,255,255,0.03)',
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
