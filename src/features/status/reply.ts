import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { upsertConversation, upsertMessage } from '../../data/db';
import { UNRESOLVED_TITLE_PLACEHOLDER } from '../messaging/conversationId';
import { ChatSocket } from '../messaging/ws';
import type { StatusItem } from './api';

/**
 * Sends a reply to someone's status as a normal 1:1 chat message tagged
 * with replyToStatusId/replyToStatusOwnerId (see Message.java's own field
 * comment) — not a separate reply-to-status endpoint. The recipient's
 * thread renders a "Status" quote block that reopens this exact status on
 * tap (see [conversationId].tsx). Mirrors forward.ts's own short-lived
 * standalone-socket pattern: the status viewer isn't a conversation
 * screen, so there's no already-open ChatSocket to reuse.
 */
export async function sendStatusReply(
  db: SQLiteDatabase,
  accessToken: string | null | undefined,
  senderId: string,
  senderDisplayName: string | null,
  status: StatusItem,
  text: string
): Promise<void> {
  const messageId = randomUUID();
  const sentAt = new Date().toISOString();
  const conversationId = [senderId, status.userId].sort().join('_');

  const envelope = {
    messageId,
    conversationId,
    senderId,
    recipientId: status.userId,
    ciphertext: text,
    sentAt,
    replyToStatusId: status.statusId,
    replyToStatusOwnerId: status.userId,
    senderDisplayName,
  };

  await upsertMessage(db, {
    message_id: messageId,
    conversation_id: conversationId,
    sender_id: senderId,
    recipient_id: status.userId,
    ciphertext: text,
    sent_at: sentAt,
    status: 'sending',
    media_type: null,
    media_object_key: null,
    media_file_name: null,
    media_duration_ms: null,
    media_waveform: null,
    edited: 0,
    deleted: 0,
    forwarded: 0,
    deleted_for_me: 0,
    attachments_json: null,
    reply_to_message_id: null,
    reply_to_conversation_id: null,
    reply_to_sender_id: null,
    reply_to_snippet: null,
    pinned: 0,
    is_system: 0,
    reply_to_status_id: status.statusId,
    reply_to_status_owner_id: status.userId,
  });
  // A placeholder title, not the raw userId — chats/index.tsx's own resolve
  // pass (see looksLikeUnresolvedName) fixes it up to the real local/
  // registered name the next time the chat list loads, same self-healing
  // mechanism inboxSocket.ts's own conversation stubs already rely on.
  await upsertConversation(db, conversationId, UNRESOLVED_TITLE_PLACEHOLDER, sentAt, null, false);

  await new Promise<void>((resolve) => {
    const socket = new ChatSocket(accessToken);
    socket.connect(() => {
      socket.send(envelope);
      setTimeout(() => {
        socket.disconnect();
        resolve();
      }, 500);
    });
  });
}
