import { Alert, Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

/**
 * Android-only for now — this app has no iOS release yet, so there's
 * nothing to check against on that platform. Uses Google Play's own
 * in-app update check (Play Core under the hood), which already knows the
 * installed version code natively — no manual version comparison needed.
 *
 * Dynamically imported and Expo-Go-gated for the same reason
 * usePushNotifications.ts gates expo-notifications: this is a native module
 * that Expo Go can't load, so it must never be statically imported.
 */
async function loadInAppUpdates() {
  if (Platform.OS !== 'android') return null;
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return null;
  try {
    return await import('sp-react-native-in-app-updates');
  } catch {
    return null;
  }
}

/**
 * Checks Google Play for a newer version and, if one exists, starts a
 * "flexible" update — downloads in the background while the customer keeps
 * using the app, then prompts them to restart once it's ready. Best-effort:
 * any failure here should never block using the app.
 */
export async function checkForInAppUpdate(): Promise<void> {
  try {
    const mod = await loadInAppUpdates();
    if (!mod) return;
    const { default: SpInAppUpdates, IAUUpdateKind, IAUInstallStatus } = mod;

    const inAppUpdates = new SpInAppUpdates(false);
    const result = await inAppUpdates.checkNeedsUpdate();
    if (!result.shouldUpdate) return;

    await inAppUpdates.startUpdate({ updateType: IAUUpdateKind.FLEXIBLE });

    // Flexible updates download silently in the background — Play Core
    // doesn't show its own "ready to restart" prompt for this mode (unlike
    // an immediate update), so the app has to ask.
    const onStatusUpdate = (status: { status: number }) => {
      if (status.status === IAUInstallStatus.DOWNLOADED) {
        inAppUpdates.removeStatusUpdateListener(onStatusUpdate);
        Alert.alert(
          'Update ready',
          'A new version has finished downloading. Restart now to apply it?',
          [
            { text: 'Later', style: 'cancel' },
            { text: 'Restart', onPress: () => inAppUpdates.installUpdate() },
          ]
        );
      }
    };
    inAppUpdates.addStatusUpdateListener(onStatusUpdate);
  } catch (e) {
    console.warn('checkForInAppUpdate failed:', e);
  }
}
