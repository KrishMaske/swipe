import { Platform } from 'react-native';

const fontFamily = Platform.select({
  ios: 'System',
  default: 'System',
});

export const Typography = {
  largeTitle: {
    fontFamily,
    fontSize: 34,
    fontWeight: '800' as const, // Extra bold
    letterSpacing: -0.5,
  },
  title1: {
    fontFamily,
    fontSize: 28,
    fontWeight: '800' as const,
    letterSpacing: -0.4,
  },
  title2: {
    fontFamily,
    fontSize: 22,
    fontWeight: '700' as const,
    letterSpacing: -0.3,
  },
  title3: {
    fontFamily,
    fontSize: 20,
    fontWeight: '700' as const, // Bumped from 600
    letterSpacing: -0.3,
  },
  headline: {
    fontFamily,
    fontSize: 17,
    fontWeight: '700' as const, // Bumped from 600
    letterSpacing: -0.4,
  },
  body: {
    fontFamily,
    fontSize: 17,
    fontWeight: '400' as const,
    letterSpacing: -0.4,
  },
  callout: {
    fontFamily,
    fontSize: 16,
    fontWeight: '400' as const,
    letterSpacing: -0.3,
  },
  subhead: {
    fontFamily,
    fontSize: 15,
    fontWeight: '500' as const, // A bit punchier than 400
    letterSpacing: -0.2,
  },
  footnote: {
    fontFamily,
    fontSize: 13,
    fontWeight: '500' as const,
    letterSpacing: -0.1,
  },
  caption1: {
    fontFamily,
    fontSize: 12,
    fontWeight: '500' as const,
    letterSpacing: 0,
  },
  caption2: {
    fontFamily,
    fontSize: 11,
    fontWeight: '500' as const,
    letterSpacing: 0,
  },
  mono: {
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    fontSize: 13,
    fontWeight: '400' as const,
  },
};
