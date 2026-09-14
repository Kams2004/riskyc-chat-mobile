import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { Avatar } from '../../../components/Avatar';
import { KeyboardScreen } from '../../../components/KeyboardScreen';
import { useAuth } from '../../../features/auth/AuthContext';
import { createGroup } from '../../../features/groups/api';
import { useTheme } from '../../../features/theme/ThemeContext';
import { searchUsers, type UserResult } from '../../../features/users/api';
import { fonts, gradients, type Palette } from '../../../theme';
import { LinearGradient } from 'expo-linear-gradient';

export default function NewGroupScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const { userId } = useAuth();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState<Map<string, UserResult>>(new Map());
  const [groupName, setGroupName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    const timer = setTimeout(() => {
      searchUsers(query)
        .then((users) => {
          if (!cancelled) setResults(users);
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

  function toggle(user: UserResult) {
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
      Alert.alert('Could not create group', 'Please try again.');
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
        <Text style={styles.headerTitle}>New group</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.nameBar}>
        <TextInput
          style={styles.nameInput}
          placeholder="Group name"
          placeholderTextColor={colors.textMuted}
          value={groupName}
          onChangeText={setGroupName}
        />
      </View>

      {selected.size > 0 && (
        <Text style={styles.selectedCount}>{selected.size} selected</Text>
      )}

      <View style={styles.searchBar}>
        <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={colors.brand300} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z" />
          <Path d="M21 21l-4.3-4.3" />
        </Svg>
        <TextInput
          style={styles.searchInput}
          placeholder="Search people to add"
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
            return (
              <TouchableOpacity style={styles.row} onPress={() => toggle(item)}>
                <Avatar objectKey={item.avatarObjectKey} label={item.displayName || item.email || '?'} size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{item.displayName || 'Unnamed user'}</Text>
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
