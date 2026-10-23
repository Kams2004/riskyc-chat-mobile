import { config } from '../../lib/config';
import { apiFetch } from '../../lib/httpClient';
import type { VerifyOtpResponse } from '../auth/api';

export type SessionResult = {
  id: string;
  deviceLabel: string | null;
  createdAt: string;
  lastSeenAt: string;
  isCurrent: boolean;
  /** This is the account's master device — the one that originally verified the phone number, or the first to sign back in after a previous master's sign-out cascaded everyone else out. Only a master session may revoke another device or delete the account. */
  isMaster: boolean;
  /** True for an entry in the "recently signed out" window (30 days) — revokedAt is only populated alongside this. A currently-active session always has revoked=false/revokedAt=null. */
  revoked: boolean;
  revokedAt: string | null;
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

/** What a "Link a device" scan/manual-entry shows before committing — the other device's own supplied label, e.g. "Chrome on Windows" or "Pixel 8". */
export function getPairingInfo(token: string): Promise<{ deviceLabel: string }> {
  return apiFetch(`${config.authServiceUrl}/api/auth/pairing/${encodeURIComponent(token)}`);
}

/** The manual-entry fallback for when scanning the QR isn't possible (broken/denied camera) — resolves the short, hand-typed code back to its token, then the caller proceeds through getPairingInfo/approvePairing/denyPairing exactly as if it had scanned a QR. */
export function resolvePairingCode(code: string): Promise<{ token: string }> {
  return apiFetch(`${config.authServiceUrl}/api/auth/pairing/by-code/${encodeURIComponent(code)}`);
}

/** Mints the new session server-side — this device's own valid session is what authenticates the approval, the other device never handles a token directly. */
export function approvePairing(token: string): Promise<void> {
  return apiFetch(`${config.authServiceUrl}/api/auth/pairing/${encodeURIComponent(token)}/approve`, { method: 'POST' });
}

export function denyPairing(token: string): Promise<void> {
  return apiFetch(`${config.authServiceUrl}/api/auth/pairing/${encodeURIComponent(token)}/deny`, { method: 'POST' });
}

/** The "new phone, skip the OTP SMS" side — mirrors web's SignIn.tsx startPairing/pollPairingStatus. platform defaults to the mobile Session rows' own convention; see AuthController#verifyOtp. expiresInSeconds is the admin-configurable pairing lifetime (riskyc.pairing.pending-ttl-seconds) — the caller schedules its own refresh timer from this value instead of hardcoding one. */
export function startPairing(deviceLabel: string, platform: string): Promise<{ token: string; code: string; expiresInSeconds: number }> {
  return apiFetch(`${config.authServiceUrl}/api/auth/pairing/start`, {
    method: 'POST',
    body: JSON.stringify({ deviceLabel, platform }),
  });
}

export type PairingStatus = { status: 'PENDING' | 'APPROVED' | 'DENIED' | 'EXPIRED'; session: VerifyOtpResponse | null };

export function pollPairingStatus(token: string): Promise<PairingStatus> {
  return apiFetch(`${config.authServiceUrl}/api/auth/pairing/${encodeURIComponent(token)}/status`);
}
