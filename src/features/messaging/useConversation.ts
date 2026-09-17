import { useCallback, useEffect, useRef, useState } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { randomUUID } from 'expo-crypto';

import {
  advanceMessagesStatus,
  applyMessageMutation,
  applyReactionUpdate,
  applyReceipt,
  getReactionsForConversation,
  markDeletedForMe,
  recomputeGroupMessageStatus,
  replaceReactionsForConversation,
  setDisappearingSeconds,
  setMuted as setMutedLocally,
  setPinnedLocally,
  useSQLiteContext,
  listMessages,
  upsertConversation,
  upsertMessage,
  type LocalMessage,
  type MediaType,
} from '../../data/db';
import { useAuth } from '../auth/AuthContext';
import { preferences } from '../../lib/preferences';
import { UNRESOLVED_TITLE_PLACEHOLDER } from './conversationId';
import * as messagingApi from './api';
import { MESSAGES_CLEARED_EVENT } from './inboxSocket';
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
    forwarded: envelope.forwarded ? 1 : 0,
    // Never arrives over the wire for the acting user (delete-for-me is
    // never broadcast) — if it's already deleted-for-me, MessageHistoryController
    // filters it out of history before it ever reaches here in the first
    // place, so this is always 0 for a freshly-received envelope.
    deleted_for_me: 0,
    attachments_json: envelope.attachments && envelope.attachments.length > 0 ? JSON.stringify(envelope.attachments) : null,
    reply_to_message_id: envelope.replyToMessageId ?? null,
    reply_to_conversation_id: envelope.replyToConversationId ?? null,
    reply_to_sender_id: envelope.replyToSenderId ?? null,
    reply_to_snippet: envelope.replyToSnippet ?? null,
    pinned: envelope.pinned ? 1 : 0,
    is_system: envelope.system ? 1 : 0,
    reply_to_status_id: envelope.replyToStatusId ?? null,
    reply_to_status_owner_id: envelope.replyToStatusOwnerId ?? null,
  };
}

export type ReplyToDraft = {
  messageId: string;
  conversationId: string;
  senderId: string;
  snippet: string;
};

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
  const { userId, accessToken, displayName } = useAuth();
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const socketRef = useRef<ChatSocket | null>(null);
  const isGroup = !!groupId;
  const titleRef = useRef(recipientName || UNRESOLVED_TITLE_PLACEHOLDER);
  titleRef.current = recipientName || UNRESOLVED_TITLE_PLACEHOLDER;
  const avatarRef = useRef<string | null | undefined>(recipientAvatarObjectKey);
  avatarRef.current = recipientAvatarObjectKey;

  // messageId -> (userId -> emoji), refreshed from the server once per
  // thread open (fetchReactions) and kept live via the .reactions topic —
  // see ChatController#react on the backend.
  const [reactions, setReactions] = useState<Map<string, Map<string, string>>>(new Map());
  const [disappearingSeconds, setDisappearingSecondsState] = useState<number | null>(null);
  const [muted, setMutedState] = useState(false);

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

  // A "Clear chat" triggered from contact-details.tsx (a different screen
  // than this thread) deletes rows in SQLite directly — without this, an
  // already-mounted thread underneath keeps showing its stale in-memory
  // `messages` state until it's closed and reopened.
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(MESSAGES_CLEARED_EVENT, (clearedConversationId: string) => {
      if (clearedConversationId === conversationId) reload();
    });
    return () => sub.remove();
  }, [conversationId, reload]);

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

    messagingApi.fetchConversationSettings(conversationId).then(async (s) => {
      await setDisappearingSeconds(db, conversationId, s.disappearingMessageSeconds);
      await setMutedLocally(db, [conversationId], s.muted);
      if (!cancelled) {
        setDisappearingSecondsState(s.disappearingMessageSeconds);
        setMutedState(s.muted);
      }
    }).catch((e) => {
      console.warn('[useConversation] fetchConversationSettings failed', e);
    });

    // Seeds this device's reaction cache with the server's current state —
    // a fresh install, or a thread this device hasn't opened before, has
    // nothing locally until this runs once.
    messagingApi.fetchReactions(conversationId).then(async (rows) => {
      await replaceReactionsForConversation(
        db,
        conversationId,
        rows.map((r) => ({ message_id: r.messageId, user_id: r.userId, emoji: r.emoji }))
      );
      if (!cancelled) setReactions(await getReactionsForConversation(db, conversationId));
    }).catch((e) => {
      console.warn('[useConversation] fetchReactions failed', e);
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

      socket.subscribeToReactions(conversationId, async (update) => {
        await applyReactionUpdate(db, update.messageId, update.userId, update.emoji);
        if (!cancelled) setReactions(await getReactionsForConversation(db, conversationId));
      });

      socket.subscribeToSettings(conversationId, async (update) => {
        await setDisappearingSeconds(db, conversationId, update.seconds);
        if (!cancelled) setDisappearingSecondsState(update.seconds);
      });

      socket.subscribeToMutations(conversationId, async (mutation) => {
        await applyMessageMutation(db, mutation.messageId, {
          ciphertext: mutation.ciphertext,
          edited: mutation.edited,
          deleted: mutation.deleted,
          pinned: mutation.pinned,
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
    async (
      plaintext: string,
      media?: OutgoingMedia,
      attachments?: OutgoingMedia[],
      replyTo?: ReplyToDraft,
      replyToStatus?: { statusId: string; ownerId: string }
    ) => {
      if (!userId) throw new Error('Cannot send a message while signed out');
      const attachmentDtos =
        attachments && attachments.length > 0
          ? attachments.map((a, i) => ({
              position: i,
              mediaType: a.type as 'IMAGE' | 'VIDEO',
              mediaObjectKey: a.objectKey,
              mediaFileName: a.fileName ?? null,
              mediaDurationMs: a.durationMs ?? null,
            }))
          : undefined;
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
        attachments: attachmentDtos,
        replyToMessageId: replyTo?.messageId ?? null,
        replyToConversationId: replyTo?.conversationId ?? null,
        replyToSenderId: replyTo?.senderId ?? null,
        replyToSnippet: replyTo?.snippet ?? null,
        replyToStatusId: replyToStatus?.statusId ?? null,
        replyToStatusOwnerId: replyToStatus?.ownerId ?? null,
        senderDisplayName: displayName,
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
        forwarded: 0,
        deleted_for_me: 0,
        attachments_json: attachmentDtos ? JSON.stringify(attachmentDtos) : null,
        reply_to_message_id: envelope.replyToMessageId,
        reply_to_conversation_id: envelope.replyToConversationId,
        reply_to_sender_id: envelope.replyToSenderId,
        reply_to_snippet: envelope.replyToSnippet,
        pinned: 0,
        is_system: 0,
        reply_to_status_id: envelope.replyToStatusId,
        reply_to_status_owner_id: envelope.replyToStatusOwnerId,
      });
      await upsertConversation(db, conversationId, titleRef.current, envelope.sentAt, avatarRef.current, isGroup);
      await reload();
      stopTyping();
      socketRef.current?.send(envelope);
    },
    [conversationId, db, groupId, isGroup, recipientId, reload, stopTyping, userId]
  );

  /** Toggles a message's shared pin — optimistic local update, then synced via /chat.pin. */
  const pinMessage = useCallback(
    async (messageId: string, pinned: boolean) => {
      await setPinnedLocally(db, messageId, pinned);
      await reload();
      socketRef.current?.sendPin({ conversationId, messageId, pinned });
    },
    [conversationId, db, reload]
  );

  /** Same emoji already reacted with → removes it; a different one → replaces it — see ChatController#react. Optimistic local update, server is the actual source of truth once its broadcast comes back. */
  const sendReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!userId) return;
      const current = reactions.get(messageId)?.get(userId);
      const next = current === emoji ? null : emoji;
      await applyReactionUpdate(db, messageId, userId, next);
      setReactions(await getReactionsForConversation(db, conversationId));
      socketRef.current?.sendReaction({ messageId, conversationId, emoji });
    },
    [conversationId, db, reactions, userId]
  );

  /** seconds=null turns disappearing messages off — applies only to messages sent from now on. */
  const setDisappearing = useCallback(
    async (seconds: number | null) => {
      await setDisappearingSeconds(db, conversationId, seconds);
      setDisappearingSecondsState(seconds);
      await messagingApi.setDisappearingMessages(conversationId, seconds);
    },
    [conversationId, db]
  );

  /**
   * Server-side, not just local — see MutedConversation's own doc comment
   * on why (push suppression) — but ALSO mirrored into the local
   * conversations.is_muted column so the chat list's own mute icon (see
   * chats/index.tsx's bulk-select mute action) reflects a mute toggled from
   * inside a thread too, and vice versa.
   */
  const setMuted = useCallback(
    async (nextMuted: boolean) => {
      setMutedState(nextMuted);
      await setMutedLocally(db, [conversationId], nextMuted);
      await messagingApi.setConversationMuted(conversationId, nextMuted);
    },
    [conversationId, db]
  );

  const editMessage = useCallback(
    async (messageId: string, newText: string) => {
      await applyMessageMutation(db, messageId, { ciphertext: newText, edited: true, deleted: false });
      await reload();
      socketRef.current?.sendEdit({ conversationId, messageId, newCiphertext: newText });
    },
    [conversationId, db, reload]
  );

  /**
   * "everyone" (own messages only, enforced server-side too) marks the
   * shared row deleted and syncs to every participant. "me" only ever
   * touches this device's local deleted_for_me column — no shared mutation,
   * no optimistic broadcast expectation, since the server never echoes it
   * back to the acting user either.
   */
  const deleteMessage = useCallback(
    async (messageId: string, scope: 'everyone' | 'me') => {
      if (scope === 'me') {
        await markDeletedForMe(db, messageId);
        await reload();
        socketRef.current?.sendDelete({ conversationId, messageId, scope: 'ME' });
        return;
      }
      await applyMessageMutation(db, messageId, { ciphertext: null, edited: false, deleted: true });
      await reload();
      socketRef.current?.sendDelete({ conversationId, messageId, scope: 'EVERYONE' });
    },
    [conversationId, db, reload]
  );

  return {
    messages,
    sendMessage,
    editMessage,
    deleteMessage,
    pinMessage,
    typingUserIds,
    notifyTyping,
    reactions,
    sendReaction,
    disappearingSeconds,
    setDisappearing,
    muted,
    setMuted,
    // Exposed so screens that mutate SQLite directly (e.g. "Clear chat",
    // which deletes rows outside this hook's own action functions) can make
    // this hook's in-memory `messages` state reflect it — otherwise the
    // thread visibly doesn't change until it's closed and reopened, since
    // `messages` is only ever populated on connect/action, never re-read
    // from SQLite on every render.
    reloadMessages: reload,
  };
}
