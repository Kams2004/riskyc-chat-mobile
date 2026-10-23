import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { DeviceEventEmitter } from 'react-native';

import { currentDeviceLabel } from '../../lib/deviceLabel';
import { SESSION_REVOKED_EVENT } from '../../lib/httpClient';
import { identity, profile, session } from '../../lib/secureStore';
import { unregisterCurrentDevicePushToken } from '../notifications/api';
import { listSessions, revokeSession } from '../sessions/api';
import * as authApi from './api';
import type { Identifier, VerifyOtpResponse } from './api';

type AuthState = {
  isLoading: boolean;
  userId: string | null;
  accessToken: string | null;
  displayName: string | null;
  avatarObjectKey: string | null;
  email: string | null;
  phoneNumber: string | null;
  /** Whether THIS device is the account's master — see SessionResult.isMaster's own doc comment. Only meaningful once isLoading is false; defaults to false until the sessions list resolves. */
  isMaster: boolean;
  /** Resolves once OTP is verified — the caller decides what to do next (e.g. only a brand-new account needs profile setup). */
  signInWithOtp: (identifier: Identifier, code: string) => Promise<{ isNewAccount: boolean }>;
  /** Applies a token response obtained without OTP verification — currently only the system-account access identifier's /otp/request short-circuit (see requestOtp's doc comment). */
  completeSystemLogin: (res: VerifyOtpResponse) => Promise<void>;
  updateProfile: (fields: { displayName?: string; avatarObjectKey?: string | null }) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarObjectKey, setAvatarObjectKey] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [isMaster, setIsMaster] = useState(false);

  // Best-effort — a failed fetch just leaves isMaster at its previous value
  // (false by default), which only ever hides a master-only action a real
  // master could have used; it never grants one to a non-master device.
  async function refreshIsMaster() {
    try {
      const sessions = await listSessions();
      setIsMaster(sessions.find((s) => s.isCurrent)?.isMaster ?? false);
    } catch (e) {
      console.warn('[AuthContext] failed to refresh master-device status', e);
    }
  }

  useEffect(() => {
    Promise.all([session.load(), profile.load(), identity.load()]).then(([storedSession, storedProfile, storedIdentity]) => {
      setUserId(storedSession?.userId ?? null);
      setAccessToken(storedSession?.accessToken ?? null);
      setDisplayName(storedProfile.displayName);
      setAvatarObjectKey(storedProfile.avatarObjectKey);
      setEmail(storedIdentity.email);
      setPhoneNumber(storedIdentity.phoneNumber);
      setIsLoading(false);
      if (storedSession?.accessToken) void refreshIsMaster();
    });
  }, []);

  // This device's own session was revoked server-side (see
  // httpClient.ts's SESSION_REVOKED_EVENT doc comment) — clear local state
  // directly rather than calling the full signOut() below: that one makes
  // its OWN authenticated requests (unregister push token, list sessions,
  // revoke), every one of which would also 401 against an already-dead
  // token and re-emit this same event, looping forever. No server call
  // here is correct anyway — there's nothing left to revoke.
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(SESSION_REVOKED_EVENT, () => {
      session.clear();
      setUserId(null);
      setAccessToken(null);
      setDisplayName(null);
      setAvatarObjectKey(null);
      setEmail(null);
      setPhoneNumber(null);
      setIsMaster(false);
    });
    return () => sub.remove();
  }, []);

  async function applySession(res: VerifyOtpResponse) {
    await session.save(res.accessToken, res.userId);
    await profile.save(res.displayName, res.avatarObjectKey);
    await identity.save(res.email, res.phoneNumber);
    setUserId(res.userId);
    setAccessToken(res.accessToken);
    setDisplayName(res.displayName);
    setAvatarObjectKey(res.avatarObjectKey);
    setEmail(res.email);
    setPhoneNumber(res.phoneNumber);
    await refreshIsMaster();
  }

  const value = useMemo<AuthState>(
    () => ({
      isLoading,
      userId,
      accessToken,
      displayName,
      avatarObjectKey,
      email,
      phoneNumber,
      isMaster,
      async signInWithOtp(identifier, code) {
        const res = await authApi.verifyOtp(identifier, code, currentDeviceLabel());
        await applySession(res);
        return { isNewAccount: !res.displayName };
      },
      async completeSystemLogin(res) {
        await applySession(res);
      },
      async updateProfile(fields) {
        const nextName = fields.displayName ?? displayName;
        const nextAvatarObjectKey = fields.avatarObjectKey === undefined ? avatarObjectKey : fields.avatarObjectKey;
        await profile.save(nextName, nextAvatarObjectKey);
        setDisplayName(nextName);
        setAvatarObjectKey(nextAvatarObjectKey);
      },
      async signOut() {
        // Must run before session.clear() below — apiFetch reads the access
        // token from secureStore itself (not from this closure's state), so
        // clearing it first would send these requests unauthenticated.
        await unregisterCurrentDevicePushToken();
        // Revokes this device's own session server-side — without this,
        // signing out only ever cleared local storage, leaving the session
        // row's revoked flag false forever (a stale row an old build used
        // to misinterpret as a device conflict on next sign-in, before the
        // device cap replaced that single-mobile-session rule). If this IS
        // the master device, the server cascades: every other linked device
        // gets signed out too (see SessionController#revoke) — by design,
        // not a bug, see Session.isMaster's own doc comment. Best-effort: a
        // network hiccup here shouldn't block the user from signing out
        // locally, same fail-soft stance as the push-token unregister above.
        try {
          const sessions = await listSessions();
          const current = sessions.find((s) => s.isCurrent);
          if (current) await revokeSession(current.id);
        } catch (e) {
          console.warn('[signOut] failed to revoke current session', e);
        }
        await session.clear();
        setUserId(null);
        setAccessToken(null);
        setDisplayName(null);
        setAvatarObjectKey(null);
        setEmail(null);
        setPhoneNumber(null);
        setIsMaster(false);
      },
    }),
    [isLoading, userId, accessToken, displayName, avatarObjectKey, email, phoneNumber, isMaster]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
