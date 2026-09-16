import { config } from '../../lib/config';
import { apiFetch } from '../../lib/httpClient';

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

export function updateMyProfile(fields: { displayName?: string; avatarObjectKey?: string }): Promise<UserResult> {
  return apiFetch(`${config.authServiceUrl}/api/users/me`, {
    method: 'PUT',
    body: JSON.stringify(fields),
  });
}

export function deleteMyAccount(): Promise<void> {
  return apiFetch(`${config.authServiceUrl}/api/users/me`, { method: 'DELETE' });
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
