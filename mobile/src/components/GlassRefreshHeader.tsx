import React, { useEffect } from 'react';
import { StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import Animated, {
  useAnimatedStyle,
  interpolate,
  Extrapolate,
  SharedValue,
  withSpring,
  useDerivedValue,
  useAnimatedProps,
  runOnJS,
} from 'react-native-reanimated';
import { GlassBackground } from './GlassBackground';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';

interface GlassRefreshHeaderProps {
  scrollY: SharedValue<number>;
  refreshing: boolean;
  threshold?: number;
}

export function GlassRefreshHeader({
  scrollY,
  refreshing,
  threshold = 80,
}: GlassRefreshHeaderProps) {
  const pullDistance = useDerivedValue(() => {
    return Math.max(0, -scrollY.value);
  });

  const animatedStyle = useAnimatedStyle(() => {
    const height = interpolate(
      pullDistance.value,
      [0, threshold],
      [0, threshold],
      Extrapolate.CLAMP
    );

    const opacity = interpolate(
      pullDistance.value,
      [20, threshold],
      [0, 1],
      Extrapolate.CLAMP
    );

    return {
      height,
      opacity,
      transform: [
        {
          translateY: interpolate(
            pullDistance.value,
            [0, threshold],
            [-20, 0],
            Extrapolate.CLAMP
          ),
        },
      ],
    };
  });

  const iconStyle = useAnimatedStyle(() => {
    const rotate = interpolate(
      pullDistance.value,
      [0, threshold],
      [0, 180],
      Extrapolate.CLAMP
    );

    const scale = interpolate(
      pullDistance.value,
      [0, threshold],
      [0.6, 1],
      Extrapolate.CLAMP
    );

    return {
      transform: [{ rotate: `${rotate}deg` }, { scale }],
    };
  });

  const iconProps = useAnimatedProps(() => {
    return {
      name: (pullDistance.value > threshold - 5 ? 'refresh' : 'arrow-down') as any,
    };
  });

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <GlassBackground
        blurIntensity={40}
        blurTint="systemChromeMaterialDark"
        style={StyleSheet.absoluteFill}
        tintColor="rgba(0, 0, 0, 0.4)"
        tintOpacity={0.6}
      />
      <View style={styles.content}>
        {refreshing ? (
          <ActivityIndicator color={Colors.accentBlueBright} size="small" />
        ) : (
          <Animated.View style={iconStyle}>
            <AnimatedIonicons
              animatedProps={iconProps}
              name="arrow-down"
              size={24}
              color={Colors.accentBlueBright}
            />
          </Animated.View>
        )}
        <AnimatedText
          scrollY={scrollY}
          refreshing={refreshing}
          threshold={threshold}
        />
      </View>
    </Animated.View>
  );
}

const AnimatedIonicons = Animated.createAnimatedComponent(Ionicons);

function AnimatedText({ 
  scrollY, 
  refreshing, 
  threshold 
}: { 
  scrollY: SharedValue<number>;
  refreshing: boolean;
  threshold: number;
}) {
  const pullDistance = useDerivedValue(() => Math.max(0, -scrollY.value));
  
  // We use a small hack here: Reanimated's Animated.Text doesn't support 
  // dynamic children well without useAnimatedProps for 'text' (only on some platforms).
  // Better approach: use a state for the text but update it via runOnJS if needed,
  // OR just use a simple sub-component that re-renders when refreshing changes,
  // and for the "Pull" text, we'll just show it if not refreshing.
  
  if (refreshing) return <Text style={styles.text}>Updating...</Text>;

  // To avoid render warnings, we can't use pullDistance.value here directly.
  // Actually, for simple text that doesn't need to be per-frame animated based on scroll,
  // we can just use a static message or a delayed state.
  // But the user wants "Release to Sync" vs "Pull to Refresh".
  
  // Let's use a simple state that updates when threshold is crossed.
  const [canRelease, setCanRelease] = React.useState(false);

  useDerivedValue(() => {
    const over = pullDistance.value > threshold - 5;
    if (over !== canRelease) {
      runOnJS(setCanRelease)(over);
    }
  });

  return (
    <Text style={styles.text}>
      {canRelease ? 'Release to Sync' : 'Pull to Refresh'}
    </Text>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 16,
    zIndex: 100,
    overflow: 'hidden',
    borderRadius: 20,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingTop: 10,
  },
  text: {
    ...Typography.caption1,
    color: Colors.textPrimary,
    fontWeight: '700',
  },
});
