import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Button, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { approvePairing, denyPairing, getPairingInfo } from '../../../features/sessions/api';
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
  const hasHandledScan = useRef(false);

  function resetForAnotherScan() {
    hasHandledScan.current = false;
    setIsResolving(false);
  }

  async function handleBarcodeScanned({ data }: { data: string }) {
    if (hasHandledScan.current || !data.startsWith(QR_PREFIX)) {
      return;
    }
    hasHandledScan.current = true;
    setIsResolving(true);
    const token = data.slice(QR_PREFIX.length);

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

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.permissionContainer, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.permissionTitle}>{t('linkDevice.cameraPermissionTitle')}</Text>
        <Text style={styles.permissionBody}>{t('linkDevice.cameraPermissionBody')}</Text>
        <Button title={t('linkDevice.grantAccess')} onPress={requestPermission} color={colors.brand600} />
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
      {isResolving && (
        <View style={styles.resolvingOverlay}>
          <ActivityIndicator color="#ffffff" size="large" />
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
  });
}
