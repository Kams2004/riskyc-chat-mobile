import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../../../features/auth/AuthContext';
import { listSessions, revokeSession, type SessionResult } from '../../../features/sessions/api';
import { useTheme } from '../../../features/theme/ThemeContext';
import { fonts, type Palette } from '../../../theme';

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function DevicesScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const { signOut } = useAuth();
  const { t } = useTranslation('settings');
  const [sessions, setSessions] = useState<SessionResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setIsLoading(true);
    listSessions()
      .then(setSessions)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  useFocusEffect(load);

  function confirmRevoke(item: SessionResult) {
    Alert.alert(
      item.isCurrent
        ? t('devices.signOutThisDeviceTitle')
        : t('devices.signOutNamedDeviceTitle', { device: item.deviceLabel || t('devices.thisDevice') }),
      item.isCurrent ? t('devices.signOutCurrentMessage') : t('devices.signOutOtherMessage'),
      [
        { text: t('common:cancel'), style: 'cancel' },
        {
          text: t('devices.signOut'),
          style: 'destructive',
          onPress: async () => {
            setRevokingId(item.id);
            try {
              await revokeSession(item.id);
              if (item.isCurrent) {
                await signOut();
                return;
              }
              await load();
            } catch (e) {
              Alert.alert(t('devices.revokeError'), t('common:checkConnectionAndRetry'));
            } finally {
              setRevokingId(null);
            }
          },
        },
      ]
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 20 }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconTouchable} onPress={() => router.back()}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 18l-6-6 6-6" />
          </Svg>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('devices.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <TouchableOpacity style={styles.linkDeviceRow} onPress={() => router.push('/(tabs)/settings/link-device' as never)}>
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.brand600} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Rect x={3} y={3} width={7} height={7} rx={1} />
          <Rect x={14} y={3} width={7} height={7} rx={1} />
          <Rect x={3} y={14} width={7} height={7} rx={1} />
          <Path d="M14 14h3v3h-3zM14 21h3M21 14v3M17.5 21H21v-3.5" />
        </Svg>
        <Text style={styles.linkDeviceLabel}>{t('devices.linkDevice')}</Text>
      </TouchableOpacity>

      {isLoading && sessions.length === 0 && <ActivityIndicator color={colors.brand500} style={{ marginTop: 24 }} />}

      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 20 }}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>
                {item.deviceLabel || t('devices.unknownDevice')} {item.isCurrent && <Text style={styles.currentBadge}>{t('devices.currentDeviceBadge')}</Text>}
              </Text>
              <Text style={styles.rowSubtitle}>{t('devices.activeAt', { when: formatWhen(item.lastSeenAt) })}</Text>
            </View>
            {revokingId === item.id ? (
              <ActivityIndicator color={colors.brand500} />
            ) : (
              <TouchableOpacity onPress={() => confirmRevoke(item)}>
                <Text style={styles.signOutLabel}>{t('devices.signOut')}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      />
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 20 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    iconTouchable: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontFamily: fonts.sansSemiBold, fontSize: 16.5, color: colors.textPrimary },
    linkDeviceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.hairline,
    },
    linkDeviceLabel: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.brand600 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.hairline,
      gap: 12,
    },
    rowTitle: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.textPrimary },
    currentBadge: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.brand600 },
    rowSubtitle: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
    signOutLabel: { fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: colors.brand700 },
  });
}
