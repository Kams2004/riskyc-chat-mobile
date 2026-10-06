import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'riskyc.accessToken';
const USER_ID_KEY = 'riskyc.userId';
const DISPLAY_NAME_KEY = 'riskyc.displayName';
const AVATAR_OBJECT_KEY_KEY = 'riskyc.avatarObjectKey';
const EMAIL_KEY = 'riskyc.email';
const PHONE_NUMBER_KEY = 'riskyc.phoneNumber';

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
    await identity.clear();
  },
};

/**
 * email/phoneNumber from the server's own OTP-verify response — kept
 * separate from `profile` below (rather than widening its save() signature)
 * since those two are set once at sign-in and never change via
 * updateProfile, unlike displayName/avatarObjectKey. Previously only ever
 * held in AuthContext's in-memory state, never persisted: useAuth().phoneNumber
 * silently went back to null after every cold start (session.load() restored
 * the token fine, this never did), which quietly broke anything relying on
 * it post-restart — contacts-sync's own-number-derived default dial code
 * (see features/contacts/sync.ts) included.
 */
export const identity = {
  async save(email: string | null, phoneNumber: string | null) {
    if (email) {
      await SecureStore.setItemAsync(EMAIL_KEY, email);
    } else {
      await SecureStore.deleteItemAsync(EMAIL_KEY);
    }
    if (phoneNumber) {
      await SecureStore.setItemAsync(PHONE_NUMBER_KEY, phoneNumber);
    } else {
      await SecureStore.deleteItemAsync(PHONE_NUMBER_KEY);
    }
  },
  async load() {
    const [email, phoneNumber] = await Promise.all([
      SecureStore.getItemAsync(EMAIL_KEY),
      SecureStore.getItemAsync(PHONE_NUMBER_KEY),
    ]);
    return { email, phoneNumber };
  },
  async clear() {
    await SecureStore.deleteItemAsync(EMAIL_KEY);
    await SecureStore.deleteItemAsync(PHONE_NUMBER_KEY);
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
