import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, DeviceEventEmitter, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { Avatar } from '../../../components/Avatar';
import { StatusPreviewThumb } from '../../../components/StatusPreviewThumb';
import { StatusRing } from '../../../components/StatusRing';
import { getAllLocalContacts, useSQLiteContext } from '../../../data/db';
import { useAuth } from '../../../features/auth/AuthContext';
import { STATUS_UPDATED_EVENT } from '../../../features/messaging/inboxSocket';
import { setComposerIntent } from '../../../features/status/composerIntent';
import { fetchStatusFeed, fetchStatusesFor, type StatusFeedEntry } from '../../../features/status/api';
import { useTheme } from '../../../features/theme/ThemeContext';
import { getUser } from '../../../features/users/api';
import { fonts, TAB_BAR_CLEARANCE, type Palette } from '../../../theme';

type FeedRow = StatusFeedEntry & { name: string; avatarObjectKey: string | null };

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return '';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

export default function StatusScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const db = useSQLiteContext();
  const { userId, displayName, avatarObjectKey } = useAuth();
  const { t } = useTranslation('status');

  const [myStatuses, setMyStatuses] = useState<FeedRow | null>(null);
  const [rows, setRows] = useState<FeedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    const [feed, mine, localNames] = await Promise.all([
      fetchStatusFeed(),
      fetchStatusesFor(userId).catch(() => []),
      getAllLocalContacts(db),
    ]);

    setMyStatuses(mine.length > 0 ? { userId, statuses: mine, hasUnviewed: false, name: displayName ?? '', avatarObjectKey: avatarObjectKey ?? null } : null);

    const enriched = await Promise.all(
      feed.map(async (entry) => {
        const localName = localNames.get(entry.userId);
        const user = localName ? null : await getUser(entry.userId).catch(() => null);
        return {
          ...entry,
          name: localName || user?.displayName || user?.phoneNumber || entry.userId,
          avatarObjectKey: user?.avatarObjectKey ?? null,
        };
      })
    );
    setRows(enriched);
  }, [userId, displayName, avatarObjectKey, db]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load])
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(STATUS_UPDATED_EVENT, () => {
      load();
    });
    return () => sub.remove();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function openViewer(targetUserId: string) {
    router.push({ pathname: '/(tabs)/status/viewer', params: { userId: targetUserId } } as never);
  }

  function openComposer(mode?: 'camera' | 'text') {
    if (mode) setComposerIntent(mode);
    router.push({ pathname: '/(tabs)/status/new' } as never);
  }

  const unviewed = rows.filter((r) => r.hasUnviewed);
  const viewed = rows.filter((r) => !r.hasUnviewed);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>{t('tab.title')}</Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.brand500} />
        </View>
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand500} />}
          contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE(insets.bottom) }}
        >
          <TouchableOpacity
            style={styles.row}
            onPress={() => (myStatuses ? openViewer(userId!) : openComposer())}
          >
            {myStatuses ? (
              <StatusRing size={58} count={myStatuses.statuses.length} unviewedColor={colors.tint2} viewedColor={colors.tint2}>
                <StatusPreviewThumb item={myStatuses.statuses[0]} size={52} />
              </StatusRing>
            ) : (
              <View style={styles.ringNoneWrap}>
                <Avatar localUri={null} objectKey={avatarObjectKey} label={displayName ?? '?'} size={52} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>{t('feed.myStatus')}</Text>
              <Text style={styles.sub} numberOfLines={1}>{t('feed.addStatus')}</Text>
            </View>
            <TouchableOpacity style={styles.addButton} onPress={() => openComposer('camera')}>
              <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={colors.brand600} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <Path d="M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
              </Svg>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addButton} onPress={() => openComposer('text')}>
              <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={colors.brand600} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
              </Svg>
            </TouchableOpacity>
          </TouchableOpacity>

          {rows.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>{t('feed.noUpdatesTitle')}</Text>
              <Text style={styles.emptyBody}>{t('feed.noUpdatesBody')}</Text>
            </View>
          ) : (
            <>
              {unviewed.length > 0 && <Text style={styles.sectionLabel}>{t('feed.recentUpdates')}</Text>}
              {unviewed.map((row) => (
                <StatusRow key={row.userId} row={row} styles={styles} colors={colors} onPress={() => openViewer(row.userId)} />
              ))}
              {viewed.length > 0 && <Text style={styles.sectionLabel}>{t('feed.viewedUpdates')}</Text>}
              {viewed.map((row) => (
                <StatusRow key={row.userId} row={row} styles={styles} colors={colors} onPress={() => openViewer(row.userId)} />
              ))}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function StatusRow({
  row,
  styles,
  colors,
  onPress,
}: {
  row: FeedRow;
  styles: ReturnType<typeof makeStyles>;
  colors: Palette;
  onPress: () => void;
}) {
  // Thumbnail shows the FIRST status (matches tapping the row, which opens
  // the viewer starting there too), but the timestamp below still reflects
  // the most recent post — that's what tells you there's fresh activity.
  const first = row.statuses[0];
  const latest = row.statuses[row.statuses.length - 1];
  return (
    <TouchableOpacity style={styles.row} onPress={onPress}>
      <StatusRing
        size={58}
        count={row.statuses.length}
        viewedFlags={row.statuses.map((s) => s.viewedByMe)}
        unviewedColor={colors.brand600}
        viewedColor={colors.tint2}
      >
        <StatusPreviewThumb item={first} size={52} />
      </StatusRing>
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>{row.name}</Text>
        <Text style={styles.sub} numberOfLines={1}>{timeAgo(latest.createdAt)}</Text>
      </View>
    </TouchableOpacity>
  );
}

function makeStyles(colors: Palette) {
  return {
    container: { flex: 1 } as const,
    header: { paddingHorizontal: 20, paddingBottom: 16 } as const,
    title: { fontFamily: fonts.sansBold, fontSize: 26, color: colors.textPrimary } as const,
    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' } as const,
    empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 32 } as const,
    emptyTitle: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.textPrimary, marginBottom: 4 } as const,
    emptyBody: { fontFamily: fonts.sans, fontSize: 13, color: colors.textMuted, textAlign: 'center' } as const,
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 10 } as const,
    ringNoneWrap: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' } as const,
    name: { fontFamily: fonts.sansSemiBold, fontSize: 15.5, color: colors.textPrimary } as const,
    sub: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.textMuted, marginTop: 2 } as const,
    addButton: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tint1 } as const,
    sectionLabel: { fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.textMuted, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 } as const,
  };
}
