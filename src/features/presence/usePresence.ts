import { useEffect, useState } from 'react';

import { getPresence } from './api';

// Polling, not push: presence-service has no live-update channel of its own
// yet (see architecture notes) — this is the simplest thing that keeps a
// chat header's status reasonably fresh without needing another WebSocket
// subscription per screen. Comfortably inside the 60s TTL so a stale read
// never outlives the other side's own heartbeat cadence.
const POLL_INTERVAL_MS = 15_000;

export type PresenceState = { online: boolean; lastSeen: string | null };

export function usePresence(userId: string): PresenceState {
  const [state, setState] = useState<PresenceState>({ online: false, lastSeen: null });

  useEffect(() => {
    let cancelled = false;

    const poll = () => {
      getPresence(userId)
        .then((presence) => {
          if (!cancelled) setState({ online: presence.online, lastSeen: presence.lastSeen });
        })
        .catch(() => {});
    };

    poll();
    const intervalId = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [userId]);

  return state;
}
