import { useEffect, useState } from 'react';

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
