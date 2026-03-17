import React from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import StarField from '../components/StarField';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';

function formatFee(amount: number) {
  if (!amount) {
    return '$0';
  }
  return `$${amount.toLocaleString('en-US')}`;
}

export default function CardDetailsScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { card } = route.params;

  if (!card) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>No card details found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.gradientStart, Colors.gradientMid, Colors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <StarField />

      <BlurView intensity={38} tint="dark" style={[styles.header, { marginTop: insets.top + 8 }]}>
        <View style={styles.headerTopRow}>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>Card Details</Text>
            <Text style={styles.headerProvider}>{card.card_name || 'Unknown Card'}</Text>
          </View>
        </View>
      </BlurView>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        <BlurView intensity={28} tint="dark" style={styles.detailsCard}>
          <Image
            source={{ uri: card.card_image_url }}
            style={styles.detailsCardArt}
            resizeMode="contain"
          />

          <Text style={styles.detailsCardName}>{card.card_name}</Text>
          <Text style={styles.detailsCardIssuer}>{card.issuer}</Text>

          <View style={styles.detailsMetaGrid}>
            <View style={styles.detailsMetaItem}>
              <Text style={styles.detailsMetaLabel}>Type</Text>
              <Text style={styles.detailsMetaValue}>{card.reward_type}</Text>
            </View>
            <View style={styles.detailsMetaItem}>
              <Text style={styles.detailsMetaLabel}>Annual Fee</Text>
              <Text style={styles.detailsMetaValue}>{formatFee(card.annual_fee)}</Text>
            </View>
          </View>

          <Text style={styles.detailsSectionTitle}>Reward Multipliers</Text>
          {(Object.entries(card.reward_multipliers || {}) as Array<[string, number]>)
            .sort((a, b) => b[1] - a[1])
            .map(([category, multiplier]) => (
              <View key={category} style={styles.multiplierRow}>
                <Text style={styles.multiplierCategory}>
                  {category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                </Text>
                <Text style={styles.multiplierValue}>{multiplier}x</Text>
              </View>
            ))}
        </BlurView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  errorText: {
    ...Typography.headline,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 120,
  },
  header: {
    marginHorizontal: 16,
    marginBottom: 6,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(10,10,12,0.38)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.42,
    shadowRadius: 20,
    elevation: 8,
    zIndex: 10,
    overflow: 'hidden',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    ...Typography.title3,
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  headerProvider: {
    ...Typography.caption1,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  scrollContent: {
    padding: 16,
  },
  detailsCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.navGlassBorder,
    backgroundColor: Colors.navGlassBackground,
    padding: 16,
    overflow: 'hidden',
  },
  detailsCardArt: {
    width: '100%',
    height: 120,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginBottom: 12,
  },
  detailsCardName: {
    ...Typography.title3,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  detailsCardIssuer: {
    ...Typography.footnote,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  detailsMetaGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  detailsMetaItem: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.navGlassBorder,
    backgroundColor: Colors.navGlassBackground,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  detailsMetaLabel: {
    ...Typography.caption2,
    color: Colors.textMuted,
    marginBottom: 2,
  },
  detailsMetaValue: {
    ...Typography.subhead,
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  detailsSectionTitle: {
    ...Typography.footnote,
    color: Colors.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  multiplierRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 10,
  },
  multiplierCategory: {
    ...Typography.subhead,
    color: Colors.textSecondary,
    flex: 1,
    paddingRight: 10,
  },
  multiplierValue: {
    ...Typography.subhead,
    color: Colors.accentBlueBright,
    fontWeight: '700',
  },
});