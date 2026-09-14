import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';

import { AttachmentSheet } from '../../../components/AttachmentSheet';
import { Avatar } from '../../../components/Avatar';
import { MediaCaptionComposer, type PendingMedia } from '../../../components/MediaCaptionComposer';
import { VoiceMessageBubble } from '../../../components/VoiceMessageBubble';
import { VoiceRecorder } from '../../../components/VoiceRecorder';
import { useAuth } from '../../../features/auth/AuthContext';
import { useCall } from '../../../features/calls/CallContext';
import { getGroup } from '../../../features/groups/api';
import { uploadMedia } from '../../../features/media/api';
import { useMediaUrl } from '../../../features/media/useMediaUrl';
import { looksLikeUnresolvedName } from '../../../features/messaging/conversationId';
import { useConversation } from '../../../features/messaging/useConversation';
import { usePresence } from '../../../features/presence/usePresence';
import { useTheme } from '../../../features/theme/ThemeContext';
import { getUser } from '../../../features/users/api';
import { fonts, gradients, type Palette } from '../../../theme';
import {
  getReceiptsForMessage,
  listGroupMembers,
  upsertGroupMembers,
  useSQLiteContext,
  type LocalGroupMember,
  type LocalMessage,
} from '../../../data/db';

const READ_BLUE = '#34b7f1';

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatStatusLabel(online: boolean, lastSeen: string | null): string {
  if (online) return 'online';
  if (!lastSeen) return 'offline';
  return `last seen ${formatTime(lastSeen)}`;
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

function MessageImage({ objectKey }: { objectKey: string | null }) {
  const url = useMediaUrl(objectKey);
  if (!url) {
    return (
      <View style={imageStyles.placeholder}>
        <ActivityIndicator color="#ffffff" />
      </View>
    );
  }
  return <Image source={{ uri: url }} style={imageStyles.image} />;
}

const imageStyles = StyleSheet.create({
  placeholder: { width: 220, height: 220, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.15)' },
  image: { width: 220, height: 220, borderRadius: 12 },
});

function MessageFile({ fileName, objectKey, tintColor, labelColor }: { fileName: string | null; objectKey: string | null; tintColor: string; labelColor: string }) {
  const url = useMediaUrl(objectKey);
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
      <Text style={[fileRowStyles.name, { color: labelColor }]} numberOfLines={1}>{fileName || 'Document'}</Text>
    </TouchableOpacity>
  );
}

const fileRowStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 180 },
  iconCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: fonts.sansMedium, fontSize: 13.5, flexShrink: 1 },
});

type ReceiptRow = { userId: string; displayName: string; status: string };

/** "Message info" — the per-member read-by breakdown for a group message (full per-member tracking, surfaced). */
function MessageInfoModal({
  visible,
  onClose,
  rows,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  rows: ReceiptRow[];
  colors: Palette;
}) {
  const styles = infoModalStyles(colors);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>
      <View style={styles.sheet}>
        <Text style={styles.title}>Message info</Text>
        {rows.length === 0 && <Text style={styles.empty}>No one else in this group yet.</Text>}
        {rows.map((row) => (
          <View key={row.userId} style={styles.row}>
            <Text style={styles.name}>{row.displayName}</Text>
            <Text style={styles.status}>{row.status === 'read' ? 'Read' : row.status === 'delivered' ? 'Delivered' : 'Sent'}</Text>
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

export default function ChatThreadScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);

  const { conversationId, recipientId, groupId, recipientName, recipientAvatarObjectKey } = useLocalSearchParams<{
    conversationId: string;
    recipientId?: string;
    groupId?: string;
    recipientName?: string;
    recipientAvatarObjectKey?: string;
  }>();
  const isGroup = !!groupId;
  const db = useSQLiteContext();
  const { userId } = useAuth();
  const [resolvedName, setResolvedName] = useState<string | undefined>(
    recipientName && !looksLikeUnresolvedName(recipientName) ? recipientName : undefined
  );
  const [resolvedAvatarKey, setResolvedAvatarKey] = useState<string | null | undefined>(recipientAvatarObjectKey);
  const [groupMembers, setGroupMembers] = useState<LocalGroupMember[]>([]);

  // Self-heals a conversation whose stored title is just the other side's
  // raw id (e.g. opened before name resolution existed, or via a route that
  // never had a name to pass) — resolves it once and useConversation persists it.
  // For a group, this instead (re)loads the member list, which the message
  // bubbles need to show each sender's name and "message info" needs for the
  // read-by breakdown.
  useEffect(() => {
    if (isGroup) {
      getGroup(groupId).then(async (group) => {
        setResolvedName(group.name);
        setResolvedAvatarKey(group.avatarObjectKey);
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
    if (resolvedName && resolvedAvatarKey !== undefined) return;
    if (!recipientId) return;
    getUser(recipientId)
      .then((user) => {
        if (user.displayName) setResolvedName(user.displayName);
        setResolvedAvatarKey(user.avatarObjectKey);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, groupId, isGroup, recipientId]);

  const { startCall } = useCall();
  const { messages, sendMessage, editMessage, deleteMessage } = useConversation({
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
  const [attachmentSheetVisible, setAttachmentSheetVisible] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<PendingMedia | null>(null);
  const [pendingMediaMimeType, setPendingMediaMimeType] = useState<string | undefined>(undefined);

  function memberName(userId2: string): string {
    return groupMembers.find((m) => m.user_id === userId2)?.display_name || userId2;
  }

  async function showMessageInfo(message: LocalMessage) {
    const receipts = await getReceiptsForMessage(db, message.message_id);
    const receiptByUser = new Map(receipts.map((r) => [r.user_id, r.status]));
    const rows: ReceiptRow[] = groupMembers
      .filter((m) => m.user_id !== message.sender_id)
      .map((m) => ({
        userId: m.user_id,
        displayName: m.display_name || m.user_id,
        status: receiptByUser.get(m.user_id) ?? 'sent',
      }));
    setSelectedMessageId(null);
    setMessageInfoRows(rows);
  }
  const displayName = resolvedName || recipientId || conversationId;

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
      await sendMessage(text);
    }
  }

  function startEdit(message: LocalMessage) {
    setEditingMessageId(message.message_id);
    setDraft(message.ciphertext);
    setSelectedMessageId(null);
  }

  function cancelEdit() {
    setEditingMessageId(null);
    setDraft('');
  }

  function confirmDelete(messageId: string) {
    Alert.alert('Delete message?', 'This deletes it for both of you.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setSelectedMessageId(null);
          await deleteMessage(messageId);
        },
      },
    ]);
  }

  async function pickFromLibrary() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to send a picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      setPendingMediaMimeType(result.assets[0].mimeType);
      setPendingMedia({ kind: 'image', uri: result.assets[0].uri });
    }
  }

  async function pickFromCamera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow camera access to take a picture.');
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
    try {
      if (media.kind === 'image') {
        const objectKey = await uploadMedia(media.uri, pendingMediaMimeType ?? 'image/jpeg');
        await sendMessage(caption, { type: 'IMAGE', objectKey });
      } else {
        const objectKey = await uploadMedia(media.uri, pendingMediaMimeType ?? 'application/octet-stream');
        await sendMessage(caption, { type: 'FILE', objectKey, fileName: media.name });
      }
      // Only close the preview once the upload+send actually succeeded — closing
      // immediately on tap left the screen showing nothing while a slow/failed
      // upload (camera shots are large, uncompressed until this step) ran with
      // no visible feedback, which read as "the app did nothing".
      setPendingMedia(null);
      return true;
    } catch (e) {
      console.warn('[ChatThreadScreen] media send failed', e);
      Alert.alert('Could not send', 'Please check your connection and try again.');
      return false;
    }
  }

  async function handleSendVoice(objectKey: string, durationMs: number) {
    setIsRecording(false);
    await sendMessage('', { type: 'AUDIO', objectKey, durationMs });
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
          onPress={() => isGroup && router.push({ pathname: '/(tabs)/chats/group-info', params: { groupId } })}
          disabled={!isGroup}
        >
          <Avatar objectKey={resolvedAvatarKey} label={displayName} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={styles.headerName} numberOfLines={1}>{displayName}</Text>
            {isGroup ? (
              <Text style={styles.statusLabel}>{groupMembers.length} members</Text>
            ) : (
              <View style={styles.statusRow}>
                {online && <View style={styles.statusDot} />}
                <Text style={styles.statusLabel}>{formatStatusLabel(online, lastSeen)}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerActionTouchable}
          onPress={() => {
            if (isGroup) {
              Alert.alert('Group calls not supported', 'Voice calling is only available in 1:1 chats for now.');
              return;
            }
            if (recipientId) startCall(recipientId, displayName, 'AUDIO');
          }}
        >
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.902.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.908.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
          </Svg>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerActionTouchable}
          onPress={() => {
            if (isGroup) {
              Alert.alert('Group calls not supported', 'Video calling is only available in 1:1 chats for now.');
              return;
            }
            if (recipientId) startCall(recipientId, displayName, 'VIDEO');
          }}
        >
          <Svg width={21} height={21} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M23 7l-7 5 7 5V7z" />
            <Rect x={1} y={5} width={15} height={14} rx={2} />
          </Svg>
        </TouchableOpacity>
      </View>

      {selectedMessageId && (() => {
        const selected = messages.find((m) => m.message_id === selectedMessageId);
        if (!selected) return null;
        return (
          <View style={styles.selectionBar}>
            <TouchableOpacity style={styles.selectionAction} onPress={() => setSelectedMessageId(null)}>
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M18 6L6 18M6 6l12 12" />
              </Svg>
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            {isGroup && selected.sender_id === userId && (
              <TouchableOpacity style={styles.selectionAction} onPress={() => showMessageInfo(selected)}>
                <Text style={styles.selectionActionLabel}>Info</Text>
              </TouchableOpacity>
            )}
            {!selected.media_type && (
              <TouchableOpacity style={styles.selectionAction} onPress={() => startEdit(selected)}>
                <Text style={styles.selectionActionLabel}>Edit</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.selectionAction} onPress={() => confirmDelete(selected.message_id)}>
              <Text style={[styles.selectionActionLabel, { color: colors.brand700 }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        );
      })()}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.message_id}
        contentContainerStyle={styles.listContent}
        style={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => {
          const isMine = item.sender_id === userId;
          const isSelected = selectedMessageId === item.message_id;
          const canSelect = isMine && !item.deleted;

          if (item.deleted) {
            return (
              <View style={[styles.bubble, isMine ? styles.outgoing : styles.incoming, styles.deletedBubble]}>
                <Text style={styles.deletedText}>This message was deleted</Text>
              </View>
            );
          }

          return (
            <TouchableOpacity
              activeOpacity={canSelect ? 0.7 : 1}
              onLongPress={() => canSelect && setSelectedMessageId(item.message_id)}
              style={[
                styles.bubble,
                isMine ? styles.outgoing : styles.incoming,
                isSelected && styles.bubbleSelected,
              ]}
            >
              {isMine ? (
                <LinearGradient colors={gradients.brand} style={StyleSheet.absoluteFill} />
              ) : null}
              {isGroup && !isMine && (
                <Text style={styles.senderLabel}>{memberName(item.sender_id)}</Text>
              )}
              {item.media_type === 'IMAGE' && (
                <View style={styles.mediaWrap}>
                  <MessageImage objectKey={item.media_object_key} />
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
                <View style={styles.mediaWrap}>
                  <VoiceMessageBubble
                    objectKey={item.media_object_key ?? ''}
                    durationMs={item.media_duration_ms}
                    tintColor={isMine ? '#ffffff' : colors.brand600}
                    trackColor={isMine ? 'rgba(255,255,255,0.35)' : colors.tint2}
                    iconColor={isMine ? colors.brand600 : '#ffffff'}
                  />
                </View>
              )}
              {!!item.ciphertext && (
                <Text style={isMine ? styles.outgoingText : styles.incomingText}>{item.ciphertext}</Text>
              )}
              <View style={isMine ? styles.metaRow : styles.metaRowIncoming}>
                {!!item.edited && <Text style={isMine ? styles.editedLabel : styles.editedLabelIncoming}>edited</Text>}
                <Text style={isMine ? styles.outgoingTime : styles.incomingTime}>{formatTime(item.sent_at)}</Text>
                {isMine && <MessageTicks status={item.status} />}
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {editingMessageId && (
        <View style={styles.editingBanner}>
          <Text style={styles.editingBannerLabel}>Editing message</Text>
          <TouchableOpacity onPress={cancelEdit}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M18 6L6 18M6 6l12 12" />
            </Svg>
          </TouchableOpacity>
        </View>
      )}

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
              onChangeText={setDraft}
              placeholder="Message"
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

      <AttachmentSheet
        visible={attachmentSheetVisible}
        onClose={() => setAttachmentSheetVisible(false)}
        onPickPhotos={pickFromLibrary}
        onPickCamera={pickFromCamera}
        onPickDocument={pickDocument}
      />

      <MediaCaptionComposer media={pendingMedia} onCancel={() => setPendingMedia(null)} onSend={handleSendMedia} />

      <MessageInfoModal
        visible={messageInfoRows !== null}
        onClose={() => setMessageInfoRows(null)}
        rows={messageInfoRows ?? []}
        colors={colors}
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
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
    statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.gold500 },
    statusLabel: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.textMuted },
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
    listContent: { flexGrow: 1, paddingVertical: 8 },
    bubble: { borderRadius: 16, padding: 10, maxWidth: '78%', marginVertical: 4, marginHorizontal: 16, overflow: 'hidden' },
    bubbleSelected: { opacity: 0.6 },
    outgoing: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
    incoming: { alignSelf: 'flex-start', backgroundColor: colors.tint2, borderBottomLeftRadius: 4 },
    deletedBubble: { backgroundColor: colors.tint1 },
    deletedText: { fontFamily: fonts.sans, fontStyle: 'italic', fontSize: 13.5, color: colors.textMuted },
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
    composer: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: colors.hairline, backgroundColor: colors.surface },
    iconTouchable: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    input: { flex: 1, backgroundColor: colors.tint1, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 11, fontFamily: fonts.sans, fontSize: 14, color: colors.textPrimary },
    sendButton: { width: 44, height: 44, borderRadius: 22 },
    sendTouchable: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  });
}
