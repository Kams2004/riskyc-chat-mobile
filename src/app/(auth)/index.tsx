import { router } from 'expo-router';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { Button } from '../../components/Button';
import { Logo } from '../../components/Logo';
import { useTheme } from '../../features/theme/ThemeContext';
import { fonts, type Palette } from '../../theme';

const FEATURES: Array<{ title: string; description: string; icon: (color: string) => React.ReactNode }> = [
  {
    title: 'Real-time messaging',
    description: 'Texts, photos, voice notes and files, delivered instantly.',
    icon: (color) => (
      <Path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    ),
  },
  {
    title: 'Group chats',
    description: 'Bring everyone into one conversation with full read receipts.',
    icon: (color) => (
      <>
        <Path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <Path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <Path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </>
    ),
  },
  {
    title: 'Voice & video calls',
    description: 'Crystal-clear 1:1 calls, right from any conversation.',
    icon: (color) => (
      <>
        <Path d="M23 7l-7 5 7 5V7z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <Path d="M16 5H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </>
    ),
  },
];

export default function WelcomeScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);

  return (
    <View style={styles.container}>
      <View style={[styles.hero, { paddingTop: insets.top + 48 }]}>
        <Logo size={120} />
        <Text style={styles.wordmark}>
          RiskyC <Text style={styles.wordmarkLight}>Chat</Text>
        </Text>
        <Text style={styles.tagline}>Simple. Elegant. Yours.</Text>
      </View>

      <View style={styles.features}>
        {FEATURES.map((feature) => (
          <View key={feature.title} style={styles.featureRow}>
            <View style={styles.featureIcon}>
              <Svg width={22} height={22} viewBox="0 0 24 24">
                {feature.icon(colors.brand600)}
              </Svg>
            </View>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>{feature.title}</Text>
              <Text style={styles.featureDescription}>{feature.description}</Text>
            </View>
          </View>
        ))}
      </View>

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
    wordmark: { fontFamily: fonts.display, fontSize: 26, color: colors.textPrimary },
    wordmarkLight: { fontFamily: fonts.displayItalicMedium, color: colors.gold600 },
    tagline: {
      fontFamily: fonts.sansMedium,
      fontSize: 12.5,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: colors.textMuted,
    },
    features: { flex: 1, justifyContent: 'center', gap: 22, paddingHorizontal: 36 },
    featureRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    featureIcon: {
      width: 46,
      height: 46,
      borderRadius: 23,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.tint1,
    },
    featureText: { flex: 1, gap: 2 },
    featureTitle: { fontFamily: fonts.sansSemiBold, fontSize: 14.5, color: colors.textPrimary },
    featureDescription: { fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 17, color: colors.textMuted },
    footer: { gap: 20, paddingHorizontal: 28 },
    consent: { fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 19, color: colors.textMuted, textAlign: 'center' },
    link: { fontFamily: fonts.sansSemiBold, color: colors.brand600 },
  });
}
