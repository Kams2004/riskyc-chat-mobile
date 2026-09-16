import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/Button';
import { hasChosenLanguage, setAppLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from '../../i18n';
import { useTheme } from '../../features/theme/ThemeContext';
import { fonts, type Palette } from '../../theme';

const LANGUAGE_LABELS: Record<SupportedLanguage, { native: string; flag: string }> = {
  en: { native: 'English', flag: '🇬🇧' },
  fr: { native: 'Français', flag: '🇫🇷' },
};

/**
 * Shown once, right after the welcome splash's "Agree and continue" — a
 * device-persisted choice (see i18n/index.ts's hasChosenLanguage), not tied
 * to the account, so a returning already-signed-out user never sees this
 * again once it's set once; only Settings > Language can change it after
 * that. Auto-skips straight to login if a choice already exists, so the
 * splash button itself never needs to know which case applies.
 */
export default function LanguageSelectScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const { t, i18n } = useTranslation('auth');

  const [checkingExisting, setCheckingExisting] = useState(true);
  const [selected, setSelected] = useState<SupportedLanguage>(i18n.language as SupportedLanguage);

  useEffect(() => {
    hasChosenLanguage().then((chosen) => {
      if (chosen) {
        router.replace('/(auth)/login');
      } else {
        setCheckingExisting(false);
      }
    });
  }, []);

  async function handleContinue() {
    await setAppLanguage(selected);
    router.replace('/(auth)/login');
  }

  if (checkingExisting) return null;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 20 }]}>
      <Text style={styles.title}>{t('languageSelect.title')}</Text>
      <Text style={styles.subtitle}>{t('languageSelect.subtitle')}</Text>

      <View style={styles.options}>
        {SUPPORTED_LANGUAGES.map((lang) => {
          const active = selected === lang;
          return (
            <TouchableOpacity
              key={lang}
              style={[styles.option, active && styles.optionActive]}
              onPress={() => setSelected(lang)}
            >
              <Text style={styles.flag}>{LANGUAGE_LABELS[lang].flag}</Text>
              <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>{LANGUAGE_LABELS[lang].native}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Button onPress={handleContinue} style={styles.continueButton}>
        {t('languageSelect.continue')}
      </Button>
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 28 },
    title: { fontFamily: fonts.display, fontSize: 25, color: colors.textPrimary, marginBottom: 10, textAlign: 'center' },
    subtitle: { fontFamily: fonts.sans, fontSize: 13.5, lineHeight: 20, color: colors.textMuted, marginBottom: 40, textAlign: 'center' },
    options: { flex: 1, gap: 14 },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      borderWidth: 1.5,
      borderColor: colors.inputBorder,
      borderRadius: 14,
      paddingHorizontal: 18,
      paddingVertical: 16,
    },
    optionActive: { borderColor: colors.brand500, backgroundColor: colors.tint1 },
    flag: { fontSize: 26 },
    optionLabel: { fontFamily: fonts.sansMedium, fontSize: 16, color: colors.textPrimary },
    optionLabelActive: { fontFamily: fonts.sansSemiBold, color: colors.brand600 },
    continueButton: { marginTop: 20 },
  });
}
