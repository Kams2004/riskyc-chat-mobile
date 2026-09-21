import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, Path, Pattern, Rect } from 'react-native-svg';

import { useTheme } from '../features/theme/ThemeContext';
import { useWallpaper, type WallpaperVariant } from '../features/wallpaper/WallpaperContext';

// Same path data as components/icons.tsx (not imported from there — Pattern
// children must be plain Svg primitives, not arbitrary components, so these
// are inlined rather than reusing <ChatBubbleIcon/> etc. directly).
const DOODLE_PATHS = {
  chat: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z',
  phone: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.902.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.908.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z',
  camera: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z',
  cameraLens: 'M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  mic: 'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z',
  micStand: 'M19 10v2a7 7 0 0 1-14 0v-2',
  person: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2',
  personHead: 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
};

/**
 * WhatsApp-style background behind chat bubbles and the call screen — three
 * selectable patterns (see settings/wallpaper.tsx), persisted via
 * WallpaperContext. The call screens (CallOverlay/GroupCallOverlay) always
 * pass an explicit `variant="dots"` + `dark` regardless of the user's chat
 * preference — that's a different surface (full-bleed video/avatar, not a
 * message thread) and was never meant to carry the doodle pattern.
 */
export function ChatWallpaper({ children, dark = false, variant }: PropsWithChildren<{ dark?: boolean; variant?: WallpaperVariant }>) {
  const { colors } = useTheme();
  const { variant: preferredVariant } = useWallpaper();
  const resolvedVariant = variant ?? preferredVariant;

  const dotColor = dark ? 'rgba(255,255,255,0.05)' : colors.brand200;
  const dotOpacity = dark ? 1 : 0.35;
  const doodleColor = dark ? 'rgba(255,255,255,0.06)' : colors.brand200;
  const doodleOpacity = dark ? 1 : 0.55;
  const backgroundColor = dark ? '#1a0d10' : colors.background;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor }]}>
      {resolvedVariant === 'dots' && (
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
      )}
      {resolvedVariant === 'doodle' && (
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
          <Defs>
            <Pattern id="wallpaperDoodle" width={168} height={168} patternUnits="userSpaceOnUse">
              <G fill={doodleColor} opacity={doodleOpacity}>
                <G transform="translate(14,10) scale(0.62) rotate(-8)">
                  <Path d={DOODLE_PATHS.chat} />
                </G>
                <G transform="translate(100,20) scale(0.55) rotate(12)">
                  <Path d={DOODLE_PATHS.phone} />
                </G>
                <G transform="translate(30,80) scale(0.6) rotate(6)">
                  <Path d={DOODLE_PATHS.camera} />
                  <Path d={DOODLE_PATHS.cameraLens} fill={backgroundColor} />
                </G>
                <G transform="translate(120,90) scale(0.58) rotate(-10)">
                  <Path d={DOODLE_PATHS.mic} />
                  <Path d={DOODLE_PATHS.micStand} fill="none" stroke={doodleColor} strokeWidth={2} strokeLinecap="round" />
                </G>
                <G transform="translate(60,130) scale(0.55) rotate(4)">
                  <Path d={DOODLE_PATHS.person} />
                  <Path d={DOODLE_PATHS.personHead} />
                </G>
              </G>
            </Pattern>
          </Defs>
          <Rect x={0} y={0} width="100%" height="100%" fill="url(#wallpaperDoodle)" />
        </Svg>
      )}
      {children}
    </View>
  );
}
