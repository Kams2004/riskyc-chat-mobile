import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { PanGestureHandler } from 'react-native-gesture-handler';
import type { PanGestureHandlerGestureEvent } from 'react-native-gesture-handler';
import Svg, { Path, Rect } from 'react-native-svg';

import { useMediaUrl } from '../features/media/useMediaUrl';
import { fonts } from '../theme';

const BAR_COUNT = 28;
const SPEEDS = [1, 1.5, 2] as const;
type Speed = (typeof SPEEDS)[number];

function formatSeconds(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
}

function pseudoWaveform(seed: string): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  const bars: number[] = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    h = (h * 1103515245 + 12345) | 0;
    bars.push(0.25 + (Math.abs(h % 1000) / 1000) * 0.75);
  }
  return bars;
}

type VoiceMessageBubbleProps = {
  objectKey: string;
  durationMs: number | null;
  tintColor: string;
  trackColor: string;
  iconColor: string;
};

export function VoiceMessageBubble({ objectKey, durationMs, tintColor, trackColor, iconColor }: VoiceMessageBubbleProps) {
  const url = useMediaUrl(objectKey);
  const player = useAudioPlayer(url ?? undefined);
  const status = useAudioPlayerStatus(player);
  const bars = useMemo(() => pseudoWaveform(objectKey), [objectKey]);
  const [speed, setSpeed] = useState<Speed>(1);
  const waveformWidthRef = useRef<number>(0);

  const duration = status.duration || (durationMs ? durationMs / 1000 : 0);
  const progress = duration > 0 ? Math.min(1, status.currentTime / duration) : 0;
  const remaining = status.playing ? duration - status.currentTime : duration;
  const playedBars = Math.round(progress * BAR_COUNT);

  function cycleSpeed() {
    const nextIndex = (SPEEDS.indexOf(speed) + 1) % SPEEDS.length;
    const next = SPEEDS[nextIndex];
    setSpeed(next);
    // Guarded on isLoaded — mutating playbackRate on a player whose native
    // side hasn't finished loading the source yet is the kind of thing
    // that surfaces as a hard native crash rather than a catchable JS
    // error, so try/catch alone isn't enough here.
    if (!status.isLoaded) return;
    try {
      player.setPlaybackRate(next, 'high');
    } catch (e) {
      console.warn('[VoiceMessageBubble] setPlaybackRate failed', e);
    }
  }

  function seekToProgress(ratio: number) {
    if (duration <= 0) return;
    const clamped = Math.max(0, Math.min(1, ratio));
    player.seekTo(clamped * duration);
  }

  const onGestureEvent = (event: PanGestureHandlerGestureEvent) => {
    const { x } = event.nativeEvent;
    if (waveformWidthRef.current > 0) {
      seekToProgress(x / waveformWidthRef.current);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.playButton, { backgroundColor: tintColor }]}
        onPress={() => (status.playing ? player.pause() : player.play())}
        disabled={!url}
      >
        <Svg width={16} height={16} viewBox="0 0 24 24" fill={iconColor}>
          {status.playing ? (
            <>
              <Rect x={6} y={4} width={4} height={16} rx={1} />
              <Rect x={14} y={4} width={4} height={16} rx={1} />
            </>
          ) : (
            <Path d="M8 5v14l11-7z" />
          )}
        </Svg>
      </TouchableOpacity>

      <View style={styles.trackWrap}>
        <PanGestureHandler onGestureEvent={onGestureEvent}>
          <View
            style={styles.waveform}
            onLayout={(e) => { waveformWidthRef.current = e.nativeEvent.layout.width; }}
          >
            {bars.map((height, i) => (
              <View
                key={i}
                style={[
                  styles.bar,
                  { height: 4 + height * 16, backgroundColor: i < playedBars ? tintColor : trackColor },
                ]}
              />
            ))}
          </View>
        </PanGestureHandler>
        <View style={styles.metaRow}>
          <Text style={[styles.time, { color: tintColor }]}>{formatSeconds(remaining)}</Text>
          <TouchableOpacity onPress={cycleSpeed} hitSlop={8}>
            <Text style={[styles.speedLabel, { color: tintColor }]}>x{speed}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 190 },
  playButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  trackWrap: { flex: 1, gap: 4 },
  waveform: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 24 },
  bar: { flex: 1, borderRadius: 1.5, minWidth: 2 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  time: { fontFamily: fonts.sans, fontSize: 11 },
  speedLabel: { fontFamily: fonts.sansSemiBold, fontSize: 11 },
});
