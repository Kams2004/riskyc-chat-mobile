import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { StatusDrawingCanvas } from '../../../components/StatusDrawingCanvas';
import { EMPTY_OVERLAY, serializeOverlay, type StatusOverlay } from '../../../components/StatusOverlayView';
import { uploadMedia } from '../../../features/media/api';
import { createStatus } from '../../../features/status/api';
import { fonts } from '../../../theme';

const BACKGROUND_PRESETS = ['#e6004a', '#075e54', '#128c7e', '#25d366', '#34495e', '#8e44ad', '#d35400', '#2c3e50'];
const DRAW_COLORS = ['#ffffff', '#f44336', '#ff9800', '#ffeb3b', '#4caf50', '#00bcd4', '#2196f3', '#9c27b0', '#000000'];

type PendingItem = {
  id: string;
  media: { uri: string; type: 'IMAGE' | 'VIDEO'; mimeType?: string } | null;
  textValue: string;
  bgColor: string;
  caption: string;
  overlay: StatusOverlay;
};

function newMediaItem(uri: string, type: 'IMAGE' | 'VIDEO', mimeType?: string): PendingItem {
  return { id: randomUUID(), media: { uri, type, mimeType }, textValue: '', bgColor: BACKGROUND_PRESETS[0], caption: '', overlay: EMPTY_OVERLAY };
}

function newTextItem(): PendingItem {
  return { id: randomUUID(), media: null, textValue: '', bgColor: BACKGROUND_PRESETS[0], caption: '', overlay: EMPTY_OVERLAY };
}

export default function NewStatusScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { t } = useTranslation('status');
  const { mode } = useLocalSearchParams<{ mode?: 'camera' | 'text' }>();

  const [items, setItems] = useState<PendingItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeTool, setActiveTool] = useState<'none' | 'draw' | 'textOverlay'>('none');
  const [drawColor, setDrawColor] = useState(DRAW_COLORS[0]);
  const [textOverlayDraft, setTextOverlayDraft] = useState('');
  const [posting, setPosting] = useState(false);

  const current = items[activeIndex] ?? null;

  const videoPlayer = useVideoPlayer(current?.media?.type === 'VIDEO' ? current.media.uri : '', (p) => {
    p.loop = true;
    p.play();
  });

  function updateCurrent(patch: Partial<PendingItem>) {
    setItems((prev) => prev.map((it, i) => (i === activeIndex ? { ...it, ...patch } : it)));
  }

  function addItem(item: PendingItem) {
    setItems((prev) => [...prev, item]);
    setActiveIndex(items.length);
    setActiveTool('none');
  }

  function removeItem(index: number) {
    setItems((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next;
    });
    setActiveIndex((prev) => {
      const remaining = items.length - 1;
      if (remaining <= 0) return 0;
      return Math.min(prev, remaining - 1);
    });
  }

  function swipe(direction: 1 | -1) {
    setActiveIndex((i) => Math.max(0, Math.min(items.length - 1, i + direction)));
  }

  const SWIPE_THRESHOLD = 60;
  // Recreated each render (see StatusDrawingCanvas's own doc comment on the
  // same pattern) so it always reads the current `activeTool`/`items`
  // instead of a stale first-render snapshot. Only claims horizontal drags
  // — a mostly-vertical touch (e.g. scrolling) is left alone.
  const swipeResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_e, gesture) => activeTool === 'none' && Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderRelease: (_e, gesture) => {
      if (gesture.dx <= -SWIPE_THRESHOLD) swipe(1);
      else if (gesture.dx >= SWIPE_THRESHOLD) swipe(-1);
    },
  });

  async function pickFromCamera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('composer.permissionNeededTitle'), t('composer.cameraPermissionBody'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images', 'videos'], quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      addItem(newMediaItem(asset.uri, asset.type === 'video' ? 'VIDEO' : 'IMAGE', asset.mimeType));
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
      addItem(newMediaItem(asset.uri, asset.type === 'video' ? 'VIDEO' : 'IMAGE', asset.mimeType));
    }
  }

  function addTextItem() {
    addItem(newTextItem());
  }

  // Launched directly from the Status list's own camera/pencil quick-action
  // icons (see status/index.tsx's "My status" row) instead of always
  // landing on the plain camera/gallery/text menu first.
  useEffect(() => {
    if (mode === 'camera') pickFromCamera();
    else if (mode === 'text') addTextItem();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function confirmDiscard() {
    Alert.alert(t('composer.discardTitle'), t('composer.discardBody'), [
      { text: t('composer.keepEditing'), style: 'cancel' },
      { text: t('composer.discard'), style: 'destructive', onPress: () => router.back() },
    ]);
  }

  function onClosePress() {
    if (items.length === 0) {
      router.back();
    } else {
      confirmDiscard();
    }
  }

  function openTextOverlayEditor() {
    setTextOverlayDraft(current?.overlay.text?.text ?? '');
    setActiveTool('textOverlay');
  }

  function commitTextOverlay() {
    if (!current) return;
    const trimmed = textOverlayDraft.trim();
    updateCurrent({
      overlay: { ...current.overlay, text: trimmed ? { text: trimmed, color: '#ffffff', x: 0.5, y: 0.45 } : null },
    });
    setActiveTool('none');
  }

  async function postAll() {
    if (items.length === 0 || posting) return;
    setPosting(true);
    try {
      for (const item of items) {
        if (item.media) {
          const objectKey = await uploadMedia(item.media.uri, item.media.mimeType ?? (item.media.type === 'VIDEO' ? 'video/mp4' : 'image/jpeg'));
          await createStatus({
            mediaType: item.media.type,
            mediaObjectKey: objectKey,
            textContent: item.caption.trim() || null,
            overlayJson: serializeOverlay(item.overlay),
          });
        } else {
          if (!item.textValue.trim()) continue;
          await createStatus({ mediaType: 'TEXT', textContent: item.textValue.trim(), backgroundColor: item.bgColor });
        }
      }
      router.back();
    } catch (e) {
      console.warn('[NewStatusScreen] postAll failed', e);
      Alert.alert(t('composer.postFailedTitle'), t('composer.postFailedBody'));
    } finally {
      setPosting(false);
    }
  }

  const canvasHeight = height;

  return (
    <View style={styles.fullScreen}>
      {/* Menu (no items chosen yet) */}
      {items.length === 0 && (
        <View style={styles.menuScreen}>
          <TouchableOpacity style={[styles.closeButton, { top: insets.top + 12 }]} onPress={() => router.back()}>
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
            <TouchableOpacity style={styles.menuOption} onPress={addTextItem}>
              <View style={styles.menuIcon}>
                <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M4 7V4h16v3M9 20h6M12 4v16" />
                </Svg>
              </View>
              <Text style={styles.menuLabel}>{t('composer.textTab')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Editing a pending item */}
      {current && (
        <View style={styles.fullScreen}>
          {current.media ? (
            <View style={StyleSheet.absoluteFill} {...swipeResponder.panHandlers}>
              {current.media.type === 'IMAGE' ? (
                <Image source={{ uri: current.media.uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
              ) : (
                <VideoView player={videoPlayer} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />
              )}
              <StatusDrawingCanvas
                overlay={current.overlay}
                onChangeOverlay={(overlay) => updateCurrent({ overlay })}
                color={drawColor}
                width={width}
                height={canvasHeight}
                active={activeTool === 'draw'}
              />
            </View>
          ) : (
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={[StyleSheet.absoluteFill, styles.textSlide, { backgroundColor: current.bgColor }]}
            >
              <TextInput
                style={styles.textSlideInput}
                placeholder={t('composer.textPlaceholder')}
                placeholderTextColor="rgba(255,255,255,0.7)"
                value={current.textValue}
                onChangeText={(v) => updateCurrent({ textValue: v })}
                multiline
                autoFocus
                textAlign="center"
              />
            </KeyboardAvoidingView>
          )}

          <TouchableOpacity style={[styles.closeButton, { top: insets.top + 12 }]} onPress={onClosePress}>
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2.4} strokeLinecap="round">
              <Path d="M18 6L6 18M6 6l12 12" />
            </Svg>
          </TouchableOpacity>

          {/* Top-right toolbar: text-overlay + pencil, media items only */}
          {current.media && activeTool !== 'draw' && (
            <View style={[styles.topToolbar, { top: insets.top + 12 }]}>
              <TouchableOpacity style={styles.toolButton} onPress={openTextOverlayEditor}>
                <Text style={styles.toolButtonAa}>Aa</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.toolButton} onPress={() => setActiveTool('draw')}>
                <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M12 19l7-7 3 3-7 7-3-3z" />
                  <Path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                  <Path d="M2 2l7.586 7.586" />
                  <Path d="M11 11a1 1 0 1 0-2-2 1 1 0 0 0 2 2z" />
                </Svg>
              </TouchableOpacity>
            </View>
          )}

          {/* Draw mode toolbar: color strip + done */}
          {activeTool === 'draw' && (
            <>
              <TouchableOpacity style={[styles.doneDrawButton, { top: insets.top + 12 }]} onPress={() => setActiveTool('none')}>
                <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M20 6L9 17l-5-5" />
                </Svg>
              </TouchableOpacity>
              <View style={[styles.colorStrip, { top: insets.top + 60 }]}>
                {DRAW_COLORS.map((c) => (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setDrawColor(c)}
                    style={[styles.colorSwatch, { backgroundColor: c }, c === drawColor && styles.colorSwatchSelected]}
                  />
                ))}
              </View>
            </>
          )}

          {/* Text-overlay editing */}
          {activeTool === 'textOverlay' && (
            <KeyboardAvoidingView style={StyleSheet.absoluteFill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
              <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={commitTextOverlay} />
              <View style={styles.textOverlayEditorWrap} pointerEvents="box-none">
                <TextInput
                  style={styles.textOverlayInput}
                  placeholder={t('composer.textOverlayPlaceholder')}
                  placeholderTextColor="rgba(255,255,255,0.7)"
                  value={textOverlayDraft}
                  onChangeText={setTextOverlayDraft}
                  autoFocus
                  multiline
                  textAlign="center"
                  onSubmitEditing={commitTextOverlay}
                />
              </View>
              <TouchableOpacity style={[styles.doneDrawButton, { top: insets.top + 12 }]} onPress={commitTextOverlay}>
                <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M20 6L9 17l-5-5" />
                </Svg>
              </TouchableOpacity>
            </KeyboardAvoidingView>
          )}

          {/* Bottom: pending-item thumbnails + caption/swatches + send */}
          {activeTool === 'none' && (
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={[styles.bottomArea, { paddingBottom: insets.bottom + 16 }]}
            >
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbRow}>
                {items.map((item, index) => (
                  <TouchableOpacity key={item.id} onPress={() => setActiveIndex(index)} style={[styles.thumbWrap, index === activeIndex && styles.thumbWrapActive]}>
                    {item.media ? (
                      <Image source={{ uri: item.media.uri }} style={styles.thumbImage} resizeMode="cover" />
                    ) : (
                      <View style={[styles.thumbImage, { backgroundColor: item.bgColor, alignItems: 'center', justifyContent: 'center' }]}>
                        <Text style={styles.thumbTextIcon}>Aa</Text>
                      </View>
                    )}
                    <TouchableOpacity style={styles.thumbTrash} onPress={() => removeItem(index)}>
                      <Svg width={12} height={12} viewBox="0 0 24 24" fill="#ffffff">
                        <Path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
                      </Svg>
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={styles.addMoreBlob} onPress={pickFromGallery}>
                  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2.4} strokeLinecap="round">
                    <Path d="M12 5v14M5 12h14" />
                  </Svg>
                </TouchableOpacity>
              </ScrollView>

              <View style={styles.bottomRow}>
                {current.media ? (
                  <TextInput
                    style={styles.captionInput}
                    placeholder={t('composer.textPlaceholder')}
                    placeholderTextColor="rgba(255,255,255,0.6)"
                    value={current.caption}
                    onChangeText={(v) => updateCurrent({ caption: v })}
                    multiline
                  />
                ) : (
                  <View style={styles.swatchRow}>
                    {BACKGROUND_PRESETS.map((c) => (
                      <TouchableOpacity
                        key={c}
                        onPress={() => updateCurrent({ bgColor: c })}
                        style={[styles.swatch, { backgroundColor: c }, c === current.bgColor && styles.swatchSelected]}
                      />
                    ))}
                  </View>
                )}
                <TouchableOpacity style={styles.sendButton} onPress={postAll} disabled={posting}>
                  {posting ? <ActivityIndicator color="#ffffff" /> : (
                    <Svg width={20} height={20} viewBox="0 0 24 24" fill="#ffffff">
                      <Path d="M2 21l21-9L2 3v7l15 2-15 2z" />
                    </Svg>
                  )}
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fullScreen: { flex: 1, backgroundColor: '#000000' },
  menuScreen: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  closeButton: {
    position: 'absolute',
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
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
  topToolbar: { position: 'absolute', right: 16, gap: 12, zIndex: 5 },
  toolButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolButtonAa: { fontFamily: fonts.sansBold, fontSize: 15, color: '#ffffff' },
  doneDrawButton: {
    position: 'absolute',
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#25d366',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  colorStrip: { position: 'absolute', right: 16, gap: 8, alignItems: 'center' },
  colorSwatch: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: 'transparent' },
  colorSwatchSelected: { borderColor: '#ffffff', transform: [{ scale: 1.2 }] },
  textOverlayEditorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  textOverlayInput: { fontFamily: fonts.sansBold, fontSize: 24, color: '#ffffff', textAlign: 'center' },
  bottomArea: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, gap: 10 },
  thumbRow: { gap: 8, paddingVertical: 4 },
  thumbWrap: { width: 44, height: 44, borderRadius: 8, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  thumbWrapActive: { borderColor: '#25d366' },
  thumbImage: { width: '100%', height: '100%' },
  thumbTextIcon: { fontFamily: fonts.sansBold, fontSize: 13, color: '#ffffff' },
  thumbTrash: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMoreBlob: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
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
  swatchRow: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  swatch: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: 'transparent' },
  swatchSelected: { borderColor: '#ffffff' },
  sendButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#e6004a', alignItems: 'center', justifyContent: 'center' },
  textSlide: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  textSlideInput: { fontFamily: fonts.sansSemiBold, fontSize: 26, color: '#ffffff', textAlign: 'center' },
});
