import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import {
  PlayfairDisplay_600SemiBold_Italic,
  PlayfairDisplay_700Bold,
} from '@expo-google-fonts/playfair-display';
import { useFonts } from 'expo-font';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { NavigationBar } from 'expo-navigation-bar';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';

import { DATABASE_NAME } from '../data/db';
import { migrateDbIfNeeded } from '../data/schema';
import { AuthProvider, useAuth } from '../features/auth/AuthContext';
import { initI18n } from '../i18n';
import { CallProvider, useCall } from '../features/calls/CallContext';
import { GroupCallProvider, useGroupCall } from '../features/calls/GroupCallContext';
import { useContactsSync } from '../features/contacts/useContactsSync';
import { useInboxSocket } from '../features/messaging/inboxSocket';
import { usePushNotifications } from '../features/notifications/usePushNotifications';
import { usePresenceHeartbeat } from '../features/presence/usePresenceHeartbeat';
import { ThemeProvider, useTheme } from '../features/theme/ThemeContext';
import { WallpaperProvider } from '../features/wallpaper/WallpaperContext';
import { checkForInAppUpdate } from '../lib/inAppUpdate';
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
    // react-native-gesture-handler requires this at the true root — without
    // it, PanGestureHandler-based gestures (voice-message scrubbing, the
    // swipe-to-reply gesture on message bubbles) can fail silently or throw
    // on Android. Needs to wrap everything, including SQLiteProvider, since
    // it establishes the native gesture event surface for the whole tree.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrateDbIfNeeded}>
        {/* Without initialWindowMetrics, useSafeAreaInsets() returns all
            zeroes on the very first render (before native measurement
            lands) and then snaps to the real value a frame later — visible
            as the floating tab bar/FAB briefly rendering too low/high
            before jumping into place, worse on some devices than others
            depending on how many frames that first render sticks around
            for. Passing it in gives the real native metrics synchronously
            on mount instead. */}
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
          <ThemeProvider>
            <WallpaperProvider>
              <AuthProvider>
                <CallProvider>
                  <GroupCallProvider>
                    <Root />
                  </GroupCallProvider>
                </CallProvider>
              </AuthProvider>
            </WallpaperProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </SQLiteProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Live-confirmed Android bug: after a 1:1 or group call ends, the insets
 * react-native-safe-area-context measures for the WHOLE app can get stuck
 * reading 0 for insets.bottom — visible as the floating tab bar suddenly
 * rendering flush/docked (no rounded corners, no margin, no shadow), and it
 * stays that way (switching tabs doesn't fix it) until the app is
 * backgrounded and foregrounded, which is what actually forces Android to
 * redeliver fresh window insets. This isn't specific to the tab bar or to
 * one screen — anything reading useSafeAreaInsets() under the SAME provider
 * is affected, including whatever the NEXT call's own CallOverlay would
 * read. There's no imperative "re-measure" API on this library; the only
 * way to force a fresh native measurement from JS is to unmount and remount
 * the SafeAreaProvider itself. RootLayout's own outer provider (which also
 * wraps SQLiteProvider/AuthProvider/etc.) is the wrong place to remount —
 * far too destructive. This nested provider, scoped to exactly the content
 * that needs correct insets and remounted (via `key`) the moment a call
 * transitions back to idle, is the narrowest fix that still covers every
 * screen (not just the tab bar) and every future call.
 */
function Root() {
  const { colors, scheme } = useTheme();
  useInboxSocket();
  usePresenceHeartbeat();
  usePushNotifications();
  useContactsSync();

  const { callState } = useCall();
  const { groupCallState } = useGroupCall();
  const [insetsRemountKey, setInsetsRemountKey] = useState(0);
  const prevCallActiveRef = useRef(false);

  useEffect(() => {
    const callActive = callState !== 'idle' || groupCallState !== 'idle';
    if (prevCallActiveRef.current && !callActive) {
      setInsetsRemountKey((k) => k + 1);
    }
    prevCallActiveRef.current = callActive;
  }, [callState, groupCallState]);

  // Nudges toward the latest Play Store version instead of relying purely
  // on Android's own background auto-update schedule — see inAppUpdate.ts.
  useEffect(() => {
    checkForInAppUpdate();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaProvider key={insetsRemountKey} initialMetrics={initialWindowMetrics}>
        <RootNavigator />
        <CallOverlay />
        <GroupCallOverlay />
        <IncomingGroupCallBanner />
        <MinimizedCallBubble />
      </SafeAreaProvider>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {/* Android-only (no-ops elsewhere) — without this the system nav bar
          never follows this app's OWN theme preference (which can differ
          from the OS's own dark/light setting), only whatever its
          build-time default was. */}
      <NavigationBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}

function RootNavigator() {
  const { userId, isLoading, displayName } = useAuth();
  // A signed-in account with no displayName yet hasn't finished onboarding
  // — keeps the (auth) stack itself in charge of getting them to
  // profile-setup, rather than ever letting (tabs) render at all. Earlier
  // this sent them into (tabs)/settings/edit-profile instead (a
  // parameterized mode of the normal in-app editor), which left that tab's
  // own nested stack permanently rooted on the editor on some devices —
  // any later tap of Settings just restored that same stuck state instead
  // of showing the real Settings list. A screen the Settings tab's
  // navigator never even mounts can't have that bug, so profile-setup is
  // now a plain sibling of language-select/permissions in (auth) instead.
  const needsOnboarding = !!userId && !displayName;

  const previousUserId = useRef<string | null>(null);
  useEffect(() => {
    const justSignedIn = !previousUserId.current && !!userId;
    previousUserId.current = userId;
    if (justSignedIn && !displayName) {
      router.replace('/(auth)/profile-setup' as never);
    }
  }, [userId, displayName]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={(!userId && !isLoading) || needsOnboarding}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>

      <Stack.Protected guard={!!userId && !needsOnboarding}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
    </Stack>
  );
}
