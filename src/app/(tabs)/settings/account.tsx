import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../../../features/auth/AuthContext';
import { useTheme } from '../../../features/theme/ThemeContext';
import { getUser, type UserResult } from '../../../features/users/api';
import { maskIdentifier } from '../../../lib/mask';
import { fonts, type Palette } from '../../../theme';

export default function AccountScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const { userId } = useAuth();
  const { t } = useTranslation('settings');
  const [user, setUser] = useState<UserResult | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);

  // Re-fetches every time this screen regains focus, not just on mount — a
  // change-identifier round trip pushes forward then pops back here, and a
  // plain useEffect (mount-only) would keep showing the stale value.
  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      getUser(userId)
        .then(setUser)
        .catch(() => {});
    }, [userId])
  );

  // Phone is this app's canonical identity — even an account that verified
  // with email is asked for a phone number during onboarding (see
  // profile-setup.tsx), so by the time anyone reaches Settings there's
  // normally one on file. Shown first/primary regardless of which
  // identifier the person actually signed in with; email (if any) gets its
  // own card below rather than being hidden — "change his setting" still
  // needs to reach both.
  const [isEmailRevealed, setIsEmailRevealed] = useState(false);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 20 }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconTouchable} onPress={() => router.back()}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 18l-6-6 6-6" />
          </Svg>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('account.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <TouchableOpacity style={styles.card} onPress={() => setIsRevealed((prev) => !prev)} activeOpacity={0.7}>
        <Text style={styles.label}>{t('account.phoneNumber')}</Text>
        <Text style={styles.value}>{user?.phoneNumber ? (isRevealed ? user.phoneNumber : maskIdentifier(user.phoneNumber)) : '—'}</Text>
        {!!user?.phoneNumber && <Text style={styles.revealHint}>{isRevealed ? t('account.tapToHide') : t('account.tapToReveal')}</Text>}
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.changeButton}
        onPress={() => router.push({ pathname: '/(tabs)/settings/change-identifier', params: { mode: 'phone' } })}
      >
        <Text style={styles.changeLabel}>{t('account.changePhoneNumber')}</Text>
      </TouchableOpacity>

      {!!user?.email && (
        <>
          <TouchableOpacity style={[styles.card, { marginTop: 16 }]} onPress={() => setIsEmailRevealed((prev) => !prev)} activeOpacity={0.7}>
            <Text style={styles.label}>{t('account.email')}</Text>
            <Text style={styles.value}>{isEmailRevealed ? user.email : maskIdentifier(user.email)}</Text>
            <Text style={styles.revealHint}>{isEmailRevealed ? t('account.tapToHide') : t('account.tapToReveal')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.changeButton}
            onPress={() => router.push({ pathname: '/(tabs)/settings/change-identifier', params: { mode: 'email' } })}
          >
            <Text style={styles.changeLabel}>{t('account.changeEmail')}</Text>
          </TouchableOpacity>
        </>
      )}

      <View style={{ flex: 1 }} />

      <TouchableOpacity style={styles.deleteButton} onPress={() => router.push('/(tabs)/settings/delete-account' as never)}>
        <Text style={styles.deleteLabel}>{t('account.deleteAccount')}</Text>
      </TouchableOpacity>
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 20 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
    iconTouchable: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontFamily: fonts.sansSemiBold, fontSize: 16.5, color: colors.textPrimary },
    card: { backgroundColor: colors.tint1, borderRadius: 16, padding: 18, gap: 4 },
    label: { fontFamily: fonts.sansSemiBold, fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
    value: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.textPrimary },
    revealHint: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.textMuted, marginTop: 2 },
    changeButton: { paddingVertical: 14, paddingHorizontal: 4 },
    changeLabel: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.brand600 },
    deleteButton: { paddingVertical: 14, alignItems: 'center' },
    deleteLabel: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.brand700 },
  });
}
