import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/Button';
import { CountryPickerModal } from '../../components/CountryPickerModal';
import { KeyboardScreen } from '../../components/KeyboardScreen';
import * as authApi from '../../features/auth/api';
import { useAuth } from '../../features/auth/AuthContext';
import { useTheme } from '../../features/theme/ThemeContext';
import { COUNTRIES, type Country } from '../../lib/countries';
import { fonts, type Palette } from '../../theme';

type Mode = 'phone' | 'email';

export default function LoginScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const { completeSystemLogin } = useAuth();
  const { t } = useTranslation('auth');

  const { presetMode } = useLocalSearchParams<{ presetMode?: Mode }>();
  const [mode, setMode] = useState<Mode>(presetMode === 'email' ? 'email' : 'phone');
  const [country, setCountry] = useState<Country>(COUNTRIES[0]);
  const [localNumber, setLocalNumber] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const fullPhone = `${country.dialCode}${localNumber.replace(/\s/g, '')}`;
  const canSubmit = mode === 'phone' ? localNumber.trim().length >= 5 : email.trim().length > 3;

  async function handleConfirmedSend() {
    setShowConfirm(false);
    setIsSubmitting(true);
    try {
      const identifier =
        mode === 'phone'
          ? ({ type: 'phone', value: fullPhone } as const)
          : ({ type: 'email', value: email.trim() } as const);
      const immediate = await authApi.requestOtp(identifier);
      if (immediate) {
        await completeSystemLogin(immediate);
        return;
      }
      router.push({
        pathname: '/(auth)/verify',
        params: { identifierType: identifier.type, identifierValue: mode === 'phone' ? fullPhone : email.trim() },
      });
    } catch (e) {
      const status = (e as { status?: number })?.status;
      if (status === 429) setError(t('login.tooManyRequests'));
      else if (status === 409) setError(t('login.identifierInUse'));
      else setError(t('login.networkError'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <KeyboardScreen style={[styles.container, { paddingTop: insets.top + 24 }]}>
      {/* A flex:1 spacer pushing the button to the screen's bottom edge
          collapses to ~0 once the keyboard eats enough height on Android,
          leaving the button jammed right under the phone/email field
          instead of a real gap — same bug already fixed this way in
          edit-profile.tsx. A ScrollView with the button at a fixed
          marginTop after the last field keeps a real gap regardless of
          keyboard height. */}
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
      <Text style={styles.title}>{mode === 'phone' ? t('login.titlePhone') : t('login.titleEmail')}</Text>
      <Text style={styles.subtitle}>{t('login.subtitle')}</Text>

      <View style={styles.toggleRow}>
        {(['phone', 'email'] as Mode[]).map((m) => (
          <TouchableOpacity key={m} onPress={() => setMode(m)} style={[styles.toggleTab, mode === m && styles.toggleTabActive]}>
            <Text style={[styles.toggleLabel, mode === m && styles.toggleLabelActive]}>
              {m === 'phone' ? t('login.phoneTab') : t('login.emailTab')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {mode === 'phone' ? (
        <>
          <TouchableOpacity style={[styles.countryRow, { borderColor: colors.inputBorder }]} onPress={() => setShowPicker(true)}>
            <Text style={[styles.countryName, { color: colors.textPrimary }]}>{country.name}</Text>
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M6 9l6 6 6-6" />
            </Svg>
          </TouchableOpacity>
          <View style={styles.phoneRow}>
            <View style={[styles.dialBox, { borderColor: colors.inputBorder }]}>
              <Text style={[styles.dialCode, { color: colors.textPrimary }]}>{country.dialCode}</Text>
            </View>
            <TextInput
              style={[styles.phoneInput, { borderColor: colors.inputBorder, color: colors.textPrimary }]}
              placeholder={t('login.localNumberPlaceholder')}
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
              autoComplete="tel"
              value={localNumber}
              onChangeText={setLocalNumber}
            />
          </View>
        </>
      ) : (
        <TextInput
          style={[styles.input, { borderColor: colors.inputBorder, color: colors.textPrimary }]}
          placeholder={t('login.emailPlaceholder')}
          placeholderTextColor={colors.textMuted}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
        />
      )}

      {error && <Text style={styles.error}>{error}</Text>}
      <Button onPress={() => { setError(null); setShowConfirm(true); }} disabled={!canSubmit} loading={isSubmitting} style={styles.sendButton}>
        {t('login.sendCode')}
      </Button>
      </ScrollView>

      <CountryPickerModal visible={showPicker} onClose={() => setShowPicker(false)} onSelect={setCountry} />

      {/* ── Confirmation modal ── */}
      <Modal visible={showConfirm} transparent animationType="fade" onRequestClose={() => setShowConfirm(false)}>
        <TouchableWithoutFeedback onPress={() => setShowConfirm(false)}>
          <View style={styles.confirmBackdrop} />
        </TouchableWithoutFeedback>
        <View style={styles.confirmCenter}>
          <View style={[styles.confirmCard, { backgroundColor: colors.tint1 }]}>
            <Text style={[styles.confirmQuestion, { color: colors.textMuted }]}>
              {mode === 'phone' ? t('login.confirmPhoneQuestion') : t('login.confirmEmailQuestion')}
            </Text>
            <Text style={[styles.confirmValue, { color: colors.textPrimary }]}>
              {mode === 'phone' ? fullPhone : email.trim()}
            </Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity onPress={() => setShowConfirm(false)} style={styles.confirmBtn}>
                <Text style={[styles.confirmBtnLabel, { color: colors.brand600 }]}>{t('login.confirmEdit')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleConfirmedSend} style={styles.confirmBtn}>
                <Text style={[styles.confirmBtnLabel, { color: colors.brand600 }]}>{t('login.confirmYes')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardScreen>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 28 },
    sendButton: { marginTop: 32 },
    title: { fontFamily: fonts.display, fontSize: 25, color: colors.textPrimary, marginBottom: 10 },
    subtitle: { fontFamily: fonts.sans, fontSize: 13.5, lineHeight: 20, color: colors.textMuted, marginBottom: 28 },
    toggleRow: { flexDirection: 'row', backgroundColor: colors.tint1, borderRadius: 14, padding: 4, marginBottom: 20 },
    toggleTab: { flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: 'center' },
    toggleTabActive: { backgroundColor: colors.surface, shadowColor: colors.brand700, shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
    toggleLabel: { fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: colors.textMuted },
    toggleLabelActive: { color: colors.brand600 },
    countryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 10 },
    countryName: { fontFamily: fonts.sans, fontSize: 15 },
    phoneRow: { flexDirection: 'row', gap: 10 },
    dialBox: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', minWidth: 76 },
    dialCode: { fontFamily: fonts.sansSemiBold, fontSize: 16 },
    phoneInput: { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontFamily: fonts.sans, fontSize: 16 },
    input: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontFamily: fonts.sans, fontSize: 16 },
    error: { fontFamily: fonts.sans, color: colors.brand800, marginTop: 12 },
    confirmBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
    confirmCenter: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
    confirmCard: { width: '100%', borderRadius: 18, padding: 24 },
    confirmQuestion: { fontFamily: fonts.sans, fontSize: 14, marginBottom: 10 },
    confirmValue: { fontFamily: fonts.sansBold, fontSize: 22, marginBottom: 20 },
    confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 24 },
    confirmBtn: { paddingVertical: 4 },
    confirmBtnLabel: { fontFamily: fonts.sansSemiBold, fontSize: 15 },
  });
}
