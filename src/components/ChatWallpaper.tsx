import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, Path, Pattern, Rect } from 'react-native-svg';

import { useTheme } from '../features/theme/ThemeContext';
import { useWallpaper, type WallpaperVariant } from '../features/wallpaper/WallpaperContext';

/**
 * One doodle "sticker" is a self-contained set of primitives in a roughly
 * 0-20 coordinate box, line-art (stroke, not fill) to match the reference
 * WhatsApp-style wallpaper the user supplied — a scatter of small chat/
 * communication glyphs rather than a plain dot grid. Built from basic
 * shapes (rect/circle/short hand-authored paths) with coordinates chosen
 * directly here, rather than copied from an unfamiliar icon library, so
 * every path is one we can reason about and trust to render correctly.
 */
function ChatBubbleDoodle() {
  return (
    <G>
      <Rect x={0} y={0} width={20} height={14} rx={6} />
      <Path d="M5 14v4l5-4" />
      <Circle cx={6} cy={7} r={1} fill="currentColor" stroke="none" />
      <Circle cx={10} cy={7} r={1} fill="currentColor" stroke="none" />
      <Circle cx={14} cy={7} r={1} fill="currentColor" stroke="none" />
    </G>
  );
}

function PaperPlaneDoodle() {
  return <Path d="M1 19L19 1M19 1L8 9M19 1L12 19L8 9L1 19" />;
}

function PhotoDoodle() {
  return (
    <G>
      <Rect x={0} y={0} width={18} height={14} rx={3} />
      <Path d="M2 12l4-4 3 3 4-5 3 6" />
      <Circle cx={13} cy={4} r={1.4} fill="currentColor" stroke="none" />
    </G>
  );
}

function HeartDoodle() {
  return <Path d="M11 19C5 13 1 9 1 5.5 1 2.5 3.5 0 6.5 0 8.5 0 10 1.2 11 2.8 12 1.2 13.5 0 15.5 0 18.5 0 21 2.5 21 5.5 21 9 17 13 11 19Z" />;
}

function PhoneDeviceDoodle() {
  return (
    <G>
      <Rect x={0} y={0} width={11} height={19} rx={2.5} />
      <Circle cx={5.5} cy={16} r={1} fill="currentColor" stroke="none" />
    </G>
  );
}

function CameraDoodle() {
  return (
    <G>
      <Rect x={0} y={4} width={20} height={13} rx={2.5} />
      <Path d="M7 4l2-3h4l2 3" />
      <Circle cx={10} cy={10.5} r={3.4} />
    </G>
  );
}

function PeopleDoodle() {
  return (
    <G>
      <Circle cx={5} cy={5} r={3} />
      <Circle cx={15} cy={5} r={3} />
      <Path d="M0 19c0-5 3-8 5-8M20 19c0-5-3-8-5-8" />
      <Path d="M4 19c0-6 4.5-10 6-10s6 4 6 10" />
    </G>
  );
}

function SmileyDoodle() {
  return (
    <G>
      <Circle cx={9} cy={9} r={9} />
      <Circle cx={5.5} cy={7} r={1} fill="currentColor" stroke="none" />
      <Circle cx={12.5} cy={7} r={1} fill="currentColor" stroke="none" />
      <Path d="M4.5 11.5c1.6 2.2 7.4 2.2 9 0" />
    </G>
  );
}

function SparkleDoodle() {
  return <Path d="M6 0L7.2 4.8L12 6L7.2 7.2L6 12L4.8 7.2L0 6L4.8 4.8Z" />;
}

/** WhatsApp-style background behind chat bubbles and the call screen — three
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
  const doodleColor = dark ? 'rgba(255,255,255,0.14)' : colors.brand300;
  const doodleOpacity = dark ? 1 : 0.65;
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
            <Pattern id="wallpaperDoodle" width={220} height={260} patternUnits="userSpaceOnUse">
              <G
                stroke={doodleColor}
                color={doodleColor}
                strokeWidth={1.6}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={doodleOpacity}
              >
                <G transform="translate(10,8) scale(0.85) rotate(-6)"><ChatBubbleDoodle /></G>
                <G transform="translate(150,18) scale(0.7) rotate(18)"><PaperPlaneDoodle /></G>
                <G transform="translate(70,20) scale(0.55)"><SparkleDoodle /></G>
                <G transform="translate(185,70) scale(0.75) rotate(-10)"><PhotoDoodle /></G>
                <G transform="translate(15,75) scale(0.8) rotate(8)"><HeartDoodle /></G>
                <G transform="translate(95,90) scale(0.85) rotate(-4)"><ChatBubbleDoodle /></G>
                <G transform="translate(45,130) scale(0.75) rotate(-14)"><PhoneDeviceDoodle /></G>
                <G transform="translate(160,140) scale(0.7) rotate(10)"><SmileyDoodle /></G>
                <G transform="translate(0,180) scale(0.7) rotate(6)"><CameraDoodle /></G>
                <G transform="translate(115,175) scale(0.6)"><SparkleDoodle /></G>
                <G transform="translate(70,200) scale(0.75) rotate(-8)"><PeopleDoodle /></G>
                <G transform="translate(180,210) scale(0.8) rotate(14)"><ChatBubbleDoodle /></G>
                <G transform="translate(20,235) scale(0.65) rotate(20)"><PaperPlaneDoodle /></G>
                <G transform="translate(140,20) scale(0.4)"><SparkleDoodle /></G>
                <Circle cx={200} cy={20} r={1.4} fill={doodleColor} stroke="none" />
                <Circle cx={45} cy={60} r={1.4} fill={doodleColor} stroke="none" />
                <Circle cx={135} cy={110} r={1.4} fill={doodleColor} stroke="none" />
                <Circle cx={10} cy={160} r={1.4} fill={doodleColor} stroke="none" />
                <Circle cx={205} cy={175} r={1.4} fill={doodleColor} stroke="none" />
                <Circle cx={100} cy={245} r={1.4} fill={doodleColor} stroke="none" />
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
