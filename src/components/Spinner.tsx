import { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';

import { useTheme } from '../features/theme/ThemeContext';

const DOT_COUNT = 8;

/**
 * Circular dotted loader (8 dots fading in sequence around a ring) — mobile
 * counterpart to web's Spinner.tsx, same 1s-cycle/0.125s-stagger timing and
 * 0.15→1→0.15 opacity fade, replacing plain ActivityIndicator spinners and
 * "empty until it isn't" placeholders throughout the app.
 */
export function Spinner({ size = 28, color }: { size?: number; color?: string }) {
  const { colors } = useTheme();
  const dotColor = color ?? colors.brand500;
  const animsRef = useRef(Array.from({ length: DOT_COUNT }, () => new Animated.Value(0.15)));

  useEffect(() => {
    const loops = animsRef.current.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay((i * 1000) / DOT_COUNT),
          Animated.timing(anim, { toValue: 1, duration: 100, easing: Easing.linear, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.15, duration: 900, easing: Easing.linear, useNativeDriver: true }),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, []);

  const dotSize = Math.max(2, size / 8);
  const radius = size / 2 - dotSize / 2;

  return (
    <View style={{ width: size, height: size }}>
      {animsRef.current.map((anim, i) => {
        const angle = (i / DOT_COUNT) * 2 * Math.PI;
        const x = size / 2 + radius * Math.sin(angle) - dotSize / 2;
        const y = size / 2 - radius * Math.cos(angle) - dotSize / 2;
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              backgroundColor: dotColor,
              opacity: anim,
            }}
          />
        );
      })}
    </View>
  );
}
