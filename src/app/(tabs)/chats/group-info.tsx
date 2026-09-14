import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { Avatar } from '../../../components/Avatar';
import { deleteConversation, useSQLiteContext } from '../../../data/db';
import { useAuth } from '../../../features/auth/AuthContext';
import { addMembers, getGroup, removeMember, renameGroup, type GroupResult } from '../../../features/groups/api';
import { useTheme } from '../../../features/theme/ThemeContext';
import { getUser, searchUsers, type UserResult } from '../../../features/users/api';
import { fonts, type Palette } from '../../../theme';

type MemberRow = { userId: string; role: 'ADMIN' | 'MEMBER'; user: UserResult | null };

export default function GroupInfoScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const db = useSQLiteContext();
  const { userId } = useAuth();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();

  const [group, setGroup] = useState<GroupResult | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingOpen, setIsAddingOpen] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  const [addResults, setAddResults] = useState<UserResult[]>([]);

  const isAdmin = members.find((m) => m.userId === userId)?.role === 'ADMIN';

  const load = useCallback(async () => {
    const result = await getGroup(groupId);
    setGroup(result);
    const withUsers = await Promise.all(
      result.members.map(async (m) => ({ userId: m.userId, role: m.role, user: await getUser(m.userId).catch(() => null) }))
    );
    setMembers(withUsers);
    setIsLoading(false);
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!isAddingOpen) return;
    const timer = setTimeout(() => {
      searchUsers(addQuery).then((users) => setAddResults(users.filter((u) => !members.some((m) => m.userId === u.userId))));
    }, 250);
    return () => clearTimeout(timer);
  }, [addQuery, isAddingOpen, members]);

  async function handleAddMember(user: UserResult) {
    await addMembers(groupId, [user.userId]);
    setIsAddingOpen(false);
    setAddQuery('');
    await load();
  }

  function confirmRemove(member: MemberRow) {
    Alert.alert('Remove member?', `${member.user?.displayName ?? 'This person'} will be removed from the group.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await removeMember(groupId, member.userId);
          await load();
        },
      },
    ]);
  }

  function confirmLeave() {
    Alert.alert('Leave group?', 'You will no longer receive messages from this group.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
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
        <Text style={styles.headerTitle}>Group info</Text>
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
        <Text style={styles.memberCount}>{members.length} members</Text>
      </View>

      {isAdmin && (
        <TouchableOpacity style={styles.addRow} onPress={() => setIsAddingOpen((v) => !v)}>
          <View style={styles.addIconCircle}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M12 5v14M5 12h14" />
            </Svg>
          </View>
          <Text style={styles.addLabel}>Add members</Text>
        </TouchableOpacity>
      )}

      {isAddingOpen && (
        <View style={styles.addSearch}>
          <TextInput
            style={styles.addSearchInput}
            placeholder="Search people to add"
            placeholderTextColor={colors.textMuted}
            value={addQuery}
            onChangeText={setAddQuery}
            autoFocus
          />
          {addResults.map((user) => (
            <TouchableOpacity key={user.userId} style={styles.memberRow} onPress={() => handleAddMember(user)}>
              <Avatar objectKey={user.avatarObjectKey} label={user.displayName || '?'} size={40} />
              <Text style={styles.memberName}>{user.displayName || 'Unnamed user'}</Text>
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
            onLongPress={() => isAdmin && item.userId !== userId && confirmRemove(item)}
          >
            <Avatar objectKey={item.user?.avatarObjectKey} label={item.user?.displayName || '?'} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={styles.memberName}>{item.user?.displayName || 'Unknown user'}{item.userId === userId ? ' (you)' : ''}</Text>
            </View>
            {item.role === 'ADMIN' && <Text style={styles.roleLabel}>Admin</Text>}
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity style={styles.leaveButton} onPress={confirmLeave}>
        <Text style={styles.leaveLabel}>Leave group</Text>
      </TouchableOpacity>
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
    leaveButton: { paddingVertical: 14, alignItems: 'center' },
    leaveLabel: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.brand700 },
  });
}
