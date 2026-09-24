import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useMediaUrl } from '../features/media/useMediaUrl';
import { saveSticker } from '../features/stickers/api';
import { getSavedStickerKeys, invalidateSavedStickerKeys } from '../features/stickers/savedKeysCache';

/** WhatsApp renders a sticker with no bubble chrome at all — just the image over the wallpaper — unlike every other message type. Shows a "save to my stickers" button unless it's already in the viewer's own collection. */
export function StickerMessage({ objectKey }: { objectKey: string }) {
  const url = useMediaUrl(objectKey);
  const [isSaved, setIsSaved] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSavedStickerKeys().then((keys) => {
      if (!cancelled) setIsSaved(keys.has(objectKey));
    });
    return () => {
      cancelled = true;
    };
  }, [objectKey]);

  async function handleSave() {
    setIsSaved(true);
    try {
      await saveSticker(objectKey);
      invalidateSavedStickerKeys();
    } catch {
      setIsSaved(false);
    }
  }

  return (
    <View style={styles.container}>
      {url ? (
        <Image source={{ uri: url }} style={styles.image} resizeMode="contain" />
      ) : (
        <View style={styles.placeholder}>
          <ActivityIndicator color="#ffffff" />
        </View>
      )}
      {isSaved === false && (
        <TouchableOpacity style={styles.saveButton} onPress={handleSave} hitSlop={8}>
          <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M12 3v13m0 0l-4-4m4 4l4-4M5 21h14" />
          </Svg>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: 140, height: 140 },
  image: { width: '100%', height: '100%' },
  placeholder: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  saveButton: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
