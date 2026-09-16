import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, DeviceEventEmitter, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { Avatar } from '../../../components/Avatar';
import { deleteConversation, listConversations, setFavorite, upsertConversation, useSQLiteContext, type LocalConversation } from '../../../data/db';
import { useAuth } from '../../../features/auth/AuthContext';
import { getGroup } from '../../../features/groups/api';
import { looksLikeUnresolvedName, otherPartyFrom } from '../../../features/messaging/conversationId';
import { CONVERSATIONS_CHANGED_EVENT } from '../../../features/messaging/inboxSocket';
import { useTheme } from '../../../features/theme/ThemeContext';
import { getUser } from '../../../features/users/api';
import { fabBottomOffset, fonts, gradients, TAB_BAR_CLEARANCE, type Palette } from '../../../theme';

type Filter = 'all' | 'unread' | 'favorites' | 'groups';

export default function ChatListScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);

  const db = useSQLiteContext();
  const { userId } = useAuth();
  const [conversations, setConversations] = useState<LocalConversation[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filter, setFilter] = useState<Filter>('all');

  const reloadConversations = useCallback(() => {
    if (userId) listConversations(db, userId).then(setConversations);
  }, [db, userId]);

  // The inbox socket (see inboxSocket.ts) writes new messages/conversations
  // to SQLite in the background, even for threads this screen never had
  // open — this is what makes that show up live instead of only on next
  // focus.
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(CONVERSATIONS_CHANGED_EVENT, reloadConversations);
    return () => sub.remove();
  }, [reloadConversations]);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      listConversations(db, userId).then(async (rows) => {
        setConversations(rows);
        // Self-heal rows whose title is still a raw id/placeholder (created
        // before name resolution ran — either the normal first-message case,
        // or a stub backfilled by inboxSocket's syncMissedConversations,
        // which deliberately skips resolution to keep that sync call cheap)
        // or whose avatar was never resolved (e.g. the other person added a
        // profile photo after this conversation started). row.id is the
        // CANONICAL conversation id ("a_b") for a 1:1 — otherPartyFrom
        // recovers the actual other-user id from it; for a group, row.id is
        // just the group id directly.
        const unresolved = rows.filter((r) => looksLikeUnresolvedName(r.title) || !r.avatar_object_key);
        if (unresolved.length === 0) return;
        await Promise.all(
          unresolved.map(async (row) => {
            if (row.is_group) {
              const group = await getGroup(row.id).catch(() => null);
              if (group?.name || group?.avatarObjectKey) {
                await upsertConversation(
                  db,
                  row.id,
                  group.name || row.title,
                  row.last_message_at ?? new Date().toISOString(),
                  group.avatarObjectKey,
                  true
                );
              }
              return;
            }
            const user = await getUser(otherPartyFrom(row.id, userId)).catch(() => null);
            if (user?.displayName || user?.phoneNumber || user?.avatarObjectKey) {
              await upsertConversation(
                db,
                row.id,
                user.displayName || user.phoneNumber || row.title,
                row.last_message_at ?? new Date().toISOString(),
                user.avatarObjectKey
              );
            }
          })
        );
        reloadConversations();
      });
    }, [db, userId, reloadConversations])
  );

  function openConversation(item: LocalConversation) {
    if (item.is_group) {
      router.push({
        pathname: '/(tabs)/chats/[conversationId]',
        params: { conversationId: item.id, groupId: item.id, recipientName: item.title, recipientAvatarObjectKey: item.avatar_object_key ?? '' },
      });
      return;
    }
    if (!userId) return;
    router.push({
      pathname: '/(tabs)/chats/[conversationId]',
      params: {
        conversationId: item.id,
        recipientId: otherPartyFrom(item.id, userId),
        recipientName: item.title,
        recipientAvatarObjectKey: item.avatar_object_key ?? '',
      },
    });
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function handleRowPress(item: LocalConversation) {
    if (selectedIds.length > 0) {
      toggleSelected(item.id);
    } else {
      openConversation(item);
    }
  }

  const selectedRows = conversations.filter((c) => selectedIds.includes(c.id));
  const allSelectedAreFavorite = selectedRows.length > 0 && selectedRows.every((c) => c.is_favorite);

  async function handleToggleFavorite() {
    await setFavorite(db, selectedIds, !allSelectedAreFavorite);
    setSelectedIds([]);
    reloadConversations();
  }

  const visibleConversations = conversations.filter((c) => {
    if (filter === 'unread') return c.unread_count > 0;
    if (filter === 'favorites') return !!c.is_favorite;
    if (filter === 'groups') return !!c.is_group;
    return true;
  });

  function confirmDelete() {
    const count = selectedIds.length;
    Alert.alert(
      count > 1 ? `Delete ${count} conversations?` : 'Delete conversation?',
      'This removes it from this device only. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            for (const id of selectedIds) {
              await deleteConversation(db, id);
            }
            setSelectedIds([]);
            reloadConversations();
          },
        },
      ]
    );
  }

  const inSelectionMode = selectedIds.length > 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      {inSelectionMode ? (
        <View style={styles.selectionHeader}>
          <TouchableOpacity style={styles.iconTouchable} onPress={() => setSelectedIds([])}>
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M18 6L6 18M6 6l12 12" />
            </Svg>
          </TouchableOpacity>
          <Text style={styles.selectionCount}>{selectedIds.length} selected</Text>
          <TouchableOpacity style={styles.iconTouchable} onPress={handleToggleFavorite} accessibilityLabel="Toggle favorite">
            <Svg
              width={21}
              height={21}
              viewBox="0 0 24 24"
              fill={allSelectedAreFavorite ? colors.gold500 : 'none'}
              stroke={colors.gold600}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01L12 2z" />
            </Svg>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconTouchable} onPress={confirmDelete} accessibilityLabel="Delete selected conversations">
            <Svg width={21} height={21} viewBox="0 0 24 24" fill="none" stroke={colors.brand700} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" />
              <Path d="M10 11v6M14 11v6" />
            </Svg>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <Text style={styles.header}>Chats</Text>
          <View style={styles.searchBar}>
            <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={colors.brand300} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z" />
              <Path d="M21 21l-4.3-4.3" />
            </Svg>
            <Text style={styles.searchPlaceholder}>Search chats</Text>
          </View>
          <View style={styles.filterRow}>
            {(['all', 'unread', 'favorites', 'groups'] as Filter[]).map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.filterChip, filter === f && { backgroundColor: colors.brand500 }]}
                onPress={() => setFilter(f)}
              >
                <Text style={[styles.filterChipLabel, filter === f && { color: '#ffffff' }]}>
                  {f === 'all' ? 'All' : f === 'unread' ? 'Unread' : f === 'favorites' ? 'Favorites' : 'Groups'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {visibleConversations.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>{filter === 'all' ? 'No conversations yet' : 'Nothing here'}</Text>
          <Text style={styles.emptyBody}>
            {filter === 'all' ? 'Tap + to search for someone or scan their QR code.' : 'Try a different filter.'}
          </Text>
        </View>
      )}

      <FlatList
        data={visibleConversations}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const selected = selectedIds.includes(item.id);
          return (
            <TouchableOpacity
              style={[styles.row, selected && styles.rowSelected]}
              onPress={() => handleRowPress(item)}
              onLongPress={() => toggleSelected(item.id)}
            >
              {selected ? (
                <View style={styles.checkBadge}>
                  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M20 6L9 17l-5-5" />
                  </Svg>
                </View>
              ) : (
                <Avatar objectKey={item.avatar_object_key} label={item.title} size={52} />
              )}
              <View style={{ flex: 1 }}>
                <View style={styles.rowTitleRow}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                  {!!item.is_favorite && (
                    <Svg width={13} height={13} viewBox="0 0 24 24" fill={colors.gold500} stroke={colors.gold600} strokeWidth={1.5}>
                      <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01L12 2z" />
                    </Svg>
                  )}
                </View>
              </View>
              {item.unread_count > 0 && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeLabel}>{item.unread_count > 99 ? '99+' : item.unread_count}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE(insets.bottom) }}
      />

      {!inSelectionMode && (
        <LinearGradient colors={gradients.gold} style={[styles.fab, { bottom: fabBottomOffset(insets.bottom) }]}>
          <TouchableOpacity
            style={styles.fabTouchable}
            onPress={() => router.push('/(tabs)/chats/new' as never)}
            accessibilityLabel="Start a new conversation"
          >
            <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M12 5v14M5 12h14" />
            </Svg>
          </TouchableOpacity>
        </LinearGradient>
      )}
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 20 },
    header: { fontFamily: fonts.display, fontSize: 29, color: colors.textPrimary, paddingBottom: 14 },
    selectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14 },
    iconTouchable: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    selectionCount: { fontFamily: fonts.sansSemiBold, fontSize: 15.5, color: colors.textPrimary },
    filterRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
    filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, backgroundColor: colors.tint1 },
    filterChipLabel: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: colors.textPrimary },
    rowTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.tint1,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 11,
      marginBottom: 8,
    },
    searchPlaceholder: { fontFamily: fonts.sans, fontSize: 14.5, color: colors.textMuted },
    emptyState: { alignItems: 'center', gap: 6, marginTop: 48, paddingHorizontal: 24 },
    emptyTitle: { fontFamily: fonts.sansSemiBold, fontSize: 15.5, color: colors.textPrimary },
    emptyBody: { fontFamily: fonts.sans, fontSize: 13, color: colors.textMuted, textAlign: 'center' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 14, borderBottomWidth: 1, borderBottomColor: colors.hairline },
    rowSelected: { backgroundColor: colors.tint1, borderBottomColor: 'transparent' },
    checkBadge: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.brand500, alignItems: 'center', justifyContent: 'center' },
    rowTitle: { fontFamily: fonts.sansSemiBold, fontSize: 15.5, color: colors.textPrimary },
    unreadBadge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.brand500, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
    unreadBadgeLabel: { fontFamily: fonts.sansBold, fontSize: 11, color: '#ffffff' },
    fab: {
      position: 'absolute',
      right: 20,
      width: 58,
      height: 58,
      borderRadius: 29,
      shadowColor: colors.gold600,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.4,
      shadowRadius: 16,
      elevation: 8,
    },
    fabTouchable: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  });
}
