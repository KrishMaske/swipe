import React from 'react';
import { Pressable, StyleProp, ViewStyle, Platform, GestureResponderEvent } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Colors } from '../theme/colors';

interface ScalePressableProps {
  onPress?: () => void;
  onLongPress?: (event: GestureResponderEvent) => void;
  delayLongPress?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  activeScale?: number;
  haptic?: boolean;
  disabled?: boolean;
  destructive?: boolean;
}

export function ScalePressable({
  onPress,
  onLongPress,
  delayLongPress,
  style,
  children,
  activeScale = 0.96,
  haptic = true,
  disabled = false,
  destructive = false,
}: ScalePressableProps) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: withSpring(scale.value, { damping: 18, stiffness: 350, mass: 0.5 }) },
    ],
    opacity: withTiming(disabled ? 0.5 : 1),
  }));

  const handlePressIn = () => {
    if (disabled) return;
    scale.value = activeScale;
    if (haptic) {
      if (Platform.OS === 'ios') {
        Haptics.impactAsync(
          destructive ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light
        );
      }
    }
  };

  const handlePressOut = () => {
    scale.value = 1;
  };

  return (
    <Pressable
      onPress={onPress}
      onLongPress={(e) => {
        if (disabled) return;
        if (haptic) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onLongPress?.(e);
      }}
      delayLongPress={delayLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
    >
      <Animated.View style={[style, animStyle]}>{children}</Animated.View>
    </Pressable>
  );
}
