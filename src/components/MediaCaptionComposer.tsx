import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../features/theme/ThemeContext';
import { fonts, gradients, type Palette } from '../theme';
import { ImageEditor } from './ImageEditor';
import { EMPTY_OVERLAY, serializeOverlay, StatusOverlayView, type StatusOverlay } from './StatusOverlayView';

export type PendingMedia = { kind: 'image'; uri: string } | { kind: 'file'; uri: string; name: string; size?: number | null };

function formatFileSize(bytes?: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type MediaCaptionComposerProps = {
  media: PendingMedia | null;
  onCancel: () => void;
  /** Receives the (possibly crop/rotate-edited) uri and any drawing overlay, not just the original media.uri — see ImageEditor's own comment on why crop/rotate bake into new image bytes while drawing stays a separate overlay. */
  onSend: (caption: string, uri: string, overlayJson: string | null) => Promise<boolean>;
};

/** WhatsApp-style preview-with-caption screen shown before actually sending a picked photo or document. An image additionally gets an "Edit" button opening ImageEditor for crop/rotate/draw. */
export function MediaCaptionComposer({ media, onCancel, onSend }: MediaCaptionComposerProps) {
  const { colors } = useTheme();
  const { t } = useTranslation('media');
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const [caption, setCaption] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [workingUri, setWorkingUri] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<StatusOverlay>(EMPTY_OVERLAY);
  const [editorVisible, setEditorVisible] = useState(false);
  const [previewSize, setPreviewSize] = useState({ width: 1, height: 1 });

  useEffect(() => {
    setCaption('');
    setOverlay(EMPTY_OVERLAY);
    setWorkingUri(media?.uri ?? null);
  }, [media]);

  if (!media || !workingUri) return null;

  async function handleSend() {
    if (isSending || !workingUri) return;
    setIsSending(true);
    try {
      const succeeded = await onSend(caption, workingUri, serializeOverlay(overlay));
      if (succeeded) setCaption('');
    } finally {
      setIsSending(false);
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onCancel}>
      <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.closeTouchable} onPress={onCancel}>
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M18 6L6 18M6 6l12 12" />
            </Svg>
          </TouchableOpacity>
          {media.kind === 'image' && (
            <TouchableOpacity style={styles.editTouchable} onPress={() => setEditorVisible(true)}>
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
              </Svg>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.previewArea}>
          {media.kind === 'image' ? (
            <View
              style={styles.imagePreviewWrap}
              onLayout={(e) => setPreviewSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
            >
              <Image source={{ uri: workingUri }} style={styles.imagePreview} resizeMode="contain" />
              <StatusOverlayView overlay={overlay} width={previewSize.width} height={previewSize.height} />
            </View>
          ) : (
            <View style={styles.filePreview}>
              <View style={styles.fileIconCircle}>
                <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <Path d="M14 2v6h6" />
                </Svg>
              </View>
              <Text style={styles.fileName} numberOfLines={2}>{media.name}</Text>
              {!!media.size && <Text style={styles.fileSize}>{formatFileSize(media.size)}</Text>}
            </View>
          )}
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[styles.composer, { paddingBottom: insets.bottom + 10 }]}>
            <TextInput
              style={styles.input}
              value={caption}
              onChangeText={setCaption}
              placeholder={t('captionComposer.placeholder')}
              placeholderTextColor={colors.textMuted}
              multiline
            />
            <LinearGradient colors={gradients.gold} style={styles.sendButton}>
              <TouchableOpacity onPress={handleSend} style={styles.sendTouchable} disabled={isSending}>
                {isSending ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Svg width={19} height={19} viewBox="0 0 24 24" fill="#ffffff">
                    <Path d="M2 12l19-9-7 19-3-8-9-2z" />
                  </Svg>
                )}
              </TouchableOpacity>
            </LinearGradient>
          </View>
        </KeyboardAvoidingView>
      </View>

      {media.kind === 'image' && (
        <ImageEditor
          visible={editorVisible}
          uri={workingUri}
          initialOverlay={overlay}
          onCancel={() => setEditorVisible(false)}
          onConfirm={({ uri, overlay: nextOverlay }) => {
            setWorkingUri(uri);
            setOverlay(nextOverlay);
            setEditorVisible(false);
          }}
        />
      )}
    </Modal>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    closeTouchable: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
    editTouchable: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: 6 },
    previewArea: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
    imagePreviewWrap: { width: '100%', height: '100%' },
    imagePreview: { width: '100%', height: '100%' },
    filePreview: { alignItems: 'center', gap: 12 },
    fileIconCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.brand600, alignItems: 'center', justifyContent: 'center' },
    fileName: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.textPrimary, textAlign: 'center', paddingHorizontal: 24 },
    fileSize: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.textMuted },
    composer: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderTopWidth: 1, borderTopColor: colors.hairline, backgroundColor: colors.surface },
    input: { flex: 1, backgroundColor: colors.tint1, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 11, fontFamily: fonts.sans, fontSize: 14, color: colors.textPrimary },
    sendButton: { width: 44, height: 44, borderRadius: 22 },
    sendTouchable: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  });
}
