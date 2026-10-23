import * as SecureStore from 'expo-secure-store';
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { useColorScheme } from 'react-native';

import { darkPalette, lightPalette, type Palette } from '../../theme';

export type ThemePreference = 'system' | 'light' | 'dark';

type ThemeState = {
  colors: Palette;
  scheme: 'light' | 'dark';
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

const PREFERENCE_KEY = 'riskyc.themePreference';

const ThemeContext = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  // Defaults to light, not the device's own OS setting — a phone with
  // system dark mode on would otherwise launch this app in dark mode on
  // first install, before the person ever chose a theme here at all.
  // "System" is still a selectable preference in Settings for anyone who
  // wants it; this only changes what a never-set preference resolves to.
  const [preference, setPreferenceState] = useState<ThemePreference>('light');

  useEffect(() => {
    SecureStore.getItemAsync(PREFERENCE_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setPreferenceState(stored);
      }
    });
  }, []);

  function setPreference(next: ThemePreference) {
    setPreferenceState(next);
    SecureStore.setItemAsync(PREFERENCE_KEY, next);
  }

  const scheme: 'light' | 'dark' = preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;
  const colors = scheme === 'dark' ? darkPalette : lightPalette;

  const value = useMemo<ThemeState>(
    () => ({ colors, scheme, preference, setPreference }),
    [colors, scheme, preference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
