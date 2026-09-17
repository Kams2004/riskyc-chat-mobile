import { config } from '../../lib/config';
import { apiFetch } from '../../lib/httpClient';

export type GroupMemberResult = { userId: string; role: 'ADMIN' | 'MEMBER' };

export type GroupResult = {
  id: string;
  name: string;
  avatarObjectKey: string | null;
  createdBy: string;
  onlyAdminsCanMessage: boolean;
  members: GroupMemberResult[];
  /** Invited but not yet accepted — see GroupController's invitation flow. */
  pendingInviteeIds: string[];
};

/** Sentinel Message.ciphertext for a system "X joined the group" log line — must match GroupController.SYSTEM_MEMBER_JOINED exactly. */
export const SYSTEM_MEMBER_JOINED = '__SYSTEM_GROUP_JOINED__';

export type GroupInvitationResult = {
  invitationId: number;
  groupId: string;
  groupName: string | null;
  groupAvatarObjectKey: string | null;
  inviterId: string;
  createdAt: string;
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

/** Feeds the 1:1 contact-details screen's "Groups in common" section. */
export function getCommonGroups(otherUserId: string): Promise<GroupResult[]> {
  return apiFetch(`${config.messagingServiceUrl}/api/groups/common/${otherUserId}`);
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

export function renameGroup(
  groupId: string,
  name: string,
  avatarObjectKey?: string | null,
  onlyAdminsCanMessage?: boolean
): Promise<GroupResult> {
  return apiFetch(`${config.messagingServiceUrl}/api/groups/${groupId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name, avatarObjectKey: avatarObjectKey ?? null, onlyAdminsCanMessage: onlyAdminsCanMessage ?? null }),
  });
}

/** Admin-only, supports both directions — role is 'ADMIN' or 'MEMBER'. */
export function changeMemberRole(groupId: string, userId: string, role: 'ADMIN' | 'MEMBER'): Promise<GroupResult> {
  return apiFetch(`${config.messagingServiceUrl}/api/groups/${groupId}/members/${userId}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}

/** My own outstanding invitations, across every group — feeds a pending-invites badge/list. */
export function fetchMyGroupInvitations(): Promise<GroupInvitationResult[]> {
  return apiFetch(`${config.messagingServiceUrl}/api/groups/invitations`);
}

export function acceptGroupInvitation(invitationId: number): Promise<GroupResult> {
  return apiFetch(`${config.messagingServiceUrl}/api/groups/invitations/${invitationId}/accept`, { method: 'POST' });
}

export function declineGroupInvitation(invitationId: number): Promise<void> {
  return apiFetch(`${config.messagingServiceUrl}/api/groups/invitations/${invitationId}/decline`, { method: 'POST' });
}
