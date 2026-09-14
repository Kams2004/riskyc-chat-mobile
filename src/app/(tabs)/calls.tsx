import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { Avatar } from '../../components/Avatar';
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

function statusLabel(row: CallRow): string {
  if (row.status === 'MISSED') return 'Missed';
  if (row.status === 'DECLINED') return row.isOutgoing ? 'Declined' : 'Declined';
  return row.isOutgoing ? 'Outgoing' : 'Incoming';
}

export default function CallsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const { userId } = useAuth();
  const { startCall } = useCall();
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
        <Text style={styles.title}>Calls</Text>
      </View>
      {loading && (
        <View style={styles.empty}>
          <ActivityIndicator color={colors.brand500} />
        </View>
      )}
      {!loading && calls.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No calls yet</Text>
        </View>
      )}
      <FlatList
        data={calls}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE(insets.bottom) }}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => redial(item, item.type)}>
            <Avatar objectKey={item.otherAvatarKey} label={item.otherName} size={48} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>{item.otherName}</Text>
              <View style={styles.subRow}>
                <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={item.status === 'MISSED' ? '#e53935' : colors.textMuted} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  {item.isOutgoing ? <Path d="M7 17L17 7M17 7H9M17 7v8" /> : <Path d="M17 7L7 17M7 17h8M7 17V9" />}
                </Svg>
                <Text style={[styles.sub, item.status === 'MISSED' && { color: '#e53935' }]}>
                  {statusLabel(item)} · {formatWhen(item.startedAt)}
                </Text>
              </View>
            </View>
            <TouchableOpacity style={styles.callButton} onPress={() => redial(item, item.type)}>
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.brand600} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                {item.type === 'VIDEO' ? (
                  <>
                    <Path d="M23 7l-7 5 7 5V7z" />
                    <Path d="M16 5H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" />
                  </>
                ) : (
                  <Path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.902.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.908.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                )}
              </Svg>
            </TouchableOpacity>
          </TouchableOpacity>
        )}
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
    callButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tint1 },
  });
}
