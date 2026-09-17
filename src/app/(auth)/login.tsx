import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/Button';
import { KeyboardScreen } from '../../components/KeyboardScreen';
import * as authApi from '../../features/auth/api';
import { useAuth } from '../../features/auth/AuthContext';
import { useTheme } from '../../features/theme/ThemeContext';
import { fonts, type Palette } from '../../theme';

type Mode = 'phone' | 'email';
type Country = { name: string; dialCode: string };

const COUNTRIES: Country[] = [
  { name: 'Cameroon', dialCode: '+237' },
  { name: 'France', dialCode: '+33' },
  { name: 'United States', dialCode: '+1' },
  { name: 'United Kingdom', dialCode: '+44' },
  { name: 'Nigeria', dialCode: '+234' },
  { name: 'Senegal', dialCode: '+221' },
  { name: "Côte d'Ivoire", dialCode: '+225' },
  { name: 'Ghana', dialCode: '+233' },
  { name: 'South Africa', dialCode: '+27' },
  { name: 'Kenya', dialCode: '+254' },
  { name: 'Ethiopia', dialCode: '+251' },
  { name: 'Tanzania', dialCode: '+255' },
  { name: 'Uganda', dialCode: '+256' },
  { name: 'Rwanda', dialCode: '+250' },
  { name: 'Congo (DRC)', dialCode: '+243' },
  { name: 'Congo (Republic)', dialCode: '+242' },
  { name: 'Gabon', dialCode: '+241' },
  { name: 'Chad', dialCode: '+235' },
  { name: 'Central African Republic', dialCode: '+236' },
  { name: 'Equatorial Guinea', dialCode: '+240' },
  { name: 'Germany', dialCode: '+49' },
  { name: 'Belgium', dialCode: '+32' },
  { name: 'Switzerland', dialCode: '+41' },
  { name: 'Canada', dialCode: '+1' },
  { name: 'Brazil', dialCode: '+55' },
  { name: 'China', dialCode: '+86' },
  { name: 'India', dialCode: '+91' },
  { name: 'Japan', dialCode: '+81' },
  { name: 'Australia', dialCode: '+61' },
  { name: 'Morocco', dialCode: '+212' },
  { name: 'Algeria', dialCode: '+213' },
  { name: 'Tunisia', dialCode: '+216' },
  { name: 'Egypt', dialCode: '+20' },
  { name: 'Spain', dialCode: '+34' },
  { name: 'Italy', dialCode: '+39' },
  { name: 'Portugal', dialCode: '+351' },
  { name: 'Netherlands', dialCode: '+31' },
  { name: 'Russia', dialCode: '+7' },
  { name: 'Turkey', dialCode: '+90' },
  { name: 'Saudi Arabia', dialCode: '+966' },
  { name: 'UAE', dialCode: '+971' },
];

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
  const [pickerSearch, setPickerSearch] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const fullPhone = `${country.dialCode}${localNumber.replace(/\s/g, '')}`;
  const canSubmit = mode === 'phone' ? localNumber.trim().length >= 5 : email.trim().length > 3;

  const filteredCountries = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.dialCode.includes(q));
  }, [pickerSearch]);

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
    <KeyboardScreen style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20 }]}>
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
      <View style={{ flex: 1 }} />
      <Button onPress={() => { setError(null); setShowConfirm(true); }} disabled={!canSubmit} loading={isSubmitting}>
        {t('login.sendCode')}
      </Button>

      {/* ── Country picker sheet ── */}
      <Modal visible={showPicker} animationType="slide" transparent onRequestClose={() => setShowPicker(false)}>
        <TouchableWithoutFeedback onPress={() => setShowPicker(false)}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>
        <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.sheetHandle, { backgroundColor: colors.hairline }]} />
          <TextInput
            style={[styles.pickerSearch, { borderColor: colors.inputBorder, color: colors.textPrimary }]}
            placeholder={t('login.searchCountry')}
            placeholderTextColor={colors.textMuted}
            value={pickerSearch}
            onChangeText={setPickerSearch}
            autoFocus
          />
          <FlatList
            data={filteredCountries}
            keyExtractor={(item) => item.name}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.countryItem, { borderBottomColor: colors.hairline }]}
                onPress={() => { setCountry(item); setPickerSearch(''); setShowPicker(false); }}
              >
                <Text style={[styles.countryItemName, { color: colors.textPrimary }]}>{item.name}</Text>
                <Text style={[styles.countryItemDial, { color: colors.textMuted }]}>{item.dialCode}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>

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
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
    sheet: { maxHeight: '75%', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 12, paddingHorizontal: 16 },
    sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
    pickerSearch: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontFamily: fonts.sans, fontSize: 14, marginBottom: 8 },
    countryItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1 },
    countryItemName: { fontFamily: fonts.sans, fontSize: 15 },
    countryItemDial: { fontFamily: fonts.sansMedium, fontSize: 14 },
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
