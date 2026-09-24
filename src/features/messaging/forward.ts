import { randomUUID } from 'expo-crypto';
import { DeviceEventEmitter } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';

import { parseAttachments, upsertConversation, upsertMessage, type LocalMessage } from '../../data/db';
import { CONVERSATIONS_CHANGED_EVENT } from './inboxSocket';
import { ChatSocket } from './ws';

export type ForwardTarget = {
  conversationId: string;
  /** 1:1 target only. */
  recipientId?: string;
  /** Group target only. */
  groupId?: string;
  title: string;
  avatarObjectKey?: string | null;
};

/**
 * The forward picker isn't scoped to any one conversation's screen (unlike
 * useConversation's per-thread socket), so this opens its own short-lived
 * connection rather than borrowing one — a STOMP send isn't tied to what a
 * connection happens to be subscribed to anyway, so this works regardless of
 * which conversation (if any) is currently open elsewhere in the app.
 */
export async function forwardMessage(
  db: SQLiteDatabase,
  accessToken: string | null | undefined,
  senderId: string,
  source: LocalMessage,
  target: ForwardTarget
): Promise<void> {
  const messageId = randomUUID();
  const sentAt = new Date().toISOString();
  const recipientId = target.groupId ? '' : (target.recipientId ?? '');
  const attachments = parseAttachments(source);

  const envelope = {
    messageId,
    conversationId: target.conversationId,
    senderId,
    recipientId,
    groupId: target.groupId,
    ciphertext: source.ciphertext,
    sentAt,
    mediaType: source.media_type ?? undefined,
    mediaObjectKey: source.media_object_key ?? undefined,
    mediaFileName: source.media_file_name ?? undefined,
    mediaDurationMs: source.media_duration_ms ?? undefined,
    waveform: source.media_waveform ?? undefined,
    overlayJson: source.media_overlay_json ?? undefined,
    forwarded: true,
    attachments: attachments.length > 0 ? attachments : undefined,
  };

  await upsertMessage(db, {
    message_id: messageId,
    conversation_id: target.conversationId,
    sender_id: senderId,
    recipient_id: recipientId,
    ciphertext: source.ciphertext,
    sent_at: sentAt,
    status: 'sending',
    media_type: source.media_type,
    media_object_key: source.media_object_key,
    media_file_name: source.media_file_name,
    media_duration_ms: source.media_duration_ms,
    media_waveform: source.media_waveform,
    media_overlay_json: source.media_overlay_json,
    edited: 0,
    deleted: 0,
    forwarded: 1,
    deleted_for_me: 0,
    attachments_json: source.attachments_json,
    // A forward deliberately drops any reply-to context and pin state from
    // the source message — it's a fresh send in a possibly different
    // conversation, same as WhatsApp's own forward behavior.
    reply_to_message_id: null,
    reply_to_conversation_id: null,
    reply_to_sender_id: null,
    reply_to_snippet: null,
    pinned: 0,
    is_system: 0,
    reply_to_status_id: null,
    reply_to_status_owner_id: null,
  });
  await upsertConversation(db, target.conversationId, target.title, sentAt, target.avatarObjectKey, !!target.groupId);
  DeviceEventEmitter.emit(CONVERSATIONS_CHANGED_EVENT);

  await new Promise<void>((resolve) => {
    const socket = new ChatSocket(accessToken);
    socket.connect(() => {
      socket.send(envelope);
      // Give the frame a moment to actually reach the wire before tearing
      // the connection down — there's no "send acknowledged" callback to
      // await instead.
      setTimeout(() => {
        socket.disconnect();
        resolve();
      }, 500);
    });
  });
}
