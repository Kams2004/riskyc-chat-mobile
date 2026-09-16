import { Stack } from 'expo-router';

export default function SettingsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="edit-profile" />
      <Stack.Screen name="account" />
      <Stack.Screen name="change-identifier" />
      <Stack.Screen name="devices" />
      <Stack.Screen name="privacy" />
      <Stack.Screen name="language" />
    </Stack>
  );
}
