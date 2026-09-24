import { config } from '../../lib/config';
import { apiFetch } from '../../lib/httpClient';

export type StickerItem = {
  objectKey: string;
  savedAt: string;
};

/** The signed-in user's own sticker collection — built up via createSticker (turning a picked image into a sticker) or saveSticker (keeping one someone else sent). */
export function listSavedStickers(): Promise<StickerItem[]> {
  return apiFetch(`${config.messagingServiceUrl}/api/stickers`);
}

/** Idempotent — saving an objectKey already in the collection is a no-op server-side. */
export function saveSticker(objectKey: string): Promise<StickerItem> {
  return apiFetch(`${config.messagingServiceUrl}/api/stickers`, {
    method: 'POST',
    body: JSON.stringify({ objectKey }),
  });
}

export function deleteSavedSticker(objectKey: string): Promise<void> {
  return apiFetch(`${config.messagingServiceUrl}/api/stickers/${encodeURIComponent(objectKey)}`, { method: 'DELETE' });
}
