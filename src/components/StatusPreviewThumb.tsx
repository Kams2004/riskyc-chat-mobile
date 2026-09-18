import { useVideoPlayer, VideoView } from 'expo-video';
import { Image, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useMediaUrl } from '../features/media/useMediaUrl';
import type { StatusItem } from '../features/status/api';

/**
 * Replaces the plain avatar inside a status ring with an actual preview of
 * that status's content — an image/video frame, or the text status's own
 * background color + a text glyph — the "appropriate sign that a person
 * has posted a status" the Status list row shows instead of just their
 * profile picture.
 */
export function StatusPreviewThumb({ item, size }: { item: StatusItem; size: number }) {
  if (item.mediaType === 'TEXT') {
    return (
      <View style={[styles.fill, { backgroundColor: item.backgroundColor ?? '#25d366' }]}>
        <Svg width={size * 0.4} height={size * 0.4} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M4 7V4h16v3M9 20h6M12 4v16" />
        </Svg>
      </View>
    );
  }
  if (item.mediaType === 'VIDEO') {
    return <VideoThumb objectKey={item.mediaObjectKey} />;
  }
  return <ImageThumb objectKey={item.mediaObjectKey} />;
}

function ImageThumb({ objectKey }: { objectKey: string | null }) {
  const url = useMediaUrl(objectKey);
  if (!url) return <View style={[styles.fill, styles.placeholder]} />;
  return <Image source={{ uri: url }} style={styles.fill} resizeMode="cover" />;
}

// Same paused+muted-VideoView-as-thumbnail technique as MessageAttachmentGrid's own VideoTile.
function VideoThumb({ objectKey }: { objectKey: string | null }) {
  const url = useMediaUrl(objectKey);
  const player = useVideoPlayer(url ?? '', (p) => {
    p.muted = true;
  });
  if (!url) return <View style={[styles.fill, styles.placeholder]} />;
  return <VideoView player={player} style={styles.fill} contentFit="cover" nativeControls={false} />;
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  placeholder: { backgroundColor: 'rgba(0,0,0,0.08)' },
});
