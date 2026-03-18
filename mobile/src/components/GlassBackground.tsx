import React from "react";
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { BlurView, BlurTint } from "expo-blur";
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from "expo-glass-effect";

export interface GlassBackgroundProps {
  style?: StyleProp<ViewStyle>;
  /**
   * Glass style to use when Liquid Glass is available on iOS 26+.
   * Falls back to BlurView / solid color elsewhere.
   */
  glassStyle?: "regular" | "clear";
  /**
   * Background color for Android and other non-glass fallbacks.
   */
  fallbackColor?: string;
  /**
   * Blur intensity / tint for iOS fallback when Liquid Glass is not available.
   */
  blurIntensity?: number;
  blurTint?: BlurTint;
  /**
   * Optional tint color to apply over the glass.
   */
  tintColor?: string;
  /**
   * Opacity of the tint color (0-1).
   */
  tintOpacity?: number;
  /**
   * Whether to use Liquid Glass on supported iOS versions.
   * Set to false to force BlurView fallback for problematic transitions.
   */
  preferLiquidGlass?: boolean;
  /**
   * Content to render inside the glass background.
   */
  children?: React.ReactNode;
}

export function GlassBackground({
  style,
  glassStyle = "regular",
  fallbackColor = "rgba(10,10,12,0.35)",
  blurIntensity = 80,
  blurTint = "systemChromeMaterialDark",
  tintColor,
  tintOpacity = 0.5,
  preferLiquidGlass = true,
  children,
}: Readonly<GlassBackgroundProps>) {
  if (Platform.OS === "ios") {
    // Prefer true Liquid Glass on iOS 26+ when the API is available.
    if (
      preferLiquidGlass &&
      isGlassEffectAPIAvailable() &&
      isLiquidGlassAvailable()
    ) {
      return (
        <View style={style}>
          <GlassView
            style={StyleSheet.absoluteFill}
            colorScheme="dark"
            glassEffectStyle={glassStyle}
            tintColor={tintColor}
          />
          {children}
        </View>
      );
    }

    // Fallback to traditional frosted blur on older iOS or when Liquid Glass
    // is disabled by system / accessibility settings.
    return (
      <View style={style}>
        <BlurView
          intensity={blurIntensity}
          tint={blurTint as any}
          style={StyleSheet.absoluteFill}
        />
        {tintColor && (
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: tintColor, opacity: tintOpacity },
            ]}
          />
        )}
        {children}
      </View>
    );
  }

  // Android / other platforms: solid, slightly translucent surface that matches
  // our existing design language.
  return (
    <View style={[{ backgroundColor: fallbackColor }, style]}>
      {tintColor && (
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: tintColor, opacity: tintOpacity },
          ]}
        />
      )}
      {children}
    </View>
  );
}
