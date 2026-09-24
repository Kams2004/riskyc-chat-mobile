import { listSavedStickers } from './api';

/** Shared across every mounted StickerMessage so a thread full of stickers doesn't each independently fetch the whole saved-collection list just to decide whether to show its own "Save" button. */
let cache: Promise<Set<string>> | null = null;

export function getSavedStickerKeys(): Promise<Set<string>> {
  if (!cache) {
    cache = listSavedStickers()
      .then((items) => new Set(items.map((s) => s.objectKey)))
      .catch(() => new Set<string>());
  }
  return cache;
}

/** Call after any save/create/delete so the next read reflects the change. */
export function invalidateSavedStickerKeys() {
  cache = null;
}
