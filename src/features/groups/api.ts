import { config } from '../../lib/config';
import { apiFetch } from '../../lib/httpClient';

export type GroupMemberResult = { userId: string; role: 'ADMIN' | 'MEMBER' };

export type GroupResult = {
  id: string;
  name: string;
  avatarObjectKey: string | null;
  createdBy: string;
  members: GroupMemberResult[];
};

export function createGroup(name: string, memberIds: string[], avatarObjectKey?: string | null): Promise<GroupResult> {
  return apiFetch(`${config.messagingServiceUrl}/api/groups`, {
    method: 'POST',
    body: JSON.stringify({ name, memberIds, avatarObjectKey: avatarObjectKey ?? null }),
  });
}

export function getGroup(groupId: string): Promise<GroupResult> {
  return apiFetch(`${config.messagingServiceUrl}/api/groups/${groupId}`);
}

export function addMembers(groupId: string, memberIds: string[]): Promise<GroupResult> {
  return apiFetch(`${config.messagingServiceUrl}/api/groups/${groupId}/members`, {
    method: 'POST',
    body: JSON.stringify({ memberIds }),
  });
}

export function removeMember(groupId: string, userId: string): Promise<void> {
  return apiFetch(`${config.messagingServiceUrl}/api/groups/${groupId}/members/${userId}`, { method: 'DELETE' });
}

export function renameGroup(groupId: string, name: string, avatarObjectKey?: string | null): Promise<GroupResult> {
  return apiFetch(`${config.messagingServiceUrl}/api/groups/${groupId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name, avatarObjectKey: avatarObjectKey ?? null }),
  });
}
