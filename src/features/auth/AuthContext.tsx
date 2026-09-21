import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

import { currentDeviceLabel } from '../../lib/deviceLabel';
import { profile, session } from '../../lib/secureStore';
import { unregisterCurrentDevicePushToken } from '../notifications/api';
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
  /**
   * Resolves once OTP is verified; the caller decides what to do next (e.g.
   * only a brand-new account needs profile setup). Can also resolve into a
   * device-switch confirmation instead of a completed login — see
   * VerifyOtpResponse.requiresDeviceSwitchConfirmation's own doc comment;
   * the caller must then show that confirmation and call
   * confirmDeviceSwitch itself, login is NOT complete yet at that point.
   */
  signInWithOtp: (
    identifier: Identifier,
    code: string
  ) => Promise<
    | { isNewAccount: boolean }
    | { requiresDeviceSwitchConfirmation: true; confirmationToken: string; conflictingDeviceLabel: string | null }
  >;
  /** The other half of the device-switch confirmation above — call once the user agrees to sign the other phone out. */
  confirmDeviceSwitch: (confirmationToken: string) => Promise<{ isNewAccount: boolean }>;
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

  useEffect(() => {
    Promise.all([session.load(), profile.load()]).then(([storedSession, storedProfile]) => {
      setUserId(storedSession?.userId ?? null);
      setAccessToken(storedSession?.accessToken ?? null);
      setDisplayName(storedProfile.displayName);
      setAvatarObjectKey(storedProfile.avatarObjectKey);
      setIsLoading(false);
    });
  }, []);

  async function applySession(res: VerifyOtpResponse) {
    if (!res.accessToken) {
      // Callers only ever reach here once requiresDeviceSwitchConfirmation
      // has already been handled (see signInWithOtp/confirmDeviceSwitch
      // below) — a null accessToken at this point is a caller bug, not a
      // real runtime case.
      throw new Error('applySession called without an access token');
    }
    await session.save(res.accessToken, res.userId);
    await profile.save(res.displayName, res.avatarObjectKey);
    setUserId(res.userId);
    setAccessToken(res.accessToken);
    setDisplayName(res.displayName);
    setAvatarObjectKey(res.avatarObjectKey);
    setEmail(res.email);
    setPhoneNumber(res.phoneNumber);
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
      async signInWithOtp(identifier, code) {
        const res = await authApi.verifyOtp(identifier, code, currentDeviceLabel());
        if (res.requiresDeviceSwitchConfirmation) {
          return {
            requiresDeviceSwitchConfirmation: true,
            confirmationToken: res.confirmationToken!,
            conflictingDeviceLabel: res.conflictingDeviceLabel,
          };
        }
        await applySession(res);
        return { isNewAccount: !res.displayName };
      },
      async confirmDeviceSwitch(confirmationToken) {
        const res = await authApi.confirmDeviceSwitch(confirmationToken);
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
        // clearing it first would send the unregister request unauthenticated.
        await unregisterCurrentDevicePushToken();
        await session.clear();
        setUserId(null);
        setAccessToken(null);
        setDisplayName(null);
        setAvatarObjectKey(null);
        setEmail(null);
        setPhoneNumber(null);
      },
    }),
    [isLoading, userId, accessToken, displayName, avatarObjectKey, email, phoneNumber]
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
