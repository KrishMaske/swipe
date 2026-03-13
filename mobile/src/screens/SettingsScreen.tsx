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
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';

export default function SettingsScreen() {
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
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: signOut,
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      {/* Profile Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <LinearGradient
            colors={[Colors.gradientAccentStart, Colors.gradientAccentEnd]}
            style={styles.profileIcon}
          >
            <Ionicons name="person" size={24} color="#FFF" />
          </LinearGradient>
          <View style={styles.profileInfo}>
            <Text style={styles.profileEmail}>{user?.email || 'Unknown'}</Text>
            <Text style={styles.profileLabel}>Authenticated User</Text>
          </View>
        </View>
      </View>

      {/* Bank Linking Section */}
      <View style={styles.sectionHeader}>
        <Ionicons name="link" size={16} color={Colors.textSecondary} />
        <Text style={styles.sectionTitle}>Link Bank Account</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardDescription}>
          Paste your SimpleFIN setup token to connect your bank accounts. You can get this from{' '}
          <Text style={styles.link}>bridge.simplefin.org</Text>
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

        <TouchableOpacity
          onPress={handleExchangeToken}
          disabled={linking}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={[Colors.gradientAccentStart, Colors.gradientAccentEnd]}
            style={styles.linkButton}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            {linking ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Ionicons name="swap-horizontal" size={18} color="#FFF" />
                <Text style={styles.linkButtonText}>Exchange Token</Text>
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
                  ? 'rgba(52, 211, 153, 0.15)'
                  : 'rgba(248, 113, 113, 0.15)',
              },
            ]}
          >
            <Ionicons
              name={linkResult.success ? 'checkmark-circle' : 'alert-circle'}
              size={16}
              color={linkResult.success ? Colors.success : Colors.error}
            />
            <Text
              style={[
                styles.resultText,
                { color: linkResult.success ? Colors.success : Colors.error },
              ]}
            >
              {linkResult.message}
            </Text>
          </View>
        )}
      </View>

      {/* About Section */}
      <View style={styles.sectionHeader}>
        <Ionicons name="information-circle" size={16} color={Colors.textSecondary} />
        <Text style={styles.sectionTitle}>About</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.aboutRow}>
          <Text style={styles.aboutLabel}>App</Text>
          <Text style={styles.aboutValue}>SwipeSmart</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.aboutRow}>
          <Text style={styles.aboutLabel}>Version</Text>
          <Text style={styles.aboutValue}>1.0.0</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.aboutRow}>
          <Text style={styles.aboutLabel}>Backend</Text>
          <Text style={styles.aboutValue}>FastAPI + Supabase</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.aboutRow}>
          <Text style={styles.aboutLabel}>AI Engine</Text>
          <Text style={styles.aboutValue}>RAG + Groq</Text>
        </View>
      </View>

      {/* Sign Out */}
      <TouchableOpacity
        style={styles.signOutButton}
        onPress={handleSignOut}
        activeOpacity={0.7}
      >
        <Ionicons name="log-out-outline" size={20} color={Colors.error} />
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  content: {
    paddingBottom: 40,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  headerTitle: {
    ...Typography.largeTitle,
    color: Colors.textPrimary,
  },
  card: {
    backgroundColor: Colors.bgCard,
    marginHorizontal: 20,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    marginBottom: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  profileIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInfo: {
    flex: 1,
  },
  profileEmail: {
    ...Typography.headline,
    color: Colors.textPrimary,
  },
  profileLabel: {
    ...Typography.caption1,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 10,
  },
  sectionTitle: {
    ...Typography.footnote,
    color: Colors.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardDescription: {
    ...Typography.footnote,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
  },
  link: {
    color: Colors.accentBlueBright,
    fontWeight: '600',
  },
  tokenInput: {
    backgroundColor: Colors.bgInput,
    borderRadius: 14,
    padding: 16,
    color: Colors.textPrimary,
    ...Typography.mono,
    minHeight: 72,
    borderWidth: 1,
    borderColor: Colors.border,
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 14,
    gap: 8,
  },
  linkButtonText: {
    ...Typography.headline,
    color: '#FFF',
    fontSize: 15,
  },
  resultBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
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
    paddingVertical: 4,
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
    marginHorizontal: 20,
    marginTop: 24,
    paddingVertical: 16,
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.2)',
  },
  signOutText: {
    ...Typography.headline,
    color: Colors.error,
    fontSize: 15,
  },
});
