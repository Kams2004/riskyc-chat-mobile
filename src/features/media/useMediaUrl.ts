import { Directory, File, Paths } from 'expo-file-system';
import { useCallback, useEffect, useState } from 'react';

import { createDownloadUrl } from './api';

// Presigned download URLs are valid for 15 minutes (see media-service) — a
// session-lifetime cache avoids re-requesting one for every re-render of the
// same media (e.g. a chat list or message list re-rendering on every reload).
const urlCache = new Map<string, string>();

// The presigned URL itself can never be a persistent cache key (15min expiry,
// a fresh signature every time) — but the object it points to is immutable
// and named by a stable UUID objectKey forever, so the actual bytes get
// cached to a local file named by that key instead. Leaving a conversation
// and coming back (even after the app's fully restarted) then shows
// already-downloaded media straight from disk, no network fetch at all —
// the concrete gap this was built to close. Web does the same thing via the
// Cache Storage API (see useMediaUrl.ts there).
const MEDIA_CACHE_DIR = new Directory(Paths.cache, 'riskyc-media');

async function resolveLocalUri(objectKey: string, presignedUrl: string): Promise<string> {
  const file = new File(MEDIA_CACHE_DIR, objectKey);
  try {
    if (!MEDIA_CACHE_DIR.exists) MEDIA_CACHE_DIR.create({ idempotent: true, intermediates: true });
    if (file.exists) return file.uri;
    const downloaded = await File.downloadFileAsync(presignedUrl, file, { idempotent: true });
    return downloaded.uri;
  } catch (e) {
    // On Android specifically, a failed download can leave a partially
    // written file at the destination (see File.downloadFileAsync's own
    // doc comment) — left alone, the NEXT resolve would see file.exists
    // true and hand back that corrupt partial data as if it were a good
    // cache hit, never retrying the download at all.
    try {
      if (file.exists) file.delete();
    } catch {
      // best-effort cleanup only
    }
    console.warn('[useMediaUrl] local media cache failed, using direct URL', e);
    return presignedUrl;
  }
}

/** Resolves a MinIO object key to a presigned, directly-fetchable download URL. */
export function useMediaUrl(objectKey?: string | null): string | null {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(objectKey ? urlCache.get(objectKey) ?? null : null);

  useEffect(() => {
    if (!objectKey) {
      setResolvedUrl(null);
      return;
    }
    const cached = urlCache.get(objectKey);
    if (cached) {
      setResolvedUrl(cached);
      return;
    }
    let cancelled = false;
    createDownloadUrl(objectKey)
      .then(async ({ downloadUrl }) => {
        const localUri = await resolveLocalUri(objectKey, downloadUrl);
        urlCache.set(objectKey, localUri);
        if (!cancelled) setResolvedUrl(localUri);
      })
      .catch((e) => {
        // Was silently swallowed — a failed resolve looked identical to a
        // still-in-flight one from the outside (both just leave the caller
        // stuck at null forever), which made a real failure here
        // indistinguishable from normal loading.
        console.warn('[useMediaUrl] failed to resolve', objectKey, e);
      });
    return () => {
      cancelled = true;
    };
  }, [objectKey]);

  return resolvedUrl;
}

export type MediaUrlStatus = 'loading' | 'error' | 'ready';

/**
 * Like useMediaUrl, but surfaces a distinguishable error state and a retry
 * trigger instead of leaving a failed resolve looking identical to a
 * still-loading one — used by message image/attachment tiles specifically,
 * which need to show a skeleton while loading and a tappable "Retry" on
 * failure rather than a permanently-empty box. Kept separate from
 * useMediaUrl (rather than changing its return shape) so the ~10 other,
 * unrelated call sites (avatars, voice players, stickers, ...) don't all
 * need updating for a UI need only image tiles actually have.
 */
export function useMediaUrlWithStatus(objectKey?: string | null): {
  url: string | null;
  status: MediaUrlStatus;
  retry: () => void;
} {
  const [url, setUrl] = useState<string | null>(objectKey ? urlCache.get(objectKey) ?? null : null);
  const [status, setStatus] = useState<MediaUrlStatus>(url ? 'ready' : 'loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!objectKey) {
      setUrl(null);
      setStatus('loading');
      return;
    }
    const cached = attempt === 0 ? urlCache.get(objectKey) : undefined;
    if (cached) {
      setUrl(cached);
      setStatus('ready');
      return;
    }
    setStatus('loading');
    let cancelled = false;
    createDownloadUrl(objectKey)
      .then(async ({ downloadUrl }) => {
        const localUri = await resolveLocalUri(objectKey, downloadUrl);
        urlCache.set(objectKey, localUri);
        if (!cancelled) {
          setUrl(localUri);
          setStatus('ready');
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [objectKey, attempt]);

  const retry = useCallback(() => {
    if (objectKey) {
      urlCache.delete(objectKey);
      evictLocalMedia(objectKey);
    }
    setAttempt((a) => a + 1);
  }, [objectKey]);

  return { url, status, retry };
}

/**
 * Drops a cached local file so the next resolve re-downloads from scratch —
 * used by retry() above for the rare case where the bytes on disk exist but
 * are themselves bad (a truncated/corrupt file the image/video decoder then
 * fails on), which a plain urlCache clear wouldn't fix since resolveLocalUri
 * would just see file.exists and hand the same bad file back again.
 */
function evictLocalMedia(objectKey: string) {
  try {
    const file = new File(MEDIA_CACHE_DIR, objectKey);
    if (file.exists) file.delete();
  } catch {
    // best-effort only
  }
}
