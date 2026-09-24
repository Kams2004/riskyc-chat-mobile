import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  DeviceEventEmitter,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { Avatar } from '../../../components/Avatar';
import { TypingDots } from '../../../components/TypingDots';
import {
  deleteConversation,
  getAllLocalContacts,
  listArchivedConversations,
  listConversations,
  setArchived,
  setFavorite,
  setMuted,
  upsertConversation,
  useSQLiteContext,
  type LocalConversation,
} from '../../../data/db';
import { useAuth } from '../../../features/auth/AuthContext';
import { fetchMyGroupInvitations, getGroup } from '../../../features/groups/api';
import { getSystemAccountInfo } from '../../../features/systemAccount/api';
import { setConversationMuted } from '../../../features/messaging/api';
import { looksLikeUnresolvedName, otherPartyFrom } from '../../../features/messaging/conversationId';
import {
  CONVERSATIONS_CHANGED_EVENT,
  TYPING_EVENT,
} from '../../../features/messaging/inboxSocket';
import { useTheme } from '../../../features/theme/ThemeContext';
import { getUser } from '../../../features/users/api';
import { fabBottomOffset, fonts, gradients, TAB_BAR_CLEARANCE, type Palette } from '../../../theme';

type Filter = 'all' | 'unread' | 'favorites' | 'groups';
type Tab = 'chats' | 'archived';

/** Map of conversationId → Set of typing userIds */
type TypingMap = Map<string, Set<string>>;

function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Returns the last-message preview string for a conversation row. */
function lastMessagePreview(
  item: LocalConversation,
  myUserId: string,
  t: (key: string, opts?: Record<string, unknown>) => string
): { text: string; isMedia: boolean } {
  const type = item.last_message_type;
  const isMine = item.last_message_sender_id === myUserId;
  const prefix = isMine ? `${t('list.you')}: ` : '';

  if (type === 'IMAGE') return { text: `${prefix}${t('list.photo')}`, isMedia: true };
  if (type === 'VIDEO') return { text: `${prefix}${t('list.video')}`, isMedia: true };
  if (type === 'AUDIO') return { text: `${prefix}${t('list.voiceMessage')}`, isMedia: true };
  if (type === 'FILE') return { text: `${prefix}${t('list.document')}`, isMedia: true };
  if (type === 'STICKER') return { text: `${prefix}${t('list.sticker')}`, isMedia: true };
  if (item.last_message_snippet) return { text: `${prefix}${item.last_message_snippet}`, isMedia: false };
  return { text: '', isMedia: false };
}

export default function ChatListScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const { t } = useTranslation('chats');

  const db = useSQLiteContext();
  const { userId } = useAuth();
  const [conversations, setConversations] = useState<LocalConversation[]>([]);
  const [archivedConversations, setArchivedConversations] = useState<LocalConversation[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [tab, setTab] = useState<Tab>('chats');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  // conversationId → Set<userId> of who is currently typing
  const [typingMap, setTypingMap] = useState<TypingMap>(new Map());
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [pendingInvitationCount, setPendingInvitationCount] = useState(0);
  const [isSystemAccount, setIsSystemAccount] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchMyGroupInvitations()
        .then((invitations) => setPendingInvitationCount(invitations.length))
        .catch(() => {});
    }, [])
  );

  useEffect(() => {
    if (!userId) return;
    getSystemAccountInfo()
      .then((info) => setIsSystemAccount(!!info && info.userId === userId))
      .catch(() => {});
  }, [userId]);

  const reloadConversations = useCallback(() => {
    if (userId) {
      listConversations(db, userId).then(setConversations);
      listArchivedConversations(db, userId).then(setArchivedConversations);
    }
  }, [db, userId]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(CONVERSATIONS_CHANGED_EVENT, reloadConversations);
    return () => sub.remove();
  }, [reloadConversations]);

  // Listen to global typing events from the inbox socket
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      TYPING_EVENT,
      (update: { conversationId: string; userId: string; isTyping: boolean }) => {
        if (update.userId === userId) return;
        const key = `${update.conversationId}:${update.userId}`;
        const existing = typingTimers.current.get(key);
        if (existing) clearTimeout(existing);

        setTypingMap((prev) => {
          const next = new Map(prev);
          const set = new Set(next.get(update.conversationId) ?? []);
          if (update.isTyping) {
            set.add(update.userId);
          } else {
            set.delete(update.userId);
          }
          if (set.size === 0) next.delete(update.conversationId);
          else next.set(update.conversationId, set);
          return next;
        });

        if (update.isTyping) {
          typingTimers.current.set(
            key,
            setTimeout(() => {
              typingTimers.current.delete(key);
              setTypingMap((prev) => {
                const next = new Map(prev);
                const set = new Set(next.get(update.conversationId) ?? []);
                set.delete(update.userId);
                if (set.size === 0) next.delete(update.conversationId);
                else next.set(update.conversationId, set);
                return next;
              });
            }, 6000)
          );
        }
      }
    );
    return () => {
      sub.remove();
      for (const t of typingTimers.current.values()) clearTimeout(t);
      typingTimers.current.clear();
    };
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      listConversations(db, userId).then(async (rows) => {
        setConversations(rows);
        const unresolved = rows.filter((r) => looksLikeUnresolvedName(r.title) || !r.avatar_object_key);
        if (unresolved.length === 0) {
          const localNames = await getAllLocalContacts(db);
          if (localNames.size > 0) {
            await Promise.all(
              rows
                .filter((r) => !r.is_group)
                .map(async (row) => {
                  const otherId = otherPartyFrom(row.id, userId);
                  const override = localNames.get(otherId);
                  if (override && override !== row.title) {
                    await upsertConversation(db, row.id, override, row.last_message_at ?? new Date().toISOString(), row.avatar_object_key);
                  }
                })
            );
            reloadConversations();
          }
          return;
        }
        await Promise.all(
          unresolved.map(async (row) => {
            if (row.is_group) {
              const group = await getGroup(row.id).catch(() => null);
              if (group?.name || group?.avatarObjectKey) {
                await upsertConversation(db, row.id, group.name || row.title, row.last_message_at ?? new Date().toISOString(), group.avatarObjectKey, true);
              }
              return;
            }
            const user = await getUser(otherPartyFrom(row.id, userId)).catch(() => null);
            if (user?.displayName || user?.phoneNumber || user?.avatarObjectKey) {
              const localNames = await getAllLocalContacts(db);
              const localName = localNames.get(otherPartyFrom(row.id, userId));
              await upsertConversation(db, row.id, localName || user.displayName || user.phoneNumber || row.title, row.last_message_at ?? new Date().toISOString(), user.avatarObjectKey);
            }
          })
        );
        reloadConversations();
      });
    }, [db, userId, reloadConversations])
  );

  function openConversation(item: LocalConversation) {
    if (item.is_group) {
      router.push({ pathname: '/(tabs)/chats/[conversationId]', params: { conversationId: item.id, groupId: item.id, recipientName: item.title, recipientAvatarObjectKey: item.avatar_object_key ?? '' } });
      return;
    }
    if (!userId) return;
    router.push({ pathname: '/(tabs)/chats/[conversationId]', params: { conversationId: item.id, recipientId: otherPartyFrom(item.id, userId), recipientName: item.title, recipientAvatarObjectKey: item.avatar_object_key ?? '' } });
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function handleRowPress(item: LocalConversation) {
    if (selectedIds.length > 0) toggleSelected(item.id);
    else openConversation(item);
  }

  const selectedRows = conversations.filter((c) => selectedIds.includes(c.id));
  const allSelectedAreFavorite = selectedRows.length > 0 && selectedRows.every((c) => c.is_favorite);
  const allSelectedAreMuted = selectedRows.length > 0 && selectedRows.every((c) => c.is_muted);

  async function handleToggleFavorite() {
    await setFavorite(db, selectedIds, !allSelectedAreFavorite);
    setSelectedIds([]);
    reloadConversations();
  }

  async function handleToggleMute() {
    const next = !allSelectedAreMuted;
    await setMuted(db, selectedIds, next);
    setSelectedIds([]);
    reloadConversations();
    // Server-side too — see MutedConversation's own doc comment on why a
    // local-only flag can't suppress a push notification the server
    // already decided to send.
    await Promise.all(selectedIds.map((id) => setConversationMuted(id, next).catch(() => {})));
  }

  async function handleArchiveSelected() {
    await setArchived(db, selectedIds, true);
    setSelectedIds([]);
    reloadConversations();
  }

  async function handleUnarchiveSelected() {
    await setArchived(db, selectedIds, false);
    setSelectedIds([]);
    reloadConversations();
  }

  const visibleConversations = (tab === 'archived' ? archivedConversations : conversations).filter((c) => {
    if (searchQuery.trim()) {
      return c.title.toLowerCase().includes(searchQuery.toLowerCase());
    }
    if (filter === 'unread') return c.unread_count > 0;
    if (filter === 'favorites') return !!c.is_favorite;
    if (filter === 'groups') return !!c.is_group;
    return true;
  });

  function confirmDelete() {
    const count = selectedIds.length;
    Alert.alert(
      count > 1 ? `Delete ${count} conversations?` : 'Delete conversation?',
      'This removes it from this device only.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            for (const id of selectedIds) await deleteConversation(db, id);
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
          <TouchableOpacity style={styles.iconTouchable} onPress={handleToggleFavorite}>
            <Svg width={21} height={21} viewBox="0 0 24 24" fill={allSelectedAreFavorite ? colors.gold500 : 'none'} stroke={colors.gold600} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01L12 2z" />
            </Svg>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconTouchable} onPress={handleToggleMute}>
            <Svg width={21} height={21} viewBox="0 0 24 24" fill="none" stroke={allSelectedAreMuted ? colors.brand500 : colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              {allSelectedAreMuted ? (
                <><Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><Path d="M13.73 21a2 2 0 0 1-3.46 0" /><Path d="M1 1l22 22" /></>
              ) : (
                <><Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><Path d="M13.73 21a2 2 0 0 1-3.46 0" /></>
              )}
            </Svg>
          </TouchableOpacity>
          {tab === 'archived' ? (
            <TouchableOpacity style={styles.iconTouchable} onPress={handleUnarchiveSelected}>
              <Svg width={21} height={21} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4" />
              </Svg>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.iconTouchable} onPress={handleArchiveSelected}>
              <Svg width={21} height={21} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4" />
              </Svg>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.iconTouchable} onPress={confirmDelete}>
            <Svg width={21} height={21} viewBox="0 0 24 24" fill="none" stroke={colors.brand700} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" />
              <Path d="M10 11v6M14 11v6" />
            </Svg>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <Text style={styles.header}>{t('list.title')}</Text>
          <View style={[styles.searchBar, searchFocused && { borderColor: colors.brand500, borderWidth: 1.5 }]}>
            <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={colors.brand300} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z" />
              <Path d="M21 21l-4.3-4.3" />
            </Svg>
            <TextInput
              style={styles.searchInput}
              placeholder={t('list.searchPlaceholder')}
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M18 6L6 18M6 6l12 12" />
                </Svg>
              </TouchableOpacity>
            )}
          </View>
          {pendingInvitationCount > 0 && (
            <TouchableOpacity style={styles.invitationBanner} onPress={() => router.push('/(tabs)/chats/group-invitations' as never)}>
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.brand600} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <Path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
                <Path d="M19 8v6M22 11h-6" />
              </Svg>
              <Text style={styles.invitationBannerText}>
                {t('list.pendingGroupInvitations', { count: pendingInvitationCount })}
              </Text>
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.brand600} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M9 18l6-6-6-6" />
              </Svg>
            </TouchableOpacity>
          )}
          <View style={styles.tabRow}>
            <TouchableOpacity style={[styles.tabChip, tab === 'chats' && { backgroundColor: colors.brand500 }]} onPress={() => setTab('chats')}>
              <Text style={[styles.tabChipLabel, tab === 'chats' && { color: '#ffffff' }]}>{t('list.tabChats')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tabChip, tab === 'archived' && { backgroundColor: colors.brand500 }]} onPress={() => setTab('archived')}>
              <Text style={[styles.tabChipLabel, tab === 'archived' && { color: '#ffffff' }]}>
                {t('list.tabArchived')}{archivedConversations.length > 0 ? ` (${archivedConversations.length})` : ''}
              </Text>
            </TouchableOpacity>
          </View>
          {tab === 'chats' && !searchQuery && (
            <View style={styles.filterRow}>
              {(['all', 'unread', 'favorites', 'groups'] as Filter[]).map((f) => (
                <TouchableOpacity key={f} style={[styles.filterChip, filter === f && { backgroundColor: colors.brand500 }]} onPress={() => setFilter(f)}>
                  <Text style={[styles.filterChipLabel, filter === f && { color: '#ffffff' }]}>
                    {f === 'all' ? t('list.filterAll') : f === 'unread' ? t('list.filterUnread') : f === 'favorites' ? t('list.filterFavorites') : t('list.filterGroups')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </>
      )}

      {visibleConversations.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>{filter === 'all' ? t('list.emptyTitle') : t('list.nothingHere')}</Text>
          <Text style={styles.emptyBody}>{filter === 'all' ? t('list.emptyBody') : t('list.tryDifferentFilter')}</Text>
        </View>
      )}

      <FlatList
        data={visibleConversations}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE(insets.bottom) }}
        renderItem={({ item }) => {
          const selected = selectedIds.includes(item.id);
          const isTyping = (typingMap.get(item.id)?.size ?? 0) > 0;
          const preview = lastMessagePreview(item, userId ?? '', t);

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

              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.rowTitleRow}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                  {!!item.is_favorite && (
                    <Svg width={13} height={13} viewBox="0 0 24 24" fill={colors.gold500} stroke={colors.gold600} strokeWidth={1.5}>
                      <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01L12 2z" />
                    </Svg>
                  )}
                  {!!item.is_muted && (
                    <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                      <Path d="M13.73 21a2 2 0 0 1-3.46 0" />
                      <Path d="M1 1l22 22" />
                    </Svg>
                  )}
                  <Text style={styles.rowTime}>{formatTime(item.last_message_at)}</Text>
                </View>

                {/* Typing indicator OR last message preview */}
                {isTyping ? (
                  <View style={styles.typingRow}>
                    <Text style={[styles.typingLabel, { color: colors.brand500 }]}>{t('list.typing')}</Text>
                    <TypingDots color={colors.brand500} />
                  </View>
                ) : preview.text ? (
                  <View style={styles.previewRow}>
                    {preview.isMedia && (
                      <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 3, flexShrink: 0 }}>
                        {item.last_message_type === 'IMAGE' ? (
                          <><Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><Path d="M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" /></>
                        ) : item.last_message_type === 'VIDEO' ? (
                          <><Path d="M23 7l-7 5 7 5V7z" /><Path d="M1 5h15v14H1z" /></>
                        ) : item.last_message_type === 'AUDIO' ? (
                          <><Path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><Path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" fill="none" /></>
                        ) : (
                          <><Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><Path d="M14 2v6h6" /></>
                        )}
                      </Svg>
                    )}
                    <Text style={styles.previewText} numberOfLines={1}>{preview.text}</Text>
                  </View>
                ) : null}
              </View>

              {item.unread_count > 0 && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeLabel}>{item.unread_count > 99 ? '99+' : item.unread_count}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        }}
      />

      {!inSelectionMode && (
        <LinearGradient
          colors={gradients.gold}
          style={[styles.fab, conversations.length === 0 ? styles.fabExpanded : styles.fabCollapsed, { bottom: fabBottomOffset(insets.bottom) }]}
        >
          <TouchableOpacity
            style={styles.fabTouchable}
            onPress={() => router.push((isSystemAccount ? '/(tabs)/chats/broadcast' : '/(tabs)/chats/new') as never)}
          >
            {isSystemAccount ? (
              <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M4 11a9 9 0 0 1 9 9" />
                <Path d="M4 4a16 16 0 0 1 16 16" />
                <Path d="M5 19a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" />
              </Svg>
            ) : (
              <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M12 5v14M5 12h14" />
              </Svg>
            )}
            {conversations.length === 0 && (
              <Text style={styles.fabLabel}>{isSystemAccount ? t('list.newBroadcast') : t('list.newConversation')}</Text>
            )}
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
    searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.tint1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 11, marginBottom: 8 },
    searchInput: { flex: 1, fontFamily: fonts.sans, fontSize: 14.5, color: colors.textPrimary },
    invitationBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.tint1,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 10,
    },
    invitationBannerText: { flex: 1, fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: colors.textPrimary },
    tabRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    tabChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, backgroundColor: colors.tint1 },
    tabChipLabel: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: colors.textPrimary },
    emptyState: { alignItems: 'center', gap: 6, marginTop: 48, paddingHorizontal: 24 },
    emptyTitle: { fontFamily: fonts.sansSemiBold, fontSize: 15.5, color: colors.textPrimary },
    emptyBody: { fontFamily: fonts.sans, fontSize: 13, color: colors.textMuted, textAlign: 'center' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 11, paddingHorizontal: 8, borderRadius: 14, borderBottomWidth: 1, borderBottomColor: colors.hairline },
    rowSelected: { backgroundColor: colors.tint1, borderBottomColor: 'transparent' },
    checkBadge: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.brand500, alignItems: 'center', justifyContent: 'center' },
    rowTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 },
    rowTitle: { fontFamily: fonts.sansSemiBold, fontSize: 15.5, color: colors.textPrimary, flex: 1 },
    rowTime: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.textMuted, flexShrink: 0 },
    previewRow: { flexDirection: 'row', alignItems: 'center' },
    previewText: { fontFamily: fonts.sans, fontSize: 13, color: colors.textMuted, flex: 1 },
    typingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    typingLabel: { fontFamily: fonts.sansMedium, fontSize: 13 },
    unreadBadge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.brand500, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, marginLeft: 6 },
    unreadBadgeLabel: { fontFamily: fonts.sansBold, fontSize: 11, color: '#ffffff' },
    fab: { position: 'absolute', right: 20, height: 58, shadowColor: colors.gold600, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 8 },
    fabCollapsed: { width: 58, borderRadius: 29 },
    fabExpanded: { paddingHorizontal: 22, borderRadius: 29 },
    fabTouchable: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
    fabLabel: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: '#ffffff' },
  });
}
