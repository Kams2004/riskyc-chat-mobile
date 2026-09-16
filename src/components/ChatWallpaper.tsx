import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg';

import { useTheme } from '../features/theme/ThemeContext';

/**
 * WhatsApp-style subtle background behind chat bubbles and the call screen —
 * a tiled low-contrast dot pattern rather than a bundled photo/illustration
 * asset (there's no real image to ship here, and a repeating vector pattern
 * scales to any screen size for free, unlike a raster wallpaper). Shares the
 * same look across both surfaces per the "even in the chat conversations, as
 * done for whatsapp" request — same component, two call sites.
 */
export function ChatWallpaper({ children, dark = false }: PropsWithChildren<{ dark?: boolean }>) {
  const { colors } = useTheme();
  const dotColor = dark ? 'rgba(255,255,255,0.05)' : colors.brand200;
  const dotOpacity = dark ? 1 : 0.35;
  const backgroundColor = dark ? '#1a0d10' : colors.background;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor }]}>
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <Pattern id="wallpaperDots" width={36} height={36} patternUnits="userSpaceOnUse">
            <Circle cx={6} cy={6} r={1.6} fill={dotColor} opacity={dotOpacity} />
            <Circle cx={24} cy={18} r={1.6} fill={dotColor} opacity={dotOpacity} />
            <Circle cx={14} cy={28} r={1.6} fill={dotColor} opacity={dotOpacity} />
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill="url(#wallpaperDots)" />
      </Svg>
      {children}
    </View>
  );
}
