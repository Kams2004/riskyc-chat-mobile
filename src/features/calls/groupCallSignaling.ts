import { sfuWebSocketUrl } from '../../lib/config';

export type GroupCallType = 'AUDIO' | 'VIDEO';

type PendingRequest = {
  resolve: (data: Record<string, unknown>) => void;
  reject: (error: Error) => void;
};

export type GroupCallNotificationHandlers = {
  onPeerJoined?: (data: { peerId: string; displayName: string }) => void;
  onPeerLeft?: (data: { peerId: string }) => void;
  onNewProducer?: (data: { peerId: string; displayName: string; producerId: string; kind: 'audio' | 'video' }) => void;
  onProducerClosed?: (data: { producerId: string }) => void;
};

/**
 * Hand-rolled client for sfu-service's protoo wire protocol — NOT the
 * protoo-client npm package (its React Native compatibility is unverified,
 * and this is ~80 lines, not worth a second dependency to debug on top of
 * the mediasoup-client RN integration). Wire shapes match protoo-server
 * exactly (see backend/sfu-service/node_modules/protoo-server/lib/Message.js):
 * request {request:true, id, method, data}, response {response:true, id, ok,
 * data|errorCode/errorReason}, notification {notification:true, method, data}.
 *
 * Unlike ChatSocket/CallSignalingSocket, this does NOT auto-reconnect — a
 * dropped connection here means a full rejoin (fresh transports, fresh
 * produce/consume calls), never a resume of server-side Peer state (protoo's
 * Peer object doesn't survive a raw reconnect). GroupCallContext is
 * responsible for deciding whether/how to rejoin after onDisconnected fires.
 */
export class GroupCallSignalingSocket {
  private ws: WebSocket | null = null;
  private nextRequestId = 1;
  private pendingRequests = new Map<number, PendingRequest>();
  private handlers: GroupCallNotificationHandlers = {};

  connect(
    accessToken: string | null | undefined,
    groupId: string,
    displayName: string,
    callType: GroupCallType,
    handlers: GroupCallNotificationHandlers,
    onOpen: () => void,
    onDisconnected: (reason: string) => void
  ) {
    this.handlers = handlers;
    const url = sfuWebSocketUrl(accessToken, groupId, displayName, callType);
    // The 'protoo' subprotocol is required — protoo-server's WebSocketServer
    // rejects the handshake outright (403) without it.
    const ws = new WebSocket(url, 'protoo');
    this.ws = ws;

    ws.onopen = () => onOpen();
    ws.onmessage = (event) => this.handleMessage(String(event.data));
    ws.onerror = (event) => console.warn('[GroupCallSignalingSocket] error', event);
    ws.onclose = (event) => {
      this.rejectAllPending(new Error('Connection closed'));
      onDisconnected(event.reason || `code ${event.code}`);
    };
  }

  disconnect() {
    this.rejectAllPending(new Error('Disconnected'));
    this.ws?.close();
    this.ws = null;
  }

  request(method: string, data: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected'));
        return;
      }
      const id = this.nextRequestId++;
      this.pendingRequests.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ request: true, id, method, data }));
    });
  }

  private handleMessage(raw: string) {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }

    if (message.response) {
      const id = message.id as number;
      const pending = this.pendingRequests.get(id);
      if (!pending) return;
      this.pendingRequests.delete(id);
      if (message.ok) {
        pending.resolve((message.data as Record<string, unknown>) ?? {});
      } else {
        pending.reject(new Error(`${message.errorCode}: ${message.errorReason}`));
      }
      return;
    }

    if (message.notification) {
      const data = (message.data as Record<string, unknown>) ?? {};
      switch (message.method) {
        case 'peerJoined':
          this.handlers.onPeerJoined?.(data as { peerId: string; displayName: string });
          break;
        case 'peerLeft':
          this.handlers.onPeerLeft?.(data as { peerId: string });
          break;
        case 'newProducer':
          this.handlers.onNewProducer?.(data as { peerId: string; displayName: string; producerId: string; kind: 'audio' | 'video' });
          break;
        case 'producerClosed':
          this.handlers.onProducerClosed?.(data as { producerId: string });
          break;
      }
    }
  }

  private rejectAllPending(error: Error) {
    for (const pending of this.pendingRequests.values()) {
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }
}
