import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { fonts, gradients } from '../theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const RING_SIZE = 120;
const RING_RADIUS = 52;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * Plays once per cold start, on top of the real app (which mounts and starts
 * restoring its session underneath immediately — this is a visual overlay,
 * not a gate). Storyboard: a dot grows into a ring, the ring gives way to
 * the app's rounded-square icon, a soft glow and a few particles settle
 * around it, the dark backdrop fades back to reveal the brand gradient, and
 * the wordmark/tagline rise in beneath it — then the whole thing fades out.
 * Built entirely with RN's built-in Animated + react-native-svg (already a
 * dependency elsewhere, e.g. ChatWallpaper) — no new native module needed.
 */
export function AnimatedSplash({ onDone }: { onDone: () => void }) {
  const dotScale = useRef(new Animated.Value(0)).current;
  const dotOpacity = useRef(new Animated.Value(0)).current;
  const ringProgress = useRef(new Animated.Value(0)).current;
  const ringOpacity = useRef(new Animated.Value(0)).current;
  const squareScale = useRef(new Animated.Value(0.85)).current;
  const squareOpacity = useRef(new Animated.Value(0)).current;
  const iconScale = useRef(new Animated.Value(0.85)).current;
  const iconOpacity = useRef(new Animated.Value(0)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const particlesOpacity = useRef(new Animated.Value(0)).current;
  const scrimOpacity = useRef(new Animated.Value(1)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslateY = useRef(new Animated.Value(14)).current;
  const overlayOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const run = (value: Animated.Value, toValue: number, duration: number, delay: number, useNativeDriver = true) =>
      Animated.timing(value, { toValue, duration, delay, easing: Easing.out(Easing.cubic), useNativeDriver });

    Animated.parallel([
      // Dot appears, then fades as the ring takes over.
      run(dotScale, 1, 220, 0),
      run(dotOpacity, 1, 160, 0),
      run(dotOpacity, 0, 200, 380),
      // Ring draws in around it.
      run(ringOpacity, 1, 160, 150),
      run(ringProgress, 1, 380, 150, false),
      run(ringOpacity, 0, 220, 620),
      // Square forms as the ring fades.
      run(squareOpacity, 1, 260, 480),
      run(squareScale, 1, 320, 480),
      // Icon settles inside the square.
      run(iconOpacity, 1, 320, 700),
      run(iconScale, 1, 360, 700),
      // Glow + particles, background scrim lifts to reveal the brand gradient.
      run(glowOpacity, 0.85, 400, 850),
      run(particlesOpacity, 1, 400, 900),
      run(scrimOpacity, 0, 500, 950),
      // Wordmark + tagline rise in.
      run(titleOpacity, 1, 380, 1150),
      run(titleTranslateY, 0, 380, 1150),
    ]).start();

    const finale = setTimeout(() => {
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 320,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(onDone);
    }, 2000);

    return () => clearTimeout(finale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ringDashoffset = ringProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [RING_CIRCUMFERENCE, 0],
  });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.container, { opacity: overlayOpacity }]}>
      <LinearGradient colors={gradients.brand} style={StyleSheet.absoluteFill} />
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: scrimOpacity }]} />

      <View style={styles.center}>
        <View style={styles.iconStage}>
          {/* Soft glow behind everything */}
          <Animated.View style={[styles.glow, { opacity: glowOpacity }]} />

          {/* Particles */}
          <Animated.View style={[styles.particle, { top: 4, left: 10, opacity: particlesOpacity }]} />
          <Animated.View style={[styles.particle, styles.particleSmall, { top: 18, right: 2, opacity: particlesOpacity }]} />
          <Animated.View style={[styles.particle, { bottom: 8, left: 0, opacity: particlesOpacity }]} />
          <Animated.View style={[styles.particle, styles.particleSmall, { bottom: 2, right: 12, opacity: particlesOpacity }]} />

          {/* Dot */}
          <Animated.View
            style={[styles.dot, { opacity: dotOpacity, transform: [{ scale: dotScale }] }]}
          />

          {/* Ring */}
          <Animated.View style={[styles.ringWrap, { opacity: ringOpacity }]}>
            <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
              <AnimatedCircle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                stroke="#ffffff"
                strokeWidth={3}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={ringDashoffset}
              />
            </Svg>
          </Animated.View>

          {/* Square + icon */}
          <Animated.View style={[styles.square, { opacity: squareOpacity, transform: [{ scale: squareScale }] }]} />
          <Animated.View style={{ opacity: iconOpacity, transform: [{ scale: iconScale }] }}>
            <Image source={require('../../assets/icon.png')} style={styles.icon} />
          </Animated.View>
        </View>

        <Animated.View style={{ opacity: titleOpacity, transform: [{ translateY: titleTranslateY }] }}>
          <Text style={styles.title}>Riskyc Chat</Text>
          <Text style={styles.tagline}>CHAT · SHARE · STAY CLOSE</Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { zIndex: 999, elevation: 999 },
  scrim: { backgroundColor: '#0d0609' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 22 },
  iconStage: { width: 132, height: 132, alignItems: 'center', justifyContent: 'center' },
  glow: {
    position: 'absolute',
    width: 168,
    height: 168,
    borderRadius: 84,
    backgroundColor: '#ffd166',
    opacity: 0,
    shadowColor: '#ffd166',
    shadowOpacity: 0.9,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 0 },
  },
  particle: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ffd166',
  },
  particleSmall: { width: 4, height: 4, borderRadius: 2 },
  dot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ffd166',
  },
  ringWrap: { position: 'absolute' },
  square: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 26,
    borderWidth: 2.5,
    borderColor: '#ffd166',
  },
  icon: { width: 90, height: 90, borderRadius: 24 },
  title: { fontFamily: fonts.display, fontSize: 26, color: '#ffffff', textAlign: 'center' },
  tagline: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    marginTop: 6,
  },
});
