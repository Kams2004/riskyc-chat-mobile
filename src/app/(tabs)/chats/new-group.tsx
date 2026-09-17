import * as Contacts from 'expo-contacts';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { Avatar } from '../../../components/Avatar';
import { KeyboardScreen } from '../../../components/KeyboardScreen';
import { useAuth } from '../../../features/auth/AuthContext';
import { createGroup } from '../../../features/groups/api';
import { useTheme } from '../../../features/theme/ThemeContext';
import { matchContacts, type UserResult } from '../../../features/users/api';
import { getAllLocalContacts, upsertLocalContact, useSQLiteContext } from '../../../data/db';
import { fonts, gradients, type Palette } from '../../../theme';
import { LinearGradient } from 'expo-linear-gradient';

type EnrichedUser = UserResult & { localName?: string };

function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const plus = trimmed.startsWith('+') ? '+' : '';
  return plus + trimmed.replace(/[^\d]/g, '');
}

export default function NewGroupScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const { userId } = useAuth();
  const { t } = useTranslation('groups');
  const db = useSQLiteContext();

  const [query, setQuery] = useState('');
  const [allUsers, setAllUsers] = useState<EnrichedUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState<Map<string, EnrichedUser>>(new Map());
  const [groupName, setGroupName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Same contacts-only approach as new.tsx — only people in your device
  // contacts who have an account are shown, not every user in the system.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setIsLoading(true);

      (async () => {
        try {
          const permission = await Contacts.requestPermissionsAsync();
          if (!permission.granted) {
            if (!cancelled) setIsLoading(false);
            return;
          }

          const { data } = await Contacts.getContactsAsync({
            fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails, Contacts.Fields.Name],
          });

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

          const matched = await matchContacts([...phoneNumbers], [...emails]);

          for (const user of matched) {
            if (user.phoneNumber) {
              const norm = normalizePhone(user.phoneNumber);
              const deviceName = phoneToName.get(norm);
              if (deviceName) await upsertLocalContact(db, user.userId, deviceName);
            }
          }

          const localNames = await getAllLocalContacts(db);
          const enriched: EnrichedUser[] = matched.map((u) => ({
            ...u,
            localName: localNames.get(u.userId),
          }));

          if (!cancelled) {
            setAllUsers(enriched);
            setIsLoading(false);
          }
        } catch {
          if (!cancelled) setIsLoading(false);
        }
      })();

      return () => { cancelled = true; };
    }, [db])
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allUsers;
    return allUsers.filter(
      (u) =>
        (u.localName ?? u.displayName ?? '').toLowerCase().includes(q) ||
        (u.phoneNumber ?? '').toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q)
    );
  }, [allUsers, query]);

  function toggle(user: EnrichedUser) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(user.userId)) {
        next.delete(user.userId);
      } else {
        next.set(user.userId, user);
      }
      return next;
    });
  }

  async function handleCreate() {
    if (!userId || selected.size === 0 || !groupName.trim() || isCreating) return;
    setIsCreating(true);
    try {
      const group = await createGroup(groupName.trim(), Array.from(selected.keys()));
      router.replace({
        pathname: '/(tabs)/chats/[conversationId]',
        params: { conversationId: group.id, groupId: group.id, recipientName: group.name },
      });
    } catch (e) {
      console.warn('[NewGroup] create failed', e);
      Alert.alert(t('newGroup.createError.title'), t('newGroup.createError.body'));
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <KeyboardScreen style={[styles.container, { paddingTop: insets.top + 12, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconTouchable} onPress={() => router.back()}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M18 6L6 18M6 6l12 12" />
          </Svg>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('newGroup.headerTitle')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.nameBar}>
        <TextInput
          style={styles.nameInput}
          placeholder={t('newGroup.groupNamePlaceholder')}
          placeholderTextColor={colors.textMuted}
          value={groupName}
          onChangeText={setGroupName}
        />
      </View>

      {selected.size > 0 && (
        <Text style={styles.selectedCount}>{t('newGroup.selectedCount', { count: selected.size })}</Text>
      )}

      <View style={styles.searchBar}>
        <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={colors.brand300} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z" />
          <Path d="M21 21l-4.3-4.3" />
        </Svg>
        <TextInput
          style={styles.searchInput}
          placeholder={t('newGroup.searchPlaceholder')}
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
        />
      </View>

      {isLoading ? (
        <View style={styles.stateBox}>
          <ActivityIndicator color={colors.brand500} />
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.userId}
          renderItem={({ item }) => {
            const isSelected = selected.has(item.userId);
            const displayName = item.localName || item.displayName || '';
            return (
              <TouchableOpacity style={styles.row} onPress={() => toggle(item)}>
                <Avatar objectKey={item.avatarObjectKey} label={displayName || item.phoneNumber || ''} size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{displayName || t('newGroup.unnamedUser')}</Text>
                  <Text style={styles.rowSubtitle}>{item.email ?? item.phoneNumber}</Text>
                </View>
                <View style={[styles.checkbox, isSelected && { backgroundColor: colors.brand500, borderColor: colors.brand500 }]}>
                  {isSelected && (
                    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                      <Path d="M20 6L9 17l-5-5" />
                    </Svg>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {selected.size > 0 && groupName.trim() && (
        <LinearGradient colors={gradients.gold} style={[styles.createButton, { bottom: insets.bottom + 16 }]}>
          <TouchableOpacity style={styles.createTouchable} onPress={handleCreate} disabled={isCreating}>
            {isCreating ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M5 12h14M13 5l7 7-7 7" />
              </Svg>
            )}
          </TouchableOpacity>
        </LinearGradient>
      )}
    </KeyboardScreen>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 20 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    iconTouchable: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontFamily: fonts.sansSemiBold, fontSize: 16.5, color: colors.textPrimary },
    nameBar: { backgroundColor: colors.tint1, borderRadius: 14, paddingHorizontal: 16, marginBottom: 10 },
    nameInput: { fontFamily: fonts.sans, fontSize: 14.5, color: colors.textPrimary, paddingVertical: 12 },
    selectedCount: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: colors.brand700, marginBottom: 8 },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.tint1,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 4,
      marginBottom: 12,
    },
    searchInput: { flex: 1, fontFamily: fonts.sans, fontSize: 14.5, color: colors.textPrimary, paddingVertical: 10 },
    stateBox: { alignItems: 'center', marginTop: 48 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.hairline },
    rowName: { fontFamily: fonts.sansSemiBold, fontSize: 15.5, color: colors.textPrimary },
    rowSubtitle: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
    checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.inputBorder, alignItems: 'center', justifyContent: 'center' },
    createButton: { position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28 },
    createTouchable: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  });
}
