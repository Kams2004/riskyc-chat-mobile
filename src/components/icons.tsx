import { StyleSheet, View, type ColorValue } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';

/**
 * Centralizes icons that used to be copy-pasted inline (react-native-svg
 * <Svg><Path/></Svg>) at 25+ call sites — same verified path data as before
 * (nothing hand-redrawn, so nothing risks rendering wrong), just given one
 * home so the stroke weight/cap style stays consistent everywhere instead of
 * drifting call site by call site, and so a badge background (see
 * CircleIconBadge below) is one prop instead of a hand-built wrapper View
 * copied around too.
 */

type IconProps = {
  size?: number;
  color?: ColorValue;
  strokeWidth?: number;
};

function BaseIcon({
  size = 22,
  color = '#000000',
  strokeWidth = 2.1,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </Svg>
  );
}

export function PersonIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <Path d="M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
    </BaseIcon>
  );
}

export function PhoneIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <Path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.902.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.908.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </BaseIcon>
  );
}

export function VideoIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <Path d="M23 7l-7 5 7 5V7z" />
      <Path d="M16 5H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" />
    </BaseIcon>
  );
}

export function CameraIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <Path d="M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
    </BaseIcon>
  );
}

export function MicIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <Path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <Path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    </BaseIcon>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <Svg width={props.size ?? 22} height={props.size ?? 22} viewBox="0 0 24 24" fill={props.color ?? '#000000'}>
      <Path d="M2 21l21-9L2 3v7l15 2-15 2z" />
    </Svg>
  );
}

export function ChatBubbleIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <Path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </BaseIcon>
  );
}

/**
 * The circular colored-background badge behind an icon — WhatsApp's own
 * signature treatment for call/video/camera/mic actions, rather than a bare
 * icon floating with nothing behind it. Wraps whatever icon element is
 * passed as a child so it composes with any of the icons above.
 */
export function CircleIconBadge({
  size = 40,
  backgroundColor,
  children,
}: {
  size?: number;
  backgroundColor: ColorValue;
  children: React.ReactNode;
}) {
  return (
    <View
      style={[
        styles.badge,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: backgroundColor as string },
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center' },
});
