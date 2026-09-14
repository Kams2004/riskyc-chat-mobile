import * as SecureStore from 'expo-secure-store';
import { DeviceEventEmitter } from 'react-native';

const SEND_READ_RECEIPTS_KEY = 'riskyc.pref.sendReadReceipts';
const SHOW_ONLINE_STATUS_KEY = 'riskyc.pref.showOnlineStatus';

export const PREFERENCES_CHANGED_EVENT = 'riskyc:preferencesChanged';

// In-memory cache, read synchronously by callers on the hot path (sending an
// ack, deciding whether to heartbeat) so neither has to await SecureStore.
// loadPreferences() populates it once at startup, gating the same readiness
// check the root layout already uses for fonts — before that, these default
// to "on" (the same default a fresh install has).
let sendReadReceipts = true;
let showOnlineStatus = true;

export async function loadPreferences() {
  const [readReceipts, onlineStatus] = await Promise.all([
    SecureStore.getItemAsync(SEND_READ_RECEIPTS_KEY),
    SecureStore.getItemAsync(SHOW_ONLINE_STATUS_KEY),
  ]);
  sendReadReceipts = readReceipts !== 'false';
  showOnlineStatus = onlineStatus !== 'false';
}

export const preferences = {
  isSendReadReceipts: () => sendReadReceipts,
  isShowOnlineStatus: () => showOnlineStatus,
  async setSendReadReceipts(value: boolean) {
    sendReadReceipts = value;
    await SecureStore.setItemAsync(SEND_READ_RECEIPTS_KEY, String(value));
    DeviceEventEmitter.emit(PREFERENCES_CHANGED_EVENT);
  },
  async setShowOnlineStatus(value: boolean) {
    showOnlineStatus = value;
    await SecureStore.setItemAsync(SHOW_ONLINE_STATUS_KEY, String(value));
    DeviceEventEmitter.emit(PREFERENCES_CHANGED_EVENT);
  },
};
