import { useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import Svg, { Path } from 'react-native-svg';

import { useMediaUrlWithStatus } from '../features/media/useMediaUrl';
import { useTheme } from '../features/theme/ThemeContext';
import { fonts, type Palette } from '../theme';
import type { AttachmentItem } from '../data/db';
import { Spinner } from './Spinner';

const GRID_SIZE = 220;
const GAP = 3;

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function RetryOverlay({ size, onRetry }: { size: number; onRetry: () => void }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      style={[StyleSheet.absoluteFill, styles.retryOverlay]}
      onPress={onRetry}
      activeOpacity={0.8}
    >
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.brand600} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" />
      </Svg>
      <Text style={[styles.retryText, { color: colors.brand600 }]}>Retry</Text>
    </TouchableOpacity>
  );
}

/** A video tile's own first frame as its thumbnail — a raw video file URL can't be used as an <Image> source (that's what a plain Image-based tile silently failed to render before this). */
function VideoTile({ objectKey, size }: { objectKey: string; size: number }) {
  const { url, status, retry } = useMediaUrlWithStatus(objectKey);
  const player = useVideoPlayer(url ?? '', (p) => {
    p.muted = true;
  });
  if (status === 'error') return <RetryOverlay size={size} onRetry={retry} />;
  if (!url) return <View style={[StyleSheet.absoluteFill, styles.placeholder]}><Spinner size={size * 0.18} /></View>;
  return <VideoView player={player} style={{ width: size, height: size }} contentFit="cover" nativeControls={false} />;
}

function Tile({ item, size, onPress, overlay }: { item: AttachmentItem; size: number; onPress: () => void; overlay?: React.ReactNode }) {
  const { url, status, retry } = useMediaUrlWithStatus(item.mediaType === 'VIDEO' ? null : item.mediaObjectKey);
  const isError = item.mediaType !== 'VIDEO' && status === 'error';
  return (
    <TouchableOpacity onPress={isError ? undefined : onPress} style={{ width: size, height: size }} activeOpacity={0.85}>
      {item.mediaType === 'VIDEO' ? (
        <VideoTile objectKey={item.mediaObjectKey} size={size} />
      ) : status === 'error' ? (
        <RetryOverlay size={size} onRetry={retry} />
      ) : url ? (
        <Image source={{ uri: url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
          <Spinner size={size * 0.18} />
        </View>
      )}
      {item.mediaType === 'VIDEO' && status !== 'error' && (
        <View style={styles.videoBadge}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="#ffffff">
            <Path d="M8 5v14l11-7z" />
          </Svg>
        </View>
      )}
      {overlay}
    </TouchableOpacity>
  );
}

function GridBody({ items, onOpen }: { items: AttachmentItem[]; onOpen: (index: number) => void }) {
  const { colors } = useTheme();

  if (items.length === 1) {
    return (
      <View style={{ width: GRID_SIZE, height: GRID_SIZE, borderRadius: 12, overflow: 'hidden' }}>
        <Tile item={items[0]} size={GRID_SIZE} onPress={() => onOpen(0)} />
      </View>
    );
  }

  if (items.length === 2 || items.length === 3) {
    const size = (GRID_SIZE - GAP) / 2;
    return (
      <View style={{ width: GRID_SIZE, flexDirection: 'row', flexWrap: 'wrap', gap: GAP, borderRadius: 12, overflow: 'hidden' }}>
        {items.map((item, i) => (
          <Tile key={i} item={item} size={items.length === 3 && i === 2 ? GRID_SIZE : size} onPress={() => onOpen(i)} />
        ))}
      </View>
    );
  }

  const size = (GRID_SIZE - GAP) / 2;
  const remaining = items.length - 4;
  return (
    <View style={{ width: GRID_SIZE, flexDirection: 'row', flexWrap: 'wrap', gap: GAP, borderRadius: 12, overflow: 'hidden' }}>
      {items.slice(0, 4).map((item, i) => (
        <Tile
          key={i}
          item={item}
          size={size}
          onPress={() => onOpen(i)}
          overlay={
            i === 3 && remaining > 0 ? (
              <View style={[StyleSheet.absoluteFill, styles.moreOverlay, { backgroundColor: colors.brand900 + 'aa' }]}>
                <Text style={styles.moreText}>+{remaining}</Text>
              </View>
            ) : undefined
          }
        />
      ))}
    </View>
  );
}

/**
 * WhatsApp-style collage — 1 item fills the space, 2-4 split evenly, 5+
 * shows the first 4 with a "+N" overlay on the last tile. A single item
 * auto-loads as before; 2+ items (a real gallery send) stay behind a
 * download gate showing the combined size and item count until explicitly
 * tapped, instead of every tile silently fetching the moment it renders —
 * a lone photo was never batched this way, matching how it isn't merged
 * with an unrelated one sent separately.
 */
export function MessageAttachmentGrid({ items, onOpen }: { items: AttachmentItem[]; onOpen: (index: number) => void }) {
  const { colors } = useTheme();
  const gateStyles = makeGateStyles(colors);
  const [revealed, setRevealed] = useState(items.length <= 1);

  if (items.length === 0) return null;
  if (revealed) return <GridBody items={items} onOpen={onOpen} />;

  const totalBytes = items.reduce((sum, i) => sum + (i.mediaFileSize ?? 0), 0);
  const knownSize = items.every((i) => typeof i.mediaFileSize === 'number');
  const label =
    items.every((i) => i.mediaType === 'VIDEO')
      ? `${items.length} videos`
      : items.every((i) => i.mediaType === 'IMAGE')
        ? `${items.length} photos`
        : `${items.length} items`;

  return (
    <TouchableOpacity style={[gateStyles.gate]} onPress={() => setRevealed(true)} activeOpacity={0.85}>
      <View style={gateStyles.pill}>
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M12 3v13m0 0l-4-4m4 4l4-4M5 21h14" />
        </Svg>
        <View>
          {knownSize && totalBytes > 0 && <Text style={gateStyles.pillSize}>{formatBytes(totalBytes)}</Text>}
          <Text style={gateStyles.pillLabel}>{label}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function makeGateStyles(colors: Palette) {
  return StyleSheet.create({
    gate: {
      width: GRID_SIZE,
      height: GRID_SIZE,
      borderRadius: 12,
      backgroundColor: 'rgba(0,0,0,0.35)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: 'rgba(0,0,0,0.55)',
      borderRadius: 999,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    pillSize: { fontFamily: fonts.sansBold, fontSize: 13, color: '#ffffff' },
    pillLabel: { fontFamily: fonts.sans, fontSize: 12, color: 'rgba(255,255,255,0.85)' },
  });
}

const styles = StyleSheet.create({
  placeholder: { backgroundColor: 'rgba(0,0,0,0.08)', alignItems: 'center', justifyContent: 'center' },
  retryOverlay: { backgroundColor: 'rgba(0,0,0,0.05)', alignItems: 'center', justifyContent: 'center', gap: 4 },
  retryText: { fontFamily: fonts.sansSemiBold, fontSize: 12 },
  videoBadge: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -18,
    marginLeft: -18,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreOverlay: { alignItems: 'center', justifyContent: 'center' },
  moreText: { fontFamily: fonts.sansBold, fontSize: 22, color: '#ffffff' },
});
