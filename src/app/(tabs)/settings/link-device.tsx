import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Button, Modal, StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { ProgressBar } from '../../../components/ProgressBar';
import { approvePairing, denyPairing, getPairingInfo, resolvePairingCode } from '../../../features/sessions/api';
import { useTheme } from '../../../features/theme/ThemeContext';
import { ApiError } from '../../../lib/httpClient';
import { fonts, type Palette } from '../../../theme';

// Distinct from chats/scan.tsx's 'riskycchat://u/' contact-add prefix, so
// a pairing QR (this screen) and a contact QR (that one) can never be
// misrouted into each other's handler.
const QR_PREFIX = 'riskycchat://pair/';

export default function LinkDeviceScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const { t } = useTranslation('settings');
  const [permission, requestPermission] = useCameraPermissions();
  const [isResolving, setIsResolving] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);
  const hasHandledScan = useRef(false);

  function resetForAnotherScan() {
    hasHandledScan.current = false;
    setIsResolving(false);
  }

  /** Shared by both the QR-scan path and the manual-code fallback — a token resolved either way goes through the exact same confirm/approve flow. */
  async function resolveAndConfirm(token: string) {
    try {
      const { deviceLabel } = await getPairingInfo(token);
      setIsResolving(false);
      Alert.alert(t('linkDevice.confirmTitle'), t('linkDevice.confirmBody', { device: deviceLabel }), [
        { text: t('common:cancel'), style: 'cancel', onPress: () => { denyPairing(token).catch(() => {}); resetForAnotherScan(); } },
        {
          text: t('linkDevice.linkAction'),
          onPress: async () => {
            setIsResolving(true);
            try {
              await approvePairing(token);
              Alert.alert(t('linkDevice.linkedTitle'), t('linkDevice.linkedBody', { device: deviceLabel }), [
                { text: 'OK', onPress: () => router.back() },
              ]);
            } catch (e) {
              if (e instanceof ApiError && e.status === 403) {
                const body = e.body as { reason?: string; maxLinkedDevices?: number } | undefined;
                if (body?.reason === 'DEVICE_LIMIT_REACHED') {
                  Alert.alert(t('linkDevice.errorTitle'), t('linkDevice.deviceLimitReached', { max: body.maxLinkedDevices }));
                  resetForAnotherScan();
                  return;
                }
                // Defense-in-depth: devices.tsx already hides the entry
                // point to this screen for a non-master device, but the
                // backend is the real enforcement (PairingController's
                // MasterOnlyError) — this covers a stale isMaster value or
                // a direct deep-link into this screen.
                if (body?.reason === 'MASTER_ONLY') {
                  Alert.alert(t('linkDevice.errorTitle'), t('devices.masterOnlyNotice'));
                  resetForAnotherScan();
                  return;
                }
              }
              Alert.alert(t('linkDevice.errorTitle'), t('linkDevice.errorBody'));
              resetForAnotherScan();
            }
          },
        },
      ]);
    } catch (e) {
      const expired = e instanceof ApiError && e.status === 410;
      Alert.alert(
        expired ? t('linkDevice.expiredTitle') : t('linkDevice.errorTitle'),
        expired ? t('linkDevice.expiredBody') : t('linkDevice.errorBody')
      );
      resetForAnotherScan();
    }
  }

  async function handleBarcodeScanned({ data }: { data: string }) {
    if (hasHandledScan.current || !data.startsWith(QR_PREFIX)) {
      return;
    }
    hasHandledScan.current = true;
    setIsResolving(true);
    await resolveAndConfirm(data.slice(QR_PREFIX.length));
  }

  async function handleManualSubmit() {
    const normalized = manualCode.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (!normalized) return;
    setManualError(null);
    setIsResolving(true);
    try {
      const { token } = await resolvePairingCode(normalized);
      setShowManualEntry(false);
      setManualCode('');
      hasHandledScan.current = true;
      await resolveAndConfirm(token);
    } catch (e) {
      setIsResolving(false);
      setManualError(t('linkDevice.manualEntryNotFound'));
    }
  }

  function openManualEntry() {
    setManualError(null);
    setManualCode('');
    setShowManualEntry(true);
  }

  const manualEntryModal = (
    <Modal visible={showManualEntry} transparent animationType="fade" onRequestClose={() => setShowManualEntry(false)}>
      <TouchableWithoutFeedback onPress={() => setShowManualEntry(false)}>
        <View style={styles.manualBackdrop} />
      </TouchableWithoutFeedback>
      <View style={styles.manualCenter}>
        <View style={[styles.manualCard, { backgroundColor: colors.tint1 }]}>
          <Text style={[styles.manualTitle, { color: colors.textPrimary }]}>{t('linkDevice.manualEntryTitle')}</Text>
          <Text style={[styles.manualSubtitle, { color: colors.textMuted }]}>{t('linkDevice.manualEntrySubtitle')}</Text>
          <TextInput
            style={[styles.manualInput, { borderColor: colors.inputBorder, color: colors.textPrimary }]}
            placeholder={t('linkDevice.manualEntryPlaceholder')}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            value={manualCode}
            onChangeText={(v) => { setManualError(null); setManualCode(v); }}
          />
          {manualError && <Text style={styles.manualError}>{manualError}</Text>}
          <View style={styles.manualActions}>
            <TouchableOpacity onPress={() => setShowManualEntry(false)} style={styles.manualBtn}>
              <Text style={[styles.manualBtnLabel, { color: colors.brand600 }]}>{t('linkDevice.manualEntryCancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleManualSubmit} style={styles.manualBtn}>
              <Text style={[styles.manualBtnLabel, { color: colors.brand600 }]}>{t('linkDevice.manualEntrySubmit')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.permissionContainer, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.permissionTitle}>{t('linkDevice.cameraPermissionTitle')}</Text>
        <Text style={styles.permissionBody}>{t('linkDevice.cameraPermissionBody')}</Text>
        <Button title={t('linkDevice.grantAccess')} onPress={requestPermission} color={colors.brand600} />
        <TouchableOpacity style={styles.manualEntryLinkDark} onPress={openManualEntry}>
          <Text style={styles.manualEntryLinkDarkLabel}>{t('linkDevice.manualEntryAction')}</Text>
        </TouchableOpacity>
        {manualEntryModal}
        {isResolving && (
          <View style={styles.resolvingOverlay}>
            <ProgressBar active label={t('linkDevice.linking')} trackColor="rgba(255,255,255,0.25)" fillColor="#ffffff" textColor="#ffffff" />
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={handleBarcodeScanned}
      />
      <View style={[styles.overlay, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M18 6L6 18M6 6l12 12" />
          </Svg>
        </TouchableOpacity>
        <Text style={styles.overlayTitle}>{t('linkDevice.title')}</Text>
        <Text style={styles.overlaySubtitle}>{t('linkDevice.scanInstruction')}</Text>
      </View>
      <View style={styles.frame} pointerEvents="none" />
      <TouchableOpacity style={styles.manualEntryLink} onPress={openManualEntry}>
        <Text style={styles.manualEntryLinkLabel}>{t('linkDevice.manualEntryAction')}</Text>
      </TouchableOpacity>
      {manualEntryModal}
      {isResolving && (
        <View style={styles.resolvingOverlay}>
          <ProgressBar active label={t('linkDevice.linking')} trackColor="rgba(255,255,255,0.25)" fillColor="#ffffff" textColor="#ffffff" />
        </View>
      )}
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000000' },
    camera: { flex: 1 },
    overlay: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', gap: 10, paddingHorizontal: 32 },
    closeButton: { alignSelf: 'flex-start', width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    overlayTitle: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: '#ffffff' },
    overlaySubtitle: { fontFamily: fonts.sans, fontSize: 12.5, color: 'rgba(255,255,255,0.75)', textAlign: 'center' },
    frame: {
      position: 'absolute',
      top: '32%',
      left: '18%',
      right: '18%',
      aspectRatio: 1,
      borderWidth: 3,
      borderColor: '#ffffff',
      borderRadius: 24,
    },
    resolvingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
    permissionContainer: { alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 32 },
    permissionTitle: { fontFamily: fonts.display, fontSize: 21, color: '#ffffff' },
    permissionBody: { fontFamily: fonts.sans, fontSize: 13.5, lineHeight: 20, color: '#e6c6cf', textAlign: 'center' },
    manualEntryLink: {
      position: 'absolute',
      bottom: '12%',
      alignSelf: 'center',
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: 20,
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    manualEntryLinkLabel: { fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: '#ffffff' },
    manualEntryLinkDark: { marginTop: 8, paddingVertical: 8 },
    manualEntryLinkDarkLabel: { fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: colors.brand400 },
    manualBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
    manualCenter: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
    manualCard: { width: '100%', borderRadius: 18, padding: 24 },
    manualTitle: { fontFamily: fonts.sansBold, fontSize: 18, marginBottom: 6 },
    manualSubtitle: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, marginBottom: 16 },
    manualInput: {
      borderWidth: 1.5,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontFamily: fonts.sansSemiBold,
      fontSize: 17,
      letterSpacing: 1,
      textAlign: 'center',
    },
    manualError: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.brand800, marginTop: 10 },
    manualActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 24, marginTop: 18 },
    manualBtn: { paddingVertical: 4 },
    manualBtnLabel: { fontFamily: fonts.sansSemiBold, fontSize: 15 },
  });
}
