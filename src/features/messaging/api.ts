import type { MediaType } from '../../data/db';
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
};

export function fetchHistory(conversationId: string): Promise<MessageEnvelope[]> {
  return apiFetch(`${config.messagingServiceUrl}/api/messages/${conversationId}`);
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
};

export type MessageEditRequest = { conversationId: string; messageId: string; newCiphertext: string };
export type MessageDeleteRequest = { conversationId: string; messageId: string };

export type GroupAckRequest = { conversationId: string; messageIds: string[]; status: MessageStatus };
export type GroupReceiptUpdate = { conversationId: string; messageId: string; userId: string; status: MessageStatus };

export type TypingIndicator = { conversationId: string; isTyping: boolean };
export type TypingUpdate = { conversationId: string; userId: string; isTyping: boolean };
