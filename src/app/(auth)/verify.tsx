import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../../features/auth/AuthContext';
import { useTheme } from '../../features/theme/ThemeContext';
import { fonts, type Palette } from '../../theme';

const CODE_LENGTH = 6;

export default function VerifyScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const { signInWithOtp } = useAuth();

  const { identifierType, identifierValue } = useLocalSearchParams<{
    identifierType: 'phone' | 'email';
    identifierValue: string;
  }>();
  const [code, setCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (code.length !== CODE_LENGTH) return;
    let cancelled = false;
    setError(null);
    setIsVerifying(true);
    // Root layout's Stack.Protected guard swaps to (tabs) automatically once
    // userId is set below — an existing account's name/avatar came back
    // straight from the server, so there's nothing further to do here for
    // them; only a brand-new account gets redirected onward to complete its
    // profile (see app/_layout.tsx's onboarding redirect).
    signInWithOtp({ type: identifierType, value: identifierValue }, code)
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Incorrect code, please try again');
        setCode('');
      })
      .finally(() => {
        if (!cancelled) setIsVerifying(false);
      });
    return () => {
      cancelled = true;
    };
  }, [code, identifierType, identifierValue, signInWithOtp]);

  const digits = Array.from({ length: CODE_LENGTH }, (_, i) => code[i] ?? '');

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20 }]}>
      <Text style={styles.title}>Verify your {identifierType === 'phone' ? 'number' : 'email'}</Text>
      <Text style={styles.subtitle}>
        Enter the code we sent to <Text style={styles.bold}>{identifierValue}</Text>
      </Text>

      <View style={styles.boxesTouchable} onTouchEnd={() => inputRef.current?.focus()}>
        {digits.map((digit, i) => (
          <View key={i} style={[styles.box, i === code.length && styles.boxFocused]}>
            <Text style={styles.boxDigit}>{digit}</Text>
          </View>
        ))}
      </View>

      <TextInput
        ref={inputRef}
        style={styles.hiddenInput}
        value={code}
        onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, CODE_LENGTH))}
        keyboardType="number-pad"
        autoFocus
        editable={!isVerifying}
        maxLength={CODE_LENGTH}
      />

      {isVerifying && <ActivityIndicator color={colors.brand500} style={{ marginTop: 24 }} />}
      {error && <Text style={styles.error}>{error}</Text>}

      <Text style={styles.resend}>
        Didn't receive a code? <Text style={styles.link}>Resend</Text>
      </Text>
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface, alignItems: 'center', paddingHorizontal: 28 },
    title: { fontFamily: fonts.display, fontSize: 25, color: colors.textPrimary, marginBottom: 10 },
    subtitle: {
      fontFamily: fonts.sans,
      fontSize: 13,
      lineHeight: 19,
      color: colors.textMuted,
      textAlign: 'center',
      marginBottom: 40,
    },
    bold: { fontFamily: fonts.sansSemiBold, color: colors.textPrimary },
    boxesTouchable: { flexDirection: 'row', gap: 10 },
    box: {
      width: 44,
      height: 54,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: colors.inputBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    boxFocused: { borderColor: colors.brand500, borderWidth: 2 },
    boxDigit: { fontFamily: fonts.sansBold, fontSize: 20, color: colors.textPrimary },
    hiddenInput: { position: 'absolute', opacity: 0, height: 1, width: 1 },
    error: { fontFamily: fonts.sans, fontSize: 13, color: colors.brand800, marginTop: 16, textAlign: 'center' },
    resend: { fontFamily: fonts.sans, fontSize: 13, color: colors.textMuted, marginTop: 40 },
    link: { fontFamily: fonts.sansSemiBold, color: colors.brand600 },
  });
}
