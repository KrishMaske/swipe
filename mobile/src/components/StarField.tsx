import React, { useMemo } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';

const { width: W, height: H } = Dimensions.get('window');
const STAR_COUNT = 500;

interface Star {
  id: number;
  x: number;
  y: number;
  size: number;
  opacity: number;
}

const SHARED_STARS: Star[] = Array.from({ length: STAR_COUNT }, (_, i) => ({
  id: i,
  x: Math.random() * W,
  y: Math.random() * H,
  size: Math.random() * 1.6 + 0.3,
  opacity: Math.random() * 0.5 + 0.08,
}));

export default function StarField() {

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {SHARED_STARS.map((star) => (
        <View
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
          }}
        />
      ))}
    </View>
  );
}
