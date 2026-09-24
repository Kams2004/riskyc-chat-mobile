import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { getAppVersionInfo } from './api';

/** Numeric "1.2.3" comparison, not string comparison — "1.9.0" must sort below "1.10.0". Returns negative/0/positive like a normal comparator. */
function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map((n) => parseInt(n, 10) || 0);
  const partsB = b.split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export type UpdatePromptState = {
  kind: 'required' | 'available';
  playStoreUrl: string;
} | null;

/**
 * Checked once at app launch (mounted at the app root, see _layout.tsx) —
 * a backend-controlled version check so the app can prompt to update
 * instead of relying solely on the Play Store's own auto-update, which a
 * user can have disabled or delayed. iOS is skipped entirely: the
 * configured version/URL are Android-specific (Play Store), and this
 * would need its own App Store equivalent before it means anything there.
 */
export function useAppVersionCheck(): UpdatePromptState {
  const [state, setState] = useState<UpdatePromptState>(null);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const currentVersion = Constants.expoConfig?.version;
    if (!currentVersion) return;

    getAppVersionInfo()
      .then((info) => {
        if (info.minSupportedVersion && compareVersions(currentVersion, info.minSupportedVersion) < 0) {
          setState({ kind: 'required', playStoreUrl: info.playStoreUrl });
        } else if (info.latestVersion && compareVersions(currentVersion, info.latestVersion) < 0) {
          setState({ kind: 'available', playStoreUrl: info.playStoreUrl });
        }
      })
      .catch(() => {
        // Best-effort — a failed check just means no prompt this launch, never a blocker.
      });
  }, []);

  return state;
}
