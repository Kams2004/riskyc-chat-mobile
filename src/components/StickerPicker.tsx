import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { uploadMedia } from '../features/media/api';
import { useMediaUrl } from '../features/media/useMediaUrl';
import { deleteSavedSticker, listSavedStickers, saveSticker, type StickerItem } from '../features/stickers/api';
import { invalidateSavedStickerKeys } from '../features/stickers/savedKeysCache';
import { useTheme } from '../features/theme/ThemeContext';
import { type Palette } from '../theme';

function StickerTile({ objectKey, size, onPick, onLongPress }: { objectKey: string; size: number; onPick: () => void; onLongPress: () => void }) {
  const url = useMediaUrl(objectKey);
  return (
    <TouchableOpacity style={{ width: size, height: size, padding: 4 }} onPress={onPick} onLongPress={onLongPress}>
      {url && <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />}
    </TouchableOpacity>
  );
}

type StickerPickerProps = {
  visible: boolean;
  onClose: () => void;
  onPick: (objectKey: string) => void;
};

/**
 * WhatsApp-style sticker tray — the signed-in user's own saved collection
 * (built via "Create sticker" or by saving one someone sent, see
 * StickerMessage), not a curated built-in pack (no bundled sticker artwork
 * ships with this app).
 */
export function StickerPicker({ visible, onClose, onPick }: StickerPickerProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const [stickers, setStickers] = useState<StickerItem[] | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    listSavedStickers()
      .then(setStickers)
      .catch(() => setStickers([]));
  }, [visible]);

  async function handleCreateSticker() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo library access needed', 'Allow photo access to create a sticker from a picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (result.canceled || result.assets.length === 0) return;
    setIsUploading(true);
    try {
      const asset = result.assets[0];
      const objectKey = await uploadMedia(asset.uri, asset.mimeType ?? 'image/jpeg');
      await saveSticker(objectKey);
      invalidateSavedStickerKeys();
      setStickers((prev) => [{ objectKey, savedAt: new Date().toISOString() }, ...(prev ?? [])]);
    } catch {
      Alert.alert('Could not create that sticker', 'Please try again.');
    } finally {
      setIsUploading(false);
    }
  }

  function confirmRemove(objectKey: string) {
    Alert.alert('Remove sticker', 'Remove this sticker from your collection?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setStickers((prev) => (prev ?? []).filter((s) => s.objectKey !== objectKey));
          try {
            await deleteSavedSticker(objectKey);
            invalidateSavedStickerKeys();
          } catch {
            // best-effort
          }
        },
      },
    ]);
  }

  const tileSize = 84;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.handle} />
        <FlatList
          data={stickers ?? []}
          keyExtractor={(item) => item.objectKey}
          numColumns={4}
          style={{ maxHeight: 340 }}
          ListHeaderComponent={
            <TouchableOpacity style={[styles.createTile, { width: tileSize, height: tileSize }]} onPress={handleCreateSticker} disabled={isUploading}>
              {isUploading ? (
                <ActivityIndicator color={colors.brand600} />
              ) : (
                <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.brand600} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M12 5v14M5 12h14" />
                </Svg>
              )}
            </TouchableOpacity>
          }
          ListEmptyComponent={
            stickers !== null ? (
              <Text style={styles.emptyText}>No stickers yet — create one from a picture, or save one someone sends you.</Text>
            ) : (
              <ActivityIndicator style={{ marginTop: 20 }} color={colors.brand600} />
            )
          }
          renderItem={({ item }) => (
            <StickerTile
              objectKey={item.objectKey}
              size={tileSize}
              onPick={() => onPick(item.objectKey)}
              onLongPress={() => confirmRemove(item.objectKey)}
            />
          )}
        />
      </View>
    </Modal>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingTop: 10,
      paddingHorizontal: 12,
    },
    handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.tint2, alignSelf: 'center', marginBottom: 10 },
    createTile: {
      borderRadius: 12,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.tint2,
      backgroundColor: colors.tint1,
      alignItems: 'center',
      justifyContent: 'center',
      margin: 4,
    },
    emptyText: { color: colors.textMuted, fontSize: 13, padding: 16, textAlign: 'center' },
  });
}
