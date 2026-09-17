import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { Button } from '../../../components/Button';
import { useAuth } from '../../../features/auth/AuthContext';
import { useTheme } from '../../../features/theme/ThemeContext';
import { deleteMyAccount } from '../../../features/users/api';
import { fonts, type Palette } from '../../../theme';

const REASONS = ['dataLoss', 'messages', 'media', 'groupsContacts', 'status'] as const;

/**
 * A dedicated, full-screen deletion flow rather than a single Alert — the
 * account.tsx "Delete account" row used to fire the destructive action
 * straight from one native confirm dialog, with no room to actually explain
 * what's lost before asking someone to commit to it. This screen only ever
 * explains and confirms; the actual delete + sign-out + app-exit sequence
 * still only runs after a second, explicit native confirmation below.
 */
export default function DeleteAccountScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const { signOut } = useAuth();
  const { t } = useTranslation('settings');
  const [isDeleting, setIsDeleting] = useState(false);

  function confirmAndDelete() {
    Alert.alert(t('deleteAccount.finalConfirmTitle'), t('deleteAccount.finalConfirmBody'), [
      { text: t('common:cancel'), style: 'cancel' },
      { text: t('account.deleteAccount'), style: 'destructive', onPress: runDeletion },
    ]);
  }

  async function runDeletion() {
    setIsDeleting(true);
    try {
      await deleteMyAccount();
      await signOut();
      // There is no legitimate cross-platform "quit the app" API — iOS
      // explicitly disallows an app terminating itself (App Store review
      // rejects it), so this only actually closes on Android. On iOS,
      // signOut() has already cleared AuthContext, so RootNavigator's own
      // Stack.Protected guard (see app/_layout.tsx) takes over immediately
      // and lands back on the sign-up/sign-in flow on its own — reopening
      // (or just continuing) the app with no account left behind finds
      // nothing but a fresh sign-up, exactly like tapping "create another
      // one" would.
      if (Platform.OS === 'android') {
        BackHandler.exitApp();
      }
    } catch (e) {
      console.warn('[DeleteAccount] failed', e);
      Alert.alert(t('account.deleteError'), t('common:checkConnectionAndRetry'));
      setIsDeleting(false);
    }
  }

  if (isDeleting) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator color={colors.brand600} size="large" />
        <Text style={styles.loadingText}>{t('deleteAccount.deleting')}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconTouchable} onPress={() => router.back()}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 18l-6-6 6-6" />
          </Svg>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('account.deleteAccount')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.iconWrap}>
          <Svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke={colors.brand600} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
            <Path d="M10 11v6M14 11v6" />
          </Svg>
        </View>

        <Text style={styles.title}>{t('deleteAccount.title')}</Text>
        <Text style={styles.subtitle}>{t('deleteAccount.subtitle')}</Text>

        <View style={styles.list}>
          {REASONS.map((key) => (
            <View key={key} style={styles.listItem}>
              <View style={styles.bullet} />
              <Text style={styles.listText}>{t(`deleteAccount.reasons.${key}`)}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.footnote}>{t('deleteAccount.footnote')}</Text>

        <Button onPress={confirmAndDelete} style={styles.confirmButton}>
          {t('deleteAccount.understood')}
        </Button>
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface },
    loadingContainer: { alignItems: 'center', justifyContent: 'center', gap: 16 },
    loadingText: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.textMuted },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 8 },
    iconTouchable: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontFamily: fonts.sansSemiBold, fontSize: 16.5, color: colors.textPrimary },
    scrollContent: { paddingHorizontal: 28, alignItems: 'center', flexGrow: 1 },
    iconWrap: {
      width: 76,
      height: 76,
      borderRadius: 38,
      backgroundColor: colors.tint1,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 16,
      marginBottom: 24,
    },
    title: { fontFamily: fonts.display, fontSize: 23, color: colors.textPrimary, textAlign: 'center' },
    subtitle: { fontFamily: fonts.sans, fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 10, lineHeight: 20 },
    list: { alignSelf: 'stretch', marginTop: 28, gap: 14 },
    listItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    bullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand600, marginTop: 7 },
    listText: { flex: 1, fontFamily: fonts.sans, fontSize: 14.5, color: colors.textPrimary, lineHeight: 20 },
    footnote: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.textMuted, textAlign: 'center', marginTop: 24, lineHeight: 18 },
    confirmButton: { alignSelf: 'stretch', marginTop: 32 },
  });
}
