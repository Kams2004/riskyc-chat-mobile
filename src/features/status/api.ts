import { config } from '../../lib/config';
import { apiFetch } from '../../lib/httpClient';

export type StatusMediaType = 'TEXT' | 'IMAGE' | 'VIDEO';

export type StatusItem = {
  statusId: string;
  userId: string;
  mediaType: StatusMediaType;
  mediaObjectKey: string | null;
  textContent: string | null;
  backgroundColor: string | null;
  /** Opaque JSON (see StatusOverlay in components/StatusOverlayView.tsx) — freehand drawing + an optional text label drawn on top of the media, composited client-side at view time. Always null for a TEXT status. */
  overlayJson: string | null;
  createdAt: string;
  expiresAt: string;
  viewedByMe: boolean;
};

export type StatusFeedEntry = {
  userId: string;
  statuses: StatusItem[];
  hasUnviewed: boolean;
};

export type ViewerRow = {
  viewerId: string;
  viewedAt: string;
};

export type CreateStatusRequest = {
  mediaType: StatusMediaType;
  mediaObjectKey?: string | null;
  textContent?: string | null;
  backgroundColor?: string | null;
  overlayJson?: string | null;
};

export function createStatus(request: CreateStatusRequest): Promise<StatusItem> {
  return apiFetch(`${config.messagingServiceUrl}/api/status`, {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

/** One entry per contact with an active status — see StatusController's class doc comment for how "contact" is computed (existing conversations, not device contacts). */
export function fetchStatusFeed(): Promise<StatusFeedEntry[]> {
  return apiFetch(`${config.messagingServiceUrl}/api/status/feed`);
}

export function fetchStatusesFor(userId: string): Promise<StatusItem[]> {
  return apiFetch(`${config.messagingServiceUrl}/api/status/${userId}`);
}

export function markStatusViewed(statusId: string): Promise<void> {
  return apiFetch(`${config.messagingServiceUrl}/api/status/${statusId}/view`, { method: 'POST' });
}

/** Poster-only — see StatusController#viewers. */
export function fetchStatusViewers(statusId: string): Promise<ViewerRow[]> {
  return apiFetch(`${config.messagingServiceUrl}/api/status/${statusId}/viewers`);
}

export function deleteStatus(statusId: string): Promise<void> {
  return apiFetch(`${config.messagingServiceUrl}/api/status/${statusId}`, { method: 'DELETE' });
}
