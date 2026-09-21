import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  DeviceEventEmitter,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { PanGestureHandler } from 'react-native-gesture-handler';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { AttachmentSheet } from '../../../components/AttachmentSheet';
import { Avatar } from '../../../components/Avatar';
import { ChatOverflowMenu } from '../../../components/ChatOverflowMenu';
import { ChatWallpaper } from '../../../components/ChatWallpaper';
import { GalleryCaptionComposer, type PendingGalleryItem } from '../../../components/GalleryCaptionComposer';
import { PhoneIcon, VideoIcon } from '../../../components/icons';
import { MediaCaptionComposer, type PendingMedia } from '../../../components/MediaCaptionComposer';
import { MediaViewer } from '../../../components/MediaViewer';
import { MessageAttachmentGrid } from '../../../components/MessageAttachmentGrid';
import { VoiceMessageBubble } from '../../../components/VoiceMessageBubble';
import { VoiceRecorder } from '../../../components/VoiceRecorder';
import { useAuth } from '../../../features/auth/AuthContext';
import { useCall } from '../../../features/calls/CallContext';
import { useGroupCall } from '../../../features/calls/GroupCallContext';
import { getGroup, SYSTEM_MEMBER_JOINED } from '../../../features/groups/api';
import { uploadMedia } from '../../../features/media/api';
import { useMediaUrl } from '../../../features/media/useMediaUrl';
import {
  conversationIdFor,
  looksLikeUnresolvedName,
  otherPartyFrom,
  UNRESOLVED_PERSON_PLACEHOLDER,
  UNRESOLVED_TITLE_PLACEHOLDER,
} from '../../../features/messaging/conversationId';
import { SCROLL_TO_MESSAGE_EVENT } from '../../../features/messaging/inboxSocket';
import { useConversation, type ReplyToDraft } from '../../../features/messaging/useConversation';
import { usePresence } from '../../../features/presence/usePresence';
import { useTheme } from '../../../features/theme/ThemeContext';
import { getSystemAccountInfo } from '../../../features/systemAccount/api';
import { blockUser, getUser, listBlockedUsers, reportUser, unblockUser } from '../../../features/users/api';
import { getLocalContactName } from '../../../data/db';
import { firstUrlIn, LinkPreviewCard } from '../../../components/LinkPreviewCard';
import { TypingDots } from '../../../components/TypingDots';
import { fonts, gradients, type Palette } from '../../../theme';
import {
  clearConversationMessages,
  getReceiptsForMessage,
  getStarredMessageIds,
  listGroupMembers,
  parseAttachments,
  starMessage,
  unstarMessage,
  upsertGroupMembers,
  useSQLiteContext,
  type AttachmentItem,
  type LocalGroupMember,
  type LocalMessage,
} from '../../../data/db';

const READ_BLUE = '#34b7f1';
// Must match ChatController#edit's own EDIT_WINDOW — this only ever hides
// the option once it's already too late; the server enforces it for real.
const EDIT_WINDOW_MS = 2 * 60 * 60 * 1000;

function isWithinEditWindow(message: LocalMessage): boolean {
  return Date.now() - new Date(message.sent_at).getTime() < EDIT_WINDOW_MS;
}
const SWIPE_THRESHOLD = 60;
const REACTION_EMOJIS = ['❤️', '😂', '😮', '😢', '🙏', '👍'];

/** Emoji reaction picker — floats above a long-pressed bubble. */
function ReactionPicker({
  visible,
  onPick,
  onClose,
  colors,
  insets,
}: {
  visible: boolean;
  onPick: (emoji: string) => void;
  onClose: () => void;
  colors: Palette;
  insets: { bottom: number };
}) {
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} />
      </TouchableWithoutFeedback>
      <View style={[
        reactionStyles.bar,
        { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 },
      ]}>
        <View style={reactionStyles.handle} />
        <View style={reactionStyles.row}>
          {REACTION_EMOJIS.map((emoji) => (
            <TouchableOpacity key={emoji} style={reactionStyles.emojiBtn} onPress={() => { onPick(emoji); onClose(); }}>
              <Text style={reactionStyles.emoji}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const reactionStyles = StyleSheet.create({
  bar: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 12, paddingHorizontal: 16 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#ccc', alignSelf: 'center', marginBottom: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-around', paddingBottom: 8 },
  emojiBtn: { padding: 10 },
  emoji: { fontSize: 32 },
});

/** Wraps a received message bubble with a right-swipe gesture to trigger reply. */
function SwipeableMessage({ onReply, children }: { onReply: () => void; children: React.ReactNode }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const triggered = useRef(false);

  return (
    <PanGestureHandler
      activeOffsetX={[10, 9999]}
      failOffsetY={[-10, 10]}
      onGestureEvent={({ nativeEvent }) => {
        const x = Math.max(0, nativeEvent.translationX);
        translateX.setValue(Math.min(x, SWIPE_THRESHOLD + 20));
        if (x >= SWIPE_THRESHOLD && !triggered.current) {
          triggered.current = true;
          onReply();
        }
      }}
      onHandlerStateChange={({ nativeEvent }) => {
        // state 5 = END
        if (nativeEvent.state === 5) {
          triggered.current = false;
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 6 }).start();
        }
      }}
    >
      <Animated.View style={{ transform: [{ translateX }] }}>
        {children}
      </Animated.View>
    </PanGestureHandler>
  );
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatStatusLabel(online: boolean, lastSeen: string | null, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (online) return t('thread.status.online');
  if (!lastSeen) return t('thread.status.offline');
  return t('thread.status.lastSeen', { time: formatTime(lastSeen) });
}

function formatFileSize(bytes?: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function MessageTicks({ status }: { status: LocalMessage['status'] }) {
  if (status === 'sending') {
    return <ActivityIndicator size="small" color="#ffe3ea" style={{ width: 13, height: 13 }} />;
  }
  const color = status === 'read' ? READ_BLUE : 'rgba(255,255,255,0.75)';
  if (status === 'sent') {
    return (
      <Svg width={15} height={11} viewBox="0 0 20 14" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M2 8l5 5L18 2" />
      </Svg>
    );
  }
  return (
    <Svg width={19} height={11} viewBox="0 0 24 14" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M1 8l5 5L17 2" />
      <Path d="M7 8l5 5L23 2" />
    </Svg>
  );
}

function MessageImage({ objectKey, onPress }: { objectKey: string | null; onPress?: () => void }) {
  const url = useMediaUrl(objectKey);
  if (!url) {
    return (
      <View style={imageStyles.placeholder}>
        <ActivityIndicator color="#ffffff" />
      </View>
    );
  }
  return (
    <TouchableOpacity onPress={onPress} disabled={!onPress} activeOpacity={0.9}>
      <Image source={{ uri: url }} style={imageStyles.image} />
    </TouchableOpacity>
  );
}

const imageStyles = StyleSheet.create({
  placeholder: { width: 220, height: 220, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.15)' },
  image: { width: 220, height: 220, borderRadius: 12 },
});

/**
 * A single (non-gallery) video message — same 220x220 footprint as
 * MessageImage. The paused VideoView itself renders the video's own first
 * frame as a real thumbnail (no separate thumbnail-extraction pipeline
 * needed); tapping opens the same MediaViewer a gallery video uses for
 * actual playback, so there's only one video-playback implementation.
 */
function MessageVideo({ objectKey, durationMs, onPress }: { objectKey: string | null; durationMs: number | null; onPress?: () => void }) {
  const url = useMediaUrl(objectKey);
  const player = useVideoPlayer(url ?? '', (p) => {
    p.muted = true;
  });

  if (!url) {
    return (
      <View style={imageStyles.placeholder}>
        <ActivityIndicator color="#ffffff" />
      </View>
    );
  }

  const seconds = durationMs ? Math.round(durationMs / 1000) : 0;
  const durationLabel = seconds > 0 ? `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}` : null;

  return (
    <TouchableOpacity onPress={onPress} disabled={!onPress} activeOpacity={0.9} style={imageStyles.image}>
      <VideoView player={player} style={imageStyles.image} contentFit="cover" nativeControls={false} />
      <View style={videoStyles.playOverlay} pointerEvents="none">
        <View style={videoStyles.playCircle}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="#ffffff">
            <Path d="M8 5v14l11-7z" />
          </Svg>
        </View>
      </View>
      {!!durationLabel && (
        <View style={videoStyles.durationBadge} pointerEvents="none">
          <Text style={videoStyles.durationText}>{durationLabel}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const videoStyles = StyleSheet.create({
  playOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  playCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  durationBadge: { position: 'absolute', right: 8, bottom: 8, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  durationText: { color: '#ffffff', fontFamily: fonts.sansMedium, fontSize: 11 },
});

function MessageFile({ fileName, objectKey, tintColor, labelColor }: { fileName: string | null; objectKey: string | null; tintColor: string; labelColor: string }) {
  const url = useMediaUrl(objectKey);
  const { t } = useTranslation('chats');
  return (
    <TouchableOpacity
      style={fileRowStyles.row}
      onPress={() => url && Linking.openURL(url)}
      disabled={!url}
    >
      <View style={[fileRowStyles.iconCircle, { backgroundColor: tintColor }]}>
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <Path d="M14 2v6h6" />
        </Svg>
      </View>
      <Text style={[fileRowStyles.name, { color: labelColor }]} numberOfLines={1}>{fileName || t('thread.document')}</Text>
    </TouchableOpacity>
  );
}

const fileRowStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 180 },
  iconCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: fonts.sansMedium, fontSize: 13.5, flexShrink: 1 },
});

function formatCallDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

/**
 * A call's outcome, logged inline in the thread like a real message (see
 * CallController#logCallAsMessage on the backend) — ciphertext carries the
 * outcome (ENDED/MISSED/DECLINED) and mediaFileName the call type
 * (AUDIO/VIDEO), repurposed since neither has a dedicated column.
 */
function CallLogRow({
  callType,
  outcome,
  durationMs,
  isMine,
  colors,
  onCallBack,
}: {
  callType: string | null;
  outcome: string;
  durationMs: number | null;
  isMine: boolean;
  colors: Palette;
  onCallBack?: () => void;
}) {
  const { t } = useTranslation('chats');
  const isVideo = callType === 'VIDEO';
  const missed = outcome === 'MISSED';
  const declined = outcome === 'DECLINED';
  const iconColor = missed || declined ? '#e53935' : colors.brand600;

  let label = isVideo ? t('thread.call.video') : t('thread.call.voice');
  if (missed) label = isMine ? t('thread.call.missedMine', { label }) : t('thread.call.missedTheirs', { label });
  else if (declined) label = isMine ? t('thread.call.declinedMine', { label }) : t('thread.call.declinedTheirs', { label });

  return (
    <TouchableOpacity
      style={[callLogStyles.pill, { backgroundColor: colors.tint1 }]}
      onPress={onCallBack}
      disabled={!onCallBack}
      activeOpacity={0.7}
    >
      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {isMine ? <Path d="M7 17L17 7M17 7H9M17 7v8" /> : <Path d="M17 7L7 17M7 17h8M7 17V9" />}
      </Svg>
      <Text style={[callLogStyles.label, { color: colors.textPrimary }]}>{label}</Text>
      {!!durationMs && durationMs > 0 && (
        <Text style={[callLogStyles.duration, { color: colors.textMuted }]}>{formatCallDuration(durationMs)}</Text>
      )}
      {!!onCallBack && <PhoneIcon size={14} color={colors.brand600} strokeWidth={2.2} />}
    </TouchableOpacity>
  );
}

const callLogStyles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    marginVertical: 2,
  },
  label: { fontFamily: fonts.sansMedium, fontSize: 13 },
  duration: { fontFamily: fonts.sans, fontSize: 12 },
});

type ReceiptRow = { userId: string; displayName: string; status: string };

/** "Message info" — the per-member read-by breakdown for a group message (full per-member tracking, surfaced). */
function MessageInfoModal({
  visible,
  onClose,
  rows,
  colors,
  insets,
}: {
  visible: boolean;
  onClose: () => void;
  rows: ReceiptRow[];
  colors: Palette;
  insets: { bottom: number };
}) {
  const styles = infoModalStyles(colors);
  const { t } = useTranslation('chats');
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
        <Text style={styles.title}>{t('thread.messageInfo.title')}</Text>
        {rows.length === 0 && <Text style={styles.empty}>{t('thread.messageInfo.empty')}</Text>}
        {rows.map((row) => (
          <View key={row.userId} style={styles.row}>
            <Text style={styles.name}>{row.displayName}</Text>
            <Text style={styles.status}>
              {row.status === 'read' ? t('thread.messageInfo.statusRead') : row.status === 'delivered' ? t('thread.messageInfo.statusDelivered') : t('thread.messageInfo.statusSent')}
            </Text>
          </View>
        ))}
      </View>
    </Modal>
  );
}

function infoModalStyles(colors: Palette) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 12 },
    title: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.textPrimary, marginBottom: 4 },
    empty: { fontFamily: fonts.sans, fontSize: 13, color: colors.textMuted },
    row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
    name: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.textPrimary },
    status: { fontFamily: fonts.sans, fontSize: 13, color: colors.textMuted },
  });
}

/** Quoted-message block shown atop a bubble (received reply) or above the composer (drafting a reply). Tappable to jump to the original. */
function QuotedBlock({
  senderLabel,
  snippet,
  onPress,
  tint,
  textColor,
  labelColor,
}: {
  senderLabel: string;
  snippet: string;
  onPress?: () => void;
  tint: string;
  textColor: string;
  labelColor: string;
}) {
  return (
    <TouchableOpacity style={[quotedStyles.block, { backgroundColor: tint }]} onPress={onPress} disabled={!onPress} activeOpacity={0.7}>
      <View style={[quotedStyles.bar, { backgroundColor: labelColor }]} />
      <View style={{ flex: 1 }}>
        <Text style={[quotedStyles.sender, { color: labelColor }]} numberOfLines={1}>{senderLabel}</Text>
        <Text style={[quotedStyles.snippet, { color: textColor }]} numberOfLines={1}>{snippet}</Text>
      </View>
    </TouchableOpacity>
  );
}

const quotedStyles = StyleSheet.create({
  block: { flexDirection: 'row', gap: 8, borderRadius: 8, padding: 7, marginBottom: 6, alignItems: 'stretch' },
  bar: { width: 3, borderRadius: 2 },
  sender: { fontFamily: fonts.sansSemiBold, fontSize: 12 },
  snippet: { fontFamily: fonts.sans, fontSize: 12.5, marginTop: 1 },
});

export default function ChatThreadScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const { t } = useTranslation('chats');

  const {
    conversationId,
    recipientId,
    groupId,
    recipientName,
    recipientAvatarObjectKey,
    scrollToMessageId,
    replyMessageId,
    replyConversationId,
    replySenderId,
    replySnippet,
  } = useLocalSearchParams<{
    conversationId: string;
    recipientId?: string;
    groupId?: string;
    recipientName?: string;
    recipientAvatarObjectKey?: string;
    scrollToMessageId?: string;
    replyMessageId?: string;
    replyConversationId?: string;
    replySenderId?: string;
    replySnippet?: string;
  }>();
  const isGroup = !!groupId;
  const db = useSQLiteContext();
  const { userId } = useAuth();
  const [resolvedName, setResolvedName] = useState<string | undefined>(
    recipientName && !looksLikeUnresolvedName(recipientName) ? recipientName : undefined
  );
  const [resolvedAvatarKey, setResolvedAvatarKey] = useState<string | null | undefined>(recipientAvatarObjectKey);
  const [groupMembers, setGroupMembers] = useState<LocalGroupMember[]>([]);
  const [onlyAdminsCanMessage, setOnlyAdminsCanMessage] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [isSystemAccountThread, setIsSystemAccountThread] = useState(false);
  const isGroupAdmin = groupMembers.find((m) => m.user_id === userId)?.role === 'ADMIN';

  useEffect(() => {
    if (isGroup) {
      getGroup(groupId).then(async (group) => {
        setResolvedName(group.name);
        setResolvedAvatarKey(group.avatarObjectKey);
        setOnlyAdminsCanMessage(group.onlyAdminsCanMessage);
        const withNames = await Promise.all(
          group.members.map(async (m) => {
            const user = await getUser(m.userId).catch(() => null);
            return { userId: m.userId, displayName: user?.displayName, avatarObjectKey: user?.avatarObjectKey, role: m.role };
          })
        );
        await upsertGroupMembers(db, groupId, withNames);
        setGroupMembers(await listGroupMembers(db, groupId));
      }).catch(() => {});
      return;
    }
    if (!recipientId) return;
    listBlockedUsers()
      .then((blocked) => setIsBlocked(blocked.some((b) => b.userId === recipientId)))
      .catch(() => {});
    getSystemAccountInfo()
      .then((info) => setIsSystemAccountThread(!!info && info.userId === recipientId))
      .catch(() => {});
    // Always check for a local name override first — it takes priority over
    // both the passed-in recipientName and the server-registered displayName.
    getLocalContactName(db, recipientId)
      .then(async (localName) => {
        if (localName) {
          setResolvedName(localName);
          // Still fetch the avatar even if we have a local name.
          const user = await getUser(recipientId).catch(() => null);
          if (user?.avatarObjectKey) setResolvedAvatarKey(user.avatarObjectKey);
          return;
        }
        if (resolvedName && resolvedAvatarKey !== undefined) return;
        const user = await getUser(recipientId).catch(() => null);
        if (user?.displayName) setResolvedName(user.displayName);
        setResolvedAvatarKey(user?.avatarObjectKey ?? null);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, groupId, isGroup, recipientId]);

  const { startCall } = useCall();
  const { startGroupCall } = useGroupCall();
  const {
    messages,
    sendMessage,
    editMessage,
    deleteMessage,
    pinMessage,
    typingUserIds,
    notifyTyping,
    reactions: reactionsByMessage,
    sendReaction,
    disappearingSeconds,
    setDisappearing,
    muted,
    setMuted,
    reloadMessages,
  } = useConversation({
    conversationId,
    recipientId,
    groupId,
    recipientName: resolvedName,
    recipientAvatarObjectKey: resolvedAvatarKey,
  });
  const { online, lastSeen } = usePresence(recipientId ?? '');
  const [draft, setDraft] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [messageInfoRows, setMessageInfoRows] = useState<ReceiptRow[] | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [viewer, setViewer] = useState<{ items: AttachmentItem[]; index: number } | null>(null);
  const [attachmentSheetVisible, setAttachmentSheetVisible] = useState(false);
  const [overflowMenuVisible, setOverflowMenuVisible] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<PendingMedia | null>(null);
  const [pendingMediaMimeType, setPendingMediaMimeType] = useState<string | undefined>(undefined);
  const [pendingGallery, setPendingGallery] = useState<PendingGalleryItem[] | null>(null);
  const [replyDraft, setReplyDraft] = useState<ReplyToDraft | null>(null);
  const [moreMenuMessage, setMoreMenuMessage] = useState<LocalMessage | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [reactionTargetId, setReactionTargetId] = useState<string | null>(null);
  // Starred is device-local only, never synced (see db.ts's starMessage doc comment) — loaded once below, persisted on every toggle.
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didConsumeReplyParamsRef = useRef(false);
  const didConsumeScrollParamRef = useRef(false);

  useEffect(() => {
    getStarredMessageIds(db, conversationId).then(setStarredIds).catch(() => {});
  }, [db, conversationId]);

  /** Distinct emojis on a message, joined — e.g. two people reacting ❤️ each show once, not twice. */
  function reactionSummaryFor(messageId: string): string | null {
    const byUser = reactionsByMessage.get(messageId);
    if (!byUser || byUser.size === 0) return null;
    return Array.from(new Set(byUser.values())).join(' ');
  }

  function memberName(userId2: string): string {
    if (userId2 === userId) return t('common:you');
    if (!isGroup && userId2 === recipientId) return resolvedName || UNRESOLVED_PERSON_PLACEHOLDER;
    return groupMembers.find((m) => m.user_id === userId2)?.display_name || UNRESOLVED_PERSON_PLACEHOLDER;
  }

  function snippetFor(message: LocalMessage): string {
    if (message.media_type === 'IMAGE') return t('thread.snippet.photo');
    if (message.media_type === 'VIDEO') return t('thread.snippet.video');
    if (message.media_type === 'AUDIO') return t('thread.snippet.voiceMessage');
    if (message.media_type === 'FILE') return t('thread.snippet.document');
    const attachments = parseAttachments(message);
    if (attachments.length > 0) return t('thread.snippet.photosCount', { count: attachments.length });
    return message.ciphertext.length > 80 ? message.ciphertext.slice(0, 77) + '...' : message.ciphertext;
  }

  function startReply(message: LocalMessage) {
    setEditingMessageId(null);
    setReplyDraft({
      messageId: message.message_id,
      conversationId,
      senderId: message.sender_id,
      snippet: snippetFor(message),
    });
    setSelectedMessageId(null);
  }

  /** Same-conversation: scroll+briefly highlight. Cross-conversation (a "reply privately" quote pointing back at a group, or vice versa): resolve whether the target id is a group or a 1:1 and navigate there. */
  async function navigateToMessage(targetConversationId: string, messageId: string) {
    if (targetConversationId === conversationId) {
      const index = messages.findIndex((m) => m.message_id === messageId);
      if (index === -1) return;
      try {
        listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.4 });
      } catch {
        // handled by onScrollToIndexFailed below
      }
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      setHighlightedMessageId(messageId);
      highlightTimerRef.current = setTimeout(() => setHighlightedMessageId(null), 2000);
      return;
    }
    if (!userId) return;
    try {
      const group = await getGroup(targetConversationId);
      router.push({
        pathname: '/(tabs)/chats/[conversationId]',
        params: { conversationId: targetConversationId, groupId: targetConversationId, recipientName: group.name, scrollToMessageId: messageId },
      });
    } catch {
      const otherId = otherPartyFrom(targetConversationId, userId);
      const user = await getUser(otherId).catch(() => null);
      router.push({
        pathname: '/(tabs)/chats/[conversationId]',
        params: {
          conversationId: targetConversationId,
          recipientId: otherId,
          recipientName: user?.displayName || UNRESOLVED_TITLE_PLACEHOLDER,
          recipientAvatarObjectKey: user?.avatarObjectKey ?? undefined,
          scrollToMessageId: messageId,
        },
      });
    }
  }

  /** Opens a 1:1 with the original message's sender, pre-filled with a reply quoting it — WhatsApp's "reply privately" from a group. */
  async function replyPrivately(message: LocalMessage) {
    setSelectedMessageId(null);
    setMoreMenuMessage(null);
    if (!userId) return;
    const targetId = message.sender_id;
    const targetConversationId = conversationIdFor(userId, targetId);
    const targetUser = await getUser(targetId).catch(() => null);
    router.push({
      pathname: '/(tabs)/chats/[conversationId]',
      params: {
        conversationId: targetConversationId,
        recipientId: targetId,
        recipientName: targetUser?.displayName || memberName(targetId),
        recipientAvatarObjectKey: targetUser?.avatarObjectKey ?? undefined,
        replyMessageId: message.message_id,
        replyConversationId: conversationId,
        replySenderId: targetId,
        replySnippet: snippetFor(message),
      },
    });
  }

  async function togglePin(message: LocalMessage) {
    setSelectedMessageId(null);
    setMoreMenuMessage(null);
    await pinMessage(message.message_id, !message.pinned);
  }

  async function toggleStar(messageId: string) {
    const isStarred = starredIds.has(messageId);
    if (isStarred) {
      await unstarMessage(db, messageId);
    } else {
      await starMessage(db, messageId);
    }
    setStarredIds((prev) => {
      const next = new Set(prev);
      if (isStarred) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
    setSelectedMessageId(null);
  }

  function confirmReportSender(message: LocalMessage) {
    setSelectedMessageId(null);
    setMoreMenuMessage(null);
    const name = memberName(message.sender_id);
    Alert.alert(t('thread.reportSender.title', { name }), t('thread.reportSender.body'), [
      { text: t('common:cancel'), style: 'cancel' },
      {
        text: t('common:report'),
        style: 'destructive',
        onPress: () => reportUser(message.sender_id, 'Reported from a group message').catch(() => {}),
      },
    ]);
  }

  // Prefills the reply-composer state once, from a "reply privately" navigation.
  useEffect(() => {
    if (didConsumeReplyParamsRef.current) return;
    if (!replyMessageId || !replyConversationId || !replySenderId || !replySnippet) return;
    didConsumeReplyParamsRef.current = true;
    setReplyDraft({ messageId: replyMessageId, conversationId: replyConversationId, senderId: replySenderId, snippet: replySnippet });
  }, [replyMessageId, replyConversationId, replySenderId, replySnippet]);

  // Jumps to (and briefly highlights) a specific message once it's loaded —
  // arriving via a quoted-reply tap from a DIFFERENT conversation.
  useEffect(() => {
    if (didConsumeScrollParamRef.current) return;
    if (!scrollToMessageId || messages.length === 0) return;
    const index = messages.findIndex((m) => m.message_id === scrollToMessageId);
    if (index === -1) return;
    didConsumeScrollParamRef.current = true;
    setTimeout(() => {
      try {
        listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.4 });
      } catch {
        // handled by onScrollToIndexFailed below
      }
    }, 300);
    setHighlightedMessageId(scrollToMessageId);
    highlightTimerRef.current = setTimeout(() => setHighlightedMessageId(null), 2500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, scrollToMessageId]);

  // search.tsx (pushed on top of this screen, still mounted underneath)
  // emits this instead of showing results on its own separate list — same
  // scroll+highlight behavior as navigateToMessage's same-conversation case.
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      SCROLL_TO_MESSAGE_EVENT,
      ({ conversationId: targetConversationId, messageId }: { conversationId: string; messageId: string }) => {
        if (targetConversationId !== conversationId) return;
        const index = messages.findIndex((m) => m.message_id === messageId);
        if (index === -1) return;
        try {
          listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.4 });
        } catch {
          // handled by onScrollToIndexFailed below
        }
        if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
        setHighlightedMessageId(messageId);
        highlightTimerRef.current = setTimeout(() => setHighlightedMessageId(null), 2500);
      }
    );
    return () => sub.remove();
  }, [conversationId, messages]);

  /** Most recently pinned, non-deleted message — feeds the thread's pin banner. Derived from `messages` (already in sync via SQLite reload) rather than a separate query. */
  const pinnedMessage = useMemo(() => {
    const pinned = messages.filter((m) => m.pinned && !m.deleted);
    return pinned.length > 0 ? pinned[pinned.length - 1] : null;
  }, [messages]);

  async function showMessageInfo(message: LocalMessage) {
    if (isGroup) {
      const receipts = await getReceiptsForMessage(db, message.message_id);
      const receiptByUser = new Map(receipts.map((r) => [r.user_id, r.status]));
      const rows: ReceiptRow[] = groupMembers
        .filter((m) => m.user_id !== message.sender_id)
        .map((m) => ({
          userId: m.user_id,
          displayName: m.display_name || UNRESOLVED_PERSON_PLACEHOLDER,
          status: receiptByUser.get(m.user_id) ?? 'sent',
        }));
      setSelectedMessageId(null);
      setMessageInfoRows(rows);
      return;
    }
    // No group-member roster to draw per-person rows from in a 1:1 — one
    // synthetic row for the other party, reusing the exact same modal/rows
    // shape rather than a bespoke 1:1 layout.
    setSelectedMessageId(null);
    setMessageInfoRows([{ userId: recipientId ?? '', displayName: displayName, status: message.status }]);
  }
  const displayName = resolvedName || UNRESOLVED_TITLE_PLACEHOLDER;

  const typingLabel = (() => {
    if (typingUserIds.length === 0) return null;
    if (!isGroup) return t('thread.typing.self');
    const names = typingUserIds.map(memberName);
    if (names.length === 1) return t('thread.typing.one', { name: names[0] });
    if (names.length === 2) return t('thread.typing.two', { name1: names[0], name2: names[1] });
    return t('thread.typing.many', { count: names.length });
  })();

  // Messages render oldest-first; without this a FlatList never moves on its
  // own, so a new message (or the initial history load) would sit below the
  // fold until the user manually scrolled down themselves.
  const listRef = useRef<FlatList<LocalMessage>>(null);
  useEffect(() => {
    if (messages.length > 0) {
      listRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

  // Full-screen chat, like WhatsApp — hide the parent Tabs bar while this
  // screen is focused, restoring it on the way back out.
  const navigation = useNavigation();
  useEffect(() => {
    const parent = navigation.getParent();
    parent?.setOptions({ tabBarStyle: { display: 'none' } });
    return () => parent?.setOptions({ tabBarStyle: undefined });
  }, [navigation]);

  async function handleSend() {
    if (!draft.trim()) return;
    const text = draft;
    setDraft('');
    if (editingMessageId) {
      const messageId = editingMessageId;
      setEditingMessageId(null);
      await editMessage(messageId, text);
    } else {
      const reply = replyDraft ?? undefined;
      setReplyDraft(null);
      await sendMessage(text, undefined, undefined, reply);
    }
  }

  function startEdit(message: LocalMessage) {
    setEditingMessageId(message.message_id);
    setDraft(message.ciphertext);
    setReplyDraft(null);
    setSelectedMessageId(null);
  }

  function cancelEdit() {
    setEditingMessageId(null);
    setDraft('');
  }

  /** Own message: WhatsApp-style choice between the two delete scopes. */
  function confirmDeleteMine(messageId: string) {
    Alert.alert(t('thread.deleteMessage.title'), undefined, [
      { text: t('common:cancel'), style: 'cancel' },
      {
        text: t('thread.deleteMessage.forMe'),
        onPress: async () => {
          setSelectedMessageId(null);
          await deleteMessage(messageId, 'me');
        },
      },
      {
        text: t('thread.deleteMessage.forEveryone'),
        style: 'destructive',
        onPress: async () => {
          setSelectedMessageId(null);
          await deleteMessage(messageId, 'everyone');
        },
      },
    ]);
  }

  /** Received message: only one destructive option, so a plain confirm — no scope to choose between. */
  function confirmDeleteForMe(messageId: string) {
    Alert.alert(t('thread.deleteMessage.title'), t('thread.deleteMessage.receivedBody'), [
      { text: t('common:cancel'), style: 'cancel' },
      {
        text: t('thread.deleteMessage.forMe'),
        style: 'destructive',
        onPress: async () => {
          setSelectedMessageId(null);
          await deleteMessage(messageId, 'me');
        },
      },
    ]);
  }

  async function copyMessage(message: LocalMessage) {
    setSelectedMessageId(null);
    await Clipboard.setStringAsync(message.ciphertext);
  }

  function forwardSelected(messageId: string) {
    setSelectedMessageId(null);
    router.push({ pathname: '/(tabs)/chats/forward', params: { messageId } });
  }

  async function pickFromLibrary() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('thread.permission.neededTitle'), t('thread.permission.photoLibraryBody'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 0.8,
    });
    if (result.canceled || result.assets.length === 0) return;

    // A single image goes through the existing single-item composer
    // (PendingMedia has no 'video' kind) — a single VIDEO, or anything
    // multi-select, goes through the gallery composer instead, which
    // natively supports both media types.
    if (result.assets.length === 1 && result.assets[0].type !== 'video') {
      const asset = result.assets[0];
      setPendingMediaMimeType(asset.mimeType);
      setPendingMedia({ kind: 'image', uri: asset.uri });
      return;
    }

    setPendingGallery(
      result.assets.map((asset) => ({
        uri: asset.uri,
        type: asset.type === 'video' ? 'VIDEO' : 'IMAGE',
        mimeType: asset.mimeType,
      }))
    );
  }

  async function pickFromCamera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('thread.permission.neededTitle'), t('thread.permission.cameraBody'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      setPendingMediaMimeType(result.assets[0].mimeType);
      setPendingMedia({ kind: 'image', uri: result.assets[0].uri });
    }
  }

  async function pickDocument() {
    const result = await DocumentPicker.getDocumentAsync();
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setPendingMediaMimeType(asset.mimeType ?? undefined);
      setPendingMedia({ kind: 'file', uri: asset.uri, name: asset.name, size: asset.size });
    }
  }

  async function handleSendMedia(caption: string): Promise<boolean> {
    if (!pendingMedia) return false;
    const media = pendingMedia;
    const reply = replyDraft ?? undefined;
    try {
      if (media.kind === 'image') {
        const objectKey = await uploadMedia(media.uri, pendingMediaMimeType ?? 'image/jpeg');
        await sendMessage(caption, { type: 'IMAGE', objectKey }, undefined, reply);
      } else {
        const objectKey = await uploadMedia(media.uri, pendingMediaMimeType ?? 'application/octet-stream');
        await sendMessage(caption, { type: 'FILE', objectKey, fileName: media.name }, undefined, reply);
      }
      // Only close the preview once the upload+send actually succeeded — closing
      // immediately on tap left the screen showing nothing while a slow/failed
      // upload (camera shots are large, uncompressed until this step) ran with
      // no visible feedback, which read as "the app did nothing".
      setPendingMedia(null);
      setReplyDraft(null);
      return true;
    } catch (e) {
      console.warn('[ChatThreadScreen] media send failed', e);
      Alert.alert(t('thread.sendFailedTitle'), t('common:checkConnectionAndRetry'));
      return false;
    }
  }

  async function handleSendGallery(caption: string): Promise<boolean> {
    if (!pendingGallery || pendingGallery.length === 0) return false;
    const items = pendingGallery;
    const reply = replyDraft ?? undefined;
    try {
      const uploaded = await Promise.all(
        items.map(async (item) => {
          const objectKey = await uploadMedia(item.uri, item.mimeType ?? (item.type === 'VIDEO' ? 'video/mp4' : 'image/jpeg'));
          return { type: item.type, objectKey };
        })
      );
      await sendMessage(caption, undefined, uploaded, reply);
      setPendingGallery(null);
      setReplyDraft(null);
      return true;
    } catch (e) {
      console.warn('[ChatThreadScreen] gallery send failed', e);
      Alert.alert(t('thread.sendFailedTitle'), t('common:checkConnectionAndRetry'));
      return false;
    }
  }

  async function handleSendVoice(objectKey: string, durationMs: number) {
    setIsRecording(false);
    const reply = replyDraft ?? undefined;
    setReplyDraft(null);
    await sendMessage('', { type: 'AUDIO', objectKey, durationMs }, undefined, reply);
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.backTouchable} onPress={() => router.back()}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 18l-6-6 6-6" />
          </Svg>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerIdentity}
          onPress={() =>
            isGroup
              ? router.push({ pathname: '/(tabs)/chats/group-info', params: { groupId } })
              : recipientId && router.push({ pathname: '/(tabs)/chats/contact-details', params: { conversationId, userId: recipientId } })
          }
        >
          <Avatar objectKey={resolvedAvatarKey} label={displayName} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={styles.headerName} numberOfLines={1}>{displayName}</Text>
            {typingLabel ? (
              <View style={styles.statusRow}>
                <Text style={[styles.statusLabel, styles.typingLabel]} numberOfLines={1}>{typingLabel}</Text>
                <TypingDots color={colors.brand600} />
              </View>
            ) : isGroup ? (
              <Text style={styles.statusLabel}>{t('thread.membersCount', { count: groupMembers.length })}</Text>
            ) : (
              <View style={styles.statusRow}>
                {online && <View style={styles.statusDot} />}
                <Text style={styles.statusLabel}>{formatStatusLabel(online, lastSeen, t)}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerActionTouchable}
          onPress={() => {
            if (isGroup) {
              if (groupId) startGroupCall(groupId, displayName, groupMembers.map((m) => m.user_id), 'AUDIO');
              return;
            }
            if (recipientId && resolvedName) startCall(recipientId, resolvedName, 'AUDIO');
          }}
        >
          <PhoneIcon size={20} color={colors.textPrimary} strokeWidth={1.8} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerActionTouchable}
          onPress={() => {
            if (isGroup) {
              if (groupId) startGroupCall(groupId, displayName, groupMembers.map((m) => m.user_id), 'VIDEO');
              return;
            }
            if (recipientId && resolvedName) startCall(recipientId, resolvedName, 'VIDEO');
          }}
        >
          <VideoIcon size={21} color={colors.textPrimary} strokeWidth={1.8} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerActionTouchable} onPress={() => setOverflowMenuVisible(true)}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill={colors.textPrimary}>
            <Path d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
          </Svg>
        </TouchableOpacity>
      </View>

      {selectedMessageId && (() => {
        const selected = messages.find((m) => m.message_id === selectedMessageId);
        if (!selected) return null;
        const selectedIsMine = selected.sender_id === userId;
        const isStarred = starredIds.has(selected.message_id);
        return (
          <View style={styles.selectionBar}>
            <TouchableOpacity style={styles.selectionAction} onPress={() => setSelectedMessageId(null)}>
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M18 6L6 18M6 6l12 12" />
              </Svg>
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            <TouchableOpacity style={styles.selectionAction} onPress={() => startReply(selected)}>
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M9 14L4 9l5-5" />
                <Path d="M4 9h10.5A5.5 5.5 0 0 1 20 14.5v0A5.5 5.5 0 0 1 14.5 20H11" />
              </Svg>
            </TouchableOpacity>
            <TouchableOpacity style={styles.selectionAction} onPress={() => toggleStar(selected.message_id)}>
              <Svg width={20} height={20} viewBox="0 0 24 24" fill={isStarred ? colors.brand600 : 'none'} stroke={isStarred ? colors.brand600 : colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </Svg>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.selectionAction}
              onPress={() => (selectedIsMine ? confirmDeleteMine(selected.message_id) : confirmDeleteForMe(selected.message_id))}
            >
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.brand700} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
                <Path d="M10 11v6M14 11v6" />
              </Svg>
            </TouchableOpacity>
            <TouchableOpacity style={styles.selectionAction} onPress={() => forwardSelected(selected.message_id)}>
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M15 14l5-5-5-5" />
                <Path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5V15" />
              </Svg>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.selectionAction}
              onPress={() => {
                setMoreMenuMessage(selected);
                setSelectedMessageId(null);
              }}
            >
              <Svg width={20} height={20} viewBox="0 0 24 24" fill={colors.textPrimary}>
                <Path d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
              </Svg>
            </TouchableOpacity>
          </View>
        );
      })()}

      {pinnedMessage && (
        <TouchableOpacity style={styles.pinBanner} onPress={() => navigateToMessage(conversationId, pinnedMessage.message_id)}>
          <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={colors.brand600} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6z" />
          </Svg>
          <Text style={styles.pinBannerText} numberOfLines={1}>
            {isGroup ? `${memberName(pinnedMessage.sender_id)}: ` : ''}{snippetFor(pinnedMessage)}
          </Text>
          <TouchableOpacity onPress={() => togglePin(pinnedMessage)} hitSlop={8}>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M18 6L6 18M6 6l12 12" />
            </Svg>
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      <View style={styles.list}>
      <ChatWallpaper>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.message_id}
        contentContainerStyle={styles.listContent}
        style={styles.listInner}
        // A real bubble, not just header text — mimics an about-to-arrive
        // message the same way WhatsApp's typing indicator does, appearing
        // at the very end of the list (this FlatList isn't inverted, so
        // the footer naturally lands at the bottom, right below the
        // newest message).
        ListFooterComponent={
          typingLabel ? (
            <View style={[styles.bubble, styles.incoming, styles.typingBubble]}>
              <TypingDots color={colors.textMuted} />
            </View>
          ) : null
        }
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        onScrollToIndexFailed={(info) => {
          listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
          setTimeout(() => {
            try {
              listRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.4 });
            } catch {
              // best-effort — leaves the list at the approximate offset above
            }
          }, 100);
        }}
        renderItem={({ item }) => {
          const isMine = item.sender_id === userId;
          const isSelected = selectedMessageId === item.message_id;
          // Both own and received messages are selectable now — a received
          // message just gets a smaller action set (delete-for-me, forward)
          // in the selection bar above, rather than being excluded entirely.
          const canSelect = !item.deleted && item.media_type !== 'CALL' && !item.is_system;

          if (item.is_system) {
            const label =
              item.ciphertext === SYSTEM_MEMBER_JOINED
                ? t('thread.systemMessage.joined', { name: memberName(item.sender_id) })
                : item.ciphertext;
            return (
              <View style={styles.systemMessageRow}>
                <Text style={styles.systemMessageText}>{label}</Text>
              </View>
            );
          }

          if (item.deleted) {
            return (
              <View style={[styles.bubble, isMine ? styles.outgoing : styles.incoming, styles.deletedBubble]}>
                <Text style={styles.deletedText}>{t('thread.deletedMessage')}</Text>
              </View>
            );
          }

          if (item.media_type === 'CALL') {
            return (
              <CallLogRow
                callType={item.media_file_name}
                outcome={item.ciphertext}
                durationMs={item.media_duration_ms}
                isMine={isMine}
                colors={colors}
                onCallBack={
                  !isGroup && recipientId && resolvedName
                    ? () => startCall(recipientId, resolvedName, item.media_file_name === 'VIDEO' ? 'VIDEO' : 'AUDIO')
                    : undefined
                }
              />
            );
          }

          const bubble = (
            <TouchableOpacity
              activeOpacity={canSelect ? 0.7 : 1}
              onLongPress={() => canSelect && setSelectedMessageId(item.message_id)}
              style={[
                styles.bubble,
                isMine ? styles.outgoing : styles.incoming,
                isSelected && styles.bubbleSelected,
                highlightedMessageId === item.message_id && styles.bubbleHighlighted,
              ]}
            >
              {isMine ? (
                <LinearGradient colors={gradients.brand} style={StyleSheet.absoluteFill} />
              ) : null}
              {isGroup && !isMine && (
                <Text style={styles.senderLabel}>{memberName(item.sender_id)}</Text>
              )}
              {!!item.forwarded && (
                <Text style={isMine ? styles.forwardedLabel : styles.forwardedLabelIncoming}>{t('thread.forwardedLabel')}</Text>
              )}
              {!!item.reply_to_message_id && (
                <QuotedBlock
                  senderLabel={memberName(item.reply_to_sender_id || '')}
                  snippet={item.reply_to_snippet || ''}
                  onPress={() => navigateToMessage(item.reply_to_conversation_id!, item.reply_to_message_id!)}
                  tint={isMine ? 'rgba(255,255,255,0.18)' : colors.tint1}
                  textColor={isMine ? 'rgba(255,255,255,0.85)' : colors.textMuted}
                  labelColor={isMine ? '#ffffff' : colors.brand600}
                />
              )}
              {!!item.reply_to_status_id && (
                <QuotedBlock
                  senderLabel={t('thread.statusReplyLabel')}
                  snippet={memberName(item.reply_to_status_owner_id || '')}
                  onPress={() =>
                    router.push({
                      pathname: '/(tabs)/status/viewer',
                      params: { userId: item.reply_to_status_owner_id!, statusId: item.reply_to_status_id! },
                    } as never)
                  }
                  tint={isMine ? 'rgba(255,255,255,0.18)' : colors.tint1}
                  textColor={isMine ? 'rgba(255,255,255,0.85)' : colors.textMuted}
                  labelColor={isMine ? '#ffffff' : colors.brand600}
                />
              )}
              {(() => {
                const attachments = parseAttachments(item);
                if (attachments.length === 0) return null;
                return (
                  <View style={styles.mediaWrap}>
                    <MessageAttachmentGrid items={attachments} onOpen={(index) => setViewer({ items: attachments, index })} />
                  </View>
                );
              })()}
              {item.media_type === 'IMAGE' && (
                <View style={styles.mediaWrap}>
                  <MessageImage
                    objectKey={item.media_object_key}
                    onPress={
                      item.media_object_key
                        ? () =>
                            setViewer({
                              items: [
                                {
                                  position: 0,
                                  mediaType: 'IMAGE',
                                  mediaObjectKey: item.media_object_key!,
                                  mediaFileName: item.media_file_name,
                                  mediaDurationMs: null,
                                },
                              ],
                              index: 0,
                            })
                        : undefined
                    }
                  />
                </View>
              )}
              {item.media_type === 'VIDEO' && (
                <View style={styles.mediaWrap}>
                  <MessageVideo
                    objectKey={item.media_object_key}
                    durationMs={item.media_duration_ms}
                    onPress={
                      item.media_object_key
                        ? () =>
                            setViewer({
                              items: [
                                {
                                  position: 0,
                                  mediaType: 'VIDEO',
                                  mediaObjectKey: item.media_object_key!,
                                  mediaFileName: item.media_file_name,
                                  mediaDurationMs: item.media_duration_ms,
                                },
                              ],
                              index: 0,
                            })
                        : undefined
                    }
                  />
                </View>
              )}
              {item.media_type === 'FILE' && (
                <View style={styles.mediaWrap}>
                  <MessageFile
                    fileName={item.media_file_name}
                    objectKey={item.media_object_key}
                    tintColor={isMine ? 'rgba(255,255,255,0.25)' : colors.brand600}
                    labelColor={isMine ? '#ffffff' : colors.textPrimary}
                  />
                </View>
              )}
              {item.media_type === 'AUDIO' && (
                // Pressable with no visual feedback acts as a touch-stopper:
                // it claims the tap event for itself so the outer bubble's
                // TouchableOpacity (which has no onPress, only onLongPress)
                // never receives it. Without this, RN's responder system lets
                // the outer bubble win the touch when the finger lands anywhere
                // on the AUDIO row — the play button's own hitSlop is then
                // ignored for received messages (which additionally sit inside
                // a PanGestureHandler). The Pressable itself does nothing on
                // press; actual play/pause is handled inside VoiceMessageBubble.
                <Pressable style={styles.mediaWrap} onPress={() => {}}>
                  <VoiceMessageBubble
                    objectKey={item.media_object_key ?? ''}
                    durationMs={item.media_duration_ms}
                    tintColor={isMine ? '#ffffff' : colors.brand600}
                    // colors.tint2 IS the incoming bubble's own background
                    // (see its own doc comment in theme.ts) — using it here
                    // made every unplayed waveform bar invisible against the
                    // bubble behind it. A semi-transparent tint over that
                    // background is visible, mirroring how the sent side
                    // already uses translucent white over its own solid
                    // background rather than a second flat color.
                    trackColor={isMine ? 'rgba(255,255,255,0.35)' : 'rgba(230,0,74,0.25)'}
                    iconColor={isMine ? colors.brand600 : '#ffffff'}
                  />
                </Pressable>
              )}
              {!!item.ciphertext && (
                <Text style={isMine ? styles.outgoingText : styles.incomingText}>{item.ciphertext}</Text>
              )}
              {!!item.ciphertext && !!firstUrlIn(item.ciphertext) && (
                <LinkPreviewCard url={firstUrlIn(item.ciphertext)!} tintColor={isMine ? '#ffffff' : colors.brand600} isMine={isMine} />
              )}
              <View style={isMine ? styles.metaRow : styles.metaRowIncoming}>
                {!!item.edited && <Text style={isMine ? styles.editedLabel : styles.editedLabelIncoming}>{t('thread.editedLabel')}</Text>}
                <Text style={isMine ? styles.outgoingTime : styles.incomingTime}>{formatTime(item.sent_at)}</Text>
                {isMine && <MessageTicks status={item.status} />}
              </View>
            </TouchableOpacity>
          );

          if (!isMine && canSelect) {
            return (
              <View>
                <SwipeableMessage onReply={() => startReply(item)}>
                  {bubble}
                </SwipeableMessage>
                {!!reactionSummaryFor(item.message_id) && (
                  <View style={[styles.reactionBadge, { alignSelf: 'flex-start', marginLeft: 24 }]}>
                    <Text style={styles.reactionEmoji}>{reactionSummaryFor(item.message_id)}</Text>
                  </View>
                )}
                {starredIds.has(item.message_id) && (
                  <Text style={[styles.starBadge, { alignSelf: 'flex-start', marginLeft: 24 }]}>⭐</Text>
                )}
              </View>
            );
          }
          return (
            <View>
              {bubble}
              {!!reactionSummaryFor(item.message_id) && (
                <View style={[styles.reactionBadge, { alignSelf: 'flex-end', marginRight: 24 }]}>
                  <Text style={styles.reactionEmoji}>{reactionSummaryFor(item.message_id)}</Text>
                </View>
              )}
              {starredIds.has(item.message_id) && (
                <Text style={[styles.starBadge, { alignSelf: 'flex-end', marginRight: 24 }]}>⭐</Text>
              )}
            </View>
          );
        }}
      />
      </ChatWallpaper>
      </View>

      {editingMessageId && (
        <View style={styles.editingBanner}>
          <Text style={styles.editingBannerLabel}>{t('thread.editingMessage')}</Text>
          <TouchableOpacity onPress={cancelEdit}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M18 6L6 18M6 6l12 12" />
            </Svg>
          </TouchableOpacity>
        </View>
      )}

      {!editingMessageId && replyDraft && (
        <View style={styles.editingBanner}>
          <View style={{ flexDirection: 'row', flex: 1, gap: 8, alignItems: 'stretch' }}>
            <View style={[quotedStyles.bar, { backgroundColor: colors.brand600 }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.editingBannerLabel}>{t('thread.replyingTo', { name: memberName(replyDraft.senderId) })}</Text>
              <Text style={styles.replyPreviewSnippet} numberOfLines={1}>{replyDraft.snippet}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => setReplyDraft(null)}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M18 6L6 18M6 6l12 12" />
            </Svg>
          </TouchableOpacity>
        </View>
      )}

      {isSystemAccountThread ? (
        <View style={[styles.composer, styles.composerDisabledNotice, { paddingBottom: insets.bottom + 10 }]}>
          <Text style={styles.composerDisabledText}>{t('thread.systemAccountReadOnly')}</Text>
        </View>
      ) : isBlocked ? (
        <View style={[styles.composer, styles.composerDisabledNotice, { paddingBottom: insets.bottom + 10 }]}>
          <Text style={styles.composerDisabledText}>{t('thread.blockedNotice', { name: resolvedName || t('thread.menu.defaultContactName') })}</Text>
          <TouchableOpacity
            onPress={() =>
              unblockUser(recipientId!)
                .then(() => setIsBlocked(false))
                .catch(() => Alert.alert(t('common:somethingWentWrong'), t('thread.unblockFailed')))
            }
          >
            <Text style={styles.composerUnblockLink}>{t('contactDetails.unblockButton')}</Text>
          </TouchableOpacity>
        </View>
      ) : isGroup && onlyAdminsCanMessage && !isGroupAdmin ? (
        <View style={[styles.composer, styles.composerDisabledNotice, { paddingBottom: insets.bottom + 10 }]}>
          <Text style={styles.composerDisabledText}>{t('thread.adminsOnlyNotice')}</Text>
        </View>
      ) : (
      <View style={[styles.composer, { paddingBottom: insets.bottom + 10 }]}>
        {isRecording ? (
          <VoiceRecorder onSend={handleSendVoice} onCancel={() => setIsRecording(false)} />
        ) : (
          <>
            <TouchableOpacity style={styles.iconTouchable} onPress={() => setAttachmentSheetVisible(true)}>
              <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={colors.brand500} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M12 5v14M5 12h14" />
              </Svg>
            </TouchableOpacity>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={(text) => {
                setDraft(text);
                if (text.trim()) notifyTyping();
              }}
              placeholder={t('thread.composerPlaceholder')}
              placeholderTextColor={colors.textMuted}
              multiline
            />
            {!draft.trim() && (
              <TouchableOpacity style={styles.iconTouchable} onPress={pickFromCamera}>
                <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.brand500} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <Path d="M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
                </Svg>
              </TouchableOpacity>
            )}
            {draft.trim() ? (
              <LinearGradient colors={gradients.gold} style={styles.sendButton}>
                <TouchableOpacity onPress={handleSend} style={styles.sendTouchable}>
                  <Svg width={19} height={19} viewBox="0 0 24 24" fill="#ffffff">
                    <Path d="M2 12l19-9-7 19-3-8-9-2z" />
                  </Svg>
                </TouchableOpacity>
              </LinearGradient>
            ) : (
              <LinearGradient colors={gradients.gold} style={styles.sendButton}>
                <TouchableOpacity onPress={() => setIsRecording(true)} style={styles.sendTouchable}>
                  <Svg width={19} height={19} viewBox="0 0 24 24" fill="#ffffff">
                    <Path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <Path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" fill="none" />
                  </Svg>
                </TouchableOpacity>
              </LinearGradient>
            )}
          </>
        )}
      </View>
      )}

      <AttachmentSheet
        visible={attachmentSheetVisible}
        onClose={() => setAttachmentSheetVisible(false)}
        onPickPhotos={pickFromLibrary}
        onPickCamera={pickFromCamera}
        onPickDocument={pickDocument}
      />

      <MediaCaptionComposer media={pendingMedia} onCancel={() => setPendingMedia(null)} onSend={handleSendMedia} />

      <GalleryCaptionComposer items={pendingGallery} onCancel={() => setPendingGallery(null)} onSend={handleSendGallery} />

      <MessageInfoModal
        visible={messageInfoRows !== null}
        onClose={() => setMessageInfoRows(null)}
        rows={messageInfoRows ?? []}
        colors={colors}
        insets={insets}
      />

      <ReactionPicker
        visible={reactionTargetId !== null}
        onPick={(emoji) => {
          if (reactionTargetId) {
            void sendReaction(reactionTargetId, emoji);
            setReactionTargetId(null);
          }
        }}
        onClose={() => setReactionTargetId(null)}
        colors={colors}
        insets={insets}
      />

      {viewer && <MediaViewer items={viewer.items} initialIndex={viewer.index} onClose={() => setViewer(null)} />}

      <ChatOverflowMenu
        visible={moreMenuMessage !== null}
        onClose={() => setMoreMenuMessage(null)}
        items={
          moreMenuMessage
            ? [
                { label: t('thread.selection.info'), onPress: () => showMessageInfo(moreMenuMessage) },
                ...(!moreMenuMessage.media_type ? [{ label: t('thread.selection.copy'), onPress: () => copyMessage(moreMenuMessage) }] : []),
                ...(moreMenuMessage.sender_id === userId && !moreMenuMessage.media_type && isWithinEditWindow(moreMenuMessage)
                  ? [{ label: t('thread.selection.edit'), onPress: () => startEdit(moreMenuMessage) }]
                  : []),
                { label: t('thread.selection.react'), onPress: () => setReactionTargetId(moreMenuMessage.message_id) },
                { label: moreMenuMessage.pinned ? t('thread.selection.unpin') : t('thread.selection.pin'), onPress: () => togglePin(moreMenuMessage) },
                ...(isGroup && moreMenuMessage.sender_id !== userId
                  ? [{ label: t('thread.menu.replyPrivately'), onPress: () => replyPrivately(moreMenuMessage) }]
                  : []),
                ...(moreMenuMessage.sender_id !== userId
                  ? [{ label: t('thread.menu.report', { name: memberName(moreMenuMessage.sender_id) }), danger: true, onPress: () => confirmReportSender(moreMenuMessage) }]
                  : []),
              ]
            : []
        }
      />

      <ChatOverflowMenu
        visible={overflowMenuVisible}
        onClose={() => setOverflowMenuVisible(false)}
        items={[
          { label: t('thread.menu.newGroup'), onPress: () => router.push('/(tabs)/chats/new-group') },
          {
            label: isGroup ? t('thread.menu.groupInfo') : t('thread.menu.viewContact'),
            onPress: () =>
              isGroup
                ? router.push({ pathname: '/(tabs)/chats/group-info', params: { groupId } })
                : recipientId && router.push({ pathname: '/(tabs)/chats/contact-details', params: { conversationId, userId: recipientId } }),
          },
          { label: t('thread.menu.search'), onPress: () => router.push({ pathname: '/(tabs)/chats/search', params: { conversationId } }) },
          { label: t('thread.menu.mediaLinksDocs'), onPress: () => router.push({ pathname: '/(tabs)/chats/media-links-docs', params: { conversationId } }) },
          { label: muted ? t('thread.menu.unmuteNotifications') : t('thread.menu.muteNotifications'), onPress: () => void setMuted(!muted) },
          {
            label: t('thread.menu.disappearingMessages'),
            onPress: () =>
              Alert.alert(t('thread.menu.disappearingMessages'), t('thread.menu.disappearingMessagesHint'), [
                { text: t('thread.menu.disappearingOff'), onPress: () => void setDisappearing(null) },
                { text: t('thread.menu.disappearing24h'), onPress: () => void setDisappearing(86400) },
                { text: t('thread.menu.disappearing7d'), onPress: () => void setDisappearing(604800) },
                { text: t('thread.menu.disappearing90d'), onPress: () => void setDisappearing(7776000) },
                { text: t('common:cancel'), style: 'cancel' },
              ]),
          },
          {
            label: t('thread.menu.clearChat'),
            danger: true,
            onPress: () =>
              Alert.alert(t('thread.menu.clearChatConfirmTitle'), t('thread.menu.clearChatConfirmBody'), [
                { text: t('common:cancel'), style: 'cancel' },
                {
                  text: t('thread.menu.clear'),
                  style: 'destructive',
                  onPress: () => clearConversationMessages(db, conversationId).then(reloadMessages),
                },
              ]),
          },
          ...(!isGroup && recipientId
            ? [
                isBlocked
                  ? {
                      label: t('thread.menu.unblockContact', { name: resolvedName || t('thread.menu.defaultContactName') }),
                      onPress: () =>
                        Alert.alert(t('contactDetails.unblockConfirmTitle', { name: resolvedName || t('thread.menu.defaultContactName') }), t('contactDetails.unblockConfirmBody'), [
                          { text: t('common:cancel'), style: 'cancel' as const },
                          {
                            text: t('contactDetails.unblockButton'),
                            onPress: () =>
                              unblockUser(recipientId)
                                .then(() => setIsBlocked(false))
                                .catch(() => Alert.alert(t('common:somethingWentWrong'), t('thread.unblockFailed'))),
                          },
                        ]),
                    }
                  : {
                      label: t('thread.menu.blockContact', { name: resolvedName || t('thread.menu.defaultContactName') }),
                      danger: true,
                      onPress: () =>
                        Alert.alert(t('thread.menu.blockConfirmTitle', { name: resolvedName || t('thread.menu.defaultContactName') }), t('thread.menu.blockConfirmBody'), [
                          { text: t('common:cancel'), style: 'cancel' as const },
                          {
                            text: t('common:block'),
                            style: 'destructive' as const,
                            onPress: () =>
                              blockUser(recipientId)
                                .then(() => setIsBlocked(true))
                                .catch(() => Alert.alert(t('common:somethingWentWrong'), t('thread.blockFailed'))),
                          },
                        ]),
                    },
              ]
            : []),
        ]}
      />
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 14, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: colors.hairline },
    backTouchable: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    headerIdentity: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
    headerActionTouchable: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerName: { fontFamily: fonts.sansSemiBold, fontSize: 15.5, color: colors.textPrimary },
    senderLabel: { fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.brand600, marginBottom: 3 },
    forwardedLabel: { fontFamily: fonts.sans, fontStyle: 'italic', fontSize: 11, color: 'rgba(255,255,255,0.75)', marginBottom: 3 },
    forwardedLabelIncoming: { fontFamily: fonts.sans, fontStyle: 'italic', fontSize: 11, color: colors.textMuted, marginBottom: 3 },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
    statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.gold500 },
    statusLabel: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.textMuted },
    typingLabel: { fontFamily: fonts.sansMedium, color: colors.brand600 },
    selectionBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.hairline,
      backgroundColor: colors.tint1,
    },
    selectionAction: { paddingHorizontal: 12, paddingVertical: 6 },
    selectionActionLabel: { fontFamily: fonts.sansSemiBold, fontSize: 14.5, color: colors.textPrimary },
    list: { flex: 1, backgroundColor: colors.background },
    // Transparent so the ChatWallpaper pattern behind it shows through —
    // the outer `list` View (same flex:1) still supplies the fallback
    // background color underneath the wallpaper's own fill.
    listInner: { flex: 1, backgroundColor: 'transparent' },
    listContent: { flexGrow: 1, paddingVertical: 8 },
    bubble: { borderRadius: 16, padding: 10, maxWidth: '78%', marginVertical: 4, marginHorizontal: 16, overflow: 'hidden' },
    typingBubble: { paddingHorizontal: 16, paddingVertical: 12, width: 52 },
    bubbleSelected: { opacity: 0.6 },
    bubbleHighlighted: { borderWidth: 2, borderColor: colors.gold500 },
    outgoing: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
    incoming: { alignSelf: 'flex-start', backgroundColor: colors.tint2, borderBottomLeftRadius: 4 },
    deletedBubble: { backgroundColor: colors.tint1 },
    deletedText: { fontFamily: fonts.sans, fontStyle: 'italic', fontSize: 13.5, color: colors.textMuted },
    systemMessageRow: { alignSelf: 'center', marginVertical: 6, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 10, backgroundColor: colors.tint1, maxWidth: '80%' },
    systemMessageText: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: colors.textMuted, textAlign: 'center' },
    mediaWrap: { marginBottom: 6 },
    outgoingText: { fontFamily: fonts.sans, fontSize: 14.5, lineHeight: 20, color: '#ffffff' },
    incomingText: { fontFamily: fonts.sans, fontSize: 14.5, lineHeight: 20, color: colors.textPrimary },
    metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5, marginTop: 4 },
    metaRowIncoming: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5, marginTop: 4 },
    editedLabel: { fontFamily: fonts.sans, fontSize: 10, color: '#ffd9e3' },
    editedLabelIncoming: { fontFamily: fonts.sans, fontSize: 10, color: colors.textMuted },
    outgoingTime: { fontFamily: fonts.sans, fontSize: 10.5, color: '#ffd9e3' },
    incomingTime: { fontFamily: fonts.sans, fontSize: 10.5, color: colors.textMuted },
    editingBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: colors.tint1,
      borderTopWidth: 1,
      borderTopColor: colors.hairline,
    },
    editingBannerLabel: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: colors.brand700 },
    replyPreviewSnippet: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
    composer: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: colors.hairline, backgroundColor: colors.surface },
    composerDisabledNotice: { justifyContent: 'center', gap: 10 },
    composerDisabledText: { fontFamily: fonts.sans, fontSize: 13, color: colors.textMuted, textAlign: 'center', flexShrink: 1 },
    composerUnblockLink: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.brand600 },
    iconTouchable: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    input: { flex: 1, backgroundColor: colors.tint1, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 11, fontFamily: fonts.sans, fontSize: 14, color: colors.textPrimary },
    sendButton: { width: 44, height: 44, borderRadius: 22 },
    sendTouchable: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    pinBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 8,
      backgroundColor: colors.tint1,
      borderBottomWidth: 1,
      borderBottomColor: colors.hairline,
    },
    pinBannerText: { flex: 1, fontFamily: fonts.sans, fontSize: 12.5, color: colors.textPrimary },
    reactionBadge: { backgroundColor: colors.tint1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, marginTop: -4, marginBottom: 4 },
    reactionEmoji: { fontSize: 16 },
    starBadge: { fontSize: 12, marginTop: -4, marginBottom: 4 },
  });
}
