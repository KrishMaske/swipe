import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import StarField from '../components/StarField';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';
import { AppStackParamList } from '../types/navigation';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

const SIMPLEFIN_BRIDGE_URL = 'https://bridge.simplefin.org/simplefin/create';

type SettingsModal = 'email' | 'password' | 'delete' | null;

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const {
    user,
    signOut,
    simplefinLinked,
    updateEmail,
    updatePassword,
    deleteAccount,
    refreshUser,
    verifyCurrentPassword,
  } = useAuth();

  const [emailInput, setEmailInput] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [activeModal, setActiveModal] = useState<SettingsModal>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [currentPasswordVisible, setCurrentPasswordVisible] = useState(false);
  const [newPasswordVisible, setNewPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const [deletePasswordVisible, setDeletePasswordVisible] = useState(false);

  useEffect(() => {
    setEmailInput(user?.email || '');
  }, [user?.email]);

  useFocusEffect(
    React.useCallback(() => {
      refreshUser();
    }, [refreshUser])
  );

  const userAny = user as any;
  const pendingEmailFromUser: string | null =
    userAny?.new_email || userAny?.email_change || userAny?.email_change_email || null;
  const effectivePendingEmail = pendingEmailFromUser || pendingEmail;

  useEffect(() => {
    if (effectivePendingEmail && user?.email && effectivePendingEmail.toLowerCase() === user.email.toLowerCase()) {
      setPendingEmail(null);
    }
  }, [effectivePendingEmail, user?.email]);

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  const openModal = (modal: Exclude<SettingsModal, null>) => {
    setModalError(null);

    if (modal === 'email') {
      setEmailInput(pendingEmail || user?.email || '');
    }

    if (modal === 'password') {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setCurrentPasswordVisible(false);
      setNewPasswordVisible(false);
      setConfirmPasswordVisible(false);
    }

    if (modal === 'delete') {
      setDeletePassword('');
      setDeletePasswordVisible(false);
    }

    setActiveModal(modal);
  };

  const closeModal = () => {
    setModalError(null);
    setActiveModal(null);
  };

  const handleUpdateEmail = async () => {
    const nextEmail = emailInput.trim();
    if (!nextEmail || !nextEmail.includes('@')) {
      setModalError('Please enter a valid email address.');
      return;
    }

    setEmailLoading(true);
    setModalError(null);
    const { error } = await updateEmail(nextEmail);
    setEmailLoading(false);

    if (error) {
      setModalError(error);
      return;
    }

    setPendingEmail(nextEmail);
    closeModal();
    Alert.alert(
      'Verification Email Sent',
      'Please check both your old and new email addresses to confirm this email change.'
    );
  };

  const handleUpdatePassword = async () => {
    if (!currentPassword) {
      setModalError('Enter your current password first.');
      return;
    }

    if (newPassword.length < 6) {
      setModalError('Password must be at least 6 characters.');
      return;
    }

    if (currentPassword === newPassword) {
      setModalError('New password must be different from your current password.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setModalError('Passwords do not match.');
      return;
    }

    setPasswordLoading(true);
    setModalError(null);

    const { error: verifyError } = await verifyCurrentPassword(currentPassword);
    if (verifyError) {
      setPasswordLoading(false);
      setModalError('Current password is incorrect.');
      return;
    }

    const { error } = await updatePassword(newPassword);
    setPasswordLoading(false);

    if (error) {
      setModalError(error);
      return;
    }

    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    closeModal();
    Alert.alert('Password Updated', 'Your password was updated successfully.');
  };

  const openSimplefinBridge = async () => {
    try {
      await WebBrowser.openBrowserAsync(SIMPLEFIN_BRIDGE_URL, {
        controlsColor: Colors.accentBlueBright,
        toolbarColor: Colors.bgPrimary,
        secondaryToolbarColor: Colors.bgPrimary,
        showTitle: true,
        enableBarCollapsing: true,
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      });
    } catch {
      Alert.alert('SimpleFIN Bridge', 'Failed to open SimpleFIN Bridge. Please try again.');
    }
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This permanently deletes your Swipe account and all app data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Final Confirmation',
              'Are you absolutely sure you want to permanently delete your account?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete Permanently',
                  style: 'destructive',
                  onPress: handleDeleteAccount,
                },
              ]
            );
          },
        },
      ]
    );
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      setModalError('Enter your password before deleting your account.');
      return;
    }

    setDeleteLoading(true);
    setModalError(null);

    const { error: verifyError } = await verifyCurrentPassword(deletePassword);
    setDeleteLoading(false);

    if (verifyError) {
      setModalError('Current password is incorrect.');
      return;
    }

    closeModal();
    Alert.alert(
      'Delete Account',
      'This permanently deletes your Swipe account and all app data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Permanently',
          style: 'destructive',
          onPress: async () => {
            setDeleteLoading(true);
            const { error } = await deleteAccount();
            setDeleteLoading(false);

            if (error) {
              Alert.alert('Delete Failed', error);
              return;
            }

            setDeletePassword('');
            Alert.alert('Account Deleted', 'Your account and related app data were deleted successfully.');
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <StarField />
      <View style={styles.bgGlowTop} />
      <View style={styles.bgGlowBottom} />

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 8, paddingBottom: 110 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
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
                {effectivePendingEmail || user?.email || 'Unknown'}
              </Text>
              <View style={styles.profileBadge}>
                <View style={styles.profileDot} />
                <Text style={styles.profileBadgeText}>
                  {effectivePendingEmail ? 'Email Change Pending' : 'Authenticated'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>Account Security</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Change Email</Text>
          <Text style={styles.cardDesc}>Update your login email. You may need to confirm via email.</Text>
          <TouchableOpacity
            onPress={() => openModal('email')}
            disabled={emailLoading}
            activeOpacity={0.85}
            style={styles.actionButtonWrap}
          >
            <LinearGradient
              colors={[Colors.gradientAccentStart, Colors.gradientAccentEnd]}
              style={styles.primaryButton}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              {emailLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="mail-outline" size={17} color="#fff" />
                  <Text style={styles.primaryButtonText}>Change Email</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <View style={styles.inlineDivider} />

          <Text style={styles.cardTitle}>Change Password</Text>
          <Text style={styles.cardDesc}>Enter your current password, then choose a different new password.</Text>
          <TouchableOpacity
            onPress={() => openModal('password')}
            disabled={passwordLoading}
            activeOpacity={0.85}
            style={styles.actionButtonWrap}
          >
            <LinearGradient
              colors={[Colors.gradientAccentStart, Colors.gradientAccentEnd]}
              style={styles.primaryButton}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              {passwordLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="key-outline" size={17} color="#fff" />
                  <Text style={styles.primaryButtonText}>Change Password</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>SimpleFIN Connection</Text>
        </View>
        <View style={styles.card}>
          <View style={styles.statusRow}>
            <Text style={styles.cardTitle}>Connection Status</Text>
            <View
              style={[
                styles.statusPill,
                { backgroundColor: simplefinLinked ? 'rgba(46,230,166,0.16)' : 'rgba(248,113,113,0.16)' },
              ]}
            >
              <Text style={[styles.statusPillText, { color: simplefinLinked ? Colors.accentEmerald : Colors.negative }]}> 
                {simplefinLinked ? 'Enabled' : 'Disabled'}
              </Text>
            </View>
          </View>

          <Text style={styles.cardDesc}>How to enable SimpleFIN:</Text>
          <Text style={styles.instructionText}>1. Open SimpleFIN Bridge and create/link your token.</Text>
          <Text style={styles.instructionText}>2. If your status is disabled, sign out and sign back in.</Text>
          <Text style={styles.instructionText}>3. The app will send you to required SimpleFIN onboarding.</Text>

          <Text style={[styles.cardDesc, { marginTop: 10 }]}>How to disable SimpleFIN:</Text>
          <Text style={styles.instructionText}>1. Open SimpleFIN Bridge and revoke/disable your token there.</Text>
          <Text style={styles.instructionText}>2. Next app sign-in will require reconnecting before access.</Text>

          <TouchableOpacity onPress={openSimplefinBridge} activeOpacity={0.85} style={styles.actionButtonWrap}>
            <LinearGradient
              colors={[Colors.gradientAccentStart, Colors.gradientAccentEnd]}
              style={styles.primaryButton}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Ionicons name="open-outline" size={17} color="#fff" />
              <Text style={styles.primaryButtonText}>Open SimpleFIN Bridge</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity onPress={signOut} activeOpacity={0.8} style={styles.secondaryButton}>
            <Ionicons name="refresh-outline" size={16} color={Colors.textPrimary} />
            <Text style={styles.secondaryButtonText}>Sign Out to Reconnect</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>Danger Zone</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardDesc}>
            Permanently delete your account and all Swipe data. Enter your password to continue. This cannot be undone.
          </Text>
          <TouchableOpacity
            style={styles.deleteAccountButton}
            onPress={() => openModal('delete')}
            activeOpacity={0.8}
            disabled={deleteLoading}
          >
            {deleteLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="trash-outline" size={18} color="#fff" />
                <Text style={styles.deleteAccountText}>Delete Account</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={18} color={Colors.negative} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={activeModal !== null}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalKeyboardWrap}
          >
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {activeModal === 'email'
                    ? 'Change Email'
                    : activeModal === 'password'
                      ? 'Change Password'
                      : 'Delete Account'}
                </Text>
                <TouchableOpacity onPress={closeModal} activeOpacity={0.8} style={styles.modalCloseButton}>
                  <Ionicons name="close" size={18} color={Colors.textPrimary} />
                </TouchableOpacity>
              </View>

              <Text style={styles.modalSubtitle}>
                {activeModal === 'email'
                  ? 'Enter your new email address. We will send verification to both addresses.'
                  : activeModal === 'password'
                    ? 'Enter your current password, then choose a different new password.'
                    : 'Enter your password before permanently deleting your account.'}
              </Text>

              {activeModal === 'email' && (
                <TextInput
                  style={styles.input}
                  value={emailInput}
                  onChangeText={setEmailInput}
                  placeholder="Enter new email"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              )}

              {activeModal === 'password' && (
                <>
                  <View style={styles.passwordInputWrap}>
                    <TextInput
                      style={styles.passwordInput}
                      value={currentPassword}
                      onChangeText={setCurrentPassword}
                      placeholder="Current password"
                      placeholderTextColor={Colors.textMuted}
                      secureTextEntry={!currentPasswordVisible}
                    />
                    <TouchableOpacity
                      onPress={() => setCurrentPasswordVisible((prev) => !prev)}
                      style={styles.eyeButton}
                      activeOpacity={0.75}
                    >
                      <Ionicons
                        name={currentPasswordVisible ? 'eye-off-outline' : 'eye-outline'}
                        size={20}
                        color={Colors.textMuted}
                      />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.passwordInputWrap}>
                    <TextInput
                      style={styles.passwordInput}
                      value={newPassword}
                      onChangeText={setNewPassword}
                      placeholder="New password"
                      placeholderTextColor={Colors.textMuted}
                      secureTextEntry={!newPasswordVisible}
                    />
                    <TouchableOpacity
                      onPress={() => setNewPasswordVisible((prev) => !prev)}
                      style={styles.eyeButton}
                      activeOpacity={0.75}
                    >
                      <Ionicons
                        name={newPasswordVisible ? 'eye-off-outline' : 'eye-outline'}
                        size={20}
                        color={Colors.textMuted}
                      />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.passwordInputWrap}>
                    <TextInput
                      style={styles.passwordInput}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      placeholder="Confirm new password"
                      placeholderTextColor={Colors.textMuted}
                      secureTextEntry={!confirmPasswordVisible}
                    />
                    <TouchableOpacity
                      onPress={() => setConfirmPasswordVisible((prev) => !prev)}
                      style={styles.eyeButton}
                      activeOpacity={0.75}
                    >
                      <Ionicons
                        name={confirmPasswordVisible ? 'eye-off-outline' : 'eye-outline'}
                        size={20}
                        color={Colors.textMuted}
                      />
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {activeModal === 'delete' && (
                <View style={styles.passwordInputWrap}>
                  <TextInput
                    style={styles.passwordInput}
                    value={deletePassword}
                    onChangeText={setDeletePassword}
                    placeholder="Confirm password"
                    placeholderTextColor={Colors.textMuted}
                    secureTextEntry={!deletePasswordVisible}
                  />
                  <TouchableOpacity
                    onPress={() => setDeletePasswordVisible((prev) => !prev)}
                    style={styles.eyeButton}
                    activeOpacity={0.75}
                  >
                    <Ionicons
                      name={deletePasswordVisible ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color={Colors.textMuted}
                    />
                  </TouchableOpacity>
                </View>
              )}

              {modalError ? <Text style={styles.modalError}>{modalError}</Text> : null}

              <View style={styles.modalActions}>
                <TouchableOpacity onPress={closeModal} activeOpacity={0.8} style={styles.modalSecondaryButton}>
                  <Text style={styles.modalSecondaryButtonText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={
                    activeModal === 'email'
                      ? handleUpdateEmail
                      : activeModal === 'password'
                        ? handleUpdatePassword
                        : handleDeleteAccount
                  }
                  activeOpacity={0.85}
                  style={styles.modalPrimaryWrap}
                  disabled={emailLoading || passwordLoading || deleteLoading}
                >
                  <LinearGradient
                    colors={activeModal === 'delete' ? ['#F87171', '#EF4444'] : [Colors.gradientAccentStart, Colors.gradientAccentEnd]}
                    style={styles.modalPrimaryButton}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    {emailLoading || passwordLoading || deleteLoading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.modalPrimaryButtonText}>
                        {activeModal === 'email' ? 'Send Verification' : activeModal === 'password' ? 'Update Password' : 'Continue'}
                      </Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
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
    backgroundColor: 'rgba(255,255,255,0.03)',
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
  cardTitle: {
    ...Typography.subhead,
    color: Colors.textPrimary,
    fontWeight: '700',
    marginBottom: 8,
  },
  cardDesc: {
    ...Typography.footnote,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  input: {
    backgroundColor: Colors.bgInput,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 13,
    color: Colors.textPrimary,
    ...Typography.body,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
  },
  passwordInputWrap: {
    backgroundColor: Colors.bgInput,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 50,
    marginBottom: 10,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 13,
    color: Colors.textPrimary,
    ...Typography.body,
  },
  eyeButton: {
    paddingHorizontal: 14,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonWrap: {
    marginTop: 4,
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
  inlineDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 14,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  statusPillText: {
    ...Typography.caption2,
    fontWeight: '700',
  },
  instructionText: {
    ...Typography.footnote,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: 2,
  },
  secondaryButton: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  secondaryButtonText: {
    ...Typography.subhead,
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  deleteAccountButton: {
    marginTop: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(248,113,113,0.95)',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  deleteAccountText: {
    ...Typography.headline,
    color: '#fff',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
    paddingVertical: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.18)',
  },
  signOutText: {
    ...Typography.headline,
    color: Colors.negative,
    fontSize: 15,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalKeyboardWrap: {
    width: '100%',
  },
  modalCard: {
    backgroundColor: '#111111',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    padding: 18,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    ...Typography.title3,
    color: Colors.textPrimary,
  },
  modalCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  modalSubtitle: {
    ...Typography.footnote,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: 14,
  },
  modalError: {
    ...Typography.footnote,
    color: Colors.negative,
    marginBottom: 12,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  modalSecondaryButton: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSecondaryButtonText: {
    ...Typography.headline,
    color: Colors.textPrimary,
    fontSize: 15,
  },
  modalPrimaryWrap: {
    flex: 1,
  },
  modalPrimaryButton: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPrimaryButtonText: {
    ...Typography.headline,
    color: '#fff',
    fontSize: 15,
  },
});
