import { config } from '../../lib/config';
import { apiFetch } from '../../lib/httpClient';

export type CallResult = {
  id: string;
  callerId: string;
  calleeId: string;
  type: 'AUDIO' | 'VIDEO';
  status: 'RINGING' | 'ACCEPTED' | 'DECLINED' | 'MISSED' | 'ENDED';
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
};

export function listCallHistory(): Promise<CallResult[]> {
  return apiFetch(`${config.messagingServiceUrl}/api/calls`);
}

export type CallSnapshot = {
  callId: string;
  fromUserId: string;
  callerName: string | null;
  type: 'AUDIO' | 'VIDEO';
  sdpOffer: string;
};

/** What a notification Answer/Decline action fetches the instant it's tapped — see CallController#getCall. 410 once the call is no longer ringing. */
export function getCallSnapshot(callId: string): Promise<CallSnapshot> {
  return apiFetch(`${config.messagingServiceUrl}/api/calls/${callId}`);
}
