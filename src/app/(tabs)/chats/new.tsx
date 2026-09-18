import * as Contacts from 'expo-contacts';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Share,
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
import { KeyboardScreen } from '../../../components/KeyboardScreen';
import { useAuth } from '../../../features/auth/AuthContext';
import { conversationIdFor } from '../../../features/messaging/conversationId';
import { useTheme } from '../../../features/theme/ThemeContext';
import { config } from '../../../lib/config';
import { lookupByPhone, matchContacts, type UserResult } from '../../../features/users/api';
import { getAllLocalContacts, upsertLocalContact, useSQLiteContext } from '../../../data/db';
import { fonts, type Palette } from '../../../theme';

type LoadState = 'loading' | 'granted' | 'denied';

/** Strips everything but a leading + and digits. */
function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const plus = trimmed.startsWith('+') ? '+' : '';
  return plus + trimmed.replace(/[^\d]/g, '');
}

/** True when the string looks like a phone number the user typed (not a name). */
function looksLikePhoneQuery(q: string): boolean {
  return /^[+\d][\d\s\-().]{3,}$/.test(q.trim());
}

export type EnrichedUser = UserResult & { localName?: string };

/** A device contact that has no RiskyC account — shown with an Invite button. */
type UnregisteredContact = {
  name: string;
  phoneNumber: string;
};

type PhoneLookupState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'found'; user: EnrichedUser }
  | { kind: 'notFound'; deviceContact: UnregisteredContact | null };

export default function NewConversationScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const { userId } = useAuth();
  const { t } = useTranslation('chats');
  const db = useSQLiteContext();

  const [query, setQuery] = useState('');
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [contactUsers, setContactUsers] = useState<EnrichedUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [phoneLookup, setPhoneLookup] = useState<PhoneLookupState>({ kind: 'idle' });

  // phoneToName built from device contacts — used to show the saved name
  // when a typed number belongs to a device contact with no account.
  const phoneToNameRef = useRef<Map<string, string>>(new Map());

  // Re-runs every time this screen comes into focus so newly-added device
  // contacts (including SIM / other storage locations) are picked up.
  // Shared by both the focus effect below and the denied-state "Grant
  // access" retry button — a plain, standalone reload rather than something
  // that only ever runs once per screen focus, so re-requesting after a
  // denial doesn't require leaving and re-entering this screen. Always
  // calls requestPermissionsAsync (never getPermissionsAsync) so a
  // previous denial keeps being retried instead of the screen going quiet
  // — on iOS, past the first real denial the OS itself won't show the
  // dialog again, so the "Grant access" button also offers Settings.
  const loadContacts = useCallback(
    async (cancelled: { value: boolean }) => {
      const permission = await Contacts.requestPermissionsAsync();
      if (!permission.granted) {
        if (!cancelled.value) setLoadState('denied');
        return;
      }
      try {
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

        phoneToNameRef.current = phoneToName;

        const matched = await matchContacts([...phoneNumbers], [...emails]);

        for (const user of matched) {
          if (user.phoneNumber) {
            const deviceName = phoneToName.get(normalizePhone(user.phoneNumber));
            if (deviceName) await upsertLocalContact(db, user.userId, deviceName);
          }
        }

        const localNames = await getAllLocalContacts(db);
        const enriched: EnrichedUser[] = matched.map((u) => ({
          ...u,
          localName: localNames.get(u.userId),
        }));

        if (!cancelled.value) {
          setContactUsers(enriched);
          setLoadState('granted');
        }
      } catch {
        // Always the translated fallback, never the raw exception.
        if (!cancelled.value) {
          setError(t('newChat.loadErrorFallback'));
          setLoadState('granted');
        }
      }
    },
    [db, t]
  );

  useFocusEffect(
    useCallback(() => {
      const cancelled = { value: false };
      setLoadState('loading');
      setError(null);
      loadContacts(cancelled);
      return () => {
        cancelled.value = true;
      };
    }, [loadContacts])
  );

  async function retryContactsPermission() {
    const current = await Contacts.getPermissionsAsync();
    if (!current.canAskAgain && !current.granted) {
      await Linking.openSettings();
      return;
    }
    setLoadState('loading');
    loadContacts({ value: false });
  }

  // When the query looks like a phone number, debounce a server lookup.
  const lookupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const q = query.trim();
    if (!looksLikePhoneQuery(q)) {
      setPhoneLookup({ kind: 'idle' });
      return;
    }
    const norm = normalizePhone(q);
    setPhoneLookup({ kind: 'loading' });
    if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current);
    lookupTimerRef.current = setTimeout(async () => {
      try {
        const user = await lookupByPhone(norm);
        if (user) {
          const localNames = await getAllLocalContacts(db);
          setPhoneLookup({
            kind: 'found',
            user: { ...user, localName: localNames.get(user.userId) },
          });
        } else {
          const deviceName = phoneToNameRef.current.get(norm);
          setPhoneLookup({
            kind: 'notFound',
            deviceContact: deviceName ? { name: deviceName, phoneNumber: norm } : null,
          });
        }
      } catch {
        setPhoneLookup({ kind: 'idle' });
      }
    }, 400);
    return () => { if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current); };
  }, [query, db]);

  const isPhoneMode = looksLikePhoneQuery(query.trim());

  const filteredContacts = useMemo(() => {
    if (isPhoneMode) return [];
    const q = query.trim().toLowerCase();
    if (!q) return contactUsers;
    return contactUsers.filter(
      (u) =>
        (u.localName ?? u.displayName ?? '').toLowerCase().includes(q) ||
        (u.phoneNumber ?? '').toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q)
    );
  }, [contactUsers, query, isPhoneMode]);

  function openConversationWith(user: EnrichedUser) {
    if (!userId) return;
    const displayName = user.localName || user.displayName || '';
    router.replace({
      pathname: '/(tabs)/chats/[conversationId]',
      params: {
        conversationId: conversationIdFor(userId, user.userId),
        recipientId: user.userId,
        recipientName: displayName,
        recipientAvatarObjectKey: user.avatarObjectKey ?? '',
      },
    });
  }

  async function inviteNumber(phoneNumber: string, name?: string) {
    const url = `${config.webAppUrl}/invite`;
    const message = name
      ? t('newChat.inviteContactMessage', { name, url })
      : t('newChat.inviteMessage', { url });
    try {
      await Share.share({ message, url });
    } catch {
      // dismissed
    }
  }

  async function inviteFriend() {
    await inviteNumber('');
  }

  return (
    <KeyboardScreen style={[styles.container, { paddingTop: insets.top + 12, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconTouchable} onPress={() => router.back()}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M18 6L6 18M6 6l12 12" />
          </Svg>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('newChat.headerTitle')}</Text>
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
        <Text style={styles.actionLabel}>{t('newChat.newGroup')}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.actionRow} onPress={() => router.push('/(tabs)/chats/qr' as never)}>
        <View style={[styles.actionIconCircle, { backgroundColor: colors.gold500 }]}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <Path d="M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
            <Path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2" />
          </Svg>
        </View>
        <Text style={styles.actionLabel}>{t('newChat.newContact')}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.actionRow} onPress={inviteFriend}>
        <View style={[styles.actionIconCircle, { backgroundColor: colors.brand700 }]}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <Path d="M16 6l-4-4-4 4" />
            <Path d="M12 2v13" />
          </Svg>
        </View>
        <Text style={styles.actionLabel}>{t('newChat.inviteFriend')}</Text>
      </TouchableOpacity>

      <View style={styles.searchBar}>
        <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={colors.brand300} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z" />
          <Path d="M21 21l-4.3-4.3" />
        </Svg>
        <TextInput
          style={styles.searchInput}
          placeholder={t('newChat.searchPlaceholder')}
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          keyboardType="default"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M18 6L6 18M6 6l12 12" />
            </Svg>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Phone-number search results ── */}
      {isPhoneMode && (
        <View style={styles.phoneResultBox}>
          {phoneLookup.kind === 'loading' && (
            <View style={styles.phoneResultRow}>
              <ActivityIndicator color={colors.brand500} size="small" />
              <Text style={styles.phoneResultHint}>{t('newChat.lookingUp')}</Text>
            </View>
          )}

          {phoneLookup.kind === 'found' && (
            <TouchableOpacity style={styles.row} onPress={() => openConversationWith(phoneLookup.user)}>
              <Avatar
                objectKey={phoneLookup.user.avatarObjectKey}
                label={phoneLookup.user.localName || phoneLookup.user.displayName || ''}
                size={48}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>
                  {phoneLookup.user.localName || phoneLookup.user.displayName || t('newChat.unnamedUser')}
                </Text>
                <Text style={styles.rowSubtitle}>{phoneLookup.user.phoneNumber}</Text>
              </View>
              {/* "On RiskyC Chat" badge */}
              <View style={[styles.badge, { backgroundColor: colors.brand500 }]}>
                <Svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M20 6L9 17l-5-5" />
                </Svg>
                <Text style={styles.badgeLabel}>{t('newChat.onRiskyC')}</Text>
              </View>
            </TouchableOpacity>
          )}

          {phoneLookup.kind === 'notFound' && phoneLookup.deviceContact && (
            /* Number is in device contacts but has no account */
            <View style={styles.row}>
              <Avatar objectKey={null} label={phoneLookup.deviceContact.name} size={48} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{phoneLookup.deviceContact.name}</Text>
                <Text style={styles.rowSubtitle}>{phoneLookup.deviceContact.phoneNumber}</Text>
                <Text style={[styles.rowSubtitle, { color: colors.textMuted, marginTop: 1 }]}>
                  {t('newChat.notOnRiskyC')}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.inviteButton, { borderColor: colors.brand500 }]}
                onPress={() => inviteNumber(phoneLookup.deviceContact!.phoneNumber, phoneLookup.deviceContact!.name)}
              >
                <Text style={[styles.inviteButtonLabel, { color: colors.brand500 }]}>{t('newChat.invite')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {phoneLookup.kind === 'notFound' && !phoneLookup.deviceContact && (
            /* Unknown number, not in contacts, no account */
            <View style={styles.row}>
              <Avatar objectKey={null} label="" size={48} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{query.trim()}</Text>
                <Text style={[styles.rowSubtitle, { color: colors.textMuted }]}>
                  {t('newChat.notOnRiskyC')}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.inviteButton, { borderColor: colors.brand500 }]}
                onPress={() => inviteNumber(query.trim())}
              >
                <Text style={[styles.inviteButtonLabel, { color: colors.brand500 }]}>{t('newChat.invite')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* ── Contact list (name/email search mode) ── */}
      {!isPhoneMode && (
        <>
          {loadState === 'loading' && (
            <View style={styles.stateBox}>
              <ActivityIndicator color={colors.brand500} />
            </View>
          )}

          {loadState === 'denied' && (
            <View style={styles.stateBox}>
              <Text style={styles.emptyText}>{t('newChat.deniedBody')}</Text>
              <TouchableOpacity style={[styles.grantAccessButton, { borderColor: colors.brand500 }]} onPress={retryContactsPermission}>
                <Text style={[styles.grantAccessLabel, { color: colors.brand500 }]}>{t('newChat.grantAccess')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {loadState === 'granted' && error && (
            <View style={styles.stateBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {loadState === 'granted' && !error && filteredContacts.length === 0 && (
            <View style={styles.stateBox}>
              <Text style={styles.emptyText}>
                {query ? t('newChat.emptyNoMatch') : t('newChat.emptyNoContacts')}
              </Text>
            </View>
          )}

          {loadState === 'granted' && !error && (
            <FlatList
              data={filteredContacts}
              keyExtractor={(item) => item.userId}
              renderItem={({ item }) => {
                const displayName = item.localName || item.displayName || '';
                return (
                  <TouchableOpacity style={styles.row} onPress={() => openConversationWith(item)}>
                    <Avatar
                      objectKey={item.avatarObjectKey}
                      label={displayName || item.phoneNumber || ''}
                      size={48}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName}>{displayName || t('newChat.unnamedUser')}</Text>
                      <Text style={styles.rowSubtitle}>{item.email ?? item.phoneNumber}</Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </>
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
    phoneResultBox: { marginBottom: 8 },
    phoneResultRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
    phoneResultHint: { fontFamily: fonts.sans, fontSize: 13.5, color: colors.textMuted },
    stateBox: { alignItems: 'center', marginTop: 48, paddingHorizontal: 12 },
    errorText: { fontFamily: fonts.sans, color: colors.brand800, textAlign: 'center', paddingHorizontal: 24 },
    emptyText: { fontFamily: fonts.sans, color: colors.textMuted, textAlign: 'center', lineHeight: 19 },
    grantAccessButton: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, borderWidth: 1.5 },
    grantAccessLabel: { fontFamily: fonts.sansSemiBold, fontSize: 14 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.hairline },
    rowName: { fontFamily: fonts.sansSemiBold, fontSize: 15.5, color: colors.textPrimary },
    rowSubtitle: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 10,
    },
    badgeLabel: { fontFamily: fonts.sansSemiBold, fontSize: 11, color: '#ffffff' },
    inviteButton: {
      borderWidth: 1.5,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 6,
    },
    inviteButtonLabel: { fontFamily: fonts.sansSemiBold, fontSize: 13 },
  });
}
