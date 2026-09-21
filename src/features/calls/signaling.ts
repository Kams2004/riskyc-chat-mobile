import { Client, type IMessage } from '@stomp/stompjs';

import { messagingWebSocketUrl } from '../../lib/config';

export type CallType = 'AUDIO' | 'VIDEO';

export type CallInvite = {
  callId: string;
  fromUserId: string;
  toUserId: string;
  type: CallType;
  sdpOffer: string;
  callerName?: string | null;
};
export type CallAnswer = { callId: string; fromUserId: string; sdpAnswer: string };
export type CallIceCandidate = {
  callId: string;
  fromUserId: string;
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
};
export type CallEnd = { callId: string; fromUserId: string; reason: string };
export type CallRenegotiateOffer = { callId: string; fromUserId: string; sdpOffer: string };
export type CallUsageReport = { callId: string; bytesSent: number; bytesReceived: number };
/** roomId is always === groupId (see backend/sfu-service's room model) — carried anyway for symmetry with CallInvite's callId. */
export type GroupCallInviteMessage = { roomId: string; groupId: string; callerId: string; callerName: string; callType: CallType };

type QueuedFrame = { destination: string; body: string };

type Handlers = {
  onInvite?: (invite: CallInvite) => void;
  onAnswer?: (answer: CallAnswer) => void;
  onIce?: (ice: CallIceCandidate) => void;
  onEnd?: (end: CallEnd) => void;
  /** The non-offering side's response to attemptIceRestart's renegotiation offer. */
  onRenegotiateOffer?: (offer: CallRenegotiateOffer) => void;
  /** Only the offering side (the one who called startCall, not acceptIncoming) ever receives this. */
  onRenegotiateAnswer?: (answer: CallAnswer) => void;
  /** Fanned out via messaging-service's GroupCallController — a different call system (sfu-service) entirely, riding this same persistent channel purely for delivery, same as 1:1 invites. */
  onGroupInvite?: (invite: GroupCallInviteMessage) => void;
};

/**
 * Same connection pattern as ChatSocket (ws.ts) — plain WebSocketFactory (no
 * subprotocol negotiation), binary frames (React Native's WS bridge
 * truncates text frames at the STOMP NUL terminator otherwise). One
 * always-on instance, mounted for the lifetime of a signed-in session (see
 * CallContext), subscribed to the single /user/queue/calls destination that
 * carries every call message type, discriminated by the callMessageType
 * STOMP header (see CallController#headersFor on the backend).
 */
export class CallSignalingSocket {
  private client: Client;
  private pending: QueuedFrame[] = [];

  constructor(accessToken?: string | null) {
    this.client = new Client({
      webSocketFactory: () => new WebSocket(messagingWebSocketUrl(accessToken)),
      reconnectDelay: 3000,
      forceBinaryWSFrames: true,
      appendMissingNULLonIncoming: true,
    });
  }

  connect(handlers: Handlers, onConnected?: () => void) {
    this.client.onConnect = () => {
      this.client.subscribe('/user/queue/calls', (frame: IMessage) => {
        const type = frame.headers['callMessageType'];
        const body = JSON.parse(frame.body);
        switch (type) {
          case 'invite':
            handlers.onInvite?.(body as CallInvite);
            break;
          case 'answer':
            handlers.onAnswer?.(body as CallAnswer);
            break;
          case 'ice':
            handlers.onIce?.(body as CallIceCandidate);
            break;
          case 'end':
            handlers.onEnd?.(body as CallEnd);
            break;
          case 'renegotiate-offer':
            handlers.onRenegotiateOffer?.(body as CallRenegotiateOffer);
            break;
          case 'renegotiate-answer':
            handlers.onRenegotiateAnswer?.(body as CallAnswer);
            break;
          case 'group-invite':
            handlers.onGroupInvite?.(body as GroupCallInviteMessage);
            break;
        }
      });
      onConnected?.();
      this.flushPending();
    };
    this.client.onStompError = (frame) => {
      console.warn('[CallSignalingSocket] STOMP error', frame.headers['message'], frame.body);
    };
    this.client.activate();
  }

  disconnect() {
    this.client.deactivate();
  }

  sendInvite(invite: Omit<CallInvite, 'fromUserId'>) {
    this.enqueue({ destination: '/app/call.invite', body: JSON.stringify(invite) });
  }

  sendAnswer(answer: Omit<CallAnswer, 'fromUserId'>) {
    this.enqueue({ destination: '/app/call.answer', body: JSON.stringify(answer) });
  }

  sendIce(ice: Omit<CallIceCandidate, 'fromUserId'>) {
    this.enqueue({ destination: '/app/call.ice', body: JSON.stringify(ice) });
  }

  sendEnd(end: Omit<CallEnd, 'fromUserId'>) {
    this.enqueue({ destination: '/app/call.end', body: JSON.stringify(end) });
  }

  sendRenegotiateOffer(offer: Omit<CallRenegotiateOffer, 'fromUserId'>) {
    this.enqueue({ destination: '/app/call.renegotiate', body: JSON.stringify(offer) });
  }

  sendRenegotiateAnswer(answer: Omit<CallAnswer, 'fromUserId'>) {
    this.enqueue({ destination: '/app/call.renegotiate-answer', body: JSON.stringify(answer) });
  }

  /** Fire-and-forget, best-effort — a lost usage report just means that side's data column stays null in the call log, nothing else depends on it. */
  sendUsageReport(report: CallUsageReport) {
    this.enqueue({ destination: '/app/call.report-usage', body: JSON.stringify(report) });
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
