import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useMediaUrl } from '../features/media/useMediaUrl';
import { useTheme } from '../features/theme/ThemeContext';
import { fonts } from '../theme';
import type { AttachmentItem } from '../data/db';

const GRID_SIZE = 220;
const GAP = 3;

function Tile({ item, size, onPress, overlay }: { item: AttachmentItem; size: number; onPress: () => void; overlay?: React.ReactNode }) {
  const url = useMediaUrl(item.mediaObjectKey);
  return (
    <TouchableOpacity onPress={onPress} style={{ width: size, height: size }} activeOpacity={0.85}>
      {url ? <Image source={{ uri: url }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <View style={[StyleSheet.absoluteFill, styles.placeholder]} />}
      {item.mediaType === 'VIDEO' && (
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

/**
 * WhatsApp-style collage for a multi-image/video message: 1 item fills the
 * space, 2-4 split evenly, 5+ shows the first 4 with a "+N" overlay on the
 * last tile. Tapping any tile opens MediaViewer at that index.
 */
export function MessageAttachmentGrid({ items, onOpen }: { items: AttachmentItem[]; onOpen: (index: number) => void }) {
  const { colors } = useTheme();

  if (items.length === 0) return null;

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

const styles = StyleSheet.create({
  placeholder: { backgroundColor: 'rgba(0,0,0,0.08)' },
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
