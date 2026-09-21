import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useRef, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { PanGestureHandler, State, type PanGestureHandlerGestureEvent, type PanGestureHandlerStateChangeEvent } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { fonts } from '../theme';

const MIN_WINDOW_MS = 3000;
const TIMELINE_HORIZONTAL_PADDING = 24;

/**
 * WhatsApp-style status video trim — one PanGestureHandler spans the whole
 * timeline bar (rather than two small separate handle hit-targets, easier
 * to hit reliably) and drags whichever edge (start/end) was nearer the
 * touch-down point. Only ever picks an in/out point on the ORIGINAL file —
 * nothing here re-encodes or writes a new file; the actual cut happens
 * server-side (ffmpeg -c copy, stream copy — no quality loss) once the full
 * video is uploaded, see features/media/api.ts#trimVideo.
 */
export function VideoTrimmer({
  uri,
  maxWindowMs,
  initialStartMs,
  initialEndMs,
  onConfirm,
  onCancel,
}: {
  uri: string;
  maxWindowMs: number;
  initialStartMs?: number;
  initialEndMs?: number;
  onConfirm: (startMs: number, endMs: number) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('status');
  const insets = useSafeAreaInsets();
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
  });

  const [durationMs, setDurationMs] = useState(0);
  const [startMs, setStartMs] = useState(initialStartMs ?? 0);
  const [endMs, setEndMs] = useState(initialEndMs ?? maxWindowMs);
  // State, not a ref — onLayout only fires once, so this must actually
  // trigger a re-render or the handles/selection stay pinned at their
  // ref-defaults-to-0 position until some unrelated state change
  // (e.g. the first drag) happens to re-render the component anyway.
  const [timelineWidth, setTimelineWidth] = useState(0);
  const dragHandleRef = useRef<'start' | 'end' | null>(null);
  const loadedRef = useRef(false);

  useEventListener(player, 'sourceLoad', (payload: any) => {
    if (loadedRef.current) return;
    const durSec = payload?.duration ?? player.duration;
    if (!durSec) return;
    loadedRef.current = true;
    const durMs = durSec * 1000;
    setDurationMs(durMs);
    const window = Math.min(maxWindowMs, durMs);
    const s = Math.min(initialStartMs ?? 0, Math.max(0, durMs - window));
    const e = initialEndMs ?? s + window;
    setStartMs(s);
    setEndMs(e);
    player.currentTime = s / 1000;
    player.play();
  });

  useEventListener(player, 'timeUpdate', ({ currentTime }: { currentTime: number }) => {
    if (currentTime * 1000 >= endMs) {
      player.currentTime = startMs / 1000;
    }
  });

  function timeFromX(x: number): number {
    if (timelineWidth <= 0 || durationMs <= 0) return 0;
    const ratio = Math.max(0, Math.min(1, x / timelineWidth));
    return ratio * durationMs;
  }

  function onGestureEvent(e: PanGestureHandlerGestureEvent) {
    const x = e.nativeEvent.x - TIMELINE_HORIZONTAL_PADDING;
    const t = timeFromX(x);
    if (!dragHandleRef.current) {
      dragHandleRef.current = Math.abs(t - startMs) <= Math.abs(t - endMs) ? 'start' : 'end';
    }
    if (dragHandleRef.current === 'start') {
      const clampedStart = Math.max(0, Math.min(t, endMs - MIN_WINDOW_MS));
      const newEnd = Math.min(durationMs, Math.min(endMs, clampedStart + maxWindowMs));
      setStartMs(clampedStart);
      setEndMs(newEnd);
      player.currentTime = clampedStart / 1000;
    } else {
      const clampedEnd = Math.min(durationMs, Math.max(t, startMs + MIN_WINDOW_MS));
      const newStart = Math.max(0, Math.max(startMs, clampedEnd - maxWindowMs));
      setEndMs(clampedEnd);
      setStartMs(newStart);
      player.currentTime = newStart / 1000;
    }
  }

  function onHandlerStateChange(e: PanGestureHandlerStateChangeEvent) {
    if (e.nativeEvent.state === State.BEGAN) {
      dragHandleRef.current = null;
    } else if (e.nativeEvent.state === State.END || e.nativeEvent.state === State.CANCELLED) {
      dragHandleRef.current = null;
      player.currentTime = startMs / 1000;
      player.play();
    }
  }

  const startRatio = durationMs > 0 ? startMs / durationMs : 0;
  const endRatio = durationMs > 0 ? endMs / durationMs : 1;
  const windowSeconds = Math.round((endMs - startMs) / 1000);

  return (
    <Modal visible animationType="fade" onRequestClose={onCancel}>
      <View style={styles.container}>
        <View style={styles.preview}>
          <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />
        </View>

        <View style={[styles.bottom, { paddingBottom: insets.bottom + 20 }]}>
          <Text style={styles.durationLabel}>{t('trimmer.selected', { seconds: windowSeconds })}</Text>

          <PanGestureHandler onGestureEvent={onGestureEvent} onHandlerStateChange={onHandlerStateChange}>
            <View
              style={styles.timeline}
              onLayout={(e) => {
                setTimelineWidth(e.nativeEvent.layout.width - TIMELINE_HORIZONTAL_PADDING * 2);
              }}
            >
              <View style={styles.timelineTrack} />
              <View
                style={[
                  styles.timelineSelection,
                  {
                    left: TIMELINE_HORIZONTAL_PADDING + startRatio * timelineWidth,
                    width: Math.max(4, (endRatio - startRatio) * timelineWidth),
                  },
                ]}
              />
              <View style={[styles.handle, { left: TIMELINE_HORIZONTAL_PADDING + startRatio * timelineWidth - 9 }]} />
              <View style={[styles.handle, { left: TIMELINE_HORIZONTAL_PADDING + endRatio * timelineWidth - 9 }]} />
            </View>
          </PanGestureHandler>

          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2.4} strokeLinecap="round">
                <Path d="M18 6L6 18M6 6l12 12" />
              </Svg>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmButton} onPress={() => onConfirm(Math.round(startMs), Math.round(endMs))}>
              <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M20 6L9 17l-5-5" />
              </Svg>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  preview: { flex: 1 },
  bottom: { paddingTop: 16, paddingHorizontal: 16, gap: 14 },
  durationLabel: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: '#ffffff', textAlign: 'center' },
  timeline: { height: 48, justifyContent: 'center' },
  timelineTrack: {
    position: 'absolute',
    left: TIMELINE_HORIZONTAL_PADDING,
    right: TIMELINE_HORIZONTAL_PADDING,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  timelineSelection: { position: 'absolute', height: 6, borderRadius: 3, backgroundColor: '#25d366' },
  handle: {
    position: 'absolute',
    width: 18,
    height: 30,
    borderRadius: 9,
    backgroundColor: '#ffffff',
  },
  actionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cancelButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#25d366', alignItems: 'center', justifyContent: 'center' },
});
