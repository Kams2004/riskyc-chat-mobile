import { router } from 'expo-router';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../components/Button';
import { Logo } from '../../components/Logo';
import { useTheme } from '../../features/theme/ThemeContext';
import { fonts, type Palette } from '../../theme';

export default function WelcomeScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);

  return (
    <View style={styles.container}>
      <View style={[styles.hero, { paddingTop: insets.top + 64 }]}>
        <Logo size={56} />
        <Text style={styles.wordmark}>
          RiskyC <Text style={styles.wordmarkLight}>Chat</Text>
        </Text>
        <Text style={styles.tagline}>Simple. Elegant. Yours.</Text>
      </View>

      <View style={styles.spacer} />

      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        <Text style={styles.consent}>
          Read our{' '}
          <Text style={styles.link} onPress={() => Linking.openURL('https://example.com/privacy')}>
            Privacy Policy
          </Text>
          . Tap "Agree and continue" to accept the{' '}
          <Text style={styles.link} onPress={() => Linking.openURL('https://example.com/terms')}>
            Terms of Service
          </Text>
          .
        </Text>
        <Button onPress={() => router.push('/(auth)/login')}>Agree and continue</Button>
      </View>
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    hero: { alignItems: 'center', gap: 14, paddingHorizontal: 32 },
    wordmark: { fontFamily: fonts.display, fontSize: 23, color: colors.textPrimary },
    wordmarkLight: { fontFamily: fonts.displayItalicMedium, color: colors.gold600 },
    tagline: {
      fontFamily: fonts.sansMedium,
      fontSize: 12.5,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: colors.textMuted,
    },
    spacer: { flex: 1 },
    footer: { gap: 20, paddingHorizontal: 28 },
    consent: { fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 19, color: colors.textMuted, textAlign: 'center' },
    link: { fontFamily: fonts.sansSemiBold, color: colors.brand600 },
  });
}
