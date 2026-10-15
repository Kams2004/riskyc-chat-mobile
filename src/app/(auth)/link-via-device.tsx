import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import { useTranslation } from 'react-i18next';

import { ProgressBar } from '../../components/ProgressBar';
import { useAuth } from '../../features/auth/AuthContext';
import { useTheme } from '../../features/theme/ThemeContext';
import { currentDeviceLabel } from '../../lib/deviceLabel';
import * as sessionsApi from '../../features/sessions/api';
import { fonts, type Palette } from '../../theme';

const POLL_MS = 1500;
// A little under auth-service's own 3-minute PENDING TTL (PairingService),
// so a fresh code is always requested before the current one could actually
// expire server-side.
const REFRESH_MS = 2 * 60 * 1000 + 30 * 1000;

/**
 * The "new phone, skip the OTP SMS" side of device pairing — mirrors web's
 * SignIn.tsx QrPanel exactly, just rendering the QR locally instead of
 * scanning one. This device has no session yet, so it can only ever be the
 * one DISPLAYING the code; an already-signed-in device (mobile's
 * settings/link-device.tsx, or web's own QR panel in reverse) is the one
 * that scans/types it in and approves, which is what actually mints this
 * device's session.
 */
export default function LinkViaDeviceScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const { completeSystemLogin } = useAuth();
  const { t } = useTranslation('auth');

  const [token, setToken] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [errored, setErrored] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const signedInRef = useRef(false);

  function clearTimers() {
    if (pollRef.current) clearInterval(pollRef.current);
    if (refreshRef.current) clearTimeout(refreshRef.current);
  }

  async function startPairing() {
    clearTimers();
    setErrored(false);
    try {
      const { token: newToken, code: newCode } = await sessionsApi.startPairing(currentDeviceLabel(), 'android');
      setToken(newToken);
      setCode(newCode);

      pollRef.current = setInterval(async () => {
        if (signedInRef.current) return;
        try {
          const result = await sessionsApi.pollPairingStatus(newToken);
          if (result.status === 'APPROVED' && result.session) {
            signedInRef.current = true;
            clearTimers();
            await completeSystemLogin(result.session);
          } else if (result.status === 'DENIED' || result.status === 'EXPIRED') {
            clearTimers();
            startPairing();
          }
        } catch {
          // A dropped poll just tries again next tick — no need to tear down the code over one failed request.
        }
      }, POLL_MS);

      refreshRef.current = setTimeout(startPairing, REFRESH_MS);
    } catch {
      setErrored(true);
    }
  }

  useEffect(() => {
    startPairing();
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formattedCode = code ? `${code.slice(0, 4)}-${code.slice(4)}` : null;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <Text style={styles.title}>{t('linkViaDevice.title')}</Text>
      <Text style={styles.subtitle}>{t('linkViaDevice.subtitle')}</Text>

      <View style={styles.qrFrame}>
        {errored ? (
          <TouchableOpacity style={styles.retryButton} onPress={startPairing}>
            <Text style={styles.retryLabel}>{t('linkViaDevice.error')}</Text>
          </TouchableOpacity>
        ) : token ? (
          <QRCode value={`riskycchat://pair/${token}`} size={220} color={colors.brand900} backgroundColor="#ffffff" />
        ) : (
          <ProgressBar active label={t('linkViaDevice.preparing')} />
        )}
      </View>

      {formattedCode && (
        <View style={styles.codeBox}>
          <Text style={styles.codeLabel}>{t('linkViaDevice.manualCodeLabel')}</Text>
          <Text style={styles.codeValue}>{formattedCode}</Text>
        </View>
      )}

      {token && !errored && (
        <View style={styles.waitingRow}>
          <ProgressBar active label={t('linkViaDevice.waiting')} />
        </View>
      )}

      <TouchableOpacity style={styles.backLink} onPress={() => router.back()}>
        <Text style={[styles.backLinkLabel, { color: colors.brand600 }]}>{t('linkViaDevice.backToLogin')}</Text>
      </TouchableOpacity>
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 28, alignItems: 'center' },
    title: { fontFamily: fonts.display, fontSize: 23, color: colors.textPrimary, marginBottom: 10, textAlign: 'center' },
    subtitle: { fontFamily: fonts.sans, fontSize: 13.5, lineHeight: 20, color: colors.textMuted, marginBottom: 28, textAlign: 'center' },
    qrFrame: {
      width: 252,
      height: 252,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.tint1,
      borderRadius: 16,
      padding: 16,
      marginBottom: 20,
    },
    retryButton: { paddingVertical: 12, paddingHorizontal: 20 },
    retryLabel: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.brand600, textAlign: 'center' },
    codeBox: {
      width: '100%',
      borderWidth: 1.5,
      borderColor: colors.inputBorder,
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 16,
      alignItems: 'center',
      marginBottom: 20,
    },
    codeLabel: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.textMuted, marginBottom: 6, textAlign: 'center' },
    codeValue: { fontFamily: fonts.sansBold, fontSize: 22, color: colors.textPrimary, letterSpacing: 1 },
    waitingRow: { width: '100%', marginBottom: 12 },
    backLink: { marginTop: 8, paddingVertical: 8 },
    backLinkLabel: { fontFamily: fonts.sansSemiBold, fontSize: 14 },
  });
}
