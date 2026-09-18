import { router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Svg, { Path } from 'react-native-svg';

import { setAppLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from '../../../i18n';
import { useTheme } from '../../../features/theme/ThemeContext';
import { fonts, type Palette } from '../../../theme';

const LANGUAGE_FLAGS: Record<SupportedLanguage, string> = { en: '🇬🇧', fr: '🇫🇷' };

export default function LanguageSettingsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const { t, i18n } = useTranslation('settings');

  const languageLabels: Record<SupportedLanguage, string> = {
    en: t('language.english'),
    fr: t('language.french'),
  };

  async function selectLanguage(lang: SupportedLanguage) {
    await setAppLanguage(lang);
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backTouchable} onPress={() => router.back()}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 18l-6-6 6-6" />
          </Svg>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('language.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.card}>
        {SUPPORTED_LANGUAGES.map((lang, i) => {
          const active = i18n.language === lang;
          return (
            <TouchableOpacity
              key={lang}
              style={[styles.row, i === SUPPORTED_LANGUAGES.length - 1 && styles.rowLast]}
              onPress={() => selectLanguage(lang)}
            >
              <Text style={styles.flag}>{LANGUAGE_FLAGS[lang]}</Text>
              <Text style={styles.rowLabel}>{languageLabels[lang]}</Text>
              {active && <View style={styles.activeDot} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, marginBottom: 18 },
    backTouchable: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontFamily: fonts.sansSemiBold, fontSize: 16.5, color: colors.textPrimary },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      marginHorizontal: 20,
      shadowColor: colors.brand900,
      shadowOpacity: 0.06,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 8 },
      elevation: 2,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: colors.hairline },
    rowLast: { borderBottomWidth: 0 },
    flag: { fontSize: 22 },
    rowLabel: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 15, color: colors.textPrimary },
    activeDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brand500 },
  });
}
