import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { useMediaUrl } from '../features/media/useMediaUrl';
import { fonts } from '../theme';

const BAR_COUNT = 28;

function formatSeconds(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
}

/**
 * We don't have the real recorded amplitude profile (the server only stores
 * duration, not a waveform), so this generates a stable, deterministic
 * pseudo-waveform per message — seeded from its own objectKey, so it looks
 * the same every time this message renders instead of jittering randomly.
 */
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

  const duration = status.duration || (durationMs ? durationMs / 1000 : 0);
  const progress = duration > 0 ? Math.min(1, status.currentTime / duration) : 0;
  const remaining = status.playing ? duration - status.currentTime : duration;
  const playedBars = Math.round(progress * BAR_COUNT);

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
        <View style={styles.waveform}>
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
        <Text style={[styles.time, { color: tintColor }]}>{formatSeconds(remaining)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 190 },
  playButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  trackWrap: { flex: 1, gap: 4 },
  waveform: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 20 },
  bar: { flex: 1, borderRadius: 1.5, minWidth: 2 },
  time: { fontFamily: fonts.sans, fontSize: 11 },
});
