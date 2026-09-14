import { Client, type IMessage } from '@stomp/stompjs';

import { messagingWebSocketUrl } from '../../lib/config';
import type {
  GroupAckRequest,
  GroupReceiptUpdate,
  MessageDeleteRequest,
  MessageEditRequest,
  MessageEnvelope,
  MessageMutation,
  MessageStatusUpdate,
  TypingIndicator,
  TypingUpdate,
} from './api';

/**
 * Thin wrapper around a STOMP client talking to messaging-service's
 * /ws endpoint. One instance per active chat screen; the underlying
 * connection reconnects on its own (reconnectDelay) if the network drops.
 *
 * The handshake is asynchronous — a message typed and sent right after
 * opening a chat can easily beat `onConnect`, so publish() must never be
 * called until the client actually reports connected; anything sent before
 * that (or during a reconnect) is queued and flushed once it is.
 *
 * Ordering matters here: onConnected runs BEFORE flushPending so the caller's
 * subscribe() call (which sends its SUBSCRIBE frame synchronously) is on the
 * wire before any queued SEND frames — otherwise a message sent immediately
 * after opening a chat gets broadcast before the sender is subscribed to
 * hear its own echo back, and its status never leaves "sending".
 */
type QueuedFrame = { destination: string; body: string };

export class ChatSocket {
  private client: Client;
  private pending: QueuedFrame[] = [];

  constructor(accessToken?: string | null) {
    this.client = new Client({
      // Not brokerURL: that makes stompjs call `new WebSocket(url, stompSubProtocols)`,
      // and React Native's WebSocket has known issues with the subprotocol
      // negotiation path that can silently break incoming message delivery
      // (CONNECT goes out fine, but the CONNECTED reply never reaches
      // onmessage). A plain WebSocketFactory with no subprotocol list avoids
      // that path entirely — STOMP doesn't require WS-level subprotocol
      // negotiation to function, only the CONNECT/CONNECTED frames matter.
      webSocketFactory: () => new WebSocket(messagingWebSocketUrl(accessToken)),
      reconnectDelay: 3000,
      // React Native's WebSocket bridge silently truncates text frames at an
      // embedded NUL byte, which is exactly the octet STOMP uses to terminate
      // every frame — the server was receiving CONNECT with its trailing \0
      // stripped and waiting forever for a terminator that never arrived
      // ("Incomplete STOMP frame content received"). Sending frames as binary
      // (ArrayBuffer) instead of text avoids that truncation entirely.
      forceBinaryWSFrames: true,
      appendMissingNULLonIncoming: true,
    });
  }

  connect(onConnected?: () => void) {
    this.client.onConnect = () => {
      onConnected?.();
      this.flushPending();
    };
    this.client.onStompError = (frame) => {
      console.warn('[ChatSocket] STOMP error', frame.headers['message'], frame.body);
    };
    this.client.activate();
  }

  disconnect() {
    this.client.deactivate();
  }

  subscribeToConversation(conversationId: string, onMessage: (envelope: MessageEnvelope) => void) {
    return this.client.subscribe(`/topic/conversation.${conversationId}`, (frame: IMessage) => {
      onMessage(JSON.parse(frame.body) as MessageEnvelope);
    });
  }

  subscribeToStatusUpdates(conversationId: string, onStatus: (update: MessageStatusUpdate) => void) {
    return this.client.subscribe(`/topic/conversation.${conversationId}.status`, (frame: IMessage) => {
      onStatus(JSON.parse(frame.body) as MessageStatusUpdate);
    });
  }

  /** A message's own sender edited or deleted it (see ChatController#edit/#delete). */
  subscribeToMutations(conversationId: string, onMutation: (mutation: MessageMutation) => void) {
    return this.client.subscribe(`/topic/conversation.${conversationId}.mutations`, (frame: IMessage) => {
      onMutation(JSON.parse(frame.body) as MessageMutation);
    });
  }

  /** One group member's own delivery/read receipt for one message (see ChatController#ackGroup). */
  subscribeToReceipts(conversationId: string, onReceipt: (update: GroupReceiptUpdate) => void) {
    return this.client.subscribe(`/topic/conversation.${conversationId}.receipts`, (frame: IMessage) => {
      onReceipt(JSON.parse(frame.body) as GroupReceiptUpdate);
    });
  }

  /** Ephemeral "someone is typing" state for whoever has this thread open (see ChatController#typing). */
  subscribeToTyping(conversationId: string, onTyping: (update: TypingUpdate) => void) {
    return this.client.subscribe(`/topic/conversation.${conversationId}.typing`, (frame: IMessage) => {
      onTyping(JSON.parse(frame.body) as TypingUpdate);
    });
  }

  /**
   * Every message addressed to this user, across every conversation,
   * regardless of whether its thread is currently open — routed by the
   * server via convertAndSendToUser(recipientId, ...) to this session's
   * Principal (set from the ?token= JWT). Used by the app-wide InboxSocket.
   */
  subscribeToUserQueue(onMessage: (envelope: MessageEnvelope) => void) {
    return this.client.subscribe('/user/queue/messages', (frame: IMessage) => {
      onMessage(JSON.parse(frame.body) as MessageEnvelope);
    });
  }

  /** Same idea as subscribeToUserQueue, but for edits/deletes to messages in any conversation. */
  subscribeToUserMutations(onMutation: (mutation: MessageMutation) => void) {
    return this.client.subscribe('/user/queue/mutations', (frame: IMessage) => {
      onMutation(JSON.parse(frame.body) as MessageMutation);
    });
  }

  send(envelope: MessageEnvelope) {
    this.enqueue({ destination: '/app/chat.send', body: JSON.stringify(envelope) });
  }

  sendAck(update: MessageStatusUpdate) {
    this.enqueue({ destination: '/app/chat.ack', body: JSON.stringify(update) });
  }

  sendEdit(request: MessageEditRequest) {
    this.enqueue({ destination: '/app/chat.edit', body: JSON.stringify(request) });
  }

  sendDelete(request: MessageDeleteRequest) {
    this.enqueue({ destination: '/app/chat.delete', body: JSON.stringify(request) });
  }

  /** Group counterpart to sendAck — see ChatController#ackGroup for why it's a separate endpoint. */
  sendGroupAck(request: GroupAckRequest) {
    this.enqueue({ destination: '/app/chat.ack.group', body: JSON.stringify(request) });
  }

  /**
   * Deliberately NOT queued via enqueue()/pending like everything else here:
   * a stale "isTyping: true" sitting in the pending queue across a
   * reconnect could get flushed and sent well after the person actually
   * stopped typing. Typing state is best-effort and self-correcting (the
   * receiver also has its own timeout, see useConversation.ts) — silently
   * dropping one while disconnected is the right failure mode, not queuing it.
   */
  sendTyping(indicator: TypingIndicator) {
    if (!this.client.connected) return;
    this.publish({ destination: '/app/chat.typing', body: JSON.stringify(indicator) });
  }

  private enqueue(frame: QueuedFrame) {
    if (!this.client.connected) {
      this.pending.push(frame);
      return;
    }
    this.publish(frame);
  }

  private flushPending() {
    const queued = this.pending;
    this.pending = [];
    for (const frame of queued) {
      this.publish(frame);
    }
  }

  private publish(frame: QueuedFrame) {
    this.client.publish({ destination: frame.destination, body: frame.body });
  }
}
