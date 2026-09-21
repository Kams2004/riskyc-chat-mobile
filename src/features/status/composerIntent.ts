/**
 * A plain in-memory, one-shot flag — deliberately NOT a route param.
 * status/index.tsx's camera/pencil quick-actions used to pass `mode` as a
 * push() param for status/new.tsx to act on in a mount effect, but that
 * kept firing on a plain "add status" tap (no mode at all) too: expo-router
 * can hand a re-visited route back a PREVIOUS params object rather than a
 * clean empty one, so `mode` from an earlier camera-quick-action tap kept
 * reappearing. A module-level variable, set synchronously right before
 * push() and drained (read-and-cleared, unconditionally) by the very first
 * mount effect on the other end, can't have this problem — there is no
 * router-level caching or reuse to go wrong, and consuming always clears
 * it, so a stale value can never survive past the mount that reads it.
 */
export type ComposerIntent = 'camera' | 'text';

let pendingIntent: ComposerIntent | null = null;

export function setComposerIntent(intent: ComposerIntent) {
  pendingIntent = intent;
}

export function consumeComposerIntent(): ComposerIntent | null {
  const intent = pendingIntent;
  pendingIntent = null;
  return intent;
}
