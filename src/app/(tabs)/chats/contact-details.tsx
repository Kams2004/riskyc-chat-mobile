import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { ActionRow } from '../../../components/ActionRow';
import { Avatar } from '../../../components/Avatar';
import { clearConversationMessages, setFavorite, useSQLiteContext } from '../../../data/db';
import { useAuth } from '../../../features/auth/AuthContext';
import { useCall } from '../../../features/calls/CallContext';
import { getCommonGroups, type GroupResult } from '../../../features/groups/api';
import { getMediaSummary, type MediaSummaryItem } from '../../../features/messaging/api';
import { useMediaUrl } from '../../../features/media/useMediaUrl';
import { useTheme } from '../../../features/theme/ThemeContext';
import { blockUser, getUser, listBlockedUsers, reportUser, unblockUser, type UserResult } from '../../../features/users/api';
import { fonts, type Palette } from '../../../theme';

function MediaThumb({ objectKey }: { objectKey: string }) {
  const url = useMediaUrl(objectKey);
  return <View style={thumbStyles.thumb}>{url && <Image source={{ uri: url }} style={thumbStyles.thumb} />}</View>;
}

const thumbStyles = StyleSheet.create({
  thumb: { width: 72, height: 72, borderRadius: 8, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.06)' },
});

export default function ContactDetailsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const db = useSQLiteContext();
  const { userId: myUserId } = useAuth();
  const { startCall } = useCall();
  const { conversationId, userId } = useLocalSearchParams<{ conversationId: string; userId: string }>();

  const [user, setUser] = useState<UserResult | null>(null);
  const [media, setMedia] = useState<MediaSummaryItem[]>([]);
  const [groups, setGroups] = useState<GroupResult[]>([]);
  const [isBlocked, setIsBlocked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    const [userResult, mediaResult, groupsResult, blockedResult] = await Promise.all([
      getUser(userId),
      getMediaSummary(conversationId, 'IMAGE,VIDEO,FILE', 4).catch(() => []),
      getCommonGroups(userId).catch(() => []),
      listBlockedUsers().catch(() => []),
    ]);
    setUser(userResult);
    setMedia(mediaResult);
    setGroups(groupsResult);
    setIsBlocked(blockedResult.some((b) => b.userId === userId));
    setIsLoading(false);
  }, [conversationId, userId]);

  useEffect(() => {
    load();
  }, [load]);

  function confirmClearChat() {
    Alert.alert('Clear chat?', 'This removes the messages from this device only — the other person keeps theirs.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => clearConversationMessages(db, conversationId) },
    ]);
  }

  function confirmToggleBlock() {
    const name = user?.displayName || 'this person';
    Alert.alert(
      isBlocked ? `Unblock ${name}?` : `Block ${name}?`,
      isBlocked ? 'You will be able to call and message each other again.' : "You won't receive calls or messages from them anymore.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isBlocked ? 'Unblock' : 'Block',
          style: 'destructive',
          onPress: async () => {
            if (isBlocked) await unblockUser(userId);
            else await blockUser(userId);
            setIsBlocked((v) => !v);
          },
        },
      ]
    );
  }

  function confirmReport() {
    const name = user?.displayName || 'this person';
    Alert.alert(`Report ${name}?`, 'What best describes the issue?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Spam', onPress: () => reportUser(userId, 'Spam').then(() => Alert.alert('Reported', 'Thanks — we received your report.')) },
      {
        text: 'Inappropriate content',
        onPress: () => reportUser(userId, 'Inappropriate content').then(() => Alert.alert('Reported', 'Thanks — we received your report.')),
      },
      { text: 'Other', onPress: () => reportUser(userId, 'Other').then(() => Alert.alert('Reported', 'Thanks — we received your report.')) },
    ]);
  }

  if (isLoading || !user) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color={colors.brand500} />
      </View>
    );
  }

  const name = user.displayName || 'Unnamed user';

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 30 }}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconTouchable} onPress={() => router.back()}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 18l-6-6 6-6" />
          </Svg>
        </TouchableOpacity>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.profileHeader}>
        <Avatar objectKey={user.avatarObjectKey} label={name} size={92} />
        <Text style={styles.name}>{name}</Text>
        {!!user.phoneNumber && <Text style={styles.phone}>{user.phoneNumber}</Text>}
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.circleAction} onPress={() => startCall(userId, name, 'AUDIO')}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.brand600} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.902.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.908.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
          </Svg>
          <Text style={styles.circleActionLabel}>Voice</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.circleAction} onPress={() => startCall(userId, name, 'VIDEO')}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.brand600} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M23 7l-7 5 7 5V7z" />
            <Path d="M16 5H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" />
          </Svg>
          <Text style={styles.circleActionLabel}>Video</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.circleAction}
          onPress={() => router.push({ pathname: '/(tabs)/chats/search', params: { conversationId } })}
        >
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.brand600} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35" />
          </Svg>
          <Text style={styles.circleActionLabel}>Search</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.section}
        onPress={() => router.push({ pathname: '/(tabs)/chats/media-links-docs', params: { conversationId } })}
      >
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Media, links, and docs</Text>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M9 18l6-6-6-6" />
          </Svg>
        </View>
        {media.length === 0 ? (
          <Text style={styles.emptyText}>Nothing shared yet.</Text>
        ) : (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            {media.map((item) => (
              <MediaThumb key={item.messageId} objectKey={item.mediaObjectKey} />
            ))}
          </View>
        )}
      </TouchableOpacity>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Groups in common</Text>
        {groups.length === 0 ? (
          <Text style={styles.emptyText}>No groups in common</Text>
        ) : (
          groups.map((g) => (
            <View key={g.id} style={styles.groupRow}>
              <Avatar objectKey={g.avatarObjectKey} label={g.name} size={36} />
              <Text style={styles.groupName}>{g.name}</Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.section}>
        <ActionRow
          icon={
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.brand600} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <Path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
              <Path d="M19 8v6M22 11h-6" />
            </Svg>
          }
          label={`Create group with ${user.displayName || 'them'}`}
          onPress={() => router.push({ pathname: '/(tabs)/chats/new-group', params: { presetMemberId: userId } })}
        />
        <ActionRow
          icon={
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.brand600} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <Path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
              <Path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </Svg>
          }
          label="Add to group"
          onPress={() => Alert.alert('Coming soon', "Adding someone to an existing group from here isn't built yet — add them from the group's own info screen.")}
        />
        <ActionRow
          icon={
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.brand600} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M12 21C12 21 4 14.545 4 8.923 4 5.649 6.577 3 9.75 3c1.68 0 3.19.867 4.25 2.25C15.06 3.867 16.57 3 18.25 3 21.423 3 24 5.649 24 8.923c0 .259-.017.514-.049.764A9.98 9.98 0 0 0 18.25 8c-1.68 0-3.19.867-4.25 2.25" />
            </Svg>
          }
          label="Add to favourites"
          onPress={async () => {
            await setFavorite(db, [conversationId], true);
            Alert.alert('Added to favourites');
          }}
        />
        <ActionRow
          icon={
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.brand600} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
            </Svg>
          }
          label="Clear chat"
          onPress={confirmClearChat}
        />
        <ActionRow
          icon={
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.brand700} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <Path d="M4.9 4.9l14.2 14.2" />
            </Svg>
          }
          label={isBlocked ? `Unblock ${user.displayName || 'user'}` : `Block ${user.displayName || 'user'}`}
          danger
          onPress={confirmToggleBlock}
        />
        <ActionRow
          icon={
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.brand700} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
              <Path d="M4 22v-7" />
            </Svg>
          }
          label={`Report ${user.displayName || 'user'}`}
          danger
          onPress={confirmReport}
        />
      </View>
    </ScrollView>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 20 },
    centered: { alignItems: 'center', justifyContent: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
    iconTouchable: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    profileHeader: { alignItems: 'center', gap: 6, paddingVertical: 12 },
    name: { fontFamily: fonts.display, fontSize: 21, color: colors.textPrimary, marginTop: 8 },
    phone: { fontFamily: fonts.sans, fontSize: 13, color: colors.textMuted },
    actionsRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.hairline },
    circleAction: { alignItems: 'center', gap: 6 },
    circleActionLabel: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.brand600 },
    section: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.hairline },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sectionTitle: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.textPrimary },
    emptyText: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.textMuted, marginTop: 6 },
    groupRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
    groupName: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.textPrimary },
  });
}
