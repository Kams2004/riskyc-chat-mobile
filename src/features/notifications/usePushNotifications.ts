import * as Device from 'expo-device';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useAuth } from '../auth/AuthContext';
import { registerPushToken } from './api';

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
  type?: 'message' | 'call';
  conversationId?: string;
  groupId?: string;
  senderId?: string;
};

/** Mounted once at the app root (see app/_layout.tsx), alongside the other always-on hooks. */
export function usePushNotifications() {
  const { userId, accessToken } = useAuth();

  useEffect(() => {
    if (!userId || !accessToken) return;
    let cancelled = false;

    (async () => {
      await ensureAndroidChannels();

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
  // the relevant conversation — a call notification needs no extra
  // navigation, since CallOverlay already takes over the screen on its own
  // once the app is foregrounded and the live call-signaling socket catches up.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as NotificationData;
      if (data.type !== 'message' || !data.conversationId) return;
      router.push({
        pathname: '/(tabs)/chats/[conversationId]',
        params: {
          conversationId: data.conversationId,
          ...(data.groupId ? { groupId: data.groupId } : { recipientId: data.senderId }),
        },
      });
    });
    return () => sub.remove();
  }, []);
}
