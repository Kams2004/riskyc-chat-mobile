import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { Avatar } from '../../../components/Avatar';
import { getMessageById, listConversations, useSQLiteContext, type LocalConversation, type LocalMessage } from '../../../data/db';
import { useAuth } from '../../../features/auth/AuthContext';
import { otherPartyFrom } from '../../../features/messaging/conversationId';
import { forwardMessage } from '../../../features/messaging/forward';
import { useTheme } from '../../../features/theme/ThemeContext';
import { fonts, type Palette } from '../../../theme';

/** Simple picker over existing conversations — reusing the chat list rather than a full "find a new person" flow, mirroring WhatsApp's own default forward target picker. */
export default function ForwardScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const db = useSQLiteContext();
  const { userId, accessToken } = useAuth();
  const { messageId } = useLocalSearchParams<{ messageId: string }>();
  const { t } = useTranslation('chats');

  const [conversations, setConversations] = useState<LocalConversation[]>([]);
  const [source, setSource] = useState<LocalMessage | null>(null);
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    listConversations(db, userId).then(setConversations);
  }, [db, userId]);

  useEffect(() => {
    if (!messageId) return;
    getMessageById(db, messageId).then(setSource);
  }, [db, messageId]);

  async function handleForwardTo(conversation: LocalConversation) {
    if (!source || !userId || sendingTo) return;
    setSendingTo(conversation.id);
    try {
      await forwardMessage(db, accessToken, userId, source, {
        conversationId: conversation.id,
        recipientId: conversation.is_group ? undefined : otherPartyFrom(conversation.id, userId),
        groupId: conversation.is_group ? conversation.id : undefined,
        title: conversation.title,
        avatarObjectKey: conversation.avatar_object_key,
      });
      router.back();
    } catch (e) {
      Alert.alert(t('forward.failedTitle'), e instanceof Error ? e.message : t('forward.failedBody'));
    } finally {
      setSendingTo(null);
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconTouchable} onPress={() => router.back()}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M18 6L6 18M6 6l12 12" />
          </Svg>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('forward.headerTitle')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => handleForwardTo(item)} disabled={!!sendingTo}>
            <Avatar label={item.title} objectKey={item.avatar_object_key} size={44} />
            <Text style={styles.rowTitle} numberOfLines={1}>
              {item.title}
            </Text>
            {sendingTo === item.id && <ActivityIndicator color={colors.brand500} />}
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>{t('forward.empty')}</Text>}
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
    row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 },
    rowTitle: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 15, color: colors.textPrimary },
    empty: { fontFamily: fonts.sans, fontSize: 13.5, color: colors.textMuted, textAlign: 'center', marginTop: 40 },
  });
}
