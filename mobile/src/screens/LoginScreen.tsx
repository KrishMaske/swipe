import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Animated,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import StarField from '../components/StarField';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';

type Props = {
  navigation: NativeStackNavigationProp<any>;
};

export default function LoginScreen({ navigation }: Props) {
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
    <LinearGradient
      colors={['#000000', '#000000']}
      style={styles.container}
    >
      <StarField />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[
          styles.keyboardView,
          { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 20 },
        ]}
      >
        <Animated.View
          style={[
            styles.content,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <View style={styles.topBar}>
            <TouchableOpacity
              onPress={() => navigation.replace('AuthLanding')}
              style={styles.backButton}
              activeOpacity={0.8}
            >
              <Ionicons name="chevron-back" size={18} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.centerContent}>
            <ScrollView
              contentContainerStyle={styles.formScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.topTextWrap}>
                <Text style={styles.pageEyebrow}>Swipe</Text>
                <Text style={styles.pageTitle}>Sign In</Text>
              </View>

              <View style={styles.headerBlock}>
                <Text style={styles.tagline}>Welcome back. Continue to your payments dashboard.</Text>
              </View>

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
                <TouchableOpacity
                  onPress={() => setPasswordVisible((prev) => !prev)}
                  style={styles.eyeButton}
                  activeOpacity={0.75}
                >
                  <Ionicons
                    name={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={Colors.textMuted}
                  />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              onPress={handleForgotPassword}
              disabled={resettingPassword}
              style={styles.forgotButton}
              activeOpacity={0.75}
            >
              {resettingPassword ? (
                <ActivityIndicator size="small" color={Colors.accentBlueBright} />
              ) : (
                <Text style={styles.forgotText}>Forgot password?</Text>
              )}
            </TouchableOpacity>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.8}
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
            </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => navigation.replace('Signup')}
                  style={styles.switchButton}
                >
                  <Text style={styles.switchText}>
                    Need an account? <Text style={styles.switchHighlight}>Create one</Text>
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
    paddingHorizontal: 22,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    flex: 1,
    alignSelf: 'center',
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTextWrap: {
    alignItems: 'center',
  },
  pageEyebrow: {
    ...Typography.caption1,
    color: Colors.accentBlueBright,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  pageTitle: {
    ...Typography.largeTitle,
    color: Colors.textPrimary,
  },
  headerBlock: {
    marginTop: 14,
    marginBottom: 14,
    alignItems: 'center',
  },
  tagline: {
    ...Typography.footnote,
    color: Colors.textSecondary,
    lineHeight: 20,
    textAlign: 'center',
  },
  card: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 24,
    padding: 28,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 16,
  },
  cardTitle: {
    ...Typography.title2,
    color: Colors.textPrimary,
    marginBottom: 20,
  },
  inputContainer: {
    marginBottom: 18,
  },
  inputLabel: {
    ...Typography.footnote,
    color: Colors.textSecondary,
    marginBottom: 6,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: Colors.bgInput,
    borderRadius: 14,
    padding: 16,
    color: Colors.textPrimary,
    ...Typography.body,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  passwordInputWrap: {
    backgroundColor: Colors.bgInput,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    color: Colors.textPrimary,
    ...Typography.body,
  },
  eyeButton: {
    paddingHorizontal: 14,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    ...Typography.footnote,
    color: Colors.error,
    textAlign: 'center',
    marginBottom: 12,
  },
  forgotButton: {
    alignSelf: 'flex-end',
    marginTop: -4,
    marginBottom: 10,
  },
  forgotText: {
    ...Typography.footnote,
    color: Colors.accentBlueBright,
    fontWeight: '600',
  },
  button: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: Colors.accentBlue,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  buttonText: {
    ...Typography.headline,
    color: '#FFF',
  },
  switchButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  switchText: {
    ...Typography.footnote,
    color: Colors.textSecondary,
  },
  switchHighlight: {
    color: Colors.accentBlueBright,
    fontWeight: '600',
  },
});
