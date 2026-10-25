import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../../features/theme/ThemeContext';
import { cancelBroadcast, listRecentBroadcasts, type BroadcastSummary } from '../../../features/systemAccount/api';
import { fonts, type Palette } from '../../../theme';

function formatSentAt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * The official account's own "sent broadcasts" list — reachable from
 * broadcast.tsx's header history icon. Each row can be cancelled, which
 * deletes every one of that broadcast's N per-recipient copies for
 * everyone (see SystemAccountController#cancelBroadcast) — a cancelled
 * broadcast simply drops off this list since the server only returns
 * non-deleted copies.
 */
export default function BroadcastHistoryScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const { t } = useTranslation('chats');

  const [items, setItems] = useState<BroadcastSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setIsLoading(true);
    listRecentBroadcasts()
      .then(setItems)
      .catch((e) => console.warn('[BroadcastHistory] load failed', e))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function confirmCancel(item: BroadcastSummary) {
    Alert.alert(t('broadcast.cancelConfirmTitle'), t('broadcast.cancelConfirmBody'), [
      { text: t('common:cancel'), style: 'cancel' },
      {
        text: t('broadcast.cancelAction'),
        style: 'destructive',
        onPress: async () => {
          setCancellingId(item.broadcastId);
          try {
            await cancelBroadcast(item.broadcastId);
            setItems((prev) => prev.filter((b) => b.broadcastId !== item.broadcastId));
          } catch (e) {
            console.warn('[BroadcastHistory] cancel failed', e);
            Alert.alert(t('broadcast.cancelFailedTitle'), t('common:checkConnectionAndRetry'));
          } finally {
            setCancellingId(null);
          }
        },
      },
    ]);
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconTouchable} onPress={() => router.back()}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 18l-6-6 6-6" />
          </Svg>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('broadcast.historyTitle')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand500} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>{t('broadcast.historyEmpty')}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.broadcastId}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8 }}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.preview} numberOfLines={2}>
                  {item.preview && item.preview.trim().length > 0 ? item.preview : item.mediaType ? `📎 ${item.mediaType}` : ''}
                </Text>
                <Text style={styles.meta}>
                  {formatSentAt(item.sentAt)} · {t('broadcast.recipientCount', { count: item.recipientCount })}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => confirmCancel(item)}
                disabled={cancellingId === item.broadcastId}
              >
                {cancellingId === item.broadcastId ? (
                  <ActivityIndicator color={colors.brand700} size="small" />
                ) : (
                  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.brand700} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16z" />
                  </Svg>
                )}
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 8 },
    iconTouchable: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontFamily: fonts.sansSemiBold, fontSize: 16.5, color: colors.textPrimary },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyText: { fontFamily: fonts.sans, fontSize: 14, color: colors.textMuted },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.hairline,
      gap: 12,
    },
    preview: { fontFamily: fonts.sans, fontSize: 14.5, color: colors.textPrimary },
    meta: { fontFamily: fonts.sans, fontSize: 12, color: colors.textMuted, marginTop: 4 },
    deleteButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tint1 },
  });
}
