/**
 * Coordination between CallContext (1:1) and GroupCallContext (SFU group
 * calls) — two independent WebRTC/media stacks that, before this, had no way
 * to know about each other: nothing stopped a 1:1 call and a group call
 * from both being active at once (two concurrent getUserMedia sessions
 * fighting over the mic/camera, and two call overlays racing to render on
 * top of each other), and an incoming call of either kind could silently cut
 * or get tangled with one already in progress.
 *
 * A plain module-level flag, not React state — nothing here needs to trigger
 * a re-render, it's only read at the moment a NEW call is about to start or
 * be shown. CallProvider wraps GroupCallProvider in app/_layout.tsx, so
 * GroupCallContext can call useCall() directly, but not the reverse; rather
 * than restructure that nesting (and risk breaking either provider's own
 * assumptions), both sides just read/write this shared flag symmetrically.
 */
export type ActiveCallKind = 'none' | 'oneToOne' | 'group';

let activeCallKind: ActiveCallKind = 'none';

export function getActiveCallKind(): ActiveCallKind {
  return activeCallKind;
}

export function setActiveCallKind(kind: ActiveCallKind) {
  activeCallKind = kind;
}
