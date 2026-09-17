import type { AttachmentItem, MediaType } from '../../data/db';
import { config } from '../../lib/config';
import { apiFetch } from '../../lib/httpClient';

export type MessageStatus = 'SENT' | 'DELIVERED' | 'READ';

export type MessageEnvelope = {
  messageId: string;
  conversationId: string;
  senderId: string;
  recipientId: string;
  ciphertext: string;
  sentAt: string;
  // Optional: absent on the envelope the client builds locally to send, since
  // the server decides/stamps status — always present on anything read back
  // from history or a live subscription.
  status?: MessageStatus;
  mediaType?: MediaType | null;
  mediaObjectKey?: string | null;
  mediaFileName?: string | null;
  mediaDurationMs?: number | null;
  edited?: boolean;
  deleted?: boolean;
  /** Set only for a group message — absent/null for 1:1. */
  groupId?: string | null;
  /** True when this message originated from a forward action — see the "Forwarded" label in MessageBubble. */
  forwarded?: boolean;
  /** Populated only for a multi-image/video gallery send — see the single mediaType/mediaObjectKey fields above for everything else. */
  attachments?: AttachmentItem[];
  /** All four null/absent for a message that isn't a reply — see Message.java's own comment on why these are denormalized. */
  replyToMessageId?: string | null;
  replyToConversationId?: string | null;
  replyToSenderId?: string | null;
  replyToSnippet?: string | null;
  /** Shared, per-conversation pin — absent on the envelope the client builds to send (pin is a separate action, not part of send). */
  pinned?: boolean;
  /** Set on the envelope the client builds to send (from AuthContext's own displayName) — used server-side only, for the push notification title. Absent on anything read back. */
  senderDisplayName?: string | null;
  /** Set only when the conversation had disappearing messages on at send time — see Message.java's own comment. */
  expiresAt?: string | null;
};

export function fetchHistory(conversationId: string): Promise<MessageEnvelope[]> {
  return apiFetch(`${config.messagingServiceUrl}/api/messages/${conversationId}`);
}

export type MediaSummaryItem = { messageId: string; mediaType: string; mediaObjectKey: string; mediaFileName: string | null; sentAt: string | null };

/** Feeds the contact-details "Media, links, and docs" preview + its scoped sub-page. */
export function getMediaSummary(conversationId: string, types = 'IMAGE,VIDEO,FILE', limit = 50): Promise<MediaSummaryItem[]> {
  return apiFetch(`${config.messagingServiceUrl}/api/messages/${conversationId}/media-summary?types=${types}&limit=${limit}`);
}

export type SearchResult = { messageId: string; senderId: string; ciphertext: string; sentAt: string };

export function searchInConversation(conversationId: string, query: string): Promise<SearchResult[]> {
  return apiFetch(`${config.messagingServiceUrl}/api/messages/${conversationId}/search?q=${encodeURIComponent(query)}`);
}

export type MessageStatusUpdate = {
  conversationId: string;
  messageIds: string[];
  status: MessageStatus;
};

export type MessageMutation = {
  conversationId: string;
  messageId: string;
  ciphertext: string | null;
  edited: boolean;
  deleted: boolean;
  pinned: boolean;
};

export type MessageEditRequest = { conversationId: string; messageId: string; newCiphertext: string };
/** scope "EVERYONE" is sender-only and broadcasts; "ME" is available to any participant and is never broadcast. */
export type MessageDeleteRequest = { conversationId: string; messageId: string; scope: 'EVERYONE' | 'ME' };
/** Any participant, not just the sender — pin is a per-conversation bookmark, not an authorship right. */
export type MessagePinRequest = { conversationId: string; messageId: string; pinned: boolean };

export type GroupAckRequest = { conversationId: string; messageIds: string[]; status: MessageStatus };
export type GroupReceiptUpdate = { conversationId: string; messageId: string; userId: string; status: MessageStatus };

export type TypingIndicator = { conversationId: string; isTyping: boolean };
export type TypingUpdate = { conversationId: string; userId: string; isTyping: boolean };

export type ConversationSummary = {
  conversationId: string;
  otherUserId: string | null;
  groupId: string | null;
  lastMessageAt: string;
  muted: boolean;
  disappearingMessageSeconds: number | null;
};

/**
 * Reconciliation for a conversation this device never saw live over STOMP —
 * see ConversationController on the backend for why that can happen (the
 * app-wide inbox socket only knows about a conversation once something
 * arrives while it's actually connected).
 */
export function listConversationSummaries(): Promise<ConversationSummary[]> {
  return apiFetch(`${config.messagingServiceUrl}/api/conversations`);
}

export type ConversationSettingsResult = { muted: boolean; disappearingMessageSeconds: number | null };

/** The thread screen's own initial fetch for mute/disappearing state, rather than searching listConversationSummaries() for one entry. */
export function fetchConversationSettings(conversationId: string): Promise<ConversationSettingsResult> {
  return apiFetch(`${config.messagingServiceUrl}/api/conversations/${conversationId}/settings`);
}

/** Server-side (not just a local flag) so ChatController#send can skip this user's push before it's ever sent — see MutedConversation's own doc comment on the backend. */
export function setConversationMuted(conversationId: string, muted: boolean): Promise<void> {
  return apiFetch(`${config.messagingServiceUrl}/api/conversations/${conversationId}/mute`, {
    method: 'PUT',
    body: JSON.stringify({ muted }),
  });
}

/** seconds=null turns disappearing messages off. Applies only to messages sent from now on. */
export function setDisappearingMessages(conversationId: string, seconds: number | null): Promise<void> {
  return apiFetch(`${config.messagingServiceUrl}/api/conversations/${conversationId}/disappearing`, {
    method: 'PUT',
    body: JSON.stringify({ seconds }),
  });
}

export type ReactionRow = { messageId: string; userId: string; emoji: string };

/** Bulk, one call per thread open — feeds initial reaction state; live updates arrive over the .reactions STOMP topic afterward. */
export function fetchReactions(conversationId: string): Promise<ReactionRow[]> {
  return apiFetch(`${config.messagingServiceUrl}/api/messages/${conversationId}/reactions`);
}

export type LinkPreview = { url: string; title: string | null; description: string | null; imageUrl: string | null; siteName: string | null };

export function fetchLinkPreview(url: string): Promise<LinkPreview> {
  return apiFetch(`${config.messagingServiceUrl}/api/link-preview?url=${encodeURIComponent(url)}`);
}
