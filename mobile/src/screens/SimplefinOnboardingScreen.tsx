import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';

const SIMPLEFIN_CREATE_URL = 'https://bridge.simplefin.org/simplefin/create';

export default function SimplefinOnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { signOut, refreshSimplefinStatus } = useAuth();
  const [setupToken, setSetupToken] = useState('');
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const [tokenInputY, setTokenInputY] = useState(0);
  const [tokenFocused, setTokenFocused] = useState(false);

  const scrollToTokenInput = () => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(tokenInputY - 16, 0), animated: true });
    }, 120);
  };

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const sub = Keyboard.addListener(showEvent, () => {
      if (tokenFocused) {
        scrollToTokenInput();
      }
    });

    return () => sub.remove();
  }, [tokenFocused, tokenInputY]);

  const openSimplefinBridge = async () => {
    setError('');
    try {
      await WebBrowser.openBrowserAsync(SIMPLEFIN_CREATE_URL, {
        controlsColor: Colors.accentBlueBright,
        toolbarColor: Colors.bgPrimary,
        secondaryToolbarColor: Colors.bgPrimary,
        showTitle: true,
        enableBarCollapsing: true,
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      });
    } catch {
      setError('SimpleFIN Bridge failed to open. Please try again.');
    }
  };

  const handleConnect = async () => {
    const token = setupToken.trim();
    if (!token) {
      setError('Paste your SimpleFIN setup token to continue.');
      return;
    }

    setError('');
    setLinking(true);

    try {
      await api.exchangeSetupToken(token);
      // Kick off first sync so dashboard data can load shortly after onboarding.
      await api.syncAccounts().catch(() => undefined);
      await refreshSimplefinStatus();
      setSetupToken('');
    } catch (err: any) {
      setError(err?.message || 'Failed to link your SimpleFIN connection.');
    } finally {
      setLinking(false);
    }
  };

  const confirmSignOut = () => {
    Alert.alert('Sign Out', 'You can sign in again later to finish linking SimpleFIN.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  return (
    <LinearGradient
      colors={[Colors.gradientStart, Colors.gradientMid, Colors.gradientEnd]}
      style={styles.container}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardWrap}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.scrollView}
          contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 22 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.heroRow}>
            <View style={styles.iconWrap}>
              <Ionicons name="link-outline" size={26} color="#fff" />
            </View>
            <View style={styles.heroTextWrap}>
              <Text style={styles.eyebrow}>Required Setup</Text>
              <Text style={styles.title}>Connect Your Bank with SimpleFIN</Text>
            </View>
          </View>

          <Text style={styles.subtitle}>
            To protect your privacy, Swipe never asks for your bank password. You connect through SimpleFIN,
            then paste a one-time setup token here.
          </Text>

          <View style={styles.panel}>
            <Text style={styles.sectionTitle}>Step 1: Get your setup token</Text>
            <Text style={styles.sectionBody}>
              Open SimpleFIN Bridge and sign in to your bank there. After linking, SimpleFIN shows a long token
              that usually starts with "aHR0c...".
            </Text>
            <TouchableOpacity onPress={openSimplefinBridge} activeOpacity={0.85}>
              <LinearGradient
                colors={[Colors.gradientAccentStart, Colors.gradientAccentEnd]}
                style={styles.linkButton}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Ionicons name="open-outline" size={17} color="#fff" />
                <Text style={styles.linkButtonText}>Open SimpleFIN Bridge</Text>
              </LinearGradient>
            </TouchableOpacity>
            <Text style={styles.urlText}>{SIMPLEFIN_CREATE_URL}</Text>
          </View>

          <View style={styles.panel}>
            <Text style={styles.sectionTitle}>Step 2: Paste token and connect</Text>
            <Text style={styles.sectionBody}>
              Paste the token below and tap Connect. This token works once, so if it fails, generate a new one
              from the SimpleFIN page and try again.
            </Text>

            <TextInput
              value={setupToken}
              onChangeText={setSetupToken}
              onFocus={() => {
                setTokenFocused(true);
                scrollToTokenInput();
              }}
              onBlur={() => setTokenFocused(false)}
              onLayout={(event) => setTokenInputY(event.nativeEvent.layout.y)}
              style={styles.input}
              placeholder="Paste your one-time SimpleFIN setup token"
              placeholderTextColor={Colors.textMuted}
              multiline
              numberOfLines={4}
              editable={!linking}
              textAlignVertical="top"
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              onPress={handleConnect}
              disabled={linking}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={[Colors.gradientAccentStart, Colors.gradientAccentEnd]}
                style={styles.button}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {linking ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.buttonText}>Connect and Continue</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <View style={styles.noteRow}>
            <Ionicons name="information-circle-outline" size={16} color={Colors.textMuted} />
            <Text style={styles.noteText}>
              You can revoke this connection later from your SimpleFIN account at any time.
            </Text>
          </View>

          <TouchableOpacity onPress={confirmSignOut} style={styles.signOutRow} activeOpacity={0.8}>
            <Ionicons name="log-out-outline" size={16} color={Colors.textMuted} />
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardWrap: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    backgroundColor: 'rgba(79,124,255,0.3)',
  },
  heroTextWrap: {
    flex: 1,
    paddingBottom: 6,
  },
  eyebrow: {
    ...Typography.caption1,
    color: Colors.accentBlueBright,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 4,
  },
  title: {
    ...Typography.title3,
    color: Colors.textPrimary,
  },
  subtitle: {
    ...Typography.footnote,
    color: Colors.textSecondary,
    marginTop: 4,
    marginBottom: 16,
    lineHeight: 20,
  },
  panel: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    padding: 14,
    marginBottom: 12,
  },
  sectionTitle: {
    ...Typography.subhead,
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  sectionBody: {
    ...Typography.footnote,
    color: Colors.textSecondary,
    marginTop: 8,
    lineHeight: 20,
  },
  linkButton: {
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  linkButtonText: {
    ...Typography.subhead,
    color: '#FFF',
    fontWeight: '700',
  },
  urlText: {
    ...Typography.caption2,
    color: Colors.textMuted,
    marginTop: 8,
  },
  input: {
    ...Typography.mono,
    marginTop: 14,
    minHeight: 90,
    backgroundColor: Colors.bgInput,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  errorText: {
    ...Typography.footnote,
    color: Colors.error,
    marginTop: 10,
  },
  button: {
    marginTop: 12,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    ...Typography.headline,
    color: '#FFF',
  },
  noteRow: {
    marginTop: 2,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  noteText: {
    ...Typography.caption1,
    color: Colors.textMuted,
    flex: 1,
    lineHeight: 18,
  },
  signOutRow: {
    marginTop: 8,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  signOutText: {
    ...Typography.footnote,
    color: Colors.textMuted,
  },
});
