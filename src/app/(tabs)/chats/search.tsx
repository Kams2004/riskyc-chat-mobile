import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, DeviceEventEmitter, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { searchInConversation, type SearchResult } from '../../../features/messaging/api';
import { SCROLL_TO_MESSAGE_EVENT } from '../../../features/messaging/inboxSocket';
import { useTheme } from '../../../features/theme/ThemeContext';
import { fonts, type Palette } from '../../../theme';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Search-within-conversation — scoped to this one thread only, per the chat overflow menu's "Search" item. */
export default function SearchInConversationScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const { t } = useTranslation('chats');

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    const timer = setTimeout(() => {
      searchInConversation(conversationId, query.trim())
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setIsSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [conversationId, query]);

  /** Jumps back into the thread and asks it to scroll to/highlight this result, instead of showing matches on their own disconnected screen. */
  function openResult(messageId: string) {
    DeviceEventEmitter.emit(SCROLL_TO_MESSAGE_EVENT, { conversationId, messageId });
    router.back();
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconTouchable} onPress={() => router.back()}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 18l-6-6 6-6" />
          </Svg>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          placeholder={t('search.placeholder')}
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoFocus
        />
      </View>

      {isSearching && <ActivityIndicator color={colors.brand500} style={{ marginTop: 20 }} />}

      <FlatList
        data={results}
        keyExtractor={(item) => item.messageId}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => openResult(item.messageId)}>
            <Text style={styles.snippet} numberOfLines={2}>{item.ciphertext}</Text>
            <Text style={styles.time}>{formatTime(item.sentAt)}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          !isSearching && query.trim() ? <Text style={styles.empty}>{t('search.empty')}</Text> : null
        }
      />
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 20 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
    iconTouchable: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    input: {
      flex: 1,
      backgroundColor: colors.tint1,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontFamily: fonts.sans,
      fontSize: 14.5,
      color: colors.textPrimary,
    },
    row: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.hairline },
    snippet: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.textPrimary },
    time: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.textMuted, marginTop: 3 },
    empty: { fontFamily: fonts.sans, fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: 30 },
  });
}
