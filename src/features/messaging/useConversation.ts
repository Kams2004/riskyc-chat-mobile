import { useCallback, useEffect, useRef, useState } from 'react';
import { randomUUID } from 'expo-crypto';

import {
  advanceMessagesStatus,
  applyMessageMutation,
  applyReceipt,
  recomputeGroupMessageStatus,
  useSQLiteContext,
  listMessages,
  upsertConversation,
  upsertMessage,
  type LocalMessage,
  type MediaType,
} from '../../data/db';
import { useAuth } from '../auth/AuthContext';
import { preferences } from '../../lib/preferences';
import * as messagingApi from './api';
import { ChatSocket } from './ws';

export type OutgoingMedia = {
  type: MediaType;
  objectKey: string;
  fileName?: string | null;
  durationMs?: number | null;
};

export type UseConversationParams = {
  conversationId: string;
  /** The other person's id — 1:1 only, ignored (may be omitted) for a group. */
  recipientId?: string;
  /** Set for a group conversation; omitted for 1:1. */
  groupId?: string;
  recipientName?: string;
  recipientAvatarObjectKey?: string | null;
};

/** Envelopes read back from the server always carry status; this only falls
 * back to a guess for the (currently theoretical) case where one doesn't. */
function toLocalStatus(envelope: messagingApi.MessageEnvelope): LocalMessage['status'] {
  return (envelope.status?.toLowerCase() as LocalMessage['status']) ?? 'sent';
}

function envelopeToLocalMessage(envelope: messagingApi.MessageEnvelope): LocalMessage {
  return {
    message_id: envelope.messageId,
    conversation_id: envelope.conversationId,
    sender_id: envelope.senderId,
    recipient_id: envelope.recipientId,
    ciphertext: envelope.ciphertext,
    sent_at: envelope.sentAt,
    status: toLocalStatus(envelope),
    media_type: envelope.mediaType ?? null,
    media_object_key: envelope.mediaObjectKey ?? null,
    media_file_name: envelope.mediaFileName ?? null,
    media_duration_ms: envelope.mediaDurationMs ?? null,
    edited: envelope.edited ? 1 : 0,
    deleted: envelope.deleted ? 1 : 0,
  };
}

/**
 * Local-first conversation hook: the UI always renders from SQLite.
 * On mount it (1) loads whatever is cached locally so the screen is never
 * empty, (2) reconciles with the server's history, and (3) opens a live
 * WebSocket subscription for new messages — each write funnels through
 * upsertMessage so all three sources converge on the same table.
 *
 * Works for both a 1:1 conversation (recipientId set) and a group (groupId
 * set) — the two differ only in how a message gets acked and how its tick
 * status is derived: 1:1 acks straight onto Message.status via /chat.ack;
 * a group message has no single recipient, so each member acks their own
 * per-member receipt via /chat.ack.group, and recomputeGroupMessageStatus
 * folds those back into the same Message.status column so the tick UI
 * (MessageTicks, advanceMessagesStatus) never needs to know the difference.
 *
 * Read receipts: the app-wide InboxSocket (see inboxSocket.ts) acks DELIVERED
 * (1:1) the moment a message reaches the recipient's device at all,
 * regardless of which screen is open. This hook, running only while its own
 * thread is on screen, is what upgrades that further to READ — any message
 * addressed to me that shows up (or was already sitting unread) while I'm
 * actually looking at this thread gets acked to READ.
 *
 * recipientName is read through a ref (titleRef), not closed over directly,
 * so a name that resolves a moment after mount (see the chat screen's own
 * getUser() fallback) updates the stored title without tearing down and
 * reopening the socket — the connect effect below intentionally excludes it
 * from its dependency array.
 */
export function useConversation({
  conversationId,
  recipientId,
  groupId,
  recipientName,
  recipientAvatarObjectKey,
}: UseConversationParams) {
  const db = useSQLiteContext();
  const { userId, accessToken } = useAuth();
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const socketRef = useRef<ChatSocket | null>(null);
  const isGroup = !!groupId;
  const titleRef = useRef(recipientName || recipientId || conversationId);
  titleRef.current = recipientName || recipientId || conversationId;
  const avatarRef = useRef<string | null | undefined>(recipientAvatarObjectKey);
  avatarRef.current = recipientAvatarObjectKey;

  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  // Safety net for the receiving side: if a "stopped typing" update is ever
  // lost (sender's app killed mid-keystroke, connection drop, ...), a stray
  // "is typing" would otherwise stick forever — each user's typing state
  // auto-clears if no follow-up arrives within this window.
  const typingExpiryRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const TYPING_EXPIRY_MS = 6000;
  // Sending side: tracks whether an "isTyping: true" is currently
  // outstanding (so repeated keystrokes don't re-send it every time) and the
  // idle timer that sends "isTyping: false" after a pause.
  const isTypingSentRef = useRef(false);
  const typingIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const TYPING_IDLE_MS = 2500;

  const reload = useCallback(async () => {
    setMessages(await listMessages(db, conversationId));
  }, [db, conversationId]);

  // Keeps the stored title/avatar current as they resolve, independent of
  // the socket lifecycle below.
  useEffect(() => {
    if (recipientName || recipientAvatarObjectKey) {
      upsertConversation(db, conversationId, recipientName || titleRef.current, new Date().toISOString(), recipientAvatarObjectKey);
    }
  }, [conversationId, db, recipientAvatarObjectKey, recipientName]);

  const ackIfNotMine = useCallback(
    (messageId: string, senderId: string, recipient: string) => {
      if (senderId === userId) return;
      // Settings → Privacy "Send read receipts" off: still fine to receive
      // and display the message, just never reveal that I've read it —
      // it'll sit at delivered from the sender's side, same as WhatsApp.
      if (!preferences.isSendReadReceipts()) return;
      if (isGroup) {
        socketRef.current?.sendGroupAck({ conversationId, messageIds: [messageId], status: 'READ' });
      } else if (recipient === userId) {
        socketRef.current?.sendAck({ conversationId, messageIds: [messageId], status: 'READ' });
      }
    },
    [conversationId, isGroup, userId]
  );

  useEffect(() => {
    let cancelled = false;

    reload();
    upsertConversation(db, conversationId, titleRef.current, new Date().toISOString(), avatarRef.current, isGroup);

    messagingApi.fetchHistory(conversationId).then(async (history) => {
      for (const envelope of history) {
        await upsertMessage(db, envelopeToLocalMessage(envelope));
        ackIfNotMine(envelope.messageId, envelope.senderId, envelope.recipientId);
      }
      if (!cancelled) await reload();
    }).catch((e) => {
      console.warn('[useConversation] fetchHistory failed', e);
    });

    const socket = new ChatSocket(accessToken);
    socketRef.current = socket;
    socket.connect(() => {
      socket.subscribeToConversation(conversationId, async (envelope) => {
        await upsertMessage(db, envelopeToLocalMessage(envelope));
        ackIfNotMine(envelope.messageId, envelope.senderId, envelope.recipientId);
        await upsertConversation(db, conversationId, titleRef.current, envelope.sentAt, avatarRef.current, isGroup);
        if (!cancelled) await reload();
      });

      socket.subscribeToMutations(conversationId, async (mutation) => {
        await applyMessageMutation(db, mutation.messageId, {
          ciphertext: mutation.ciphertext,
          edited: mutation.edited,
          deleted: mutation.deleted,
        });
        if (!cancelled) await reload();
      });

      if (isGroup) {
        socket.subscribeToReceipts(conversationId, async (update) => {
          await applyReceipt(db, update.messageId, update.userId, update.status.toLowerCase() as LocalMessage['status']);
          await recomputeGroupMessageStatus(db, update.messageId, groupId);
          if (!cancelled) await reload();
        });
      } else {
        socket.subscribeToStatusUpdates(conversationId, async (update) => {
          const localStatus = update.status.toLowerCase() as LocalMessage['status'];
          await advanceMessagesStatus(db, update.messageIds, localStatus);
          if (!cancelled) await reload();
        });
      }

      // The topic is a plain broadcast, so this also hears the sender's own
      // outgoing typing pings back — filtered out below rather than never
      // subscribing, since that's the same topic the other party's updates
      // arrive on.
      socket.subscribeToTyping(conversationId, (update) => {
        if (cancelled || update.userId === userId) return;
        const timers = typingExpiryRef.current;
        const existing = timers.get(update.userId);
        if (existing) clearTimeout(existing);

        if (update.isTyping) {
          timers.set(
            update.userId,
            setTimeout(() => {
              timers.delete(update.userId);
              setTypingUserIds((prev) => prev.filter((id) => id !== update.userId));
            }, TYPING_EXPIRY_MS)
          );
          setTypingUserIds((prev) => (prev.includes(update.userId) ? prev : [...prev, update.userId]));
        } else {
          timers.delete(update.userId);
          setTypingUserIds((prev) => prev.filter((id) => id !== update.userId));
        }
      });
    });

    return () => {
      cancelled = true;
      socket.disconnect();
      for (const timer of typingExpiryRef.current.values()) clearTimeout(timer);
      typingExpiryRef.current.clear();
      if (typingIdleTimerRef.current) clearTimeout(typingIdleTimerRef.current);
      isTypingSentRef.current = false;
      setTypingUserIds([]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, ackIfNotMine, conversationId, db, groupId, isGroup, reload, userId]);

  /** Call on every draft keystroke — internally debounced, safe to call as often as you like. */
  const notifyTyping = useCallback(() => {
    if (typingIdleTimerRef.current) clearTimeout(typingIdleTimerRef.current);
    if (!isTypingSentRef.current) {
      isTypingSentRef.current = true;
      socketRef.current?.sendTyping({ conversationId, isTyping: true });
    }
    typingIdleTimerRef.current = setTimeout(() => {
      isTypingSentRef.current = false;
      socketRef.current?.sendTyping({ conversationId, isTyping: false });
    }, TYPING_IDLE_MS);
  }, [conversationId]);

  const stopTyping = useCallback(() => {
    if (typingIdleTimerRef.current) clearTimeout(typingIdleTimerRef.current);
    if (isTypingSentRef.current) {
      isTypingSentRef.current = false;
      socketRef.current?.sendTyping({ conversationId, isTyping: false });
    }
  }, [conversationId]);

  const sendMessage = useCallback(
    async (plaintext: string, media?: OutgoingMedia) => {
      if (!userId) throw new Error('Cannot send a message while signed out');
      const envelope = {
        messageId: randomUUID(),
        conversationId,
        senderId: userId,
        recipientId: isGroup ? '' : recipientId ?? '',
        groupId,
        // TODO: encrypt with the recipient's Signal Protocol session before
        // this ships past the MVP phase — see architecture notes on E2E.
        ciphertext: plaintext,
        sentAt: new Date().toISOString(),
        mediaType: media?.type,
        mediaObjectKey: media?.objectKey,
        mediaFileName: media?.fileName,
        mediaDurationMs: media?.durationMs,
      };
      await upsertMessage(db, {
        message_id: envelope.messageId,
        conversation_id: envelope.conversationId,
        sender_id: envelope.senderId,
        recipient_id: envelope.recipientId,
        ciphertext: envelope.ciphertext,
        sent_at: envelope.sentAt,
        status: 'sending',
        media_type: media?.type ?? null,
        media_object_key: media?.objectKey ?? null,
        media_file_name: media?.fileName ?? null,
        media_duration_ms: media?.durationMs ?? null,
        edited: 0,
        deleted: 0,
      });
      await upsertConversation(db, conversationId, titleRef.current, envelope.sentAt, avatarRef.current, isGroup);
      await reload();
      stopTyping();
      socketRef.current?.send(envelope);
    },
    [conversationId, db, groupId, isGroup, recipientId, reload, stopTyping, userId]
  );

  const editMessage = useCallback(
    async (messageId: string, newText: string) => {
      await applyMessageMutation(db, messageId, { ciphertext: newText, edited: true, deleted: false });
      await reload();
      socketRef.current?.sendEdit({ conversationId, messageId, newCiphertext: newText });
    },
    [conversationId, db, reload]
  );

  const deleteMessage = useCallback(
    async (messageId: string) => {
      await applyMessageMutation(db, messageId, { ciphertext: null, edited: false, deleted: true });
      await reload();
      socketRef.current?.sendDelete({ conversationId, messageId });
    },
    [conversationId, db, reload]
  );

  return { messages, sendMessage, editMessage, deleteMessage, typingUserIds, notifyTyping };
}
