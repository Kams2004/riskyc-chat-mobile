import { useEffect } from 'react';
import { AppState, DeviceEventEmitter } from 'react-native';

import { PREFERENCES_CHANGED_EVENT, preferences } from '../../lib/preferences';
import { useAuth } from '../auth/AuthContext';
import { markOffline, sendHeartbeat } from './api';

// Server-side presence-service treats an online key as expired after 60s
// (see PresenceService.ONLINE_TTL) — heartbeating well inside that window
// tolerates one missed beat from network jitter without flapping to offline.
const HEARTBEAT_INTERVAL_MS = 20_000;

/**
 * Mounted once at the app root for as long as the user is signed in. Sends a
 * heartbeat immediately and on an interval while the app is foregrounded AND
 * the Settings → Privacy "Show online status" toggle is on; pauses (and
 * proactively marks offline) while backgrounded or while that toggle is off,
 * rather than just letting the TTL quietly expire, so other people see the
 * status change promptly instead of up to a minute late.
 */
export function usePresenceHeartbeat() {
  const { userId } = useAuth();

  useEffect(() => {
    if (!userId) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (intervalId || !preferences.isShowOnlineStatus()) return;
      sendHeartbeat(userId).catch(() => {});
      intervalId = setInterval(() => sendHeartbeat(userId).catch(() => {}), HEARTBEAT_INTERVAL_MS);
    };
    const stop = () => {
      if (!intervalId) return;
      clearInterval(intervalId);
      intervalId = null;
      markOffline(userId).catch(() => {});
    };
    const sync = () => {
      if (AppState.currentState !== 'active') return;
      if (preferences.isShowOnlineStatus()) start();
      else stop();
    };

    sync();

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') sync();
      else stop();
    });
    // Reacts live to the Privacy screen's toggle without needing to reopen the app.
    const prefsSub = DeviceEventEmitter.addListener(PREFERENCES_CHANGED_EVENT, sync);

    return () => {
      appStateSub.remove();
      prefsSub.remove();
      stop();
    };
  }, [userId]);
}
