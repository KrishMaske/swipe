import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassBackground } from '../components/GlassBackground';
import StarField from '../components/StarField';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';
import { ScalePressable } from '../components/ScalePressable';

import { useRouter } from 'expo-router';

export default function SignupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSignup = async () => {
    if (!email.trim() || !password) {
      setError('Please fill in all fields');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    const { error: authError, needsConfirmation } = await signUp(email, password);
    setLoading(false);
    if (authError) {
      setError(authError);
    } else if (needsConfirmation) {
      setSuccess('Account created! Check your email for a confirmation link.');
    }
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
              <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.topTextWrap}>
                <View style={styles.logoBadge}>
                  <Ionicons name="flash" size={20} color={Colors.accentBlueBright} />
                </View>
                <Text style={styles.pageEyebrow}>Swipe</Text>
                <Text style={styles.pageTitle}>Create Account</Text>
              </Animated.View>

              <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.header}>
                <Text style={styles.subtitle}>Join Swipe. Access your premium finance dashboard and scan for security vulnerabilities.</Text>
              </Animated.View>

              <Animated.View entering={FadeInDown.delay(300).springify()}>
                <GlassBackground
                  blurIntensity={26}
                  blurTint="systemChromeMaterialDark"
                  style={styles.cardContainer}
                  fallbackColor="rgba(15, 15, 18, 0.98)"
                  tintColor="rgba(255,255,255,0.02)"
                >
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>Account Details</Text>
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
                    placeholder="Min. 6 characters"
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

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Confirm Password</Text>
                <View style={styles.passwordInputWrap}>
                  <TextInput
                    style={styles.passwordInput}
                    placeholder="Re-enter password"
                    placeholderTextColor={Colors.textMuted}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!confirmPasswordVisible}
                  />
                  <ScalePressable
                    onPress={() => setConfirmPasswordVisible((prev) => !prev)}
                    style={styles.eyeButton}
                  >
                    <Ionicons
                      name={confirmPasswordVisible ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color={Colors.textMuted}
                    />
                  </ScalePressable>
                </View>
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              {success ? <Text style={styles.successText}>{success}</Text> : null}

              <ScalePressable
                onPress={handleSignup}
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
                    <Text style={styles.buttonText}>Create Account</Text>
                  )}
                </LinearGradient>
              </ScalePressable>

                    <ScalePressable
                      onPress={() => router.replace('/auth/login')}
                      style={styles.switchButton}
                    >
                      <Text style={styles.switchText}>
                        Already with Swipe? <Text style={styles.switchHighlight}>Sign In</Text>
                      </Text>
                    </ScalePressable>
                  </View>
                </GlassBackground>
              </Animated.View>
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
  header: {
    marginTop: 10,
    marginBottom: 26,
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  subtitle: {
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
  inputContainer: { marginBottom: 20 },
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
  successText: {
    ...Typography.footnote,
    color: Colors.positive,
    textAlign: 'center',
    marginBottom: 16,
    fontWeight: '600',
  },
  button: {
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    shadowColor: Colors.accentEmerald,
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
