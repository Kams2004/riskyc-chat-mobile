import * as SecureStore from 'expo-secure-store';
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

/** Same shape/persistence pattern as ThemeContext's ThemePreference — see that file. */
export type WallpaperVariant = 'dots' | 'doodle' | 'plain';

type WallpaperState = {
  variant: WallpaperVariant;
  setVariant: (variant: WallpaperVariant) => void;
};

const PREFERENCE_KEY = 'riskyc.wallpaperVariant';

const WallpaperContext = createContext<WallpaperState | null>(null);

export function WallpaperProvider({ children }: PropsWithChildren) {
  const [variant, setVariantState] = useState<WallpaperVariant>('doodle');

  useEffect(() => {
    SecureStore.getItemAsync(PREFERENCE_KEY).then((stored) => {
      if (stored === 'dots' || stored === 'doodle' || stored === 'plain') {
        setVariantState(stored);
      }
    });
  }, []);

  function setVariant(next: WallpaperVariant) {
    setVariantState(next);
    SecureStore.setItemAsync(PREFERENCE_KEY, next);
  }

  const value = useMemo<WallpaperState>(() => ({ variant, setVariant }), [variant]);

  return <WallpaperContext.Provider value={value}>{children}</WallpaperContext.Provider>;
}

export function useWallpaper(): WallpaperState {
  const ctx = useContext(WallpaperContext);
  if (!ctx) {
    throw new Error('useWallpaper must be used within a WallpaperProvider');
  }
  return ctx;
}
