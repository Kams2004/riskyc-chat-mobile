import { router, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
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

import { Avatar } from '../../../components/Avatar';
import { StatusOverlayView, parseOverlay } from '../../../components/StatusOverlayView';
import { getLocalContactName, useSQLiteContext } from '../../../data/db';
import { useAuth } from '../../../features/auth/AuthContext';
import { useMediaUrl } from '../../../features/media/useMediaUrl';
import {
  deleteStatus,
  fetchStatusesFor,
  fetchStatusViewers,
  markStatusViewed,
  type StatusItem,
  type ViewerRow,
} from '../../../features/status/api';
import { sendStatusReply } from '../../../features/status/reply';
import { getUser } from '../../../features/users/api';
import { fonts } from '../../../theme';

const IMAGE_DURATION_MS = 5000;
const VIDEO_DURATION_MS = 10000;

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(1, Math.floor(diffMs / 60_000));
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h`;
}

function StatusMedia({ item, width, height }: { item: StatusItem; width: number; height: number }) {
  const url = useMediaUrl(item.mediaType !== 'TEXT' ? item.mediaObjectKey : null);
  const videoPlayer = useVideoPlayer(item.mediaType === 'VIDEO' ? url ?? '' : '', (p) => {
    p.muted = false;
    p.play();
  });
  const overlay = parseOverlay(item.overlayJson);

  if (item.mediaType === 'TEXT') {
    return (
      <View style={[StyleSheet.absoluteFill, styles.textSlide, { backgroundColor: item.backgroundColor ?? '#25d366' }]}>
        <Text style={styles.textSlideContent}>{item.textContent}</Text>
      </View>
    );
  }
  if (!url) {
    return (
      <View style={[StyleSheet.absoluteFill, styles.mediaLoading]}>
        <ActivityIndicator color="#ffffff" />
      </View>
    );
  }
  return (
    <>
      {item.mediaType === 'VIDEO' ? (
        <VideoView player={videoPlayer} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />
      ) : (
        <Image source={{ uri: url }} style={StyleSheet.absoluteFill} resizeMode="contain" />
      )}
      <StatusOverlayView overlay={overlay} width={width} height={height} />
    </>
  );
}

export default function StatusViewerScreen() {
  const { userId: targetUserId, statusId: initialStatusId } = useLocalSearchParams<{ userId: string; statusId?: string }>();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const db = useSQLiteContext();
  const { userId: myUserId, displayName: myDisplayName, avatarObjectKey: myAvatarObjectKey, accessToken } = useAuth();
  const { t } = useTranslation('status');

  const [items, setItems] = useState<StatusItem[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [name, setName] = useState('');
  const [avatarObjectKey, setAvatarObjectKey] = useState<string | null>(null);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [viewers, setViewers] = useState<ViewerRow[] | null>(null);
  const [viewCount, setViewCount] = useState(0);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const viewedRef = useRef<Set<string>>(new Set());
  const progressAnim = useRef(new Animated.Value(0)).current;

  const isMine = targetUserId === myUserId;

  useEffect(() => {
    if (!targetUserId) return;
    let cancelled = false;

    (async () => {
      const [statuses, localName, user] = await Promise.all([
        fetchStatusesFor(targetUserId),
        isMine ? Promise.resolve(null) : getLocalContactName(db, targetUserId),
        isMine ? Promise.resolve(null) : getUser(targetUserId).catch(() => null),
      ]);
      if (cancelled) return;
      setItems(statuses);
      // Jumps straight to the specific status a "Status" reply quote was
      // pointing at, when the reply came from a tap on that quote — falls
      // back to the first active item (index 0's default) if that status
      // has since expired/been deleted, same graceful degrade as WhatsApp.
      if (initialStatusId) {
        const seekIndex = statuses.findIndex((s) => s.statusId === initialStatusId);
        if (seekIndex >= 0) setIndex(seekIndex);
      }
      setName(isMine ? myDisplayName ?? '' : localName || user?.displayName || user?.phoneNumber || targetUserId);
      setAvatarObjectKey(isMine ? myAvatarObjectKey ?? null : user?.avatarObjectKey ?? null);
      setLoading(false);
      if (statuses.length === 0) router.back();
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetUserId]);

  const current = items[index];

  const goNext = useCallback(() => {
    setIndex((i) => {
      if (i + 1 >= items.length) {
        router.back();
        return i;
      }
      return i + 1;
    });
  }, [items.length]);

  const goPrev = useCallback(() => {
    setIndex((i) => (i > 0 ? i - 1 : i));
  }, []);

  useEffect(() => {
    if (!current) return;
    if (!isMine && !viewedRef.current.has(current.statusId)) {
      viewedRef.current.add(current.statusId);
      markStatusViewed(current.statusId).catch(() => {});
    }
  }, [current, isMine]);

  // Tracks the bar's live fill so a pause can resume from wherever it
  // actually stopped instead of restarting — Animated.Value has no public
  // getter, so a listener is the only way to read it back.
  const progressValueRef = useRef(0);
  useEffect(() => {
    const id = progressAnim.addListener(({ value }) => {
      progressValueRef.current = value;
    });
    return () => progressAnim.removeListener(id);
  }, [progressAnim]);

  // Resets the bar to empty only when the item itself changes — NOT on
  // every pause/resume toggle, which used to call setValue(0) here too and
  // made a long-press-pause look like it kept restarting the bar from
  // scratch even though the underlying auto-advance really was paused.
  useEffect(() => {
    progressAnim.setValue(0);
    progressValueRef.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.statusId]);

  // Drives both the visible progress-bar fill and the auto-advance.
  // Pausing just stops the animation in place (Animated.Value keeps its
  // last value on stop()); resuming continues from there over whatever
  // duration is left, rather than restarting the whole item.
  useEffect(() => {
    if (!current || paused || viewersOpen) return;
    const duration = current.mediaType === 'VIDEO' ? VIDEO_DURATION_MS : IMAGE_DURATION_MS;
    const remaining = Math.max(duration * (1 - progressValueRef.current), 0);
    const animation = Animated.timing(progressAnim, { toValue: 1, duration: remaining, useNativeDriver: false });
    animation.start(({ finished }) => {
      if (finished) goNext();
    });
    return () => animation.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, paused, viewersOpen, goNext]);

  useEffect(() => {
    if (!current || !isMine) return;
    let cancelled = false;
    fetchStatusViewers(current.statusId)
      .then((rows) => !cancelled && setViewCount(rows.length))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [current, isMine]);

  async function openViewers() {
    if (!current) return;
    setViewersOpen(true);
    setViewers(null);
    try {
      const rows = await fetchStatusViewers(current.statusId);
      setViewers(rows);
      setViewCount(rows.length);
    } catch {
      setViewers([]);
    }
  }

  function confirmDelete() {
    if (!current) return;
    Alert.alert(t('viewer.deleteConfirmTitle'), t('viewer.deleteConfirmBody'), [
      { text: t('viewer.cancel'), style: 'cancel' },
      {
        text: t('viewer.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteStatus(current.statusId).catch(() => {});
          const remaining = items.filter((i) => i.statusId !== current.statusId);
          if (remaining.length === 0) {
            router.back();
          } else {
            setItems(remaining);
            setIndex((i) => Math.min(i, remaining.length - 1));
          }
        },
      },
    ]);
  }

  async function sendReply() {
    if (!current || !replyText.trim() || !myUserId || sendingReply) return;
    setSendingReply(true);
    try {
      await sendStatusReply(db, accessToken, myUserId, myDisplayName, current, replyText.trim());
      setReplyText('');
    } catch (e) {
      console.warn('[StatusViewerScreen] sendReply failed', e);
      Alert.alert(t('viewer.replyFailedTitle'), t('viewer.replyFailedBody'));
    } finally {
      setSendingReply(false);
    }
  }

  if (loading || !current) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color="#ffffff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusMedia item={current} width={width} height={height} />

      <Pressable
        style={StyleSheet.absoluteFill}
        onLongPress={() => setPaused(true)}
        onPressOut={() => setPaused(false)}
        onPress={(e) => {
          const isLeft = e.nativeEvent.locationX < 120;
          if (isLeft) goPrev();
          else goNext();
        }}
      />

      <View style={[styles.progressRow, { top: insets.top + 8 }]}>
        {items.map((item, i) => (
          <View key={item.statusId} style={styles.progressTrack}>
            {i < index ? (
              <View style={[styles.progressFill, { width: '100%' }]} />
            ) : i === index ? (
              <Animated.View
                style={[
                  styles.progressFill,
                  { width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
                ]}
              />
            ) : null}
          </View>
        ))}
      </View>

      <View style={[styles.header, { top: insets.top + 20 }]}>
        <Avatar objectKey={avatarObjectKey} label={name} size={36} />
        <View style={{ flex: 1 }}>
          <Text style={styles.headerName} numberOfLines={1}>{name}</Text>
          <Text style={styles.headerTime}>{timeAgo(current.createdAt)}</Text>
        </View>
        {isMine && (
          <TouchableOpacity style={styles.headerButton} onPress={confirmDelete}>
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
            </Svg>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.headerButton} onPress={() => router.back()}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2.4} strokeLinecap="round">
            <Path d="M18 6L6 18M6 6l12 12" />
          </Svg>
        </TouchableOpacity>
      </View>

      {!!current.textContent && current.mediaType !== 'TEXT' && (
        <View style={[styles.captionBar, { bottom: insets.bottom + (isMine ? 60 : 80) }]}>
          <Text style={styles.captionText}>{current.textContent}</Text>
        </View>
      )}

      {isMine && (
        <TouchableOpacity style={[styles.viewersBar, { bottom: insets.bottom + 16 }]} onPress={openViewers}>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <Path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
          </Svg>
          <Text style={styles.viewersText}>{t('viewer.viewedBy', { count: viewCount })}</Text>
        </TouchableOpacity>
      )}

      {!isMine && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[styles.replyBar, { paddingBottom: insets.bottom + 16 }]}
        >
          <TextInput
            style={styles.replyInput}
            placeholder={t('viewer.replyPlaceholder', { name })}
            placeholderTextColor="rgba(255,255,255,0.6)"
            value={replyText}
            onChangeText={setReplyText}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
            multiline
          />
          {!!replyText.trim() && (
            <TouchableOpacity style={styles.replySendButton} onPress={sendReply} disabled={sendingReply}>
              {sendingReply ? <ActivityIndicator color="#ffffff" /> : (
                <Svg width={18} height={18} viewBox="0 0 24 24" fill="#ffffff">
                  <Path d="M2 21l21-9L2 3v7l15 2-15 2z" />
                </Svg>
              )}
            </TouchableOpacity>
          )}
        </KeyboardAvoidingView>
      )}

      <Modal visible={viewersOpen} animationType="slide" transparent onRequestClose={() => setViewersOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.modalTitle}>{t('viewer.viewersTitle')}</Text>
            {viewers === null ? (
              <ActivityIndicator color="#e6004a" style={{ marginVertical: 24 }} />
            ) : viewers.length === 0 ? (
              <Text style={styles.modalEmpty}>{t('viewer.noViewersYet')}</Text>
            ) : (
              <FlatList
                data={viewers}
                keyExtractor={(v) => v.viewerId}
                renderItem={({ item }) => <ViewerRowItem row={item} />}
                style={{ maxHeight: 360 }}
              />
            )}
            <TouchableOpacity style={styles.modalClose} onPress={() => setViewersOpen(false)}>
              <Text style={styles.modalCloseText}>{t('viewer.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ViewerRowItem({ row }: { row: ViewerRow }) {
  const db = useSQLiteContext();
  const [name, setName] = useState(row.viewerId);
  const [avatarObjectKey, setAvatarObjectKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getLocalContactName(db, row.viewerId), getUser(row.viewerId).catch(() => null)]).then(([localName, user]) => {
      if (cancelled) return;
      setName(localName || user?.displayName || user?.phoneNumber || row.viewerId);
      setAvatarObjectKey(user?.avatarObjectKey ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [db, row.viewerId]);

  return (
    <View style={styles.viewerRow}>
      <Avatar objectKey={avatarObjectKey} label={name} size={40} />
      <Text style={styles.viewerName} numberOfLines={1}>{name}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  center: { alignItems: 'center', justifyContent: 'center' },
  mediaLoading: { alignItems: 'center', justifyContent: 'center' },
  textSlide: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  textSlideContent: { fontFamily: fonts.sansSemiBold, fontSize: 26, color: '#ffffff', textAlign: 'center' },
  progressRow: { position: 'absolute', left: 8, right: 8, flexDirection: 'row', gap: 4 },
  progressTrack: { flex: 1, height: 2.5, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#ffffff' },
  header: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerName: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: '#ffffff' },
  headerTime: { fontFamily: fonts.sans, fontSize: 11.5, color: 'rgba(255,255,255,0.75)' },
  headerButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  captionBar: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  captionText: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: '#ffffff',
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    textAlign: 'center',
  },
  viewersBar: { position: 'absolute', left: 16, flexDirection: 'row', alignItems: 'center', gap: 6 },
  viewersText: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: '#ffffff' },
  replyBar: { position: 'absolute', left: 16, right: 16, bottom: 0, flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  replyInput: {
    flex: 1,
    maxHeight: 100,
    color: '#ffffff',
    fontFamily: fonts.sans,
    fontSize: 15,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  replySendButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#e6004a', alignItems: 'center', justifyContent: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#1f1317', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalTitle: { fontFamily: fonts.sansBold, fontSize: 17, color: '#ffffff', marginBottom: 12 },
  modalEmpty: { fontFamily: fonts.sans, fontSize: 13.5, color: 'rgba(255,255,255,0.6)', paddingVertical: 24, textAlign: 'center' },
  modalClose: { marginTop: 12, alignItems: 'center', paddingVertical: 10 },
  modalCloseText: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: '#e6004a' },
  viewerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  viewerName: { fontFamily: fonts.sans, fontSize: 14.5, color: '#ffffff' },
});
