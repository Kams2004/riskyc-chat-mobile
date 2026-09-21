import { useEvent, useEventListener } from 'expo';
import { File } from 'expo-file-system';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useEffect, useRef, useState } from 'react';
import { Image, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GestureHandlerRootView, PanGestureHandler, State, type PanGestureHandlerGestureEvent, type PanGestureHandlerStateChangeEvent } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { fonts } from '../theme';

const MIN_WINDOW_MS = 3000;
const TIMELINE_HORIZONTAL_PADDING = 24;
const TIMELINE_HEIGHT = 56;
const THUMBNAIL_COUNT = 10;

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(mb < 1 ? 2 : 1)} MB`;
}

/**
 * WhatsApp-style status video trim: a real thumbnail filmstrip (not a plain
 * bar) spanning the FULL video, a white box + dimmed-outside overlay
 * marking the selected window, a play/pause-able preview, and a thin
 * playhead line that sweeps the selection during playback — pointerEvents
 * "none" and only 2px wide specifically so it never covers the filmstrip
 * frames underneath it. One PanGestureHandler spans the whole timeline
 * (rather than two small separate handle hit-targets) and drags whichever
 * edge was nearer the touch-down point. Nothing here re-encodes or writes
 * a new file — only an in/out point on the ORIGINAL is picked; the actual
 * cut happens server-side (ffmpeg -c copy, stream copy — no quality loss)
 * once the full video is uploaded, see features/media/api.ts#trimVideo.
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
  const insets = useSafeAreaInsets();
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });

  const [durationMs, setDurationMs] = useState(0);
  const [startMs, setStartMs] = useState(initialStartMs ?? 0);
  const [endMs, setEndMs] = useState(initialEndMs ?? maxWindowMs);
  const [playheadMs, setPlayheadMs] = useState(initialStartMs ?? 0);
  const [timelineWidth, setTimelineWidth] = useState(0);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [fullFileBytes, setFullFileBytes] = useState<number | null>(null);
  const dragHandleRef = useRef<'start' | 'end' | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    try {
      setFullFileBytes(new File(uri).size ?? null);
    } catch {
      setFullFileBytes(null);
    }
  }, [uri]);

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
    setPlayheadMs(s);
    player.currentTime = s / 1000;
  });

  // Full-video filmstrip (not just the selected window) — matches the
  // reference: the box narrows over a strip that always shows the whole
  // clip, so trimming further in is a spatial "which part of this" choice.
  useEffect(() => {
    if (durationMs <= 0 || thumbnails.length > 0) return;
    let cancelled = false;
    (async () => {
      const results: string[] = [];
      for (let i = 0; i < THUMBNAIL_COUNT; i++) {
        const time = Math.max(0, Math.min(durationMs - 1, Math.floor((i / THUMBNAIL_COUNT) * durationMs)));
        try {
          const { uri: thumbUri } = await VideoThumbnails.getThumbnailAsync(uri, { time });
          if (!cancelled) results.push(thumbUri);
        } catch {
          // A single failed frame shouldn't blank the whole strip.
        }
      }
      if (!cancelled) setThumbnails(results);
    })();
    return () => {
      cancelled = true;
    };
  }, [durationMs, uri, thumbnails.length]);

  useEventListener(player, 'timeUpdate', ({ currentTime }: { currentTime: number }) => {
    const ms = currentTime * 1000;
    if (ms >= endMs) {
      player.currentTime = startMs / 1000;
      setPlayheadMs(startMs);
    } else {
      setPlayheadMs(ms);
    }
  });

  function togglePlayback() {
    if (isPlaying) {
      player.pause();
    } else {
      if (player.currentTime * 1000 >= endMs || player.currentTime * 1000 < startMs) {
        player.currentTime = startMs / 1000;
      }
      player.play();
    }
  }

  function timeFromX(x: number): number {
    if (timelineWidth <= 0 || durationMs <= 0) return 0;
    const ratio = Math.max(0, Math.min(1, x / timelineWidth));
    return ratio * durationMs;
  }

  function onGestureEvent(e: PanGestureHandlerGestureEvent) {
    player.pause();
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
      setPlayheadMs(clampedStart);
      player.currentTime = clampedStart / 1000;
    } else {
      const clampedEnd = Math.min(durationMs, Math.max(t, startMs + MIN_WINDOW_MS));
      const newStart = Math.max(0, Math.max(startMs, clampedEnd - maxWindowMs));
      setEndMs(clampedEnd);
      setStartMs(newStart);
      setPlayheadMs(newStart);
      player.currentTime = newStart / 1000;
    }
  }

  function onHandlerStateChange(e: PanGestureHandlerStateChangeEvent) {
    if (e.nativeEvent.state === State.BEGAN) {
      dragHandleRef.current = null;
    } else if (e.nativeEvent.state === State.END || e.nativeEvent.state === State.CANCELLED) {
      dragHandleRef.current = null;
    }
  }

  const startRatio = durationMs > 0 ? startMs / durationMs : 0;
  const endRatio = durationMs > 0 ? endMs / durationMs : 1;
  const playheadRatio = durationMs > 0 ? Math.max(startRatio, Math.min(endRatio, playheadMs / durationMs)) : startRatio;
  const selectedMs = endMs - startMs;
  const estimatedBytes = fullFileBytes != null && durationMs > 0 ? fullFileBytes * (selectedMs / durationMs) : null;

  return (
    <Modal visible animationType="fade" onRequestClose={onCancel}>
      {/* Modal portals its content into its own native window, separate
          from the one _layout.tsx's own GestureHandlerRootView wraps — the
          PanGestureHandler below (and, once it's active but un-rooted, even
          plain touches on this screen) silently stops responding without
          a GestureHandlerRootView of its own in here. */}
      <GestureHandlerRootView style={styles.container}>
        <TouchableOpacity style={styles.preview} activeOpacity={1} onPress={togglePlayback}>
          <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />
          {!isPlaying && (
            <View style={[StyleSheet.absoluteFill, styles.playButtonWrap]} pointerEvents="none">
              <View style={styles.playButtonCircle}>
                <Svg width={26} height={26} viewBox="0 0 24 24" fill="#ffffff">
                  <Path d="M8 5v14l11-7z" />
                </Svg>
              </View>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={[styles.closeButton, { top: insets.top + 12 }]} onPress={onCancel}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2.4} strokeLinecap="round">
            <Path d="M18 6L6 18M6 6l12 12" />
          </Svg>
        </TouchableOpacity>

        <View style={[styles.bottom, { paddingBottom: insets.bottom + 20 }]}>
          <Text style={styles.durationLabel}>
            {formatDuration(selectedMs)}
            {estimatedBytes != null ? `  •  ${formatBytes(estimatedBytes)}` : ''}
          </Text>

          <PanGestureHandler onGestureEvent={onGestureEvent} onHandlerStateChange={onHandlerStateChange}>
            <View
              style={styles.timeline}
              onLayout={(e) => setTimelineWidth(e.nativeEvent.layout.width - TIMELINE_HORIZONTAL_PADDING * 2)}
            >
              <View style={styles.filmstrip}>
                {thumbnails.length > 0
                  ? thumbnails.map((thumbUri, i) => <Image key={i} source={{ uri: thumbUri }} style={styles.thumbnail} resizeMode="cover" />)
                  : <View style={styles.filmstripPlaceholder} />}
              </View>

              {/* Dims everything outside the selection, without covering the selection itself. */}
              <View style={[styles.dim, { left: TIMELINE_HORIZONTAL_PADDING, width: startRatio * timelineWidth }]} />
              <View style={[styles.dim, { left: TIMELINE_HORIZONTAL_PADDING + endRatio * timelineWidth, right: 0 }]} />

              <View
                style={[
                  styles.selectionBox,
                  {
                    left: TIMELINE_HORIZONTAL_PADDING + startRatio * timelineWidth,
                    width: Math.max(4, (endRatio - startRatio) * timelineWidth),
                  },
                ]}
                pointerEvents="none"
              />

              {/* Thin — deliberately not wide enough to obscure the frame it's currently over. */}
              <View
                style={[styles.playhead, { left: TIMELINE_HORIZONTAL_PADDING + playheadRatio * timelineWidth - 1 }]}
                pointerEvents="none"
              />

              <View style={[styles.handle, { left: TIMELINE_HORIZONTAL_PADDING + startRatio * timelineWidth - 9 }]} />
              <View style={[styles.handle, { left: TIMELINE_HORIZONTAL_PADDING + endRatio * timelineWidth - 9 }]} />
            </View>
          </PanGestureHandler>

          <View style={styles.actionsRow}>
            <View style={{ width: 44 }} />
            <TouchableOpacity style={styles.confirmButton} onPress={() => onConfirm(Math.round(startMs), Math.round(endMs))}>
              <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M20 6L9 17l-5-5" />
              </Svg>
            </TouchableOpacity>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  preview: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  playButtonWrap: { alignItems: 'center', justifyContent: 'center' },
  playButtonCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    position: 'absolute',
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottom: { paddingTop: 16, paddingHorizontal: 16, gap: 14 },
  durationLabel: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: '#ffffff', textAlign: 'center' },
  timeline: { height: TIMELINE_HEIGHT, justifyContent: 'center' },
  filmstrip: {
    position: 'absolute',
    left: TIMELINE_HORIZONTAL_PADDING,
    right: TIMELINE_HORIZONTAL_PADDING,
    height: TIMELINE_HEIGHT - 12,
    borderRadius: 6,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: '#222222',
  },
  filmstripPlaceholder: { flex: 1 },
  thumbnail: { flex: 1, height: '100%' },
  dim: { position: 'absolute', top: 6, height: TIMELINE_HEIGHT - 12, backgroundColor: 'rgba(0,0,0,0.65)' },
  selectionBox: {
    position: 'absolute',
    top: 6,
    height: TIMELINE_HEIGHT - 12,
    borderWidth: 2,
    borderColor: '#ffffff',
    borderRadius: 6,
  },
  playhead: { position: 'absolute', top: 2, width: 2, height: TIMELINE_HEIGHT - 4, backgroundColor: '#ffffff' },
  handle: {
    position: 'absolute',
    top: 0,
    width: 18,
    height: TIMELINE_HEIGHT,
    borderRadius: 9,
    backgroundColor: '#ffffff',
  },
  actionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  confirmButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#25d366', alignItems: 'center', justifyContent: 'center' },
});
