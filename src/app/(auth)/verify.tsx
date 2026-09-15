import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../../features/auth/AuthContext';
import * as authApi from '../../features/auth/api';
import { ApiError } from '../../lib/httpClient';
import { useTheme } from '../../features/theme/ThemeContext';
import { fonts, type Palette } from '../../theme';

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 45;

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
  const [smsTrialLimitReached, setSmsTrialLimitReached] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

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

  async function handleResend() {
    if (isResending || resendCooldown > 0 || smsTrialLimitReached) return;
    setError(null);
    setIsResending(true);
    try {
      await authApi.requestOtp({ type: identifierType, value: identifierValue });
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) {
        const reason = (e.body as { reason?: string } | undefined)?.reason;
        if (reason === 'SMS_TRIAL_LIMIT_REACHED') {
          setSmsTrialLimitReached(true);
          setError(null);
        } else {
          setError("You're sending codes too quickly — please wait a bit before trying again.");
        }
      } else {
        setError(e instanceof Error ? e.message : 'Could not resend the code. Please try again.');
      }
    } finally {
      setIsResending(false);
    }
  }

  function useEmailInstead() {
    router.replace({ pathname: '/(auth)/login', params: { presetMode: 'email' } });
  }

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

      {smsTrialLimitReached ? (
        <View style={styles.trialLimitBox}>
          <Text style={styles.trialLimitText}>
            You've reached the SMS code limit for this number. Please use email instead to sign in.
          </Text>
          <TouchableOpacity onPress={useEmailInstead}>
            <Text style={[styles.resend, styles.link]}>Use email instead</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity onPress={handleResend} disabled={isResending || resendCooldown > 0}>
          <Text style={styles.resend}>
            Didn't receive a code?{' '}
            <Text style={[styles.link, (isResending || resendCooldown > 0) && styles.linkDisabled]}>
              {resendCooldown > 0 ? `Resend (${resendCooldown}s)` : isResending ? 'Sending…' : 'Resend'}
            </Text>
          </Text>
        </TouchableOpacity>
      )}
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
    resend: { fontFamily: fonts.sans, fontSize: 13, color: colors.textMuted, marginTop: 40, textAlign: 'center' },
    link: { fontFamily: fonts.sansSemiBold, color: colors.brand600 },
    linkDisabled: { color: colors.textMuted },
    trialLimitBox: { marginTop: 40, alignItems: 'center', gap: 10, paddingHorizontal: 12 },
    trialLimitText: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, color: colors.brand800, textAlign: 'center' },
  });
}
