import { requestPermissionsAsync as requestContactsPermissionsAsync } from 'expo-contacts';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { Avatar } from '../../../components/Avatar';
import { deleteConversation, getAllLocalContacts, upsertLocalContact, useSQLiteContext } from '../../../data/db';
import { useAuth } from '../../../features/auth/AuthContext';
import { readDeviceContacts } from '../../../features/contacts/sync';
import { addMembers, changeMemberRole, getGroup, removeMember, renameGroup, type GroupResult } from '../../../features/groups/api';
import { fetchConversationSettings, setAutoDownloadMedia as setAutoDownloadMediaApi } from '../../../features/messaging/api';
import { useTheme } from '../../../features/theme/ThemeContext';
import { getUser, matchContacts, type UserResult } from '../../../features/users/api';
import { fonts, type Palette } from '../../../theme';

type MemberRow = { userId: string; role: 'ADMIN' | 'MEMBER'; user: UserResult | null; localName?: string };
type AddCandidate = UserResult & { localName?: string };

function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const plus = trimmed.startsWith('+') ? '+' : '';
  return plus + trimmed.replace(/[^\d]/g, '');
}

export default function GroupInfoScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const db = useSQLiteContext();
  const { userId } = useAuth();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { t } = useTranslation('groups');

  const [group, setGroup] = useState<GroupResult | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [pendingInvitees, setPendingInvitees] = useState<{ userId: string; user: UserResult | null; localName?: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingOpen, setIsAddingOpen] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  // All of this device's contacts-with-an-account, loaded once when the add
  // panel opens — same contacts-only source as new-group.tsx, filtered
  // locally as the user types instead of hitting a system-wide search API.
  const [addCandidates, setAddCandidates] = useState<AddCandidate[]>([]);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const [autoDownloadMedia, setAutoDownloadMediaState] = useState(true);

  const isAdmin = members.find((m) => m.userId === userId)?.role === 'ADMIN';

  useEffect(() => {
    fetchConversationSettings(groupId)
      .then((settings) => setAutoDownloadMediaState(settings.autoDownloadMedia))
      .catch((e) => console.warn('[GroupInfo] fetchConversationSettings failed', e));
  }, [groupId]);

  function handleToggleAutoDownload(value: boolean) {
    setAutoDownloadMediaState(value);
    setAutoDownloadMediaApi(groupId, value).catch((e) => console.warn('[GroupInfo] setAutoDownloadMedia failed', e));
  }

  const load = useCallback(async () => {
    const result = await getGroup(groupId);
    setGroup(result);
    const localNames = await getAllLocalContacts(db);
    const withUsers = await Promise.all(
      result.members.map(async (m) => ({
        userId: m.userId,
        role: m.role,
        user: await getUser(m.userId).catch(() => null),
        localName: localNames.get(m.userId),
      }))
    );
    setMembers(withUsers);
    const withPendingUsers = await Promise.all(
      result.pendingInviteeIds.map(async (id) => ({
        userId: id,
        user: await getUser(id).catch(() => null),
        localName: localNames.get(id),
      }))
    );
    setPendingInvitees(withPendingUsers);
    setIsLoading(false);
  }, [groupId, db]);

  useEffect(() => {
    load();
  }, [load]);

  // Contacts-only, same rule as everywhere else in the app: only people
  // already in this device's contacts (and who have an account) can be
  // picked here — not every account in the system.
  useEffect(() => {
    if (!isAddingOpen || addCandidates.length > 0) return;
    let cancelled = false;
    setIsLoadingCandidates(true);
    (async () => {
      const permission = await requestContactsPermissionsAsync();
      if (!permission.granted) {
        if (!cancelled) setIsLoadingCandidates(false);
        return;
      }
      let data: Awaited<ReturnType<typeof readDeviceContacts>>;
      try {
        data = await readDeviceContacts();
      } catch (e) {
        console.warn('[GroupInfo] readDeviceContacts failed', e);
        if (!cancelled) setIsLoadingCandidates(false);
        return;
      }
      const phoneNumbers = new Set<string>();
      const emails = new Set<string>();
      const phoneToName = new Map<string, string>();
      for (const contact of data) {
        const name = contact.name?.trim() || '';
        for (const phone of contact.phoneNumbers ?? []) {
          if (phone.number) {
            const norm = normalizePhone(phone.number);
            phoneNumbers.add(norm);
            if (name) phoneToName.set(norm, name);
          }
        }
        for (const email of contact.emails ?? []) {
          if (email.email) emails.add(email.email.trim().toLowerCase());
        }
      }
      const matched = await matchContacts([...phoneNumbers], [...emails]).catch(() => []);
      for (const user of matched) {
        if (user.phoneNumber) {
          const deviceName = phoneToName.get(normalizePhone(user.phoneNumber));
          if (deviceName) await upsertLocalContact(db, user.userId, deviceName);
        }
      }
      const localNames = await getAllLocalContacts(db);
      if (!cancelled) {
        setAddCandidates(matched.map((u) => ({ ...u, localName: localNames.get(u.userId) })));
        setIsLoadingCandidates(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAddingOpen, addCandidates.length, db]);

  const addResults = addCandidates.filter((u) => {
    if (members.some((m) => m.userId === u.userId)) return false;
    if (pendingInvitees.some((p) => p.userId === u.userId)) return false;
    const q = addQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      (u.localName ?? u.displayName ?? '').toLowerCase().includes(q) ||
      (u.phoneNumber ?? '').toLowerCase().includes(q) ||
      (u.email ?? '').toLowerCase().includes(q)
    );
  });

  async function handleAddMember(user: AddCandidate) {
    await addMembers(groupId, [user.userId]);
    setIsAddingOpen(false);
    setAddQuery('');
    await load();
    Alert.alert(t('groupInfo.invitationSentTitle'), t('groupInfo.invitationSentBody', { name: user.localName || user.displayName || t('groupInfo.unnamedUser') }));
  }

  function confirmRemove(member: MemberRow) {
    Alert.alert(
      t('groupInfo.confirmRemove.title'),
      t('groupInfo.confirmRemove.body', { name: member.localName ?? member.user?.displayName ?? t('groupInfo.thisPerson') }),
      [
        { text: t('common:cancel'), style: 'cancel' },
        {
          text: t('groupInfo.confirmRemove.confirm'),
          style: 'destructive',
          onPress: async () => {
            await removeMember(groupId, member.userId);
            await load();
          },
        },
      ]
    );
  }

  async function handleToggleAdmin(member: MemberRow) {
    try {
      await changeMemberRole(groupId, member.userId, member.role === 'ADMIN' ? 'MEMBER' : 'ADMIN');
      await load();
    } catch {
      Alert.alert(t('groupInfo.roleUpdateError.title'), t('groupInfo.roleUpdateError.body'));
    }
  }

  function openMemberActions(member: MemberRow) {
    if (!isAdmin || member.userId === userId) return;
    const name = member.localName ?? member.user?.displayName ?? t('groupInfo.thisPerson');
    Alert.alert(name, undefined, [
      { text: t('common:cancel'), style: 'cancel' },
      { text: member.role === 'ADMIN' ? t('groupInfo.memberActions.dismissAsAdmin') : t('groupInfo.memberActions.makeGroupAdmin'), onPress: () => handleToggleAdmin(member) },
      { text: t('groupInfo.memberActions.removeFromGroup'), style: 'destructive', onPress: () => confirmRemove(member) },
    ]);
  }

  async function handleToggleOnlyAdmins(value: boolean) {
    if (!group) return;
    setGroup({ ...group, onlyAdminsCanMessage: value });
    await renameGroup(groupId, group.name, undefined, value);
  }

  function confirmLeave() {
    Alert.alert(t('groupInfo.confirmLeave.title'), t('groupInfo.confirmLeave.body'), [
      { text: t('common:cancel'), style: 'cancel' },
      {
        text: t('groupInfo.confirmLeave.confirm'),
        style: 'destructive',
        onPress: async () => {
          if (!userId) return;
          await removeMember(groupId, userId);
          await deleteConversation(db, groupId);
          router.replace('/(tabs)/chats');
        },
      },
    ]);
  }

  async function handleRename(name: string) {
    if (!name.trim() || name === group?.name) return;
    await renameGroup(groupId, name.trim());
    await load();
  }

  if (isLoading || !group) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color={colors.brand500} />
      </View>
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
        <Text style={styles.headerTitle}>{t('groupInfo.headerTitle')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.groupHeader}>
        <Avatar objectKey={group.avatarObjectKey} label={group.name} size={72} />
        {isAdmin ? (
          <TextInput
            style={styles.groupNameInput}
            defaultValue={group.name}
            onEndEditing={(e) => handleRename(e.nativeEvent.text)}
          />
        ) : (
          <Text style={styles.groupName}>{group.name}</Text>
        )}
        <Text style={styles.memberCount}>{t('groupInfo.memberCount', { count: members.length })}</Text>
      </View>

      {isAdmin && (
        <TouchableOpacity style={styles.addRow} onPress={() => setIsAddingOpen((v) => !v)}>
          <View style={styles.addIconCircle}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M12 5v14M5 12h14" />
            </Svg>
          </View>
          <Text style={styles.addLabel}>{t('groupInfo.addMembers')}</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={styles.mediaRow}
        onPress={() => router.push({ pathname: '/(tabs)/chats/media-links-docs', params: { conversationId: groupId } })}
      >
        <Text style={styles.mediaLabel}>{t('groupInfo.mediaLinksDocs')}</Text>
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M9 18l6-6-6-6" />
        </Svg>
      </TouchableOpacity>

      <View style={styles.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.mediaLabel}>{t('groupInfo.autoDownloadMedia')}</Text>
          <Text style={styles.toggleDescription}>{t('groupInfo.autoDownloadMediaDescription')}</Text>
        </View>
        <Switch
          value={autoDownloadMedia}
          onValueChange={handleToggleAutoDownload}
          trackColor={{ false: colors.hairline, true: colors.brand400 }}
          thumbColor="#ffffff"
        />
      </View>

      {isAdmin && (
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.mediaLabel}>{t('groupInfo.onlyAdminsCanMessage')}</Text>
            <Text style={styles.toggleDescription}>{t('groupInfo.onlyAdminsDescription')}</Text>
          </View>
          <Switch
            value={group.onlyAdminsCanMessage}
            onValueChange={handleToggleOnlyAdmins}
            trackColor={{ false: colors.hairline, true: colors.brand400 }}
            thumbColor="#ffffff"
          />
        </View>
      )}

      {isAddingOpen && (
        <View style={styles.addSearch}>
          <TextInput
            style={styles.addSearchInput}
            placeholder={t('groupInfo.addSearchPlaceholder')}
            placeholderTextColor={colors.textMuted}
            value={addQuery}
            onChangeText={setAddQuery}
            autoFocus
          />
          {isLoadingCandidates && <ActivityIndicator color={colors.brand500} style={{ marginVertical: 12 }} />}
          {addResults.map((user) => (
            <TouchableOpacity key={user.userId} style={styles.memberRow} onPress={() => handleAddMember(user)}>
              <Avatar objectKey={user.avatarObjectKey} label={user.localName || user.displayName || '?'} size={40} />
              <Text style={styles.memberName}>{user.localName || user.displayName || t('groupInfo.unnamedUser')}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <FlatList
        data={members}
        keyExtractor={(item) => item.userId}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.memberRow}
            onLongPress={() => openMemberActions(item)}
          >
            <Avatar objectKey={item.user?.avatarObjectKey} label={item.localName || item.user?.displayName || '?'} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={styles.memberName}>{item.localName || item.user?.displayName || t('groupInfo.unknownUser')}{item.userId === userId ? t('groupInfo.youSuffix') : ''}</Text>
            </View>
            {item.role === 'ADMIN' && <Text style={styles.roleLabel}>{t('groupInfo.roleAdmin')}</Text>}
          </TouchableOpacity>
        )}
        ListFooterComponent={
          pendingInvitees.length > 0 ? (
            <View>
              <Text style={styles.pendingSectionLabel}>{t('groupInfo.pendingInvitations')}</Text>
              {pendingInvitees.map((item) => (
                <View key={item.userId} style={styles.memberRow}>
                  <Avatar objectKey={item.user?.avatarObjectKey} label={item.localName || item.user?.displayName || '?'} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.memberName}>{item.localName || item.user?.displayName || t('groupInfo.unknownUser')}</Text>
                  </View>
                  <Text style={styles.pendingLabel}>{t('groupInfo.pendingBadge')}</Text>
                </View>
              ))}
            </View>
          ) : null
        }
      />

      <TouchableOpacity style={styles.leaveButton} onPress={confirmLeave}>
        <Text style={styles.leaveLabel}>{t('groupInfo.leaveGroup')}</Text>
      </TouchableOpacity>
      {isAdmin && (
        <Text style={styles.leaveHint}>
          {t('groupInfo.leaveHint')}
        </Text>
      )}
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 20 },
    centered: { alignItems: 'center', justifyContent: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    iconTouchable: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontFamily: fonts.sansSemiBold, fontSize: 16.5, color: colors.textPrimary },
    groupHeader: { alignItems: 'center', gap: 6, paddingVertical: 16 },
    groupName: { fontFamily: fonts.display, fontSize: 20, color: colors.textPrimary, marginTop: 8 },
    groupNameInput: {
      fontFamily: fonts.display,
      fontSize: 20,
      color: colors.textPrimary,
      marginTop: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.brand300,
      minWidth: 160,
      textAlign: 'center',
    },
    memberCount: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.textMuted },
    addRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10 },
    addIconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brand500, alignItems: 'center', justifyContent: 'center' },
    addLabel: { fontFamily: fonts.sansSemiBold, fontSize: 14.5, color: colors.brand700 },
    addSearch: { backgroundColor: colors.tint1, borderRadius: 14, padding: 10, marginBottom: 8 },
    addSearchInput: { fontFamily: fonts.sans, fontSize: 14, color: colors.textPrimary, paddingVertical: 8, paddingHorizontal: 6 },
    memberRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.hairline },
    memberName: { fontFamily: fonts.sansMedium, fontSize: 14.5, color: colors.textPrimary },
    roleLabel: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.textMuted },
    pendingSectionLabel: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 4 },
    pendingLabel: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.brand600 },
    leaveButton: { paddingVertical: 14, alignItems: 'center' },
    leaveLabel: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.brand700 },
    leaveHint: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.textMuted, textAlign: 'center', paddingBottom: 12 },
    mediaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      borderTopWidth: 1,
      borderTopColor: colors.hairline,
    },
    mediaLabel: { fontFamily: fonts.sansMedium, fontSize: 14.5, color: colors.textPrimary },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 14,
      borderTopWidth: 1,
      borderTopColor: colors.hairline,
      borderBottomWidth: 1,
      borderBottomColor: colors.hairline,
      marginBottom: 6,
    },
    toggleDescription: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.textMuted, marginTop: 2, lineHeight: 15 },
  });
}
