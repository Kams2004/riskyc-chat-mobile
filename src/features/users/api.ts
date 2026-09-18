import { config } from '../../lib/config';
import { apiFetch, ApiError } from '../../lib/httpClient';

export type UserResult = {
  userId: string;
  displayName: string | null;
  email: string | null;
  phoneNumber: string | null;
  avatarObjectKey: string | null;
};

export function searchUsers(query: string): Promise<UserResult[]> {
  const params = query ? `?q=${encodeURIComponent(query)}` : '';
  return apiFetch(`${config.authServiceUrl}/api/users${params}`);
}

export function getUser(userId: string): Promise<UserResult> {
  return apiFetch(`${config.authServiceUrl}/api/users/${userId}`);
}

export function updateMyProfile(fields: { displayName?: string; avatarObjectKey?: string; phoneNumber?: string; email?: string }): Promise<UserResult> {
  return apiFetch(`${config.authServiceUrl}/api/users/me`, {
    method: 'PUT',
    body: JSON.stringify(fields),
  });
}

export function deleteMyAccount(): Promise<void> {
  return apiFetch(`${config.authServiceUrl}/api/users/me`, { method: 'DELETE' });
}

export type OnboardingPhoneMergeResult = {
  /** false: the number was free — it's just attached to the current (new) account, same session as before. true: it already belonged to a pre-existing account, which is what accessToken/user now point at — see UserController#setOnboardingPhone's own doc comment. */
  merged: boolean;
  accessToken: string | null;
  user: UserResult | null;
};

/**
 * Phone-number-is-canonical-identity check, run once during onboarding for
 * an email-verified account. Deliberately NOT OTP-verified — see the
 * backend endpoint's own doc comment for the full merge design and the
 * explicit tradeoff (no billed SMS, but also no proof the caller actually
 * owns the number they typed).
 */
export function setOnboardingPhone(phoneNumber: string): Promise<OnboardingPhoneMergeResult> {
  return apiFetch(`${config.authServiceUrl}/api/users/me/onboarding-phone`, {
    method: 'POST',
    body: JSON.stringify({ phoneNumber }),
  });
}

export type IdentifierField = { newPhoneNumber: string } | { newEmail: string };

function identifierChangeBody(field: IdentifierField) {
  return 'newPhoneNumber' in field ? { newPhoneNumber: field.newPhoneNumber } : { newEmail: field.newEmail };
}

/** Sends an OTP to the NEW identifier — nothing on the account changes until confirmIdentifierChange succeeds. */
export function requestIdentifierChange(field: IdentifierField): Promise<void> {
  return apiFetch(`${config.authServiceUrl}/api/users/me/identifier/request-otp`, {
    method: 'POST',
    body: JSON.stringify(identifierChangeBody(field)),
  });
}

export function confirmIdentifierChange(field: IdentifierField, code: string): Promise<UserResult> {
  return apiFetch(`${config.authServiceUrl}/api/users/me/identifier/confirm`, {
    method: 'POST',
    body: JSON.stringify({ ...identifierChangeBody(field), code }),
  });
}

export function listBlockedUsers(): Promise<{ userId: string }[]> {
  return apiFetch(`${config.authServiceUrl}/api/users/me/blocked`);
}

export function blockUser(userId: string): Promise<void> {
  return apiFetch(`${config.authServiceUrl}/api/users/me/blocked/${userId}`, { method: 'POST' });
}

export function unblockUser(userId: string): Promise<void> {
  return apiFetch(`${config.authServiceUrl}/api/users/me/blocked/${userId}`, { method: 'DELETE' });
}

export function reportUser(userId: string, reason: string): Promise<void> {
  return apiFetch(`${config.authServiceUrl}/api/users/${userId}/report`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

/**
 * Feeds contacts-only discovery: the caller never learns which numbers/
 * emails in their own device contacts DON'T have an account — non-matches
 * are simply absent from the response, same privacy shape as the server side.
 */
export function matchContacts(phoneNumbers: string[], emails: string[] = []): Promise<UserResult[]> {
  return apiFetch(`${config.authServiceUrl}/api/users/match-contacts`, {
    method: 'POST',
    body: JSON.stringify({ phoneNumbers, emails }),
  });
}

/**
 * Looks up a single phone number that the caller typed manually (not in
 * their device contacts). Returns the account if found, or null if the
 * number has no account — the caller never learns anything about numbers
 * they didn't type themselves.
 */
export async function lookupByPhone(phoneNumber: string): Promise<UserResult | null> {
  try {
    return await apiFetch<UserResult>(`${config.authServiceUrl}/api/users/lookup-by-phone`, {
      method: 'POST',
      body: JSON.stringify({ phoneNumber }),
    });
  } catch (e: unknown) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}
