import * as Device from 'expo-device';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { useAuth } from '../auth/AuthContext';
import { useCall } from '../calls/CallContext';
import { registerPushToken } from './api';

const INCOMING_CALL_CATEGORY = 'incoming_call';
const ANSWER_ACTION = 'answer';
const DECLINE_ACTION = 'decline';

/**
 * Governs only the FOREGROUND case — while this screen/JS engine is alive,
 * an incoming push is redundant with what's already happening live: a
 * message shows up via InboxSocket (with its own in-app sound, see
 * lib/sounds.ts), and an incoming call already renders the full-screen
 * CallOverlay (mounted at the app root regardless of which screen is open).
 * Backgrounded/killed-app presentation is NOT controlled by this handler at
 * all — the OS falls back to each Android notification channel's own
 * sound/importance (see the channels created below), which is the only
 * thing that actually reaches the user once the JS engine isn't running.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Answer/Decline action buttons on the "calls" channel notification itself
 * — lets the user respond without opening the app first. Both actions fire
 * addNotificationResponseReceivedListener below (and getLastNotificationResponseAsync
 * on a cold start) the same way a plain tap does, distinguished by
 * response.actionIdentifier. Requires a dev-client/prebuild build (confirmed
 * this project already is one, for react-native-webrtc) — Expo Go doesn't
 * support notification categories/actions.
 */
async function ensureCallCategory() {
  await Notifications.setNotificationCategoryAsync(INCOMING_CALL_CATEGORY, [
    { identifier: ANSWER_ACTION, buttonTitle: 'Answer', options: { opensAppToForeground: true } },
    { identifier: DECLINE_ACTION, buttonTitle: 'Decline', options: { opensAppToForeground: false, isDestructive: true } },
  ]);
}

async function ensureAndroidChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('messages', {
    name: 'Messages',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'notification.wav',
    vibrationPattern: [0, 200, 100, 200],
  });
  await Notifications.setNotificationChannelAsync('calls', {
    name: 'Calls',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'ringtone.wav',
    bypassDnd: true,
    vibrationPattern: [0, 400, 200, 400, 200, 400],
  });
}

type NotificationData = {
  type?: 'message' | 'call' | 'group-invitation';
  conversationId?: string;
  groupId?: string;
  senderId?: string;
  callId?: string;
};

/** Mounted once at the app root (see app/_layout.tsx), alongside the other always-on hooks — inside CallProvider, so useCall() is available here. */
export function usePushNotifications() {
  const { userId, accessToken } = useAuth();
  const { seedIncomingCallFromNotification, acceptIncoming, declineIncoming } = useCall();
  const handledColdStartRef = useRef(false);

  useEffect(() => {
    if (!userId || !accessToken) return;
    let cancelled = false;

    (async () => {
      await ensureAndroidChannels();
      await ensureCallCategory();

      // Push tokens only exist on a real device (the simulator/emulator has
      // no APNs/FCM registration at all) — requesting on one just errors.
      if (!Device.isDevice) return;

      const permission = await Notifications.getPermissionsAsync();
      let granted = permission.granted;
      if (!granted) {
        const requested = await Notifications.requestPermissionsAsync();
        granted = requested.granted;
      }
      if (!granted || cancelled) return;

      try {
        const { data: token } = await Notifications.getExpoPushTokenAsync();
        if (!cancelled) {
          await registerPushToken(token, Platform.OS === 'ios' ? 'ios' : 'android');
        }
      } catch (e) {
        console.warn('[usePushNotifications] failed to register push token', e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, userId]);

  // Tapping a notification (from the tray, app backgrounded or killed) opens
  // the relevant conversation. A call notification's Answer/Decline actions
  // (see ensureCallCategory) fetch the call fresh via REST and act on it
  // immediately — this is what lets the app answer/decline a call it was
  // never live-connected for (backgrounded past the OS grace period, or
  // fully killed), landing straight in CallOverlay's connected view with no
  // splash/onboarding in between, since CallOverlay is mounted at the root
  // and reacts purely to CallContext state. A plain tap on the notification
  // body (not an action button) just seeds the incoming-ringing state and
  // lets the user decide from the in-app UI, same as the live-socket path.
  const handleResponse = useCallback(
    async (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data as NotificationData;

      if (data.type === 'call' && data.callId) {
        if (response.actionIdentifier === DECLINE_ACTION) {
          if (await seedIncomingCallFromNotification(data.callId)) declineIncoming();
        } else if (response.actionIdentifier === ANSWER_ACTION) {
          if (await seedIncomingCallFromNotification(data.callId)) await acceptIncoming();
        } else {
          await seedIncomingCallFromNotification(data.callId);
        }
        return;
      }

      if (data.type === 'message' && data.conversationId) {
        router.push({
          pathname: '/(tabs)/chats/[conversationId]',
          params: {
            conversationId: data.conversationId,
            ...(data.groupId ? { groupId: data.groupId } : { recipientId: data.senderId }),
          },
        });
        return;
      }

      if (data.type === 'group-invitation') {
        router.push('/(tabs)/chats/group-invitations' as never);
      }
    },
    [acceptIncoming, declineIncoming, seedIncomingCallFromNotification]
  );

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(handleResponse);
    // Cold start: the app process was launched BY this notification tap (the
    // listener above only fires for responses received while already
    // running) — getLastNotificationResponseAsync is what surfaces that one.
    if (!handledColdStartRef.current) {
      handledColdStartRef.current = true;
      Notifications.getLastNotificationResponseAsync().then((response) => {
        if (response) handleResponse(response);
      });
    }
    return () => sub.remove();
  }, [handleResponse]);
}
