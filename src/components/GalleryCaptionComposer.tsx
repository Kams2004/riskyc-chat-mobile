import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../features/theme/ThemeContext';
import { fonts, gradients, type Palette } from '../theme';

export type PendingGalleryItem = { uri: string; type: 'IMAGE' | 'VIDEO'; mimeType?: string; fileSize?: number };

type GalleryCaptionComposerProps = {
  items: PendingGalleryItem[] | null;
  onCancel: () => void;
  onSend: (caption: string) => Promise<boolean>;
};

/** Same idea as MediaCaptionComposer but for a multi-image/video gallery send — a row of thumbnails instead of one full preview, since there's no room to show every item large. */
export function GalleryCaptionComposer({ items, onCancel, onSend }: GalleryCaptionComposerProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const { t } = useTranslation('media');
  const [caption, setCaption] = useState('');
  const [isSending, setIsSending] = useState(false);

  if (!items || items.length === 0) return null;

  async function handleSend() {
    if (isSending) return;
    setIsSending(true);
    try {
      const succeeded = await onSend(caption);
      if (succeeded) setCaption('');
    } finally {
      setIsSending(false);
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onCancel}>
      <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.closeTouchable} onPress={onCancel}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M18 6L6 18M6 6l12 12" />
          </Svg>
        </TouchableOpacity>

        <View style={styles.previewArea}>
          {items[0].type === 'IMAGE' ? (
            <Image source={{ uri: items[0].uri }} style={styles.mainPreview} resizeMode="contain" />
          ) : (
            <View style={[styles.mainPreview, styles.videoPlaceholder]}>
              <Svg width={40} height={40} viewBox="0 0 24 24" fill={colors.surface}>
                <Path d="M8 5v14l11-7z" />
              </Svg>
            </View>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbRow}>
          {items.map((item, i) => (
            <View key={i} style={styles.thumbWrap}>
              <Image source={{ uri: item.uri }} style={styles.thumb} />
              {item.type === 'VIDEO' && (
                <View style={styles.thumbVideoBadge}>
                  <Svg width={14} height={14} viewBox="0 0 24 24" fill="#ffffff">
                    <Path d="M8 5v14l11-7z" />
                  </Svg>
                </View>
              )}
            </View>
          ))}
        </ScrollView>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[styles.composer, { paddingBottom: insets.bottom + 10 }]}>
            <TextInput
              style={styles.input}
              value={caption}
              onChangeText={setCaption}
              placeholder={t('captionComposer.placeholderWithCount', { count: items.length })}
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
    </Modal>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    closeTouchable: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
    previewArea: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
    mainPreview: { width: '100%', height: '100%', borderRadius: 12 },
    videoPlaceholder: { backgroundColor: colors.brand900, alignItems: 'center', justifyContent: 'center' },
    thumbRow: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
    thumbWrap: { width: 56, height: 56, borderRadius: 8, overflow: 'hidden', marginRight: 8 },
    thumb: { width: '100%', height: '100%' },
    thumbVideoBadge: {
      position: 'absolute',
      top: '50%',
      left: '50%',
      marginTop: -10,
      marginLeft: -10,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    composer: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderTopWidth: 1, borderTopColor: colors.hairline, backgroundColor: colors.surface },
    input: { flex: 1, backgroundColor: colors.tint1, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 11, fontFamily: fonts.sans, fontSize: 14, color: colors.textPrimary },
    sendButton: { width: 44, height: 44, borderRadius: 22 },
    sendTouchable: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  });
}
