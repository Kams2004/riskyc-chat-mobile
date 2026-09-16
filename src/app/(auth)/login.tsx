import { router, useLocalSearchParams } from 'expo-router';
import LottieView from 'lottie-react-native';
import { useEffect, useState } from 'react';
import { Keyboard, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../components/Button';
import { KeyboardScreen } from '../../components/KeyboardScreen';
import * as authApi from '../../features/auth/api';
import { useAuth } from '../../features/auth/AuthContext';
import { useTheme } from '../../features/theme/ThemeContext';
import { fonts, type Palette } from '../../theme';

type Mode = 'phone' | 'email';

export default function LoginScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const { completeSystemLogin } = useAuth();

  // Set when the verify screen sends someone back here after hitting the
  // SMS trial cap — lands them straight on the Email tab instead of phone,
  // since going "back" alone would leave them right where the problem was.
  const { presetMode } = useLocalSearchParams<{ presetMode?: Mode }>();
  const [mode, setMode] = useState<Mode>(presetMode === 'email' ? 'email' : 'phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  // The animation has a fixed pixel size that can't shrink to fit whatever
  // room the keyboard leaves behind — with it open there usually isn't
  // enough space left for both the animation AND the input/button below it,
  // so it visibly overlapped them. Simplest fix: it's decorative, so it
  // just hides itself while the keyboard (and therefore typing) is active.
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setIsKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setIsKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const value = mode === 'phone' ? phoneNumber : email;

  async function handleSendCode() {
    setError(null);
    setIsSubmitting(true);
    try {
      const identifier =
        mode === 'phone' ? ({ type: 'phone', value: phoneNumber } as const) : ({ type: 'email', value: email } as const);
      const immediate = await authApi.requestOtp(identifier);
      if (immediate) {
        // System-account access identifier — see requestOtp's doc comment.
        // No code was sent, so there's nothing to verify; sign in directly.
        await completeSystemLogin(immediate);
        return;
      }
      router.push({
        pathname: '/(auth)/verify',
        params: { identifierType: identifier.type, identifierValue: identifier.value },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <KeyboardScreen style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20 }]}>
      <Text style={styles.title}>Enter your {mode === 'phone' ? 'phone number' : 'email address'}</Text>
      <Text style={styles.subtitle}>RiskyC Chat will send a verification code to confirm it's you.</Text>

      <View style={styles.toggleRow}>
        <ToggleTab label="Phone" active={mode === 'phone'} onPress={() => setMode('phone')} styles={styles} />
        <ToggleTab label="Email" active={mode === 'email'} onPress={() => setMode('email')} styles={styles} />
      </View>

      {mode === 'phone' ? (
        <TextInput
          style={styles.input}
          placeholder="+237 6XX XXX XXX"
          placeholderTextColor={colors.textMuted}
          keyboardType="phone-pad"
          autoComplete="tel"
          value={phoneNumber}
          onChangeText={setPhoneNumber}
        />
      ) : (
        <TextInput
          style={styles.input}
          placeholder="you@example.com"
          placeholderTextColor={colors.textMuted}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
        />
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      {isKeyboardVisible ? (
        <View style={styles.spacer} />
      ) : (
        <View style={styles.animationWrap}>
          <LottieView
            source={require('../../../assets/lottie/two-factor-auth.json')}
            autoPlay
            loop
            resizeMode="contain"
            style={styles.animation}
          />
        </View>
      )}

      <Button onPress={handleSendCode} disabled={!value} loading={isSubmitting}>
        Send code
      </Button>
    </KeyboardScreen>
  );
}

function ToggleTab({
  label,
  active,
  onPress,
  styles,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.toggleTab, active && styles.toggleTabActive]}>
      <Text style={[styles.toggleLabel, active && styles.toggleLabelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 28 },
    title: { fontFamily: fonts.display, fontSize: 25, color: colors.textPrimary, marginBottom: 10 },
    subtitle: { fontFamily: fonts.sans, fontSize: 13.5, lineHeight: 20, color: colors.textMuted, marginBottom: 28 },
    toggleRow: {
      flexDirection: 'row',
      backgroundColor: colors.tint1,
      borderRadius: 14,
      padding: 4,
      marginBottom: 20,
    },
    toggleTab: { flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: 'center' },
    toggleTabActive: {
      backgroundColor: colors.surface,
      shadowColor: colors.brand700,
      shadowOpacity: 0.12,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    toggleLabel: { fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: colors.textMuted },
    toggleLabelActive: { color: colors.brand600 },
    input: {
      borderWidth: 1.5,
      borderColor: colors.inputBorder,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontFamily: fonts.sans,
      fontSize: 16,
      color: colors.textPrimary,
    },
    error: { fontFamily: fonts.sans, color: colors.brand800, marginTop: 12 },
    spacer: { flex: 1 },
    // overflow: 'hidden' is defense-in-depth, not the actual fix (that's
    // hiding the animation while the keyboard's up, see isKeyboardVisible) —
    // View's default overflow is 'visible', so without this any native
    // rendering quirk that draws outside the declared bounds could still
    // bleed into the button below like it did before.
    animationWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    animation: { width: 200, height: 206 },
  });
}
