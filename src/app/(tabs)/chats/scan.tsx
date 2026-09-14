import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Button, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { useAuth } from '../../../features/auth/AuthContext';
import { conversationIdFor } from '../../../features/messaging/conversationId';
import { useTheme } from '../../../features/theme/ThemeContext';
import { getUser } from '../../../features/users/api';
import { fonts, type Palette } from '../../../theme';

const QR_PREFIX = 'riskycchat://u/';

export default function ScanScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const { userId } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [isResolving, setIsResolving] = useState(false);
  const hasHandledScan = useRef(false);

  async function handleBarcodeScanned({ data }: { data: string }) {
    if (hasHandledScan.current || !data.startsWith(QR_PREFIX) || !userId) {
      return;
    }
    hasHandledScan.current = true;
    setIsResolving(true);
    const otherUserId = data.slice(QR_PREFIX.length);
    const user = await getUser(otherUserId).catch(() => null);
    router.replace({
      pathname: '/(tabs)/chats/[conversationId]',
      params: {
        conversationId: conversationIdFor(userId, otherUserId),
        recipientId: otherUserId,
        recipientName: user?.displayName ?? '',
        recipientAvatarObjectKey: user?.avatarObjectKey ?? '',
      },
    });
  }

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.permissionContainer, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.permissionTitle}>Camera access needed</Text>
        <Text style={styles.permissionBody}>
          RiskyC Chat needs your camera to scan a contact's QR code and start a chat with them.
        </Text>
        <Button title="Grant access" onPress={requestPermission} color={colors.brand600} />
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
        <Text style={styles.overlayTitle}>Scan a RiskyC Chat QR code</Text>
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
    overlay: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', gap: 16, paddingHorizontal: 20 },
    closeButton: { alignSelf: 'flex-start', width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    overlayTitle: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: '#ffffff' },
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
