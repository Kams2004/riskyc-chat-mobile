import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

import { config } from '../../lib/config';
import { apiFetch } from '../../lib/httpClient';

export function registerPushToken(token: string, platform: 'ios' | 'android'): Promise<void> {
  return apiFetch(`${config.messagingServiceUrl}/api/push-tokens`, {
    method: 'POST',
    body: JSON.stringify({ token, platform }),
  });
}

/**
 * Call on sign-out (and before account deletion) so this device stops
 * getting pushed notifications for an account nothing's signed into here
 * anymore — without this, the token row just sits there forever still
 * pointing at whoever was last signed in on this device.
 */
export function unregisterPushToken(token: string): Promise<void> {
  return apiFetch(`${config.messagingServiceUrl}/api/push-tokens`, {
    method: 'DELETE',
    body: JSON.stringify({ token }),
  });
}

/**
 * Resolves this device's own Expo push token again (the SDK just hands back
 * the same locally-cached value, no new registration round-trip) and
 * unregisters it. usePushNotifications never stashes the token anywhere
 * AuthContext could read it back from, so re-deriving it here — rather than
 * threading it through context/state — is the simplest way for signOut to
 * reach it. Best-effort: a signed-out session must never be blocked on this,
 * and account deletion already cascades server-side (see
 * UserController#deleteMe), so a failure or no-op here is harmless there.
 */
export async function unregisterCurrentDevicePushToken(): Promise<void> {
  if (!Device.isDevice) return;
  try {
    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync();
    await unregisterPushToken(token);
  } catch (e) {
    console.warn('[unregisterCurrentDevicePushToken] failed', e);
  }
}
