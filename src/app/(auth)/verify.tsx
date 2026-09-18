import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../../features/auth/AuthContext';
import * as authApi from '../../features/auth/api';
import { ApiError } from '../../lib/httpClient';
import { KeyboardScreen } from '../../components/KeyboardScreen';
import { useTheme } from '../../features/theme/ThemeContext';
import { fonts, type Palette } from '../../theme';

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 45;

export default function VerifyScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const { signInWithOtp, confirmDeviceSwitch } = useAuth();
  const { t } = useTranslation('auth');

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
      .then((result) => {
        if (cancelled || !('requiresDeviceSwitchConfirmation' in result)) return;
        // The OTP was correct, but this account is already open on another
        // phone — login isn't complete yet (see signInWithOtp's own doc
        // comment). Refusing here must leave things exactly as if this
        // screen had never been submitted, so a decline just goes back to
        // entering the phone/email again, nothing more.
        Alert.alert(
          t('verify.deviceConflictTitle'),
          t('verify.deviceConflictBody', {
            device: result.conflictingDeviceLabel ?? t('verify.deviceConflictUnknownDevice'),
          }),
          [
            {
              text: t('common:cancel'),
              style: 'cancel',
              onPress: () => {
                setCode('');
                router.replace('/(auth)/login');
              },
            },
            {
              text: t('verify.deviceConflictConfirm'),
              style: 'destructive',
              onPress: async () => {
                setIsVerifying(true);
                try {
                  await confirmDeviceSwitch(result.confirmationToken);
                  // Stack.Protected guard swaps to (tabs) automatically once userId is set.
                } catch {
                  setError(t('login.networkError'));
                  setCode('');
                } finally {
                  setIsVerifying(false);
                }
              },
            },
          ]
        );
      })
      .catch((e) => {
        if (cancelled) return;
        // Never show raw network errors — a 401 really is a wrong/expired
        // code, but anything else (dropped connection, server hiccup) gets
        // the same friendly network message login.tsx uses, not a false
        // claim that the code itself was wrong.
        const status = (e as { status?: number })?.status;
        setError(status === 401 ? t('verify.incorrectCode') : t('login.networkError'));
        setCode('');
      })
      .finally(() => {
        if (!cancelled) setIsVerifying(false);
      });
    return () => {
      cancelled = true;
    };
  }, [code, identifierType, identifierValue, signInWithOtp, confirmDeviceSwitch, t]);

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
          setError(t('verify.tooManyRequests'));
        }
      } else {
        // Suppress raw network errors — show a generic friendly message.
        setError(t('verify.couldNotResend'));
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
    <KeyboardScreen style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
      <Text style={styles.title}>{identifierType === 'phone' ? t('verify.titlePhone') : t('verify.titleEmail')}</Text>
      <Text style={styles.subtitle}>
        {t('verify.subtitlePrefix')}
        <Text style={styles.bold}>{identifierValue}</Text>
        {identifierType === 'phone' && (
          <Text style={[styles.bold, { color: colors.brand600 }]} onPress={() => router.replace('/(auth)/login')}>
            {'  '}{t('verify.wrongNumber')}
          </Text>
        )}
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
          <Text style={styles.trialLimitText}>{t('verify.smsLimitReached')}</Text>
          <TouchableOpacity onPress={useEmailInstead}>
            <Text style={[styles.resend, styles.link]}>{t('verify.useEmailInstead')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity onPress={handleResend} disabled={isResending || resendCooldown > 0}>
          <Text style={styles.resend}>
            {t('verify.didntReceiveCode')}{' '}
            <Text style={[styles.link, (isResending || resendCooldown > 0) && styles.linkDisabled]}>
              {resendCooldown > 0 ? t('verify.resendWithCooldown', { seconds: resendCooldown }) : isResending ? t('verify.sending') : t('verify.resend')}
            </Text>
          </Text>
        </TouchableOpacity>
      )}
      </ScrollView>
    </KeyboardScreen>
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
