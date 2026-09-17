import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../../../features/auth/AuthContext';
import { uploadMedia } from '../../../features/media/api';
import { broadcastFromSystemAccount } from '../../../features/systemAccount/api';
import { useTheme } from '../../../features/theme/ThemeContext';
import { fonts, type Palette } from '../../../theme';

type PendingMedia = { uri: string; type: 'IMAGE' | 'VIDEO'; mimeType?: string };

/**
 * The official account's own composer — a single message fanned out to
 * every user's 1:1 with this account (see SystemAccountController#broadcast).
 * Only ever reachable from the Chats list's own FAB, which itself only
 * swaps to this when the signed-in account IS the official account (see
 * chats/index.tsx).
 */
export default function BroadcastScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const { displayName, avatarObjectKey } = useAuth();
  const { t } = useTranslation('chats');

  const [text, setText] = useState('');
  const [media, setMedia] = useState<PendingMedia | null>(null);
  const [sending, setSending] = useState(false);

  async function pickMedia() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('thread.permission.neededTitle'), t('thread.permission.photoLibraryBody'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setMedia({ uri: asset.uri, type: asset.type === 'video' ? 'VIDEO' : 'IMAGE', mimeType: asset.mimeType });
    }
  }

  function confirmSend() {
    Alert.alert(t('broadcast.confirmTitle'), t('broadcast.confirmBody'), [
      { text: t('common:cancel'), style: 'cancel' },
      { text: t('broadcast.send'), onPress: doSend },
    ]);
  }

  async function doSend() {
    setSending(true);
    try {
      const objectKey = media ? await uploadMedia(media.uri, media.mimeType ?? (media.type === 'VIDEO' ? 'video/mp4' : 'image/jpeg')) : null;
      await broadcastFromSystemAccount({
        text: text.trim() || null,
        mediaType: media?.type ?? null,
        mediaObjectKey: objectKey,
        senderDisplayName: displayName,
        senderAvatarObjectKey: avatarObjectKey,
      });
      router.back();
    } catch (e) {
      console.warn('[BroadcastScreen] send failed', e);
      Alert.alert(t('broadcast.failedTitle'), t('common:checkConnectionAndRetry'));
    } finally {
      setSending(false);
    }
  }

  const canSend = (text.trim().length > 0 || !!media) && !sending;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconTouchable} onPress={() => router.back()}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M18 6L6 18M6 6l12 12" />
          </Svg>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('broadcast.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={styles.hint}>{t('broadcast.hint')}</Text>

      {media && (
        <View style={styles.mediaPreviewWrap}>
          <Image source={{ uri: media.uri }} style={styles.mediaPreview} resizeMode="cover" />
          <TouchableOpacity style={styles.mediaRemove} onPress={() => setMedia(null)}>
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="#ffffff">
              <Path d="M18 6L6 18M6 6l12 12" />
            </Svg>
          </TouchableOpacity>
        </View>
      )}

      <TextInput
        style={styles.input}
        placeholder={t('broadcast.placeholder')}
        placeholderTextColor={colors.textMuted}
        value={text}
        onChangeText={setText}
        multiline
      />

      <View style={styles.footer}>
        <TouchableOpacity style={styles.attachButton} onPress={pickMedia}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.brand500} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </Svg>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.sendButton, !canSend && styles.sendButtonDisabled]} onPress={confirmSend} disabled={!canSend}>
          {sending ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.sendLabel}>{t('broadcast.send')}</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 20 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    iconTouchable: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontFamily: fonts.sansSemiBold, fontSize: 16.5, color: colors.textPrimary },
    hint: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.textMuted, marginBottom: 16 },
    mediaPreviewWrap: { width: 120, height: 120, borderRadius: 12, overflow: 'hidden', marginBottom: 12 },
    mediaPreview: { width: '100%', height: '100%' },
    mediaRemove: {
      position: 'absolute',
      top: 6,
      right: 6,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    input: {
      flex: 1,
      fontFamily: fonts.sans,
      fontSize: 16,
      color: colors.textPrimary,
      textAlignVertical: 'top',
    },
    footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12 },
    attachButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tint1 },
    sendButton: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 22, backgroundColor: colors.brand600 },
    sendButtonDisabled: { opacity: 0.5 },
    sendLabel: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: '#ffffff' },
  });
}
