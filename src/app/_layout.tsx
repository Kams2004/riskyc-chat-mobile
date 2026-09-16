import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import {
  PlayfairDisplay_600SemiBold_Italic,
  PlayfairDisplay_700Bold,
} from '@expo-google-fonts/playfair-display';
import { useFonts } from 'expo-font';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DATABASE_NAME } from '../data/db';
import { migrateDbIfNeeded } from '../data/schema';
import { AuthProvider, useAuth } from '../features/auth/AuthContext';
import { initI18n } from '../i18n';
import { CallProvider } from '../features/calls/CallContext';
import { GroupCallProvider } from '../features/calls/GroupCallContext';
import { useInboxSocket } from '../features/messaging/inboxSocket';
import { usePushNotifications } from '../features/notifications/usePushNotifications';
import { usePresenceHeartbeat } from '../features/presence/usePresenceHeartbeat';
import { ThemeProvider, useTheme } from '../features/theme/ThemeContext';
import { loadPreferences } from '../lib/preferences';
import { CallOverlay } from '../components/CallOverlay';
import { GroupCallOverlay } from '../components/GroupCallOverlay';
import { IncomingGroupCallBanner } from '../components/IncomingGroupCallBanner';
import { MinimizedCallBubble } from '../components/MinimizedCallBubble';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    PlayfairDisplay_700Bold,
    PlayfairDisplay_600SemiBold_Italic,
  });
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);

  useEffect(() => {
    // i18n must be ready before ANY screen renders, including the very
    // first splash — loaded alongside the other startup preferences so
    // there's no extra gate/flash-of-wrong-language to manage separately.
    Promise.all([loadPreferences(), initI18n()]).then(() => setPreferencesLoaded(true));
  }, []);

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded || !preferencesLoaded) {
    return null;
  }

  return (
    <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrateDbIfNeeded}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <CallProvider>
              <GroupCallProvider>
                <Root />
              </GroupCallProvider>
            </CallProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </SQLiteProvider>
  );
}

function Root() {
  const { colors, scheme } = useTheme();
  useInboxSocket();
  usePresenceHeartbeat();
  usePushNotifications();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <RootNavigator />
      <CallOverlay />
      <GroupCallOverlay />
      <IncomingGroupCallBanner />
      <MinimizedCallBubble />
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}

function RootNavigator() {
  const { userId, isLoading, displayName } = useAuth();
  // Tracks a sign-in happening *during this app session* (not one already
  // signed in when the app launched) — a brand-new account has no
  // displayName yet, so this sends them straight to Edit profile instead of
  // dropping them on an empty-named chat list. An already-signed-in user
  // whose name is somehow still blank is deliberately NOT redirected here:
  // only the live transition below fires this, so they're never trapped
  // going back out of Edit profile with the name left empty.
  //
  // Two-step navigation (replace into Settings' own index, THEN push
  // edit-profile) rather than replacing straight into edit-profile: a
  // direct replace leaves the Settings tab's nested stack rooted on
  // edit-profile with no index underneath it (imperative router.replace
  // doesn't rehydrate intermediate route history the way a cold-start deep
  // link does), and since tab navigators preserve their state across
  // focus changes, every later visit to Settings re-lands on edit-profile
  // instead of its own list. Pushing on top of index gives edit-profile's
  // own save handler a real router.back() target and leaves the stack
  // correctly rooted for all future Settings visits.
  const previousUserId = useRef<string | null>(null);
  useEffect(() => {
    const justSignedIn = !previousUserId.current && !!userId;
    previousUserId.current = userId;
    if (justSignedIn && !displayName) {
      router.replace('/(tabs)/settings' as never);
      // The onboarding=1 param (not canGoBack(), which this same push now
      // makes true) is what edit-profile.tsx checks to decide Save should
      // land on the chat list, not back on the Settings screen it was only
      // ever pushed on top of to keep that tab's stack correctly rooted.
      router.push({ pathname: '/(tabs)/settings/edit-profile', params: { onboarding: '1' } } as never);
    }
  }, [userId, displayName]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!userId && !isLoading}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>

      <Stack.Protected guard={!!userId}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
    </Stack>
  );
}
