import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { OpaqueColorValue, StyleProp, TextStyle } from 'react-native';

// SFSymbol to Ionicons mapping
const MAPPING: Record<string, any> = {
  'map.fill': 'map',
  'magnifyingglass': 'search',
  'person.2.fill': 'people',
  'person.fill': 'person',
  'grid': 'grid',
  'house.fill': 'home',
  'creditcard.fill': 'card',
  'shield.fill': 'shield',
  'message.fill': 'chatbubbles',
  'questionmark': 'help-circle-outline',
  'card': 'card',
  'shield': 'shield',
  'chatbubbles': 'chatbubbles',
};

interface Props {
  name: string;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
}

export function IconSymbol({ name, size = 24, color, style }: Props) {
  const iconName = MAPPING[name] || name;
  return <Ionicons name={iconName} size={size} color={color} style={style} />;
};
