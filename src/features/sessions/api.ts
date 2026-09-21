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

/** What a "Link a device" QR scan shows before committing — the web-supplied browser label, e.g. "Chrome on Windows". */
export function getPairingInfo(token: string): Promise<{ deviceLabel: string }> {
  return apiFetch(`${config.authServiceUrl}/api/auth/pairing/${encodeURIComponent(token)}`);
}

/** Mints the new web session server-side — this device's own valid session is what authenticates the approval, the web browser never handles a token directly. */
export function approvePairing(token: string): Promise<void> {
  return apiFetch(`${config.authServiceUrl}/api/auth/pairing/${encodeURIComponent(token)}/approve`, { method: 'POST' });
}

export function denyPairing(token: string): Promise<void> {
  return apiFetch(`${config.authServiceUrl}/api/auth/pairing/${encodeURIComponent(token)}/deny`, { method: 'POST' });
}
