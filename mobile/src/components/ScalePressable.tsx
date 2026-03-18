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
}: ScalePressableProps) {
  const scale = useSharedValue(1);
  const pressed = useSharedValue(0);

  const tiltX = useSharedValue(0);
  const tiltY = useSharedValue(0);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: withSpring(scale.value, { damping: 18, stiffness: 350, mass: 0.5 }) },
      { perspective: 1000 },
      { rotateX: `${withSpring(tiltX.value)}deg` },
      { rotateY: `${withSpring(tiltY.value)}deg` },
    ],
    shadowOpacity: withTiming(interpolate(pressed.value, [0, 1], [0.15, 0.45]), { duration: 150 }),
    shadowRadius: withSpring(interpolate(pressed.value, [0, 1], [8, 18])),
    shadowColor: Colors.accentBlueBright, // Using a consistent neon accent
    shadowOffset: { width: 0, height: 4 },
    opacity: withTiming(disabled ? 0.5 : 1),
  }));

  const handlePressIn = () => {
    if (disabled) return;
    scale.value = activeScale;
    pressed.value = 1;
    if (haptic) {
      if (Platform.OS === 'ios') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }
  };

  const handlePressOut = () => {
    scale.value = 1;
    pressed.value = 0;
    tiltX.value = 0;
    tiltY.value = 0;
  };

  return (
    <Pressable
      onPress={onPress}
      onLongPress={(e) => {
        if (disabled) return;
        tiltX.value = (e.nativeEvent.locationY - 30) / 10; // Simplified tilt math
        tiltY.value = (e.nativeEvent.locationX - 100) / -20;
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
