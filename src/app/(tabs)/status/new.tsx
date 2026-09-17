import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { uploadMedia } from '../../../features/media/api';
import { createStatus } from '../../../features/status/api';
import { fonts } from '../../../theme';

const BACKGROUND_PRESETS = ['#e6004a', '#075e54', '#128c7e', '#25d366', '#34495e', '#8e44ad', '#d35400', '#2c3e50'];

type PendingMedia = { uri: string; type: 'IMAGE' | 'VIDEO'; mimeType?: string };

export default function NewStatusScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation('status');

  const [mode, setMode] = useState<'menu' | 'media' | 'text'>('menu');
  const [media, setMedia] = useState<PendingMedia | null>(null);
  const [caption, setCaption] = useState('');
  const [text, setText] = useState('');
  const [bgColor, setBgColor] = useState(BACKGROUND_PRESETS[0]);
  const [posting, setPosting] = useState(false);

  const videoPlayer = useVideoPlayer(media?.type === 'VIDEO' ? media.uri : '', (p) => {
    p.loop = true;
    p.play();
  });

  function close() {
    router.back();
  }

  async function pickFromCamera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('composer.permissionNeededTitle'), t('composer.cameraPermissionBody'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images', 'videos'], quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setMedia({ uri: asset.uri, type: asset.type === 'video' ? 'VIDEO' : 'IMAGE', mimeType: asset.mimeType });
      setMode('media');
    }
  }

  async function pickFromGallery() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('composer.permissionNeededTitle'), t('composer.galleryPermissionBody'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setMedia({ uri: asset.uri, type: asset.type === 'video' ? 'VIDEO' : 'IMAGE', mimeType: asset.mimeType });
      setMode('media');
    }
  }

  async function postMedia() {
    if (!media || posting) return;
    setPosting(true);
    try {
      const objectKey = await uploadMedia(media.uri, media.mimeType ?? (media.type === 'VIDEO' ? 'video/mp4' : 'image/jpeg'));
      await createStatus({
        mediaType: media.type,
        mediaObjectKey: objectKey,
        textContent: caption.trim() || null,
      });
      close();
    } catch (e) {
      console.warn('[NewStatusScreen] postMedia failed', e);
      Alert.alert(t('composer.postFailedTitle'), t('composer.postFailedBody'));
    } finally {
      setPosting(false);
    }
  }

  async function postText() {
    if (!text.trim() || posting) return;
    setPosting(true);
    try {
      await createStatus({ mediaType: 'TEXT', textContent: text.trim(), backgroundColor: bgColor });
      close();
    } catch (e) {
      console.warn('[NewStatusScreen] postText failed', e);
      Alert.alert(t('composer.postFailedTitle'), t('composer.postFailedBody'));
    } finally {
      setPosting(false);
    }
  }

  if (mode === 'media' && media) {
    return (
      <View style={styles.fullScreen}>
        {media.type === 'IMAGE' ? (
          <Image source={{ uri: media.uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
        ) : (
          <VideoView player={videoPlayer} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />
        )}
        <TouchableOpacity style={[styles.closeButton, { top: insets.top + 12 }]} onPress={() => setMode('menu')}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2.4} strokeLinecap="round">
            <Path d="M18 6L6 18M6 6l12 12" />
          </Svg>
        </TouchableOpacity>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.captionBar, { paddingBottom: insets.bottom + 16 }]}
        >
          <TextInput
            style={styles.captionInput}
            placeholder={t('composer.textPlaceholder')}
            placeholderTextColor="rgba(255,255,255,0.6)"
            value={caption}
            onChangeText={setCaption}
            multiline
          />
          <TouchableOpacity style={styles.sendButton} onPress={postMedia} disabled={posting}>
            {posting ? <ActivityIndicator color="#ffffff" /> : (
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="#ffffff">
                <Path d="M2 21l21-9L2 3v7l15 2-15 2z" />
              </Svg>
            )}
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </View>
    );
  }

  if (mode === 'text') {
    return (
      <View style={[styles.fullScreen, { backgroundColor: bgColor }]}>
        <TouchableOpacity style={[styles.closeButton, { top: insets.top + 12 }]} onPress={() => setMode('menu')}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2.4} strokeLinecap="round">
            <Path d="M18 6L6 18M6 6l12 12" />
          </Svg>
        </TouchableOpacity>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.textComposerBody}>
          <TextInput
            style={styles.textInput}
            placeholder={t('composer.textPlaceholder')}
            placeholderTextColor="rgba(255,255,255,0.7)"
            value={text}
            onChangeText={setText}
            multiline
            autoFocus
            textAlign="center"
          />
        </KeyboardAvoidingView>
        <View style={[styles.textComposerFooter, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.swatchRow}>
            {BACKGROUND_PRESETS.map((c) => (
              <TouchableOpacity
                key={c}
                onPress={() => setBgColor(c)}
                style={[styles.swatch, { backgroundColor: c }, c === bgColor && styles.swatchSelected]}
              />
            ))}
          </View>
          <TouchableOpacity style={styles.sendButton} onPress={postText} disabled={posting || !text.trim()}>
            {posting ? <ActivityIndicator color="#ffffff" /> : (
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="#ffffff">
                <Path d="M2 21l21-9L2 3v7l15 2-15 2z" />
              </Svg>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.fullScreen, styles.menuScreen]}>
      <TouchableOpacity style={[styles.closeButton, { top: insets.top + 12 }]} onPress={close}>
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2.4} strokeLinecap="round">
          <Path d="M18 6L6 18M6 6l12 12" />
        </Svg>
      </TouchableOpacity>
      <Text style={styles.menuTitle}>{t('composer.headerTitle')}</Text>
      <View style={styles.menuOptions}>
        <TouchableOpacity style={styles.menuOption} onPress={pickFromCamera}>
          <View style={styles.menuIcon}>
            <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <Path d="M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
            </Svg>
          </View>
          <Text style={styles.menuLabel}>{t('composer.cameraTab')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuOption} onPress={pickFromGallery}>
          <View style={styles.menuIcon}>
            <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z" />
              <Path d="M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" />
              <Path d="M21 15l-5-5L5 21" />
            </Svg>
          </View>
          <Text style={styles.menuLabel}>{t('composer.galleryTab')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuOption} onPress={() => setMode('text')}>
          <View style={styles.menuIcon}>
            <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M4 7V4h16v3M9 20h6M12 4v16" />
            </Svg>
          </View>
          <Text style={styles.menuLabel}>{t('composer.textTab')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fullScreen: { flex: 1, backgroundColor: '#000000' },
  menuScreen: { alignItems: 'center', justifyContent: 'center' },
  closeButton: {
    position: 'absolute',
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  menuTitle: { fontFamily: fonts.sansBold, fontSize: 20, color: '#ffffff', marginBottom: 40 },
  menuOptions: { flexDirection: 'row', gap: 28 },
  menuOption: { alignItems: 'center', gap: 8 },
  menuIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: '#ffffff' },
  captionBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 16 },
  captionInput: {
    flex: 1,
    maxHeight: 100,
    color: '#ffffff',
    fontFamily: fonts.sans,
    fontSize: 15,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sendButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#e6004a', alignItems: 'center', justifyContent: 'center' },
  textComposerBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  textInput: { fontFamily: fonts.sansSemiBold, fontSize: 26, color: '#ffffff', textAlign: 'center' },
  textComposerFooter: { paddingHorizontal: 16, gap: 16, alignItems: 'center' },
  swatchRow: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  swatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  swatchSelected: { borderColor: '#ffffff' },
});
