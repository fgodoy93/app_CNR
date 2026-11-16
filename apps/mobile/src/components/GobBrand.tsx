import React from 'react';
import { Image, View } from 'react-native';
import { COLORS } from '../theme';

export function GobStripe() {
  return (
    <View style={{ flexDirection: 'row', height: 4, width: '100%' }}>
      <View style={{ flex: 1, backgroundColor: COLORS.gobBlue }} />
      <View style={{ flex: 1, backgroundColor: COLORS.gobRed }} />
    </View>
  );
}

export function BrandEmblem({ size = 36 }: { size?: number }) {
  return (
    <Image
      source={require('../../assets/cnr-badge.jpg')}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#fff' }}
      resizeMode="cover"
    />
  );
}

export function CnrLogoFull({ width = 190, height = 90 }: { width?: number; height?: number }) {
  return (
    <Image
      source={require('../../assets/cnr-logo.png')}
      style={{ width, height, alignSelf: 'center' }}
      resizeMode="contain"
    />
  );
}
