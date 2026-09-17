import { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';

/**
 * Three dots that fade in/out in sequence, mimicking WhatsApp's typing
 * indicator — used both inline (chat list row, thread header) and inside a
 * message-bubble-shaped container (see the thread screen's typing bubble).
 */
export function TypingDots({ color }: { color: string }) {
  const dots = [useRef(new Animated.Value(0.3)).current, useRef(new Animated.Value(0.3)).current, useRef(new Animated.Value(0.3)).current];

  useEffect(() => {
    const anims = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.3, duration: 300, useNativeDriver: true }),
          Animated.delay((2 - i) * 160),
        ])
      )
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      {dots.map((dot, i) => (
        <Animated.View key={i} style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: color, opacity: dot }} />
      ))}
    </View>
  );
}
