import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../components/Button';
import { KeyboardScreen } from '../../components/KeyboardScreen';
import * as authApi from '../../features/auth/api';
import { useTheme } from '../../features/theme/ThemeContext';
import { fonts, type Palette } from '../../theme';

type Mode = 'phone' | 'email';

export default function LoginScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);

  const [mode, setMode] = useState<Mode>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value = mode === 'phone' ? phoneNumber : email;

  async function handleSendCode() {
    setError(null);
    setIsSubmitting(true);
    try {
      const identifier =
        mode === 'phone' ? ({ type: 'phone', value: phoneNumber } as const) : ({ type: 'email', value: email } as const);
      await authApi.requestOtp(identifier);
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

      <View style={styles.spacer} />

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
  });
}
