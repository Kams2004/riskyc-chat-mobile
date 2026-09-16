import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import { Dimensions, FlatList, Image, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { useMediaUrl } from '../features/media/useMediaUrl';
import type { AttachmentItem } from '../data/db';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

function VideoPage({ objectKey }: { objectKey: string }) {
  const url = useMediaUrl(objectKey);
  const player = useVideoPlayer(url ?? '', (p) => {
    p.loop = false;
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });

  if (!url) return <View style={[styles.page, styles.placeholder]} />;

  return (
    <View style={styles.page}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />
      <TouchableOpacity
        style={styles.playButton}
        onPress={() => (isPlaying ? player.pause() : player.play())}
        activeOpacity={0.8}
      >
        <Svg width={30} height={30} viewBox="0 0 24 24" fill="#ffffff">
          {isPlaying ? <Path d="M6 5h4v14H6zM14 5h4v14h-4z" /> : <Path d="M8 5v14l11-7z" />}
        </Svg>
      </TouchableOpacity>
    </View>
  );
}

function ImagePage({ objectKey }: { objectKey: string }) {
  const url = useMediaUrl(objectKey);
  return (
    <View style={styles.page}>
      {url ? <Image source={{ uri: url }} style={StyleSheet.absoluteFill} resizeMode="contain" /> : <View style={[StyleSheet.absoluteFill, styles.placeholder]} />}
    </View>
  );
}

/** Full-screen swipeable viewer for a message's image/video attachments — opened by tapping any tile in MessageAttachmentGrid (or a single media bubble). */
export function MediaViewer({ items, initialIndex, onClose }: { items: AttachmentItem[]; initialIndex: number; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(initialIndex);

  if (items.length === 0) return null;

  return (
    <Modal visible animationType="fade" onRequestClose={onClose}>
      <View style={styles.container}>
        <FlatList
          data={items}
          keyExtractor={(item) => item.mediaObjectKey}
          horizontal
          pagingEnabled
          initialScrollIndex={initialIndex}
          getItemLayout={(_, i) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * i, index: i })}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH))}
          renderItem={({ item }) =>
            item.mediaType === 'VIDEO' ? <VideoPage objectKey={item.mediaObjectKey} /> : <ImagePage objectKey={item.mediaObjectKey} />
          }
        />

        <TouchableOpacity style={[styles.closeButton, { top: insets.top + 12 }]} onPress={onClose}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M18 6L6 18M6 6l12 12" />
          </Svg>
        </TouchableOpacity>

        {items.length > 1 && (
          <View style={[styles.counter, { top: insets.top + 16 }]}>
            <Text style={styles.counterText}>
              {index + 1} / {items.length}
            </Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  page: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  placeholder: { backgroundColor: '#111' },
  playButton: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -30,
    marginLeft: -30,
    width: 60,
    height: 60,
    borderRadius: 30,
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
  counter: { position: 'absolute', alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  counterText: { color: '#ffffff', fontSize: 13, fontWeight: '600' },
});
