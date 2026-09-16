import * as Contacts from 'expo-contacts';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { Avatar } from '../../../components/Avatar';
import { KeyboardScreen } from '../../../components/KeyboardScreen';
import { useAuth } from '../../../features/auth/AuthContext';
import { conversationIdFor } from '../../../features/messaging/conversationId';
import { useTheme } from '../../../features/theme/ThemeContext';
import { config } from '../../../lib/config';
import { matchContacts, type UserResult } from '../../../features/users/api';
import { fonts, type Palette } from '../../../theme';

type LoadState = 'loading' | 'granted' | 'denied';

/** Loose normalization (strip everything but leading + and digits) — good enough to match the app's own simple "+237..." storage format without pulling in a full libphonenumber dependency. */
function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const plus = trimmed.startsWith('+') ? '+' : '';
  return plus + trimmed.replace(/[^\d]/g, '');
}

export default function NewConversationScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const { userId } = useAuth();

  const [query, setQuery] = useState('');
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [contactUsers, setContactUsers] = useState<UserResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Contacts-only discovery: reads the device's own contacts ONCE, matches
  // them against accounts server-side (see UserController#matchContacts),
  // and every search below filters that already-matched set locally rather
  // than ever hitting a free-text/global search — so a user can only find
  // and start a chat with people they've already got in their phone or SIM
  // contacts, not a stranger's account. Browsers have no contacts API, so
  // this is mobile-only; web's global search is a documented platform gap,
  // not something to fake here.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const permission = await Contacts.requestPermissionsAsync();
      if (!permission.granted) {
        if (!cancelled) setLoadState('denied');
        return;
      }
      try {
        const details = await Contacts.Contact.getAllDetails([Contacts.ContactField.PHONES, Contacts.ContactField.EMAILS]);
        const phoneNumbers = new Set<string>();
        const emails = new Set<string>();
        for (const contact of details) {
          for (const phone of contact.phones ?? []) {
            if (phone.number) phoneNumbers.add(normalizePhone(phone.number));
          }
          for (const email of contact.emails ?? []) {
            if (email.address) emails.add(email.address.trim().toLowerCase());
          }
        }
        const matched = await matchContacts([...phoneNumbers], [...emails]);
        if (!cancelled) {
          setContactUsers(matched);
          setLoadState('granted');
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not load your contacts');
          setLoadState('granted');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contactUsers;
    return contactUsers.filter(
      (u) =>
        (u.displayName ?? '').toLowerCase().includes(q) ||
        (u.phoneNumber ?? '').toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q)
    );
  }, [contactUsers, query]);

  function openConversationWith(user: UserResult) {
    if (!userId) return;
    router.replace({
      pathname: '/(tabs)/chats/[conversationId]',
      params: {
        conversationId: conversationIdFor(userId, user.userId),
        recipientId: user.userId,
        recipientName: user.displayName ?? '',
        recipientAvatarObjectKey: user.avatarObjectKey ?? '',
      },
    });
  }

  async function inviteFriend() {
    const url = `${config.webAppUrl}/invite`;
    try {
      await Share.share({ message: `Join me on RiskyC Chat: ${url}`, url });
    } catch {
      // User dismissed the share sheet — nothing to do.
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
        <Text style={styles.headerTitle}>New conversation</Text>
        <View style={{ width: 40 }} />
      </View>

      <TouchableOpacity style={styles.actionRow} onPress={() => router.push('/(tabs)/chats/new-group' as never)}>
        <View style={[styles.actionIconCircle, { backgroundColor: colors.brand500 }]}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <Path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
            <Path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
          </Svg>
        </View>
        <Text style={styles.actionLabel}>New group</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.actionRow} onPress={() => router.push('/(tabs)/chats/qr' as never)}>
        <View style={[styles.actionIconCircle, { backgroundColor: colors.gold500 }]}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <Path d="M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
            <Path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2" />
          </Svg>
        </View>
        <Text style={styles.actionLabel}>New contact</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.actionRow} onPress={inviteFriend}>
        <View style={[styles.actionIconCircle, { backgroundColor: colors.brand700 }]}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <Path d="M16 6l-4-4-4 4" />
            <Path d="M12 2v13" />
          </Svg>
        </View>
        <Text style={styles.actionLabel}>Invite a friend</Text>
      </TouchableOpacity>

      <View style={styles.searchBar}>
        <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={colors.brand300} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z" />
          <Path d="M21 21l-4.3-4.3" />
        </Svg>
        <TextInput
          style={styles.searchInput}
          placeholder="Search your contacts by name or number"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
        />
      </View>

      {loadState === 'loading' && (
        <View style={styles.stateBox}>
          <ActivityIndicator color={colors.brand500} />
        </View>
      )}

      {loadState === 'denied' && (
        <View style={styles.stateBox}>
          <Text style={styles.emptyText}>
            RiskyC Chat only shows people already in your contacts, to keep strangers from starting a chat with you.
            {'\n\n'}Allow contacts access in your device settings to see who's already on RiskyC Chat.
          </Text>
        </View>
      )}

      {loadState === 'granted' && error && (
        <View style={styles.stateBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {loadState === 'granted' && !error && results.length === 0 && (
        <View style={styles.stateBox}>
          <Text style={styles.emptyText}>
            {query ? 'No one in your contacts matches that search.' : "None of your contacts are on RiskyC Chat yet — try inviting one!"}
          </Text>
        </View>
      )}

      {loadState === 'granted' && !error && (
        <FlatList
          data={results}
          keyExtractor={(item) => item.userId}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => openConversationWith(item)}>
              <Avatar
                objectKey={item.avatarObjectKey}
                label={item.displayName || item.email || item.phoneNumber || '?'}
                size={48}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{item.displayName || 'Unnamed user'}</Text>
                <Text style={styles.rowSubtitle}>{item.email ?? item.phoneNumber}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </KeyboardScreen>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 20 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
    iconTouchable: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontFamily: fonts.sansSemiBold, fontSize: 16.5, color: colors.textPrimary },
    actionRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10 },
    actionIconCircle: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
    actionLabel: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.textPrimary },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.tint1,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 4,
      marginTop: 4,
      marginBottom: 12,
    },
    searchInput: { flex: 1, fontFamily: fonts.sans, fontSize: 14.5, color: colors.textPrimary, paddingVertical: 10 },
    stateBox: { alignItems: 'center', marginTop: 48, paddingHorizontal: 12 },
    errorText: { fontFamily: fonts.sans, color: colors.brand800, textAlign: 'center', paddingHorizontal: 24 },
    emptyText: { fontFamily: fonts.sans, color: colors.textMuted, textAlign: 'center', lineHeight: 19 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.hairline },
    rowName: { fontFamily: fonts.sansSemiBold, fontSize: 15.5, color: colors.textPrimary },
    rowSubtitle: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  });
}
