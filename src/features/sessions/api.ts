import { config } from '../../lib/config';
import { apiFetch } from '../../lib/httpClient';

export type SessionResult = {
  id: string;
  deviceLabel: string | null;
  createdAt: string;
  lastSeenAt: string;
  isCurrent: boolean;
  /** This is the account's master device — the one that originally verified the phone number, or the first to sign back in after a previous master's sign-out cascaded everyone else out. Only a master session may revoke another device or delete the account. */
  isMaster: boolean;
};

export function listSessions(): Promise<SessionResult[]> {
  return apiFetch(`${config.authServiceUrl}/api/sessions`);
}

/**
 * Revoking your OWN current session is always allowed — an ordinary sign-out.
 * Revoking any OTHER device requires this device to be master (403 otherwise).
 * If the current session IS master and this is a self-revoke, the server
 * cascades to sign out every other linked device too.
 */
export function revokeSession(id: string): Promise<void> {
  return apiFetch(`${config.authServiceUrl}/api/sessions/${id}`, { method: 'DELETE' });
}

/** The deployment-wide max-linked-devices cap — see AuthController.DeviceLimitError. */
export function getDeviceLimit(): Promise<{ maxLinkedDevices: number }> {
  return apiFetch(`${config.authServiceUrl}/api/sessions/limit`);
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
