import { config } from '../../lib/config';
import { apiFetch } from '../../lib/httpClient';

export type SessionResult = {
  id: string;
  deviceLabel: string | null;
  createdAt: string;
  lastSeenAt: string;
  isCurrent: boolean;
};

export function listSessions(): Promise<SessionResult[]> {
  return apiFetch(`${config.authServiceUrl}/api/sessions`);
}

export function revokeSession(id: string): Promise<void> {
  return apiFetch(`${config.authServiceUrl}/api/sessions/${id}`, { method: 'DELETE' });
}
