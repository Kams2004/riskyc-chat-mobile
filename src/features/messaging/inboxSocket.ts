import { useEffect } from 'react';
import { DeviceEventEmitter } from 'react-native';

import {
  applyMessageMutation,
  getConversationTitle,
  upsertConversation,
  upsertGroupMembers,
  upsertMessage,
  useSQLiteContext,
} from '../../data/db';
import { useAuth } from '../auth/AuthContext';
import { getGroup } from '../groups/api';
import { getUser } from '../users/api';
import { playNotificationSound } from '../../lib/sounds';
import type { MessageEnvelope } from './api';
import { looksLikeUnresolvedName } from './conversationId';
import { ChatSocket } from './ws';

export const CONVERSATIONS_CHANGED_EVENT = 'riskyc:conversationsChanged';

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
        });
        playNotificationSound();

        let title = await getConversationTitle(db, envelope.conversationId);
        let avatarObjectKey: string | null | undefined;
        if (!title || looksLikeUnresolvedName(title)) {
          if (envelope.groupId) {
            const group = await getGroup(envelope.groupId).catch(() => null);
            title = group?.name ?? envelope.groupId;
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
            const sender = await getUser(envelope.senderId).catch(() => null);
            title = sender?.displayName || envelope.senderId;
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
        });
        DeviceEventEmitter.emit(CONVERSATIONS_CHANGED_EVENT);
      });
    });

    return () => {
      cancelled = true;
      socket.disconnect();
    };
  }, [accessToken, db, userId]);
}
