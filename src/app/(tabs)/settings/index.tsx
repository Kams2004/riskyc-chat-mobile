import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { Avatar } from '../../../components/Avatar';
import { useAuth } from '../../../features/auth/AuthContext';
import { useTheme, type ThemePreference } from '../../../features/theme/ThemeContext';
import { getUser } from '../../../features/users/api';
import { maskIdentifier } from '../../../lib/mask';
import { darkPalette, fonts, lightPalette, TAB_BAR_CLEARANCE, type Palette } from '../../../theme';

function Chevron({ colors }: { colors: Palette }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.gold600} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 18l6-6-6-6" />
    </Svg>
  );
}

function Check({ colors }: { colors: Palette }) {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20 6L9 17l-5-5" />
    </Svg>
  );
}

function Row({
  icon,
  label,
  danger,
  last,
  onPress,
  styles,
  colors,
}: {
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  last?: boolean;
  onPress?: () => void;
  styles: ReturnType<typeof makeStyles>;
  colors: Palette;
}) {
  return (
    <TouchableOpacity style={[styles.row, last && styles.rowLast]} onPress={onPress}>
      <View style={styles.rowIcon}>{icon}</View>
      <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
      {!danger && <Chevron colors={colors} />}
    </TouchableOpacity>
  );
}

const PREFERENCE_VALUES: ThemePreference[] = ['system', 'light', 'dark'];

function ThemePreviewSwatch({ mode, active, colors, styles }: { mode: ThemePreference; active: boolean; colors: Palette; styles: ReturnType<typeof makeStyles> }) {
  if (mode === 'system') {
    return (
      <View style={[styles.previewSwatch, active && styles.previewSwatchActive, { flexDirection: 'row', overflow: 'hidden' }]}>
        <View style={[styles.previewHalf, { backgroundColor: lightPalette.background }]}>
          <View style={[styles.previewCard, { backgroundColor: lightPalette.surface, width: '90%' }]} />
        </View>
        <View style={[styles.previewHalf, { backgroundColor: darkPalette.background }]}>
          <View style={[styles.previewCard, { backgroundColor: darkPalette.surface, width: '90%' }]} />
        </View>
      </View>
    );
  }
  const palette = mode === 'dark' ? darkPalette : lightPalette;
  return (
    <View style={[styles.previewSwatch, active && styles.previewSwatchActive, { backgroundColor: palette.background, alignItems: 'center' }]}>
      <View style={[styles.previewCard, { backgroundColor: palette.surface }]}>
        <View style={[styles.previewLine, { backgroundColor: palette.brand500, width: '70%' }]} />
        <View style={[styles.previewLine, { backgroundColor: palette.hairline, width: '45%' }]} />
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const { userId, displayName, avatarObjectKey, signOut } = useAuth();
  const { colors, preference, setPreference } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const { t } = useTranslation('settings');

  const themeLabels: Record<ThemePreference, string> = {
    system: t('index.themeSystem'),
    light: t('index.themeLight'),
    dark: t('index.themeDark'),
  };

  // Registered email/phone shown instead of the raw account id — fetched
  // fresh rather than cached, since AuthContext only carries it right after
  // a live sign-in, not across a cold start of an already-signed-in session.
  const [identifier, setIdentifier] = useState<string | null>(null);
  useEffect(() => {
    if (!userId) return;
    getUser(userId)
      .then((user) => setIdentifier(user.email ?? user.phoneNumber))
      .catch(() => {});
  }, [userId]);

  function confirmSignOut() {
    Alert.alert(t('index.signOutConfirmTitle'), t('index.signOutConfirmBody'), [
      { text: t('common:cancel'), style: 'cancel' },
      { text: t('index.signOut'), style: 'destructive', onPress: signOut },
    ]);
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 8, paddingBottom: TAB_BAR_CLEARANCE(insets.bottom) }]}
    >
      <Text style={styles.header}>{t('index.title')}</Text>

      <TouchableOpacity style={styles.profileCard} onPress={() => router.push('/(tabs)/settings/edit-profile' as never)}>
        <Avatar objectKey={avatarObjectKey} label={displayName || '?'} size={68} />
        <View style={{ flex: 1 }}>
          <Text style={styles.profileName}>{displayName || t('index.addYourName')}</Text>
          {!!identifier && <Text style={styles.profileSubtitle}>{maskIdentifier(identifier)}</Text>}
        </View>
        <Chevron colors={colors} />
      </TouchableOpacity>

      <View style={styles.card}>
        <Row
          styles={styles}
          colors={colors}
          last
          icon={
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.brand600} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Rect x={3} y={3} width={7} height={7} />
              <Rect x={14} y={3} width={7} height={7} />
              <Rect x={3} y={14} width={7} height={7} />
              <Path d="M14 14h3v3h-3zM14 21h3M21 14v3M17.5 21H21v-3.5" />
            </Svg>
          }
          label={t('index.myQrCode')}
          onPress={() => router.push({ pathname: '/(tabs)/chats/qr', params: { initialTab: 'mine' } })}
        />
      </View>

      <Text style={styles.sectionLabel}>{t('index.appearance')}</Text>
      <View style={styles.card}>
        <View style={styles.themeRow}>
          {PREFERENCE_VALUES.map((value) => {
            const active = preference === value;
            return (
              <TouchableOpacity key={value} onPress={() => setPreference(value)} style={styles.themeOption}>
                <View>
                  <ThemePreviewSwatch mode={value} active={active} colors={colors} styles={styles} />
                  {active && (
                    <View style={styles.checkBadge}>
                      <Check colors={colors} />
                    </View>
                  )}
                </View>
                <Text style={[styles.themeTabLabel, active && styles.themeTabLabelActive]}>{themeLabels[value]}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.card}>
        <Row
          styles={styles}
          colors={colors}
          icon={
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.brand600} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Rect x={3} y={3} width={18} height={18} rx={3} />
              <Circle cx={8.5} cy={8.5} r={1.5} />
              <Path d="M21 15l-5-5L5 21" />
            </Svg>
          }
          label={t('index.chatWallpaper')}
          onPress={() => router.push('/(tabs)/settings/wallpaper' as never)}
        />
        <Row
          styles={styles}
          colors={colors}
          icon={
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.brand600} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <Circle cx={12} cy={7} r={4} />
            </Svg>
          }
          label={t('index.account')}
          onPress={() => router.push('/(tabs)/settings/account' as never)}
        />
        <Row
          styles={styles}
          colors={colors}
          icon={
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.brand600} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Rect x={2} y={4} width={20} height={13} rx={2} />
              <Path d="M8 21h8M12 17v4" />
            </Svg>
          }
          label={t('index.loggedInDevices')}
          onPress={() => router.push('/(tabs)/settings/devices' as never)}
        />
        <Row
          styles={styles}
          colors={colors}
          icon={
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.brand600} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </Svg>
          }
          label={t('index.privacy')}
          onPress={() => router.push('/(tabs)/settings/privacy' as never)}
        />
        <Row
          styles={styles}
          colors={colors}
          icon={
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.brand600} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M5 8l7 6 7-6" />
              <Rect x={3} y={5} width={18} height={14} rx={2} />
            </Svg>
          }
          label={t('index.language')}
          onPress={() => router.push('/(tabs)/settings/language' as never)}
        />
        <Row
          styles={styles}
          colors={colors}
          last
          icon={
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.brand600} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
              <Path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </Svg>
          }
          label={t('index.notifications')}
          onPress={() => Alert.alert(t('index.notificationsComingSoonTitle'), t('index.notificationsComingSoonBody'))}
        />
      </View>

      <View style={styles.card}>
        <Row
          styles={styles}
          colors={colors}
          last
          icon={
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.brand900} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <Path d="M16 17l5-5-5-5" />
              <Path d="M21 12H9" />
            </Svg>
          }
          label={t('index.signOut')}
          danger
          onPress={confirmSignOut}
        />
      </View>
    </ScrollView>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { paddingBottom: 40 },
    header: { fontFamily: fonts.display, fontSize: 29, color: colors.textPrimary, paddingHorizontal: 20, marginBottom: 18 },
    profileCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      backgroundColor: colors.surface,
      borderRadius: 20,
      padding: 18,
      marginHorizontal: 20,
      marginBottom: 20,
      shadowColor: colors.brand900,
      shadowOpacity: 0.06,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 8 },
      elevation: 2,
    },
    profileName: { fontFamily: fonts.display, fontSize: 18.5, color: colors.textPrimary },
    profileSubtitle: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.textMuted, marginTop: 3 },
    sectionLabel: {
      fontFamily: fonts.sansSemiBold,
      fontSize: 11.5,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginHorizontal: 24,
      marginBottom: 8,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      marginHorizontal: 20,
      marginBottom: 20,
      shadowColor: colors.brand900,
      shadowOpacity: 0.06,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 8 },
      elevation: 2,
    },
    themeRow: { flexDirection: 'row', gap: 12, padding: 16, justifyContent: 'space-between' },
    themeOption: { alignItems: 'center', gap: 8 },
    previewSwatch: {
      width: 72,
      height: 104,
      borderRadius: 14,
      borderWidth: 2,
      borderColor: 'transparent',
      justifyContent: 'center',
    },
    previewSwatchActive: { borderColor: colors.brand500 },
    previewHalf: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center' },
    previewCard: { borderRadius: 6, paddingVertical: 8, paddingHorizontal: 6, gap: 5, width: '78%' },
    previewLine: { height: 5, borderRadius: 3 },
    checkBadge: {
      position: 'absolute',
      top: -6,
      right: -6,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.brand500,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.surface,
    },
    themeTabLabel: { fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.textMuted },
    themeTabLabelActive: { color: colors.brand600 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: colors.hairline },
    rowLast: { borderBottomWidth: 0 },
    rowIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: colors.tint1, alignItems: 'center', justifyContent: 'center' },
    rowLabel: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 15, color: colors.textPrimary },
    rowLabelDanger: { color: colors.brand900 },
  });
}
