import {
  requestRecordingPermissionsAsync,
  RecordingPresets,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, TouchableOpacity, View, Text } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { uploadMedia } from '../features/media/api';
import { useTheme } from '../features/theme/ThemeContext';
import { fonts, type Palette } from '../theme';

const MAX_BARS = 40;
// Bar count the final, stored waveform gets resampled to — matches web's
// VoiceMessagePlayer so a voice note looks the same density on either
// platform, though there's no hard requirement they match.
const FINAL_BAR_COUNT = 46;
// Rough dBFS-to-visual-height normalization — expo-audio's metering follows
// the usual AVAudioRecorder-style convention (~-60 near-silence, 0 = peak);
// there's no need for exact calibration, just a waveform that visibly moves.
function normalizeMetering(db: number | undefined): number {
  if (db === undefined) return 0.05;
  return Math.min(1, Math.max(0.05, (db + 60) / 60));
}

/** Downsamples the full, unbounded metering history captured over the whole recording into a fixed-length bar array (averaged per bucket) for storage/playback — independent of how long the recording ran or how many raw 100ms samples that produced. */
function resampleToFixedBars(raw: number[], targetCount: number): number[] {
  if (raw.length === 0) return new Array(targetCount).fill(0.05);
  const bucketSize = raw.length / targetCount;
  const bars: number[] = [];
  for (let i = 0; i < targetCount; i++) {
    const start = Math.floor(i * bucketSize);
    const end = Math.max(start + 1, Math.floor((i + 1) * bucketSize));
    let sum = 0;
    let count = 0;
    for (let j = start; j < end && j < raw.length; j++) {
      sum += raw[j];
      count++;
    }
    bars.push(count > 0 ? sum / count : 0.05);
  }
  return bars;
}

/** Comma-separated 0-100 ints — compact and trivial to parse back on either platform, no JSON-in-a-column needed. */
function encodeWaveform(bars: number[]): string {
  return bars.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 100)).join(',');
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

type VoiceRecorderProps = {
  onSend: (objectKey: string, durationMs: number, waveform: string) => void;
  onCancel: () => void;
};

/** Replaces the whole composer row while recording a voice note — timer, live waveform, pause, discard, send. */
export function VoiceRecorder({ onSend, onCancel }: VoiceRecorderProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { t } = useTranslation('media');

  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const state = useAudioRecorderState(recorder, 100);
  const [bars, setBars] = useState<number[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const startedRef = useRef(false);
  // Unbounded, unlike `bars` (which is trimmed to MAX_BARS for the live
  // display) — every metering sample across the whole recording, so the
  // final stored waveform reflects the entire clip, not just its last few
  // seconds.
  const fullMeteringRef = useRef<number[]>([]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t('voiceRecorder.permissionTitle'), t('voiceRecorder.permissionBody'));
        onCancel();
        return;
      }
      await recorder.prepareToRecordAsync();
      recorder.record();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!state.isRecording) return;
    const normalized = normalizeMetering(state.metering);
    fullMeteringRef.current.push(normalized);
    setBars((prev) => [...prev.slice(-(MAX_BARS - 1)), normalized]);
  }, [state.metering, state.isRecording]);

  async function handleDiscard() {
    await recorder.stop();
    onCancel();
  }

  function handleTogglePause() {
    if (state.isRecording) {
      recorder.pause();
    } else {
      recorder.record();
    }
  }

  async function handleSend() {
    setIsUploading(true);
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error('No recording produced');
      const objectKey = await uploadMedia(uri, 'audio/m4a');
      const waveform = encodeWaveform(resampleToFixedBars(fullMeteringRef.current, FINAL_BAR_COUNT));
      onSend(objectKey, state.durationMillis, waveform);
    } catch (e) {
      console.warn('[VoiceRecorder] send failed', e);
      Alert.alert(t('voiceRecorder.sendFailedTitle'), t('voiceRecorder.sendFailedBody'));
      onCancel();
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.iconTouchable} onPress={handleDiscard} disabled={isUploading}>
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.brand700} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" />
        </Svg>
      </TouchableOpacity>

      <Text style={styles.timer}>{formatDuration(state.durationMillis)}</Text>

      <View style={styles.waveform}>
        {bars.map((height, i) => (
          <View key={i} style={[styles.bar, { height: 4 + height * 22, backgroundColor: colors.brand500 }]} />
        ))}
      </View>

      <TouchableOpacity style={styles.iconTouchable} onPress={handleTogglePause} disabled={isUploading}>
        <Svg width={20} height={20} viewBox="0 0 24 24" fill={colors.textPrimary}>
          {state.isRecording ? (
            <>
              <Rect x={6} y={4} width={4} height={16} rx={1} />
              <Rect x={14} y={4} width={4} height={16} rx={1} />
            </>
          ) : (
            <Path d="M8 5v14l11-7z" />
          )}
        </Svg>
      </TouchableOpacity>

      <TouchableOpacity style={styles.sendTouchable} onPress={handleSend} disabled={isUploading}>
        <Svg width={19} height={19} viewBox="0 0 24 24" fill="#ffffff">
          <Path d="M2 12l19-9-7 19-3-8-9-2z" />
        </Svg>
      </TouchableOpacity>
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
    iconTouchable: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    timer: { fontFamily: fonts.sans, fontSize: 13, color: colors.textMuted, width: 38 },
    waveform: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2, height: 30, overflow: 'hidden' },
    bar: { width: 3, borderRadius: 1.5 },
    sendTouchable: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.gold500,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
