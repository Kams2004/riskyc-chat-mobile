import { useCallback, useEffect, useState } from 'react';

import { createDownloadUrl } from './api';

// Presigned download URLs are valid for 15 minutes (see media-service) — a
// session-lifetime cache avoids re-requesting one for every re-render of the
// same media (e.g. a chat list or message list re-rendering on every reload).
const urlCache = new Map<string, string>();

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
      .then(({ downloadUrl }) => {
        urlCache.set(objectKey, downloadUrl);
        if (!cancelled) setResolvedUrl(downloadUrl);
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
      .then(({ downloadUrl }) => {
        urlCache.set(objectKey, downloadUrl);
        if (!cancelled) {
          setUrl(downloadUrl);
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
    if (objectKey) urlCache.delete(objectKey);
    setAttempt((a) => a + 1);
  }, [objectKey]);

  return { url, status, retry };
}
