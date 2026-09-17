import { config } from '../../lib/config';
import { apiFetch, ApiError } from '../../lib/httpClient';

export type SystemAccountInfo = {
  userId: string;
  displayName: string;
  avatarObjectKey: string | null;
  description: string;
  websiteUrl: string;
};

// Module-level cache: this rarely (if ever) changes for the lifetime of an
// app session, and every thread screen wants to know "is the other party
// the official account" — refetching per-screen would be wasteful. `null`
// means "not fetched yet", `'none'` means the feature is disabled (404).
let cached: SystemAccountInfo | 'none' | null = null;
let inFlight: Promise<SystemAccountInfo | 'none'> | null = null;

async function fetchSystemAccountInfo(): Promise<SystemAccountInfo | 'none'> {
  try {
    return await apiFetch<SystemAccountInfo>(`${config.authServiceUrl}/api/system-account`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return 'none';
    throw e;
  }
}

/** Cached — safe to call from every thread/contact-details screen without worrying about redundant network calls. */
export async function getSystemAccountInfo(): Promise<SystemAccountInfo | null> {
  if (cached !== null) return cached === 'none' ? null : cached;
  if (!inFlight) inFlight = fetchSystemAccountInfo();
  const result = await inFlight;
  cached = result;
  inFlight = null;
  return result === 'none' ? null : result;
}

export type BroadcastRequest = {
  text?: string | null;
  mediaType?: 'IMAGE' | 'VIDEO' | 'FILE' | 'AUDIO' | null;
  mediaObjectKey?: string | null;
  mediaFileName?: string | null;
  mediaDurationMs?: number | null;
  senderDisplayName?: string | null;
  senderAvatarObjectKey?: string | null;
};

/** Only succeeds when the caller IS the official account — see SystemAccountController#broadcast's own server-side check. */
export function broadcastFromSystemAccount(request: BroadcastRequest): Promise<void> {
  return apiFetch(`${config.messagingServiceUrl}/api/system-account/broadcast`, {
    method: 'POST',
    body: JSON.stringify(request),
  });
}
