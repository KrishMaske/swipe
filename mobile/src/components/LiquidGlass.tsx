import React from 'react';
import { StyleSheet, View } from 'react-native';

let LiquidGlassView: any = null;
let isLiquidGlassSupported = false;

try {
  const LiquidGlassModule = require('@callstack/liquid-glass');
  LiquidGlassView = LiquidGlassModule.LiquidGlassView;
  isLiquidGlassSupported = LiquidGlassModule.isLiquidGlassSupported;
} catch (e) {
  console.warn("Liquid Glass native module not found. Falling back to default UI.");
}

export default function LiquidGlass() {
  if (isLiquidGlassSupported) {
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none" collapsable={false}>
        <LiquidGlassView 
          style={StyleSheet.absoluteFill} 
          effect="clear"
          colorScheme="dark"
          interactive={false}
        />
      </View>
    );
  }

  // Fallback if not supported
  return null;
}
