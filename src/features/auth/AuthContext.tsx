import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

import { currentDeviceLabel } from '../../lib/deviceLabel';
import { profile, session } from '../../lib/secureStore';
import * as authApi from './api';
import type { Identifier } from './api';

type AuthState = {
  isLoading: boolean;
  userId: string | null;
  accessToken: string | null;
  displayName: string | null;
  avatarObjectKey: string | null;
  email: string | null;
  phoneNumber: string | null;
  /** Resolves once OTP is verified; the caller decides what to do next (e.g. only a brand-new account needs profile setup). */
  signInWithOtp: (identifier: Identifier, code: string) => Promise<{ isNewAccount: boolean }>;
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
        await session.save(res.accessToken, res.userId);
        await profile.save(res.displayName, res.avatarObjectKey);
        setUserId(res.userId);
        setAccessToken(res.accessToken);
        setDisplayName(res.displayName);
        setAvatarObjectKey(res.avatarObjectKey);
        setEmail(res.email);
        setPhoneNumber(res.phoneNumber);
        return { isNewAccount: !res.displayName };
      },
      async updateProfile(fields) {
        const nextName = fields.displayName ?? displayName;
        const nextAvatarObjectKey = fields.avatarObjectKey === undefined ? avatarObjectKey : fields.avatarObjectKey;
        await profile.save(nextName, nextAvatarObjectKey);
        setDisplayName(nextName);
        setAvatarObjectKey(nextAvatarObjectKey);
      },
      async signOut() {
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
