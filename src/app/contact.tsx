import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../features/auth/AuthContext';
import { normalizeLinkPhone, setPendingContactLink } from '../features/contactLink/pendingContactLink';
import { conversationIdFor } from '../features/messaging/conversationId';
import { useTheme } from '../features/theme/ThemeContext';
import { lookupByPhone } from '../features/users/api';
import { config } from '../lib/config';
import { fonts, type Palette } from '../theme';

type State = 'opening' | 'notFound' | 'invalid' | 'yourself' | 'error';

/**
 * riskycchat://contact?phone=%2B2376…&name=Shop — opened from outside the app (e.g. a "Contact on RiskyC Chat"
 * button on a shop's page). Goes straight into the 1:1 chat with whoever owns that number, or says plainly that the
 * number isn't on RiskyC Chat yet. Signed out, the link is remembered and reopened after sign-in.
 */
export default function ContactLinkScreen() {
  const { phone, name } = useLocalSearchParams<{ phone?: string; name?: string }>();
  const { userId, displayName, isLoading, phoneNumber: ownPhoneNumber } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const { t } = useTranslation('chats');
  const [state, setState] = useState<State>('opening');
  const [attempt, setAttempt] = useState(0);

  const label = (name ?? '').trim() || (phone ?? '').trim();

  useEffect(() => {
    if (isLoading) return;
    const raw = (phone ?? '').trim();
    if (!raw) {
      setState('invalid');
      return;
    }
    // No account yet (or onboarding unfinished): sign in first, then RootNavigator reopens this link.
    if (!userId || !displayName) {
      setPendingContactLink({ kind: 'phone', phone: raw, name: name ?? undefined });
      router.replace('/(auth)' as never);
      return;
    }
    const target = normalizeLinkPhone(raw, ownPhoneNumber);
    if (ownPhoneNumber && target === ownPhoneNumber) {
      setState('yourself');
      return;
    }
    let cancelled = false;
    setState('opening');
    lookupByPhone(target)
      .then((user) => {
        if (cancelled) return;
        if (!user) {
          setState('notFound');
          return;
        }
        // Same navigation as New chat / QR scan: the 1:1 conversation id is derived from both user ids.
        router.replace({
          pathname: '/(tabs)/chats/[conversationId]',
          params: {
            conversationId: conversationIdFor(userId, user.userId),
            recipientId: user.userId,
            recipientName: user.displayName || (name ?? ''),
            recipientAvatarObjectKey: user.avatarObjectKey ?? '',
          },
        } as never);
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [isLoading, userId, displayName, ownPhoneNumber, phone, name, attempt]);

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace((userId ? '/(tabs)/chats' : '/(auth)') as never);
  }, [userId]);

  const invite = useCallback(async () => {
    const url = `${config.webAppUrl}/invite`;
    const message = (name ?? '').trim()
      ? t('newChat.inviteContactMessage', { name: (name ?? '').trim(), url })
      : t('newChat.inviteMessage', { url });
    try {
      await Share.share({ message, url });
    } catch {
      // dismissed
    }
  }, [name, t]);

  if (state === 'opening') {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={colors.brand500} />
        <Text style={styles.muted}>{t('contactLink.opening')}</Text>
      </View>
    );
  }

  const title =
    state === 'notFound'
      ? t('contactLink.notOnRiskyc', { name: label })
      : state === 'invalid'
        ? t('contactLink.invalidTitle')
        : state === 'yourself'
          ? t('contactLink.yourself')
          : t('contactLink.errorTitle');
  const body =
    state === 'notFound' ? t('contactLink.notOnRiskycBody') : state === 'invalid' ? t('contactLink.invalidBody') : state === 'error' ? t('contactLink.errorBody') : '';

  return (
    <View style={[styles.container, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        {!!body && <Text style={styles.body}>{body}</Text>}
        {state === 'notFound' && (
          <TouchableOpacity style={styles.primaryButton} onPress={invite}>
            <Text style={styles.primaryButtonText}>{t('contactLink.invite')}</Text>
          </TouchableOpacity>
        )}
        {state === 'error' && (
          <TouchableOpacity style={styles.primaryButton} onPress={() => setAttempt((n) => n + 1)}>
            <Text style={styles.primaryButtonText}>{t('contactLink.retry')}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.secondaryButton} onPress={close}>
          <Text style={styles.secondaryButtonText}>{t('contactLink.close')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 24 },
    center: { alignItems: 'center', justifyContent: 'center', gap: 12 },
    muted: { fontFamily: fonts.sans, fontSize: 14, color: colors.textMuted },
    card: { backgroundColor: colors.surface, borderRadius: 20, padding: 24, gap: 14 },
    title: { fontFamily: fonts.sansBold, fontSize: 18, color: colors.textPrimary },
    body: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20, color: colors.textMuted },
    primaryButton: { backgroundColor: colors.brand500, borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
    primaryButtonText: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: '#ffffff' },
    secondaryButton: { borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
    secondaryButtonText: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.textMuted },
  });
}
