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
