import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import StarField from '../components/StarField';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, WalletCard } from '../services/api';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';

const ALL_CARDS = require('../../data/cards.json') as WalletCard[];

function ScalePressable({
  onPress,
  onLongPress,
  delayLongPress,
  style,
  children,
}: {
  onPress?: () => void;
  onLongPress?: () => void;
  delayLongPress?: number;
  style?: any;
  children: React.ReactNode;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(scale.value, { damping: 15, stiffness: 400 }) }],
  }));
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      onPressIn={() => { scale.value = 0.965; }}
      onPressOut={() => { scale.value = 1; }}
    >
      <Animated.View style={[style, animStyle]}>{children}</Animated.View>
    </Pressable>
  );
}

function getTopReward(card: WalletCard) {
  const entries = Object.entries(card.reward_multipliers || {});
  if (!entries.length) return { label: 'Rewards', value: 1 };
  const [category, multiplier] = entries.sort((a, b) => b[1] - a[1])[0];
  return {
    label: category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    value: multiplier,
  };
}

export default function SwipeSmartScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();

  // Wallet state
  const [savedCards, setSavedCards] = useState<WalletCard[]>([]);
  const [loadingCards, setLoadingCards] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Add-cards modal
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);

  // Long-press context menu
  const [contextMenuCard, setContextMenuCard] = useState<WalletCard | null>(null);

  const loadSavedCards = useCallback(async (forceRefresh = false) => {
    try {
      const cards = await api.getUserCards(forceRefresh);
      setSavedCards(cards);
    } catch {
      setSavedCards([]);
    } finally {
      setLoadingCards(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoadingCards(true);
      loadSavedCards();
    }, [loadSavedCards]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSavedCards(true);
    setRefreshing(false);
  };

  const openAddModal = () => {
    setPendingIds(savedCards.map((c) => c.id));
    setSearchQuery('');
    setAddModalVisible(true);
  };

  const filteredModalCards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return ALL_CARDS;
    return ALL_CARDS.filter((c) =>
      `${c.card_name} ${c.issuer} ${c.reward_type}`.toLowerCase().includes(q),
    );
  }, [searchQuery]);

  const handleSaveWallet = async () => {
    const selectedCards = ALL_CARDS.filter((c) => pendingIds.includes(c.id));
    setSaving(true);
    try {
      const result = await api.saveUserCards(selectedCards);
      setSavedCards(result.cards || selectedCards);
      setAddModalVisible(false);
    } catch (error) {
      Alert.alert('Save failed', error instanceof Error ? error.message : 'Unable to save wallet.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveCard = async (card: WalletCard) => {
    const updated = savedCards.filter((c) => c.id !== card.id);
    setContextMenuCard(null);
    setSavedCards(updated); // optimistic update
    try {
      await api.saveUserCards(updated);
    } catch {
      setSavedCards(savedCards); // revert on failure
      Alert.alert('Error', 'Failed to remove card. Please try again.');
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#000000', '#000000']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <StarField />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 120 + insets.bottom }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.accentBlueBright}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header — identical structure to DashboardScreen */}
        <View style={[styles.headerRow, { paddingTop: insets.top + 8 }]}>
          <View>
            <Text style={styles.headerEyebrow}>Swipe</Text>
            <Text style={styles.headerTitle}>Smart</Text>
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={openAddModal} activeOpacity={0.8}>
            <Ionicons name="add" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Hero — identical structure to DashboardScreen heroSection */}
        <View style={styles.heroSection}>
          <Text style={styles.heroLabel}>Smart Wallet</Text>
          <Text style={styles.heroBalance}>{loadingCards ? '...' : savedCards.length}</Text>
          <Text style={styles.heroMeta}>
            {savedCards.length === 1 ? '1 card saved' : `${savedCards.length} cards saved`}
          </Text>
        </View>

        {/* My Wallet section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>My Wallet</Text>
        </View>

        {loadingCards ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={Colors.accentBlueBright} />
            <Text style={styles.loadingText}>Loading wallet...</Text>
          </View>
        ) : savedCards.length === 0 ? (
          <View style={styles.emptyWallet}>
            <Ionicons name="card-outline" size={36} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No cards yet</Text>
            <Text style={styles.emptySubtitle}>
              Tap + to add cards to your SwipeSmart wallet.
            </Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.walletCardList}
          >
            {savedCards.map((card, index) => {
              const topReward = getTopReward(card);
              return (
                <Animated.View key={card.id} entering={FadeInDown.delay(index * 60).springify()}>
                  <ScalePressable
                    onLongPress={() => setContextMenuCard(card)}
                    delayLongPress={600}
                    style={styles.walletCard}
                  >
                    <Image
                      source={{ uri: card.card_image_url }}
                      style={styles.walletCardArt}
                      resizeMode="contain"
                    />
                    <Text style={styles.walletCardName} numberOfLines={2}>{card.card_name}</Text>
                    <Text style={styles.walletCardMeta}>{topReward.value}x {topReward.label}</Text>
                    <View style={[styles.rewardPill, card.reward_type === 'Cashback' ? styles.cashbackPill : styles.pointsPill]}>
                      <Text style={styles.rewardPillText}>{card.reward_type}</Text>
                    </View>
                  </ScalePressable>
                </Animated.View>
              );
            })}
          </ScrollView>
        )}
      </ScrollView>

      {/* Long-press context menu */}
      <Modal visible={contextMenuCard !== null} transparent animationType="fade">
        <View style={styles.contextOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setContextMenuCard(null)}
          />
          <BlurView intensity={50} tint="dark" style={styles.contextMenu}>
            {contextMenuCard && (
              <>
                <View style={styles.contextCardHeader}>
                  <Image
                    source={{ uri: contextMenuCard.card_image_url }}
                    style={styles.contextCardArt}
                    resizeMode="contain"
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.contextCardName} numberOfLines={2}>
                      {contextMenuCard.card_name}
                    </Text>
                    <Text style={styles.contextCardIssuer}>{contextMenuCard.issuer}</Text>
                  </View>
                </View>
                <View style={styles.contextDivider} />
                <TouchableOpacity
                  style={styles.contextMenuItem}
                  onPress={() => handleRemoveCard(contextMenuCard)}
                >
                  <Ionicons name="trash-outline" size={20} color={Colors.negative} />
                  <Text style={[styles.contextMenuText, { color: Colors.negative }]}>Remove Card</Text>
                </TouchableOpacity>
              </>
            )}
          </BlurView>
        </View>
      </Modal>

      {/* Add wallet modal */}
      <Modal visible={addModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.centeredOverlay}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setAddModalVisible(false)}
          />
          <BlurView intensity={65} tint="dark" style={styles.addModalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add to Wallet</Text>
              <View style={styles.modalActions}>
                <TouchableOpacity onPress={() => setAddModalVisible(false)} style={{ marginRight: 16 }}>
                  <Ionicons name="close" size={26} color={Colors.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSaveWallet} disabled={saving}>
                  {saving
                    ? <ActivityIndicator color={Colors.accentBlueBright} size="small" />
                    : <Ionicons name="checkmark" size={26} color={Colors.accentBlueBright} />
                  }
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.modalSearchBar}>
              <Ionicons name="search" size={16} color={Colors.textMuted} />
              <TextInput
                style={styles.modalSearchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search cards..."
                placeholderTextColor={Colors.textMuted}
              />
            </View>

            <Text style={styles.selectedCountText}>
              {pendingIds.length} card{pendingIds.length !== 1 ? 's' : ''} selected
            </Text>

            <FlatList
              data={filteredModalCards}
              keyExtractor={(c) => c.id}
              style={styles.modalList}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const isSelected = pendingIds.includes(item.id);
                const topReward = getTopReward(item);
                return (
                  <Pressable
                    onPress={() =>
                      setPendingIds((prev) =>
                        prev.includes(item.id)
                          ? prev.filter((id) => id !== item.id)
                          : [...prev, item.id],
                      )
                    }
                    style={[styles.modalCardRow, isSelected && styles.modalCardRowSelected]}
                  >
                    <Image
                      source={{ uri: item.card_image_url }}
                      style={styles.modalCardArt}
                      resizeMode="contain"
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modalCardIssuer}>{item.issuer}</Text>
                      <Text style={styles.modalCardName} numberOfLines={1}>{item.card_name}</Text>
                      <Text style={styles.modalCardMeta}>{topReward.value}x {topReward.label}</Text>
                    </View>
                    <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                      {isSelected && <Ionicons name="checkmark" size={14} color={Colors.bgPrimary} />}
                    </View>
                  </Pressable>
                );
              }}
            />
          </BlurView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  scroll: { paddingBottom: 120 },

  // Header — matches DashboardScreen exactly
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
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
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },

  // Hero — matches DashboardScreen heroSection
  heroSection: {
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  heroLabel: {
    ...Typography.footnote,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  heroBalance: {
    ...Typography.largeTitle,
    color: Colors.textPrimary,
    marginTop: 10,
    fontSize: 44,
    letterSpacing: -1,
  },
  heroMeta: {
    ...Typography.subhead,
    color: Colors.textMuted,
    marginTop: 6,
  },

  // Section header — matches DashboardScreen sectionHeader
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  sectionTitle: { ...Typography.headline, color: Colors.textPrimary },

  // Loading / empty
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  loadingText: { ...Typography.footnote, color: Colors.textSecondary },
  emptyWallet: {
    marginHorizontal: 20,
    borderRadius: 18,
    paddingVertical: 32,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    alignItems: 'center',
  },
  emptyTitle: { ...Typography.headline, color: Colors.textPrimary, marginTop: 12 },
  emptySubtitle: {
    ...Typography.footnote,
    color: Colors.textMuted,
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Horizontal wallet cards — modelled on DashboardScreen budgetList
  walletCardList: {
    gap: 12,
    paddingHorizontal: 20,
    paddingRight: 28,
  },
  walletCard: {
    width: 160,
    borderRadius: 18,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  walletCardArt: {
    width: '100%',
    height: 80,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginBottom: 10,
  },
  walletCardName: { ...Typography.footnote, color: Colors.textPrimary, fontWeight: '700', marginBottom: 4 },
  walletCardMeta: { ...Typography.caption2, color: Colors.textMuted, marginBottom: 8 },
  rewardPill: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  cashbackPill: { backgroundColor: 'rgba(46,230,166,0.14)' },
  pointsPill: { backgroundColor: 'rgba(79,124,255,0.16)' },
  rewardPillText: { ...Typography.caption2, color: Colors.textPrimary },

  // Context menu (long-press remove) — matches DashboardScreen contextMenu pattern
  contextOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  contextMenu: {
    width: 280,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  contextCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  contextCardArt: {
    width: 64,
    height: 40,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  contextCardName: { ...Typography.subhead, color: Colors.textPrimary, fontWeight: '700' },
  contextCardIssuer: { ...Typography.caption1, color: Colors.textMuted, marginTop: 2 },
  contextDivider: { height: 1, backgroundColor: Colors.glassBorder },
  contextMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  contextMenuText: { ...Typography.subhead, color: Colors.textPrimary },

  // Add-cards modal — matches DashboardScreen staticSquareCard / sheetContent pattern
  centeredOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  addModalCard: {
    width: '92%',
    height: '78%',
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: { ...Typography.title3, color: Colors.textPrimary },
  modalActions: { flexDirection: 'row', alignItems: 'center' },
  modalSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.bgInput,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  modalSearchInput: { flex: 1, ...Typography.subhead, color: Colors.textPrimary },
  selectedCountText: { ...Typography.caption1, color: Colors.textMuted, marginBottom: 10 },
  modalList: { flex: 1 },
  modalCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.glassBorder,
  },
  modalCardRowSelected: { backgroundColor: 'rgba(46,230,166,0.06)' },
  modalCardArt: {
    width: 72,
    height: 44,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  modalCardIssuer: {
    ...Typography.caption1,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  modalCardName: { ...Typography.subhead, color: Colors.textPrimary, fontWeight: '600', marginTop: 2 },
  modalCardMeta: { ...Typography.caption2, color: Colors.textMuted, marginTop: 2 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: { backgroundColor: Colors.accentEmerald, borderColor: Colors.accentEmerald },
});
