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
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import StarField from '../components/StarField';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  useAnimatedScrollHandler,
  runOnJS,
} from 'react-native-reanimated';
import { GlassBackground } from '../components/GlassBackground';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { Skeleton } from '../components/Skeleton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, WalletCard } from '../services/api';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';
import { ScalePressable } from '../components/ScalePressable';
import { GlassRefreshHeader } from '../components/GlassRefreshHeader';

const ALL_CARDS = require('../../data/cards.json') as WalletCard[];

function getTopReward(card: WalletCard) {
  const entries = Object.entries(card.reward_multipliers || {});
  if (!entries.length) return { label: 'Rewards', value: 1 };
  const [category, multiplier] = entries.sort((a, b) => b[1] - a[1])[0];
  return {
    label: category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    value: multiplier,
  };
}

export default function SwipeSmartScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Wallet state
  const [savedCards, setSavedCards] = useState<WalletCard[]>([]);
  const [loadingCards, setLoadingCards] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Add-cards modal
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<string>('All');
  const [saving, setSaving] = useState(false);

  // Long-press context menu
  const [contextMenuCard, setContextMenuCard] = useState<WalletCard | null>(null);

  const scrollY = useSharedValue(0);
  const REFRESH_THRESHOLD = 80;

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
    onEndDrag: (event) => {
      if (event.contentOffset.y < -REFRESH_THRESHOLD && !refreshing) {
        runOnJS(onRefresh)();
      }
    },
  });

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
    setSelectedProvider('All');
    setAddModalVisible(true);
  };

  const providerOptions = useMemo(() => {
    const issuers = Array.from(new Set(ALL_CARDS.map((c) => c.issuer))).sort((a, b) => a.localeCompare(b));
    return ['All', ...issuers];
  }, []);

  const filteredModalCards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return ALL_CARDS.filter((c) => {
      const matchesProvider = selectedProvider === 'All' || c.issuer === selectedProvider;
      const matchesSearch =
        !q || `${c.card_name} ${c.issuer} ${c.reward_type}`.toLowerCase().includes(q);
      return matchesProvider && matchesSearch;
    });
  }, [searchQuery, selectedProvider]);

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
      <StarField />

      <GlassRefreshHeader scrollY={scrollY} refreshing={refreshing} threshold={REFRESH_THRESHOLD} />

      <Animated.ScrollView
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={[styles.scroll, { paddingBottom: 120 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header — identical structure to DashboardScreen */}
        <View style={[styles.headerRow, { paddingTop: insets.top + 8 }]}>
          <View>
            <Text style={styles.headerEyebrow}>Swipe</Text>
            <Text style={styles.headerTitle}>Smart</Text>
          </View>
          <ScalePressable style={styles.addBtn} onPress={openAddModal}>
            <Ionicons name="add" size={24} color={Colors.textPrimary} />
          </ScalePressable>
        </View>

        {/* Hero — identical structure to DashboardScreen heroSection */}
        <View style={styles.heroSection}>
          <Text style={styles.heroLabel}>Smart Wallet</Text>
          <View style={{ height: 48, justifyContent: 'center' }}>
            {loadingCards ? (
              <Skeleton width={120} height={40} borderRadius={10} />
            ) : (
              <Text style={styles.heroBalance}>{savedCards.length}</Text>
            )}
          </View>
          <Text style={styles.heroMeta}>
            {loadingCards ? (
              <Skeleton width={100} height={16} borderRadius={4} />
            ) : savedCards.length === 1 ? (
              '1 card saved'
            ) : (
              `${savedCards.length} cards saved`
            )}
          </Text>
        </View>

        {/* My Wallet section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>My Wallet</Text>
        </View>

        {loadingCards ? (
          <View style={{ paddingHorizontal: 20, gap: 16, marginTop: 10 }}>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} width={340} height={100} borderRadius={18} />
            ))}
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
                    onPress={() => router.push({
                      pathname: '/swipesmart/card-details',
                      params: { card: JSON.stringify(card) }
                    })}
                    onLongPress={() => setContextMenuCard(card)}
                    delayLongPress={1200}
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
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => setContextMenuCard(null)}
          />
          <GlassBackground
            blurIntensity={50}
            blurTint="systemChromeMaterialDark"
            style={styles.contextMenu}
            tintColor="rgba(0, 0, 0, 0.4)"
            tintOpacity={0.6}
          >
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
                <ScalePressable
                  style={styles.contextMenuItem}
                  onPress={() => handleRemoveCard(contextMenuCard)}
                >
                  <Ionicons name="trash-outline" size={20} color={Colors.negative} />
                  <Text style={[styles.contextMenuText, { color: Colors.negative }]}>Remove Card</Text>
                </ScalePressable>
              </>
            )}
          </GlassBackground>
        </View>
      </Modal>

      {/* Add wallet modal */}
      <Modal visible={addModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.centeredOverlay}
        >
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => setAddModalVisible(false)}
          />
          <GlassBackground
            blurIntensity={65}
            blurTint="systemChromeMaterialDark"
            style={styles.addModalCard}
            tintColor="rgba(0, 0, 0, 0.4)"
            tintOpacity={0.7}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add to Wallet</Text>
              <View style={styles.modalActions}>
                <ScalePressable onPress={() => setAddModalVisible(false)} style={{ marginRight: 16 }}>
                  <Ionicons name="close" size={26} color={Colors.textMuted} />
                </ScalePressable>
                <ScalePressable onPress={handleSaveWallet} disabled={saving}>
                  {saving
                    ? (
                      <View style={{ width: 26, height: 26, borderRadius: 13, overflow: 'hidden' }}>
                        <Skeleton width={26} height={26} borderRadius={13} />
                      </View>
                    )
                    : <Ionicons name="checkmark" size={26} color={Colors.accentBlueBright} />
                  }
                </ScalePressable>
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

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filterScroll}
              contentContainerStyle={styles.filterRow}
            >
              {providerOptions.map((provider) => {
                const active = provider === selectedProvider;
                return (
                  <ScalePressable
                    key={provider}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                    onPress={() => setSelectedProvider(provider)}
                  >
                    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                      {provider}
                    </Text>
                  </ScalePressable>
                );
              })}
            </ScrollView>

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
          </GlassBackground>
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
    borderColor: Colors.navGlassBorder,
    backgroundColor: Colors.navGlassBackground,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
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
    borderColor: Colors.navGlassBorder,
    backgroundColor: Colors.navGlassBackground,
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
    backgroundColor: Colors.navGlassBackground,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.navGlassBorder,
  },
  modalSearchInput: { flex: 1, ...Typography.subhead, color: Colors.textPrimary },
  filterScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  filterRow: {
    gap: 8,
    paddingTop: 8,
    paddingBottom: 2,
    alignItems: 'center',
  },
  filterChip: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  filterChipActive: {
    backgroundColor: 'rgba(248,113,113,0.22)',
    borderColor: 'rgba(248,113,113,0.62)',
  },
  filterChipText: {
    ...Typography.caption1,
    color: Colors.textSecondary,
    fontWeight: '700',
  },
  filterChipTextActive: {
    color: Colors.textPrimary,
  },
  selectedCountText: { ...Typography.caption1, color: Colors.textMuted, marginBottom: 2 },
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
