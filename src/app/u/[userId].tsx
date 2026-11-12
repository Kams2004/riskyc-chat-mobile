import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '../../features/auth/AuthContext';
import { setPendingContactLink } from '../../features/contactLink/pendingContactLink';
import { conversationIdFor } from '../../features/messaging/conversationId';
import { useTheme } from '../../features/theme/ThemeContext';
import { getUser } from '../../features/users/api';

/**
 * riskycchat://u/<userId> — the same link a contact's QR code holds (see chats/qr.tsx), now also openable from
 * outside the app (a camera app, a shared link). Opens the 1:1 chat like the in-app scanner does.
 */
export default function UserLinkScreen() {
  const { userId: otherUserId } = useLocalSearchParams<{ userId: string }>();
  const { userId, displayName, isLoading } = useAuth();
  const { colors } = useTheme();

  useEffect(() => {
    if (isLoading || !otherUserId) return;
    if (!userId || !displayName) {
      setPendingContactLink({ kind: 'user', userId: otherUserId });
      router.replace('/(auth)' as never);
      return;
    }
    if (otherUserId === userId) {
      router.replace('/(tabs)/chats' as never);
      return;
    }
    let cancelled = false;
    getUser(otherUserId)
      .catch(() => null)
      .then((user) => {
        if (cancelled) return;
        router.replace({
          pathname: '/(tabs)/chats/[conversationId]',
          params: {
            conversationId: conversationIdFor(userId, otherUserId),
            recipientId: otherUserId,
            recipientName: user?.displayName ?? '',
            recipientAvatarObjectKey: user?.avatarObjectKey ?? '',
          },
        } as never);
      });
    return () => {
      cancelled = true;
    };
  }, [isLoading, userId, displayName, otherUserId]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator color={colors.brand500} />
    </View>
  );
}
