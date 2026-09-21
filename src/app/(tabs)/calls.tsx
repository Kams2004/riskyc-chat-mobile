import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { Avatar } from '../../components/Avatar';
import { PhoneIcon, VideoIcon } from '../../components/icons';
import { listCallHistory, type CallResult } from '../../features/calls/api';
import { useCall } from '../../features/calls/CallContext';
import { useAuth } from '../../features/auth/AuthContext';
import { UNRESOLVED_PERSON_PLACEHOLDER } from '../../features/messaging/conversationId';
import { useTheme } from '../../features/theme/ThemeContext';
import { getUser } from '../../features/users/api';
import { fonts, TAB_BAR_CLEARANCE, type Palette } from '../../theme';

type CallRow = CallResult & { otherName: string; otherAvatarKey: string | null; isOutgoing: boolean };

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function statusLabel(row: CallRow, t: (key: string) => string): string {
  if (row.status === 'MISSED') return t('status.missed');
  if (row.status === 'DECLINED') return t('status.declined');
  return row.isOutgoing ? t('status.outgoing') : t('status.incoming');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export default function CallsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const { userId } = useAuth();
  const { startCall } = useCall();
  const { t } = useTranslation('calls');
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      let cancelled = false;
      listCallHistory()
        .then(async (results) => {
          const rows = await Promise.all(
            results.map(async (call) => {
              const isOutgoing = call.callerId === userId;
              const otherId = isOutgoing ? call.calleeId : call.callerId;
              const user = await getUser(otherId).catch(() => null);
              return {
                ...call,
                isOutgoing,
                otherName: user?.displayName || UNRESOLVED_PERSON_PLACEHOLDER,
                otherAvatarKey: user?.avatarObjectKey ?? null,
              };
            })
          );
          if (!cancelled) setCalls(rows);
        })
        .finally(() => !cancelled && setLoading(false));
      return () => {
        cancelled = true;
      };
    }, [userId])
  );

  function redial(row: CallRow, type: 'AUDIO' | 'VIDEO') {
    const otherId = row.isOutgoing ? row.calleeId : row.callerId;
    startCall(otherId, row.otherName, type);
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>{t('screen.title')}</Text>
      </View>
      {loading && (
        <View style={styles.empty}>
          <ActivityIndicator color={colors.brand500} />
        </View>
      )}
      {!loading && calls.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t('screen.empty')}</Text>
        </View>
      )}
      <FlatList
        data={calls}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE(insets.bottom) }}
        renderItem={({ item }) => {
          const myBytesSent = item.isOutgoing ? item.callerBytesSent : item.calleeBytesSent;
          const myBytesReceived = item.isOutgoing ? item.callerBytesReceived : item.calleeBytesReceived;
          // Only this device's own usage — the other party's is never shown
          // here (their own call log shows theirs), even though the server
          // does track both sides independently.
          const hasUsage = myBytesSent != null || myBytesReceived != null;
          return (
          <TouchableOpacity style={styles.row} onPress={() => redial(item, item.type)}>
            <Avatar objectKey={item.otherAvatarKey} label={item.otherName} size={48} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>{item.otherName}</Text>
              <View style={styles.subRow}>
                <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={item.status === 'MISSED' ? '#e53935' : colors.textMuted} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  {item.isOutgoing ? <Path d="M7 17L17 7M17 7H9M17 7v8" /> : <Path d="M17 7L7 17M7 17h8M7 17V9" />}
                </Svg>
                <Text style={[styles.sub, item.status === 'MISSED' && { color: '#e53935' }]}>
                  {statusLabel(item, t)} · {formatWhen(item.startedAt)}
                </Text>
              </View>
              {hasUsage && (
                <Text style={styles.usage} numberOfLines={1}>
                  {t('screen.dataUsageYou', { amount: formatBytes((myBytesSent ?? 0) + (myBytesReceived ?? 0)) })}
                </Text>
              )}
            </View>
            <TouchableOpacity style={styles.callButton} onPress={() => redial(item, item.type)}>
              {item.type === 'VIDEO' ? (
                <VideoIcon size={18} color={colors.brand600} />
              ) : (
                <PhoneIcon size={18} color={colors.brand600} />
              )}
            </TouchableOpacity>
          </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1 },
    header: { paddingHorizontal: 20, paddingBottom: 16 },
    title: { fontFamily: fonts.sansBold, fontSize: 26, color: colors.textPrimary },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: -80 },
    emptyText: { fontFamily: fonts.sans, fontSize: 14, color: colors.textMuted },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    name: { fontFamily: fonts.sansSemiBold, fontSize: 15.5, color: colors.textPrimary },
    subRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
    sub: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.textMuted },
    usage: { fontFamily: fonts.sans, fontSize: 11, color: colors.textMuted, marginTop: 2 },
    callButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tint1 },
  });
}
