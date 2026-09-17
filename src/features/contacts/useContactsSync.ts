import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

import i18n from '../../i18n';
import { useAuth } from '../auth/AuthContext';
import { syncDeviceContacts } from './sync';

// WhatsApp re-syncs contacts periodically in the background, not just when
// the "New conversation" screen happens to be open — this interval is the
// mobile equivalent, deliberately much coarser than the 20s presence
// heartbeat since a contact joining is a rare event, not a live status.
const SYNC_INTERVAL_MS = 15 * 60_000;

/**
 * Mounted once at the app root (see app/_layout.tsx), alongside the other
 * always-on hooks. Silently no-ops if contacts permission was never
 * granted (see permissions.tsx's Skip path) — this only ever reads
 * permission it already has, it never prompts.
 */
export function useContactsSync() {
  const { userId } = useAuth();
  const db = useSQLiteContext();

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    const runSync = async () => {
      try {
        const { newlyJoined } = await syncDeviceContacts(db);
        if (cancelled) return;
        for (const user of newlyJoined) {
          const name = user.localName || user.displayName || user.phoneNumber || i18n.t('chats:contactDetails.unnamedUser');
          await Notifications.scheduleNotificationAsync({
            content: {
              title: i18n.t('chats:newChat.contactJoinedTitle', { name }),
              body: i18n.t('chats:newChat.contactJoinedBody'),
              data: { type: 'contact-joined', userId: user.userId },
            },
            trigger: null,
          });
        }
      } catch {
        // Best-effort background sync — a failed pass just tries again next interval.
      }
    };

    const sync = () => {
      if (AppState.currentState === 'active') void runSync();
    };

    sync();
    const intervalId = setInterval(sync, SYNC_INTERVAL_MS);
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') sync();
    });

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      appStateSub.remove();
    };
  }, [db, userId]);
}
