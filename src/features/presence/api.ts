import { config } from '../../lib/config';
import { apiFetch } from '../../lib/httpClient';

export type PresenceResponse = {
  userId: string;
  online: boolean;
  lastSeen: string | null;
};

export function sendHeartbeat(userId: string): Promise<void> {
  return apiFetch(`${config.presenceServiceUrl}/api/presence/${userId}/heartbeat`, { method: 'POST' });
}

export function markOffline(userId: string): Promise<void> {
  return apiFetch(`${config.presenceServiceUrl}/api/presence/${userId}/offline`, { method: 'POST' });
}

export function getPresence(userId: string): Promise<PresenceResponse> {
  return apiFetch(`${config.presenceServiceUrl}/api/presence/${userId}`);
}
