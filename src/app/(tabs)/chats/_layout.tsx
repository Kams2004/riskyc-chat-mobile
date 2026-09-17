import { Stack } from 'expo-router';

export default function ChatsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[conversationId]" />
      <Stack.Screen name="new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="broadcast" options={{ presentation: 'modal' }} />
      <Stack.Screen name="new-group" options={{ presentation: 'modal' }} />
      <Stack.Screen name="forward" options={{ presentation: 'modal' }} />
      <Stack.Screen name="group-info" />
      <Stack.Screen name="group-invitations" />
      <Stack.Screen name="contact-details" />
      <Stack.Screen name="media-links-docs" />
      <Stack.Screen name="search" />
      <Stack.Screen name="scan" options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="qr" options={{ presentation: 'fullScreenModal' }} />
    </Stack>
  );
}
