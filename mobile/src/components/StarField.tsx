import React, { useEffect, useMemo } from 'react';
import { Animated, Dimensions, StyleSheet, View } from 'react-native';

const { width: W, height: H } = Dimensions.get('window');
const STAR_COUNT = 90;

interface StarData {
  id: number;
  x: number;
  y: number;
  size: number;
  opacity: Animated.Value;
  translateY: Animated.Value;
  twinkleDuration: number;
  driftDuration: number;
  driftRange: number;
}

export default function StarField() {
  const stars = useMemo<StarData[]>(() => {
    return Array.from({ length: STAR_COUNT }, (_, i) => {
      const size = Math.random() * 1.6 + 0.4;
      return {
        id: i,
        x: Math.random() * W,
        y: Math.random() * H,
        size,
        opacity: new Animated.Value(Math.random() * 0.4 + 0.1),
        translateY: new Animated.Value(0),
        twinkleDuration: Math.random() * 2500 + 1500,
        driftDuration: Math.random() * 25000 + 20000,
        driftRange: -(Math.random() * H * 0.04 + H * 0.01),
      };
    });
  }, []);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    stars.forEach((star) => {
      const delay = Math.floor(Math.random() * 4000);

      const twinkleLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(star.opacity, {
            toValue: Math.random() * 0.5 + 0.5,
            duration: star.twinkleDuration,
            useNativeDriver: true,
          }),
          Animated.timing(star.opacity, {
            toValue: Math.random() * 0.1 + 0.05,
            duration: star.twinkleDuration,
            useNativeDriver: true,
          }),
        ])
      );

      const driftLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(star.translateY, {
            toValue: star.driftRange,
            duration: star.driftDuration,
            useNativeDriver: true,
          }),
          Animated.timing(star.translateY, {
            toValue: 0,
            duration: star.driftDuration,
            useNativeDriver: true,
          }),
        ])
      );

      const t = setTimeout(() => {
        twinkleLoop.start();
        driftLoop.start();
      }, delay);

      timers.push(t);
    });

    return () => {
      timers.forEach(clearTimeout);
      stars.forEach((star) => {
        star.opacity.stopAnimation();
        star.translateY.stopAnimation();
      });
    };
  }, [stars]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {stars.map((star) => (
        <Animated.View
          key={star.id}
          style={{
            position: 'absolute',
            left: star.x,
            top: star.y,
            width: star.size,
            height: star.size,
            borderRadius: star.size / 2,
            backgroundColor: '#ffffff',
            opacity: star.opacity,
            transform: [{ translateY: star.translateY }],
          }}
        />
      ))}
    </View>
  );
}
