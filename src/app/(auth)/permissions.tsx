import * as Contacts from 'expo-contacts';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/Button';
import { useTheme } from '../../features/theme/ThemeContext';
import { config } from '../../lib/config';
import { fonts, type Palette } from '../../theme';

export default function PermissionsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const { t } = useTranslation('auth');

  async function handleContinue() {
    await Contacts.requestPermissionsAsync();
    await ImagePicker.requestMediaLibraryPermissionsAsync();
    await ImagePicker.requestCameraPermissionsAsync();
    await Notifications.requestPermissionsAsync();
    router.replace('/(auth)/login');
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
      {/* Illustration */}
      <View style={styles.illustration}>
        <View style={[styles.card, { backgroundColor: colors.tint1 }]}>
          <Svg width={44} height={44} viewBox="0 0 24 24" fill="none" stroke={colors.brand500} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <Path d="M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
            <Rect x={3} y={14} width={8} height={1} rx={0.5} />
            <Rect x={3} y={17} width={6} height={1} rx={0.5} />
          </Svg>
        </View>
        <View style={[styles.bell, { backgroundColor: colors.brand500 }]}>
          <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <Path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </Svg>
        </View>
      </View>

      <Text style={styles.title}>{t('permissions.title')}</Text>
      <Text style={styles.subtitle}>{t('permissions.subtitle')}</Text>

      <View style={styles.items}>
        <PermItem colors={colors} title={t('permissions.contactsTitle')} desc={t('permissions.contactsDesc')}
          icon={<Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.brand500} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><Path d="M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" /></Svg>}
        />
        <PermItem colors={colors} title={t('permissions.mediaTitle')} desc={t('permissions.mediaDesc')}
          icon={<Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.brand500} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Rect x={3} y={3} width={18} height={18} rx={2} /><Path d="M3 9h18M9 21V9" /></Svg>}
        />
        <PermItem colors={colors} title={t('permissions.notificationsTitle')} desc={t('permissions.notificationsDesc')}
          icon={<Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.brand500} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><Path d="M13.73 21a2 2 0 0 1-3.46 0" /></Svg>}
        />
      </View>

      <Text style={styles.learnMore}>
        {t('permissions.learnMorePrefix')}
        <Text style={{ color: colors.brand600, fontFamily: fonts.sansSemiBold }} onPress={() => Linking.openURL(`${config.webAppUrl}/permissions`)}>
          {t('permissions.learnMoreLink')}
        </Text>
        {'.'}
      </Text>

      <View style={styles.footer}>
        <Button onPress={handleContinue}>{t('permissions.continue')}</Button>
        <TouchableOpacity onPress={() => router.replace('/(auth)/login')} style={styles.skipBtn}>
          <Text style={[styles.skipLabel, { color: colors.brand600 }]}>{t('permissions.skip')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function PermItem({ icon, title, desc, colors }: { icon: React.ReactNode; title: string; desc: string; colors: Palette }) {
  return (
    <View style={permStyles.row}>
      <View style={[permStyles.iconWrap, { backgroundColor: colors.tint1 }]}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={[permStyles.title, { color: colors.textPrimary }]}>{title}</Text>
        <Text style={[permStyles.desc, { color: colors.textMuted }]}>{desc}</Text>
      </View>
    </View>
  );
}

const permStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 22 },
  iconWrap: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  title: { fontFamily: fonts.sansSemiBold, fontSize: 15, marginBottom: 2 },
  desc: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18 },
});

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 28 },
    illustration: { alignSelf: 'center', width: 110, height: 90, marginBottom: 32, position: 'relative' },
    card: { width: 78, height: 78, borderRadius: 18, alignItems: 'center', justifyContent: 'center', position: 'absolute', left: 0, top: 6 },
    bell: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', position: 'absolute', right: 0, bottom: 0 },
    title: { fontFamily: fonts.display, fontSize: 26, color: colors.textPrimary, textAlign: 'center', marginBottom: 10 },
    subtitle: { fontFamily: fonts.sans, fontSize: 13.5, lineHeight: 20, color: colors.textMuted, textAlign: 'center', marginBottom: 32 },
    items: { flex: 1 },
    learnMore: { fontFamily: fonts.sans, fontSize: 13, color: colors.textMuted, textAlign: 'center', marginBottom: 24, lineHeight: 19 },
    footer: { gap: 4 },
    skipBtn: { alignItems: 'center', paddingVertical: 14 },
    skipLabel: { fontFamily: fonts.sansSemiBold, fontSize: 15 },
  });
}
