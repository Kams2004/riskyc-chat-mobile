import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Button, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { Avatar } from '../../../components/Avatar';
import { useAuth } from '../../../features/auth/AuthContext';
import { conversationIdFor } from '../../../features/messaging/conversationId';
import { useTheme } from '../../../features/theme/ThemeContext';
import { getUser } from '../../../features/users/api';
import { fonts, type Palette } from '../../../theme';

const QR_PREFIX = 'riskycchat://u/';

type Tab = 'scan' | 'mine';

/** "New contact" entry point — a scan/my-code tabbed screen, matching the reference two-tab QR layout. */
export default function QrScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const { userId, displayName, avatarObjectKey } = useAuth();
  const { initialTab } = useLocalSearchParams<{ initialTab?: Tab }>();
  const [tab, setTab] = useState<Tab>(initialTab === 'mine' ? 'mine' : 'scan');
  const { t } = useTranslation('chats');

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.backTouchable} onPress={() => router.back()}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={tab === 'scan' ? '#ffffff' : colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 18l-6-6 6-6" />
          </Svg>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: tab === 'scan' ? '#ffffff' : colors.textPrimary }]}>{t('qr.headerTitle')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={[styles.tabRow, { backgroundColor: tab === 'scan' ? 'transparent' : colors.tint1 }]}>
        <TouchableOpacity style={styles.tab} onPress={() => setTab('scan')}>
          <Text style={[styles.tabLabel, { color: tab === 'scan' ? '#ffffff' : colors.textMuted }, tab === 'scan' && styles.tabLabelActive]}>
            {t('qr.tabScan')}
          </Text>
          {tab === 'scan' && <View style={styles.tabUnderline} />}
        </TouchableOpacity>
        <TouchableOpacity style={styles.tab} onPress={() => setTab('mine')}>
          <Text style={[styles.tabLabel, { color: tab === 'mine' ? colors.brand600 : colors.textMuted }, tab === 'mine' && styles.tabLabelActive]}>
            {t('qr.tabMine')}
          </Text>
          {tab === 'mine' && <View style={[styles.tabUnderline, { backgroundColor: colors.brand600 }]} />}
        </TouchableOpacity>
      </View>

      {tab === 'scan' ? (
        <ScanPane />
      ) : (
        <View style={styles.mineContainer}>
          <View style={styles.card}>
            <Avatar objectKey={avatarObjectKey} label={displayName || userId || '?'} size={72} />
            <Text style={styles.name}>{displayName || t('qr.youFallback')}</Text>
            <View style={styles.qrWrap}>
              <QRCode value={`${QR_PREFIX}${userId}`} size={200} color={colors.brand900} backgroundColor="#ffffff" />
            </View>
          </View>
          <Text style={styles.caption}>{t('qr.caption')}</Text>
        </View>
      )}
    </View>
  );
}

function ScanPane() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { userId } = useAuth();
  const { t } = useTranslation('chats');
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
    return <View style={styles.scanPane} />;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.scanPane, styles.permissionContainer]}>
        <Text style={styles.permissionTitle}>{t('qr.cameraPermissionTitle')}</Text>
        <Text style={styles.permissionBody}>{t('qr.cameraPermissionBody')}</Text>
        <Button title={t('qr.grantAccess')} onPress={requestPermission} color={colors.brand600} />
      </View>
    );
  }

  return (
    <View style={styles.scanPane}>
      <CameraView style={styles.camera} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={handleBarcodeScanned} />
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
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6, paddingBottom: 8 },
    backTouchable: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontFamily: fonts.sansSemiBold, fontSize: 16.5 },
    tabRow: { flexDirection: 'row' },
    tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
    tabLabel: { fontFamily: fonts.sansSemiBold, fontSize: 12.5, letterSpacing: 0.5 },
    tabLabelActive: { fontFamily: fonts.sansBold },
    tabUnderline: { marginTop: 8, height: 2.5, width: 60, backgroundColor: '#ffffff', borderRadius: 2 },
    scanPane: { flex: 1 },
    camera: { flex: 1 },
    frame: {
      position: 'absolute',
      top: '30%',
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
    mineContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, paddingHorizontal: 24 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 24,
      padding: 28,
      alignItems: 'center',
      gap: 16,
      shadowColor: colors.brand900,
      shadowOpacity: 0.1,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
      elevation: 4,
    },
    name: { fontFamily: fonts.display, fontSize: 19, color: colors.textPrimary },
    qrWrap: { padding: 16, backgroundColor: '#ffffff', borderRadius: 16 },
    caption: {
      fontFamily: fonts.sans,
      fontSize: 12.5,
      lineHeight: 18,
      color: colors.textMuted,
      textAlign: 'center',
      maxWidth: 260,
      marginTop: 24,
    },
  });
}
