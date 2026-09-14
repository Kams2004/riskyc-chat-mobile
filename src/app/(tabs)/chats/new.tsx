import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { Avatar } from '../../../components/Avatar';
import { KeyboardScreen } from '../../../components/KeyboardScreen';
import { useAuth } from '../../../features/auth/AuthContext';
import { conversationIdFor } from '../../../features/messaging/conversationId';
import { useTheme } from '../../../features/theme/ThemeContext';
import { searchUsers, type UserResult } from '../../../features/users/api';
import { fonts, type Palette } from '../../../theme';

export default function NewConversationScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const { userId } = useAuth();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    const timer = setTimeout(() => {
      searchUsers(query)
        .then((users) => {
          if (!cancelled) setResults(users);
        })
        .catch((e) => {
          if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load users');
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

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

      <View style={styles.searchBar}>
        <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={colors.brand300} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z" />
          <Path d="M21 21l-4.3-4.3" />
        </Svg>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or email"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoFocus
        />
      </View>

      {isLoading && (
        <View style={styles.stateBox}>
          <ActivityIndicator color={colors.brand500} />
        </View>
      )}

      {!isLoading && error && (
        <View style={styles.stateBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {!isLoading && !error && results.length === 0 && (
        <View style={styles.stateBox}>
          <Text style={styles.emptyText}>{query ? 'No one matches that search.' : 'No other users yet.'}</Text>
        </View>
      )}

      {!isLoading && !error && (
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
      marginBottom: 12,
    },
    searchInput: { flex: 1, fontFamily: fonts.sans, fontSize: 14.5, color: colors.textPrimary, paddingVertical: 10 },
    stateBox: { alignItems: 'center', marginTop: 48 },
    errorText: { fontFamily: fonts.sans, color: colors.brand800, textAlign: 'center', paddingHorizontal: 24 },
    emptyText: { fontFamily: fonts.sans, color: colors.textMuted },
    row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.hairline },
    rowName: { fontFamily: fonts.sansSemiBold, fontSize: 15.5, color: colors.textPrimary },
    rowSubtitle: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  });
}
