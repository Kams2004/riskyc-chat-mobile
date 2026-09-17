import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { Avatar } from '../../../components/Avatar';
import { acceptGroupInvitation, declineGroupInvitation, fetchMyGroupInvitations, type GroupInvitationResult } from '../../../features/groups/api';
import { useTheme } from '../../../features/theme/ThemeContext';
import { fonts, type Palette } from '../../../theme';

export default function GroupInvitationsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const { t } = useTranslation('groups');

  const [invitations, setInvitations] = useState<GroupInvitationResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [respondingId, setRespondingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setInvitations(await fetchMyGroupInvitations());
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function respond(invitationId: number, accept: boolean) {
    setRespondingId(invitationId);
    try {
      if (accept) await acceptGroupInvitation(invitationId);
      else await declineGroupInvitation(invitationId);
      setInvitations((prev) => prev.filter((i) => i.invitationId !== invitationId));
    } finally {
      setRespondingId(null);
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconTouchable} onPress={() => router.back()}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 18l-6-6 6-6" />
          </Svg>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('invitations.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand500} />
        </View>
      ) : invitations.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>{t('invitations.empty')}</Text>
        </View>
      ) : (
        <FlatList
          data={invitations}
          keyExtractor={(item) => String(item.invitationId)}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Avatar objectKey={item.groupAvatarObjectKey} label={item.groupName || '?'} size={48} />
              <View style={{ flex: 1 }}>
                <Text style={styles.groupName} numberOfLines={1}>{item.groupName || t('invitations.unnamedGroup')}</Text>
                <Text style={styles.sub}>{t('invitations.invitedYou')}</Text>
              </View>
              {respondingId === item.invitationId ? (
                <ActivityIndicator color={colors.brand500} />
              ) : (
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.declineButton} onPress={() => respond(item.invitationId, false)}>
                    <Text style={styles.declineLabel}>{t('invitations.decline')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.acceptButton} onPress={() => respond(item.invitationId, true)}>
                    <Text style={styles.acceptLabel}>{t('invitations.accept')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 20 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
    iconTouchable: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontFamily: fonts.sansSemiBold, fontSize: 16.5, color: colors.textPrimary },
    emptyText: { fontFamily: fonts.sans, fontSize: 14, color: colors.textMuted },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
    groupName: { fontFamily: fonts.sansSemiBold, fontSize: 15.5, color: colors.textPrimary },
    sub: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
    actions: { flexDirection: 'row', gap: 8 },
    declineButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: colors.tint1 },
    declineLabel: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.textMuted },
    acceptButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: colors.brand600 },
    acceptLabel: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: '#ffffff' },
  });
}
