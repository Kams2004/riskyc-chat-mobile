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
