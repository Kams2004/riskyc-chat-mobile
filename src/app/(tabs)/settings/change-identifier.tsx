import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { Button } from '../../../components/Button';
import { KeyboardScreen } from '../../../components/KeyboardScreen';
import { useTheme } from '../../../features/theme/ThemeContext';
import { confirmIdentifierChange, requestIdentifierChange, type IdentifierField } from '../../../features/users/api';
import { ApiError } from '../../../lib/httpClient';
import { fonts, type Palette } from '../../../theme';

type Mode = 'phone' | 'email';

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 45;

function fieldFor(mode: Mode, value: string): IdentifierField {
  return mode === 'phone' ? { newPhoneNumber: value } : { newEmail: value };
}

/**
 * Two steps in one screen (enter new value, then enter the code sent to it)
 * — mirrors (auth)/login.tsx + verify.tsx's flow, but for an already-signed-in
 * user changing an existing identifier rather than signing in. Nothing on the
 * account changes until step 2's confirm succeeds.
 */
export default function ChangeIdentifierScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const { t } = useTranslation('settings');
  const { mode: modeParam } = useLocalSearchParams<{ mode?: Mode }>();
  const mode: Mode = modeParam === 'phone' ? 'phone' : 'email';

  const [step, setStep] = useState<'enter' | 'verify'>('enter');
  const [value, setValue] = useState('');
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [smsTrialLimitReached, setSmsTrialLimitReached] = useState(false);
  const [smsRetryHours, setSmsRetryHours] = useState(24);
  const [error, setError] = useState<string | null>(null);

  function smsRetryHoursFrom(e: unknown): number {
    const seconds = e instanceof ApiError ? (e.body as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds : undefined;
    return Math.max(1, Math.ceil((seconds ?? 24 * 3600) / 3600));
  }
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  function describeError(e: unknown): string {
    if (e instanceof ApiError) {
      if (e.status === 409) return mode === 'phone' ? t('changeIdentifier.alreadyInUsePhone') : t('changeIdentifier.alreadyInUseEmail');
      const reason = (e.body as { reason?: string } | undefined)?.reason;
      if (e.status === 429 && reason !== 'SMS_TRIAL_LIMIT_REACHED') {
        return t('changeIdentifier.tooManyRequests');
      }
    }
    // Never surface the raw exception (e.g. a bare "fetch failed:
    // java.net.ConnectException…" when the network drops) — always a
    // translated, user-appropriate message instead.
    return t('changeIdentifier.genericError');
  }

  async function handleSendCode() {
    setError(null);
    setIsSubmitting(true);
    try {
      await requestIdentifierChange(fieldFor(mode, value));
      setStep('verify');
      setCode('');
      setSmsTrialLimitReached(false);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (e) {
      if (e instanceof ApiError && e.status === 429 && (e.body as { reason?: string } | undefined)?.reason === 'SMS_TRIAL_LIMIT_REACHED') {
        setError(t('changeIdentifier.smsLimitReached', { hours: smsRetryHoursFrom(e) }));
      } else {
        setError(describeError(e));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResend() {
    if (isResending || resendCooldown > 0 || smsTrialLimitReached) return;
    setError(null);
    setIsResending(true);
    try {
      await requestIdentifierChange(fieldFor(mode, value));
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (e) {
      if (e instanceof ApiError && e.status === 429 && (e.body as { reason?: string } | undefined)?.reason === 'SMS_TRIAL_LIMIT_REACHED') {
        setSmsTrialLimitReached(true);
        setSmsRetryHours(smsRetryHoursFrom(e));
      } else {
        setError(describeError(e));
      }
    } finally {
      setIsResending(false);
    }
  }

  useEffect(() => {
    if (step !== 'verify' || code.length !== CODE_LENGTH) return;
    let cancelled = false;
    setError(null);
    setIsSubmitting(true);
    confirmIdentifierChange(fieldFor(mode, value), code)
      .then(() => {
        if (cancelled) return;
        router.back();
      })
      .catch((e) => {
        if (cancelled) return;
        setError(describeError(e));
        setCode('');
      })
      .finally(() => {
        if (!cancelled) setIsSubmitting(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const digits = Array.from({ length: CODE_LENGTH }, (_, i) => code[i] ?? '');

  return (
    <KeyboardScreen style={[styles.container, { paddingTop: insets.top + 12 }]}>
      {/* Same fix as login.tsx: a flex:1 spacer pushing the button to the
          bottom collapses to ~0 once the keyboard eats enough height, so the
          button ends up jammed under the input instead of a real gap — a
          ScrollView with the button at a fixed marginTop avoids that
          regardless of keyboard height. */}
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 20 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconTouchable} onPress={() => (step === 'verify' ? setStep('enter') : router.back())}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 18l-6-6 6-6" />
          </Svg>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{mode === 'phone' ? t('changeIdentifier.titlePhone') : t('changeIdentifier.titleEmail')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {step === 'enter' ? (
        <>
          <Text style={styles.subtitle}>
            {mode === 'phone' ? t('changeIdentifier.subtitleEnterPhone') : t('changeIdentifier.subtitleEnterEmail')}
          </Text>
          <TextInput
            style={styles.input}
            placeholder={mode === 'phone' ? t('changeIdentifier.phonePlaceholder') : t('changeIdentifier.emailPlaceholder')}
            placeholderTextColor={colors.textMuted}
            keyboardType={mode === 'phone' ? 'phone-pad' : 'email-address'}
            autoCapitalize="none"
            autoComplete={mode === 'phone' ? 'tel' : 'email'}
            value={value}
            onChangeText={setValue}
            autoFocus
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <Button onPress={handleSendCode} disabled={!value} loading={isSubmitting} style={styles.sendButton}>
            {t('changeIdentifier.sendCode')}
          </Button>
        </>
      ) : (
        <>
          <Text style={styles.subtitle}>
            {t('changeIdentifier.subtitleVerifyPrefix')}
            <Text style={styles.bold}>{value}</Text>
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
            editable={!isSubmitting}
            maxLength={CODE_LENGTH}
          />
          {isSubmitting && <ActivityIndicator color={colors.brand500} style={{ marginTop: 24 }} />}
          {error && <Text style={styles.error}>{error}</Text>}
          {smsTrialLimitReached ? (
            <Text style={styles.trialLimitText}>
              {t('changeIdentifier.smsLimitReached', { hours: smsRetryHours })}
            </Text>
          ) : (
            <TouchableOpacity onPress={handleResend} disabled={isResending || resendCooldown > 0}>
              <Text style={styles.resend}>
                {t('changeIdentifier.didntReceiveCode')}{' '}
                <Text style={[styles.link, (isResending || resendCooldown > 0) && styles.linkDisabled]}>
                  {resendCooldown > 0
                    ? t('changeIdentifier.resendWithCooldown', { seconds: resendCooldown })
                    : isResending
                      ? t('changeIdentifier.sending')
                      : t('changeIdentifier.resend')}
                </Text>
              </Text>
            </TouchableOpacity>
          )}
        </>
      )}
      </ScrollView>
    </KeyboardScreen>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 20 },
    sendButton: { marginTop: 24 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
    iconTouchable: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontFamily: fonts.sansSemiBold, fontSize: 16.5, color: colors.textPrimary },
    subtitle: { fontFamily: fonts.sans, fontSize: 13.5, lineHeight: 20, color: colors.textMuted, marginBottom: 24 },
    bold: { fontFamily: fonts.sansSemiBold, color: colors.textPrimary },
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
    error: { fontFamily: fonts.sans, fontSize: 13, color: colors.brand800, marginTop: 16 },
    boxesTouchable: { flexDirection: 'row', gap: 10, alignSelf: 'center' },
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
    resend: { fontFamily: fonts.sans, fontSize: 13, color: colors.textMuted, marginTop: 28, textAlign: 'center' },
    link: { fontFamily: fonts.sansSemiBold, color: colors.brand600 },
    linkDisabled: { color: colors.textMuted },
    trialLimitText: {
      fontFamily: fonts.sans,
      fontSize: 13,
      lineHeight: 19,
      color: colors.brand800,
      textAlign: 'center',
      marginTop: 28,
    },
  });
}
