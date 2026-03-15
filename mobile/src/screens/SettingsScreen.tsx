import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { user, signOut } = useAuth();
  const [setupToken, setSetupToken] = useState('');
  const [linking, setLinking] = useState(false);
  const [linkResult, setLinkResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleExchangeToken = async () => {
    if (!setupToken.trim()) {
      Alert.alert('Missing Token', 'Please paste your SimpleFIN setup token');
      return;
    }
    setLinking(true);
    setLinkResult(null);
    try {
      const result = await api.exchangeSetupToken(setupToken.trim());
      setLinkResult({ success: true, message: result.message || 'Bank linked successfully!' });
      setSetupToken('');
    } catch (err: any) {
      setLinkResult({ success: false, message: err.message || 'Failed to link bank' });
    } finally {
      setLinking(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  const aboutRows = [
    { label: 'App', value: 'Swipe' },
    { label: 'Version', value: '1.0.0' },
    { label: 'Backend', value: 'FastAPI + Supabase' },
    { label: 'AI Engine', value: 'RAG + Groq' },
  ];

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#000000', '#000000', '#000000']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.bgGlowTop} />
      <View style={styles.bgGlowBottom} />

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 8, paddingBottom: 110 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.headerEyebrow}>Swipe</Text>
            <Text style={styles.headerTitle}>Settings</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
             <Ionicons name="close" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <View style={styles.profileRow}>
            <LinearGradient
              colors={[Colors.gradientAccentStart, Colors.gradientAccentEnd]}
              style={styles.profileAvatar}
            >
              <Ionicons name="person" size={22} color="#fff" />
            </LinearGradient>
            <View style={styles.profileInfo}>
              <Text style={styles.profileEmail} numberOfLines={1}>
                {user?.email || 'Unknown'}
              </Text>
              <View style={styles.profileBadge}>
                <View style={styles.profileDot} />
                <Text style={styles.profileBadgeText}>Authenticated</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>Smart Suggestions</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardDesc}>
            Choose the cards in your wallet so SwipeSmart can recommend the best one when you
            arrive at restaurants, stores, and travel spots.
          </Text>
          <TouchableOpacity
            onPress={() => (navigation as any).navigate('SwipeSmart')}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={[Colors.gradientAccentStart, Colors.gradientAccentEnd]}
              style={styles.primaryButton}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Ionicons name="card-outline" size={17} color="#fff" />
              <Text style={styles.primaryButtonText}>Open SwipeSmart</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>Link Bank Account</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardDesc}>
            Paste your SimpleFIN setup token to connect your bank accounts. Get yours at{' '}
            <Text style={styles.linkText}>bridge.simplefin.org</Text>
          </Text>
          <TextInput
            style={styles.tokenInput}
            value={setupToken}
            onChangeText={setSetupToken}
            placeholder="Paste base64 setup token..."
            placeholderTextColor={Colors.textMuted}
            multiline
            numberOfLines={3}
          />
          <TouchableOpacity onPress={handleExchangeToken} disabled={linking} activeOpacity={0.85}>
            <LinearGradient
              colors={[Colors.gradientAccentStart, Colors.gradientAccentEnd]}
              style={styles.primaryButton}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              {linking ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="swap-horizontal" size={17} color="#fff" />
                  <Text style={styles.primaryButtonText}>Exchange Token</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {linkResult && (
            <View
              style={[
                styles.resultBadge,
                {
                  backgroundColor: linkResult.success
                    ? 'rgba(46,230,166,0.12)'
                    : 'rgba(248,113,113,0.12)',
                },
              ]}
            >
              <Ionicons
                name={linkResult.success ? 'checkmark-circle' : 'alert-circle'}
                size={15}
                color={linkResult.success ? Colors.accentEmerald : Colors.negative}
              />
              <Text
                style={[
                  styles.resultText,
                  { color: linkResult.success ? Colors.accentEmerald : Colors.negative },
                ]}
              >
                {linkResult.message}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>About</Text>
        </View>
        <View style={styles.card}>
          {aboutRows.map((row, i) => (
            <View key={row.label}>
              <View style={styles.aboutRow}>
                <Text style={styles.aboutLabel}>{row.label}</Text>
                <Text style={styles.aboutValue}>{row.value}</Text>
              </View>
              {i < aboutRows.length - 1 && <View style={styles.divider} />}
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={styles.signOutButton}
          onPress={handleSignOut}
          activeOpacity={0.8}
        >
          <Ionicons name="log-out-outline" size={18} color={Colors.negative} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  bgGlowTop: {
    display: 'none',
  },
  bgGlowBottom: {
    display: 'none',
  },
  scroll: {
    paddingHorizontal: 20,
  },
  header: {
    paddingBottom: 18,
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerEyebrow: {
    ...Typography.caption1,
    color: Colors.accentBlueBright,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  headerTitle: {
    ...Typography.largeTitle,
    color: Colors.textPrimary,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    marginBottom: 8,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  profileAvatar: {
    width: 50,
    height: 50,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInfo: {
    flex: 1,
  },
  profileEmail: {
    ...Typography.subhead,
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  profileBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 5,
  },
  profileDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.accentEmerald,
  },
  profileBadgeText: {
    ...Typography.caption2,
    color: Colors.accentEmerald,
    fontWeight: '600',
  },
  sectionHeader: {
    paddingTop: 22,
    paddingBottom: 8,
    paddingLeft: 4,
  },
  sectionLabel: {
    ...Typography.footnote,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '600',
  },
  cardDesc: {
    ...Typography.footnote,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: 14,
  },
  linkText: {
    color: Colors.accentBlueBright,
    fontWeight: '600',
  },
  tokenInput: {
    backgroundColor: Colors.bgInput,
    borderRadius: 14,
    padding: 14,
    color: Colors.textPrimary,
    ...Typography.mono,
    minHeight: 72,
    borderWidth: 1,
    borderColor: Colors.border,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 14,
    gap: 8,
  },
  primaryButtonText: {
    ...Typography.headline,
    color: '#fff',
    fontSize: 15,
  },
  resultBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  resultText: {
    ...Typography.footnote,
    fontWeight: '500',
    flex: 1,
  },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  aboutLabel: {
    ...Typography.subhead,
    color: Colors.textSecondary,
  },
  aboutValue: {
    ...Typography.subhead,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 12,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
    paddingVertical: 16,
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.18)',
  },
  signOutText: {
    ...Typography.headline,
    color: Colors.negative,
    fontSize: 15,
  },
});
