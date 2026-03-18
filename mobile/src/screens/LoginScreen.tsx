import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Animated,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassBackground } from '../components/GlassBackground';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import StarField from '../components/StarField';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';
import { AuthNavigationProp } from '../types/navigation';
import { ScalePressable } from '../components/ScalePressable';

import { useRouter } from 'expo-router';

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signIn, requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [error, setError] = useState('');

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError('Please enter your email and password');
      return;
    }
    setLoading(true);
    setError('');
    const { error: authError } = await signIn(email, password);
    setLoading(false);
    if (authError) setError(authError);
  };

  const handleForgotPassword = async () => {
    const emailValue = email.trim();
    if (!emailValue) {
      setError('Enter your email, then tap Forgot password.');
      return;
    }

    setResettingPassword(true);
    setError('');
    const { error: resetError } = await requestPasswordReset(emailValue);
    setResettingPassword(false);

    if (resetError) {
      setError(resetError);
      return;
    }

    setError('Password reset email sent. Check your inbox.');
  };

  return (
    <View style={styles.container}>
      <StarField />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <Animated.View
          style={[
            styles.content,
            {
              paddingTop: insets.top + 20,
              paddingBottom: insets.bottom + 26,
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <View style={styles.topBar}>
            <ScalePressable
              onPress={() => router.back()}
              style={styles.backButton}
            >
              <Ionicons name="chevron-back" size={20} color={Colors.textPrimary} />
            </ScalePressable>
          </View>

          <View style={styles.centerContent}>
            <ScrollView
              contentContainerStyle={styles.formScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.topTextWrap}>
                <View style={styles.logoBadge}>
                  <Ionicons name="flash" size={20} color={Colors.accentBlueBright} />
                </View>
                <Text style={styles.pageEyebrow}>Swipe</Text>
                <Text style={styles.pageTitle}>Sign In</Text>
              </View>

              <View style={styles.headerBlock}>
                <Text style={styles.tagline}>Welcome back. Access your premium finance dashboard and scan for security vulnerabilities.</Text>
              </View>

              <GlassBackground
                blurIntensity={26}
                blurTint="systemChromeMaterialDark"
                style={styles.cardContainer}
                fallbackColor="rgba(15, 15, 18, 0.98)"
                tintColor="rgba(255,255,255,0.02)"
              >
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Account Access</Text>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={Colors.textMuted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Password</Text>
              <View style={styles.passwordInputWrap}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="••••••••"
                  placeholderTextColor={Colors.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!passwordVisible}
                />
                <ScalePressable
                  onPress={() => setPasswordVisible((prev) => !prev)}
                  style={styles.eyeButton}
                >
                  <Ionicons
                    name={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={Colors.textMuted}
                  />
                </ScalePressable>
              </View>
            </View>

            <ScalePressable
              onPress={handleForgotPassword}
              disabled={resettingPassword}
              style={styles.forgotButton}
            >
              {resettingPassword ? (
                <ActivityIndicator size="small" color={Colors.accentBlueBright} />
              ) : (
                <Text style={styles.forgotText}>Forgot password?</Text>
              )}
            </ScalePressable>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <ScalePressable
              onPress={handleLogin}
              disabled={loading}
            >
              <LinearGradient
                colors={[Colors.gradientAccentStart, Colors.gradientAccentEnd]}
                style={styles.button}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {loading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.buttonText}>Sign In</Text>
                )}
              </LinearGradient>
            </ScalePressable>

                  <ScalePressable
                    onPress={() => router.replace('/auth/signup')}
                    style={styles.switchButton}
                  >
                    <Text style={styles.switchText}>
                      New to Swipe? <Text style={styles.switchHighlight}>Create Account</Text>
                    </Text>
                  </ScalePressable>
                </View>
              </GlassBackground>
            </ScrollView>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 420,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  centerContent: {
    flex: 1,
  },
  formScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTextWrap: {
    alignItems: 'center',
    marginBottom: 8,
  },
  logoBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(220, 38, 38, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.25)',
  },
  pageEyebrow: {
    ...Typography.caption1,
    color: Colors.accentBlueBright,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontWeight: '800',
  },
  pageTitle: {
    ...Typography.largeTitle,
    color: Colors.textPrimary,
    fontSize: 40,
    letterSpacing: -1,
  },
  headerBlock: {
    marginTop: 10,
    marginBottom: 26,
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  tagline: {
    ...Typography.footnote,
    color: Colors.textSecondary,
    lineHeight: 20,
    textAlign: 'center',
    opacity: 0.85,
  },
  cardContainer: {
    width: '100%',
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    backgroundColor: 'rgba(255,255,255,0.02)',
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
    marginBottom: 24,
    fontWeight: '700',
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    ...Typography.caption2,
    color: Colors.textMuted,
    marginBottom: 8,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    padding: 16,
    color: Colors.textPrimary,
    ...Typography.body,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  passwordInputWrap: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 58,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    color: Colors.textPrimary,
    ...Typography.body,
  },
  eyeButton: {
    paddingHorizontal: 16,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    ...Typography.footnote,
    color: Colors.negative,
    textAlign: 'center',
    marginBottom: 16,
    fontWeight: '600',
  },
  forgotButton: {
    alignSelf: 'flex-end',
    marginTop: -4,
    marginBottom: 18,
  },
  forgotText: {
    ...Typography.caption1,
    color: Colors.accentBlueBright,
    fontWeight: '700',
  },
  button: {
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    shadowColor: Colors.accentBlue,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 8,
  },
  buttonText: {
    ...Typography.headline,
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  switchButton: {
    marginTop: 24,
    alignItems: 'center',
  },
  switchText: {
    ...Typography.footnote,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  switchHighlight: {
    color: Colors.accentBlueBright,
    fontWeight: '800',
  },
});
