import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'riskyc.accessToken';
const USER_ID_KEY = 'riskyc.userId';
const DISPLAY_NAME_KEY = 'riskyc.displayName';
const AVATAR_OBJECT_KEY_KEY = 'riskyc.avatarObjectKey';

export const session = {
  async save(accessToken: string, userId: string) {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
    await SecureStore.setItemAsync(USER_ID_KEY, userId);
  },
  async load() {
    const [accessToken, userId] = await Promise.all([
      SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.getItemAsync(USER_ID_KEY),
    ]);
    return accessToken && userId ? { accessToken, userId } : null;
  },
  async clear() {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_ID_KEY);
    await profile.clear();
  },
};

/**
 * Local cache of the server's own record of who you are — refreshed from
 * the /api/auth/otp/verify response on every sign-in (see AuthContext), so
 * signing out and back in (or a fresh install, on the same account) shows
 * your existing name/avatar immediately instead of asking again. This is
 * just a fast-start cache, not the source of truth: the server row is.
 */
export const profile = {
  async save(displayName: string | null, avatarObjectKey: string | null) {
    if (displayName) {
      await SecureStore.setItemAsync(DISPLAY_NAME_KEY, displayName);
    } else {
      await SecureStore.deleteItemAsync(DISPLAY_NAME_KEY);
    }
    if (avatarObjectKey) {
      await SecureStore.setItemAsync(AVATAR_OBJECT_KEY_KEY, avatarObjectKey);
    } else {
      await SecureStore.deleteItemAsync(AVATAR_OBJECT_KEY_KEY);
    }
  },
  async load() {
    const [displayName, avatarObjectKey] = await Promise.all([
      SecureStore.getItemAsync(DISPLAY_NAME_KEY),
      SecureStore.getItemAsync(AVATAR_OBJECT_KEY_KEY),
    ]);
    return { displayName, avatarObjectKey };
  },
  async clear() {
    await SecureStore.deleteItemAsync(DISPLAY_NAME_KEY);
    await SecureStore.deleteItemAsync(AVATAR_OBJECT_KEY_KEY);
  },
};
