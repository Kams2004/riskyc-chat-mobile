import { useEffect } from 'react';
import { DeviceEventEmitter } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  advanceMessagesStatus,
  applyMessageMutation,
  applyReceipt,
  getConversationTitle,
  getLocalContactName,
  recomputeGroupMessageStatus,
  upsertConversation,
  upsertGroupMembers,
  upsertMessage,
  useSQLiteContext,
  type LocalMessage,
} from '../../data/db';
import { useAuth } from '../auth/AuthContext';
import { getGroup } from '../groups/api';
import { getUser } from '../users/api';
import { playNotificationSound } from '../../lib/sounds';
import { listConversationSummaries, type MessageEnvelope } from './api';
import { looksLikeUnresolvedName, UNRESOLVED_TITLE_PLACEHOLDER } from './conversationId';
import { ChatSocket } from './ws';

export const CONVERSATIONS_CHANGED_EVENT = 'riskyc:conversationsChanged';
export const TYPING_EVENT = 'riskyc:typing';
export const STATUS_UPDATED_EVENT = 'riskyc:statusUpdated';

/**
 * Backfills any conversation this device never saw live over STOMP — a
 * message that arrived while this socket was disconnected (backgrounded
 * past the OS grace period, killed, a fresh install) otherwise just
 * vanishes from the local view: nothing here ever creates the local
 * conversation row for it, so it never shows up in the chat list, and the
 * only way to see it was to manually re-find the sender and start a new
 * thread with them. Written as a stub with a placeholder title (self-heals
 * via the exact same looksLikeUnresolvedName mechanism chats/index.tsx
 * already runs for any row with an unresolved name) — the point here is
 * only to make the conversation EXIST locally at all; name/avatar
 * resolution and full message history both already happen elsewhere
 * (chats/index.tsx's resolve pass, and useConversation's fetchHistory once
 * the thread is actually opened).
 */
async function syncMissedConversations(db: SQLiteDatabase) {
  try {
    const summaries = await listConversationSummaries();
    let backfilled = false;
    for (const summary of summaries) {
      const existingTitle = await getConversationTitle(db, summary.conversationId);
      if (existingTitle) continue;
      await upsertConversation(db, summary.conversationId, UNRESOLVED_TITLE_PLACEHOLDER, summary.lastMessageAt, null, !!summary.groupId);
      backfilled = true;
    }
    if (backfilled) DeviceEventEmitter.emit(CONVERSATIONS_CHANGED_EVENT);
  } catch (e) {
    console.warn('[inboxSocket] conversation sync failed', e);
  }
}

/**
 * One persistent, app-wide connection — mounted once at the app root for as
 * long as the user is signed in — subscribed to this user's personal
 * /user/queue/messages (see ChatController#send's convertAndSendToUser call).
 *
 * This is what a per-thread ChatSocket (useConversation.ts) can't do: receive
 * a message, ack it DELIVERED, and update the chat list's unread badge and
 * last-message preview, all regardless of whether that specific conversation
 * screen happens to be open — including the first message of a brand-new
 * conversation (or group) someone else started with you, which otherwise has
 * no way to ever reach this device's local database.
 */
export function useInboxSocket() {
  const db = useSQLiteContext();
  const { userId, accessToken } = useAuth();

  useEffect(() => {
    if (!userId || !accessToken) return;

    const socket = new ChatSocket(accessToken);
    let cancelled = false;

    socket.connect(() => {
      syncMissedConversations(db);

      socket.subscribeToUserQueue(async (envelope: MessageEnvelope) => {
        // For a 1:1 message this queue only ever receives ones addressed to
        // me anyway, so recipientId === userId is redundant-but-safe to check.
        // For a group message, recipientId is the groupId itself (there's no
        // single recipient) — the fact that the server routed it to MY OWN
        // queue at all (see ChatController#send's per-member loop) is already
        // the guarantee that it's for me, so it must NOT be checked here.
        if (cancelled || (!envelope.groupId && envelope.recipientId !== userId)) return;

        await upsertMessage(db, {
          message_id: envelope.messageId,
          conversation_id: envelope.conversationId,
          sender_id: envelope.senderId,
          recipient_id: envelope.recipientId,
          ciphertext: envelope.ciphertext,
          sent_at: envelope.sentAt,
          status: (envelope.status?.toLowerCase() as 'sent' | 'delivered' | 'read' | undefined) ?? 'sent',
          media_type: envelope.mediaType ?? null,
          media_object_key: envelope.mediaObjectKey ?? null,
          media_file_name: envelope.mediaFileName ?? null,
          media_duration_ms: envelope.mediaDurationMs ?? null,
          edited: envelope.edited ? 1 : 0,
          deleted: envelope.deleted ? 1 : 0,
          forwarded: envelope.forwarded ? 1 : 0,
          deleted_for_me: 0,
          attachments_json: envelope.attachments && envelope.attachments.length > 0 ? JSON.stringify(envelope.attachments) : null,
          reply_to_message_id: envelope.replyToMessageId ?? null,
          reply_to_conversation_id: envelope.replyToConversationId ?? null,
          reply_to_sender_id: envelope.replyToSenderId ?? null,
          reply_to_snippet: envelope.replyToSnippet ?? null,
          pinned: envelope.pinned ? 1 : 0,
        });
        playNotificationSound();

        let title = await getConversationTitle(db, envelope.conversationId);
        let avatarObjectKey: string | null | undefined;
        if (!title || looksLikeUnresolvedName(title)) {
          if (envelope.groupId) {
            const group = await getGroup(envelope.groupId).catch(() => null);
            title = group?.name || UNRESOLVED_TITLE_PLACEHOLDER;
            avatarObjectKey = group?.avatarObjectKey;
            if (group) {
              const withNames = await Promise.all(
                group.members.map(async (m) => {
                  const user = await getUser(m.userId).catch(() => null);
                  return { userId: m.userId, displayName: user?.displayName, avatarObjectKey: user?.avatarObjectKey, role: m.role };
                })
              );
              await upsertGroupMembers(db, envelope.groupId, withNames);
            }
          } else {
            // Whatever name this device has saved for the sender always
            // wins over their own registered displayName — same rule every
            // other screen (new.tsx, contact-details.tsx, the thread
            // header) already follows, see data/db.ts's local_contacts
            // table doc comment.
            const [sender, localName] = await Promise.all([
              getUser(envelope.senderId).catch(() => null),
              getLocalContactName(db, envelope.senderId),
            ]);
            title = localName || sender?.displayName || sender?.phoneNumber || UNRESOLVED_TITLE_PLACEHOLDER;
            avatarObjectKey = sender?.avatarObjectKey;
          }
        }
        await upsertConversation(db, envelope.conversationId, title, envelope.sentAt, avatarObjectKey, !!envelope.groupId);

        if (envelope.groupId) {
          socket.sendGroupAck({ conversationId: envelope.conversationId, messageIds: [envelope.messageId], status: 'DELIVERED' });
        } else {
          socket.sendAck({ conversationId: envelope.conversationId, messageIds: [envelope.messageId], status: 'DELIVERED' });
        }

        if (!cancelled) DeviceEventEmitter.emit(CONVERSATIONS_CHANGED_EVENT);
      });

      // Lets an edit/delete reach the chat list's last-message preview even
      // when that conversation's own thread screen isn't open to receive it
      // via subscribeToMutations. A thread screen that IS open will apply
      // the exact same mutation again via its own subscription — harmless,
      // applyMessageMutation is a plain idempotent overwrite.
      socket.subscribeToUserMutations(async (mutation) => {
        if (cancelled) return;
        await applyMessageMutation(db, mutation.messageId, {
          ciphertext: mutation.ciphertext,
          edited: mutation.edited,
          deleted: mutation.deleted,
          pinned: mutation.pinned,
        });
        DeviceEventEmitter.emit(CONVERSATIONS_CHANGED_EVENT);
      });

      // This account's own read/delivery state, changed on one of its OTHER
      // devices (see ChatController#ack/#ackGroup) — applies the exact same
      // local-status update useConversation.ts's own subscriptions already
      // do, so the chat list's unread badge (a derived COUNT query, see
      // db.ts) self-corrects without that conversation's thread ever being
      // opened on this device.
      socket.subscribeToUserReadState(async (update) => {
        if (cancelled) return;
        if ('messageIds' in update) {
          await advanceMessagesStatus(db, update.messageIds, update.status.toLowerCase() as LocalMessage['status']);
        } else {
          await applyReceipt(db, update.messageId, update.userId, update.status.toLowerCase() as LocalMessage['status']);
          await recomputeGroupMessageStatus(db, update.messageId, update.conversationId);
        }
        DeviceEventEmitter.emit(CONVERSATIONS_CHANGED_EVENT);
      });

      // Broadcast typing events globally so the chat list can show
      // "typing..." in the conversation row without opening the thread.
      socket.subscribeToUserTyping((update) => {
        if (cancelled) return;
        DeviceEventEmitter.emit(TYPING_EVENT, update);
      });

      // A contact posted a new status — just a refresh nudge for whichever
      // screen has the Status tab mounted, not a local-DB write (status
      // content isn't part of the local-first sync model, see
      // features/status/api.ts's own doc comment).
      socket.subscribeToUserStatus(() => {
        if (cancelled) return;
        DeviceEventEmitter.emit(STATUS_UPDATED_EVENT);
      });
    });

    return () => {
      cancelled = true;
      socket.disconnect();
    };
  }, [accessToken, db, userId]);
}
