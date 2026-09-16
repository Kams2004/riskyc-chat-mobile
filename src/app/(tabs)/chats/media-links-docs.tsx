import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { getMediaSummary, searchInConversation, type MediaSummaryItem, type SearchResult } from '../../../features/messaging/api';
import { useMediaUrl } from '../../../features/media/useMediaUrl';
import { useTheme } from '../../../features/theme/ThemeContext';
import { fonts, type Palette } from '../../../theme';

type Tab = 'media' | 'links' | 'docs';

// No dedicated "extract links from text" endpoint exists — a plain URL regex
// over each message's own ciphertext (still plaintext today, no E2E yet) is
// enough for this preview without new backend work.
const URL_PATTERN = /https?:\/\/[^\s]+/g;

function MediaTile({ objectKey }: { objectKey: string }) {
  const url = useMediaUrl(objectKey);
  return <View style={styles.tile}>{url && <Image source={{ uri: url }} style={styles.tile} />}</View>;
}

export default function MediaLinksDocsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const themedStyles = makeStyles(colors);
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();

  const [tab, setTab] = useState<Tab>('media');
  const [media, setMedia] = useState<MediaSummaryItem[]>([]);
  const [links, setLinks] = useState<{ messageId: string; url: string }[]>([]);
  const [docs, setDocs] = useState<MediaSummaryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getMediaSummary(conversationId, 'IMAGE,VIDEO', 100),
      getMediaSummary(conversationId, 'FILE', 100),
      searchInConversation(conversationId, 'http').catch(() => [] as SearchResult[]),
    ])
      .then(([mediaResult, docsResult, searchResult]) => {
        setMedia(mediaResult);
        setDocs(docsResult);
        const extracted: { messageId: string; url: string }[] = [];
        for (const m of searchResult) {
          const matches = m.ciphertext.match(URL_PATTERN);
          if (matches) for (const url of matches) extracted.push({ messageId: m.messageId, url });
        }
        setLinks(extracted);
      })
      .finally(() => setIsLoading(false));
  }, [conversationId]);

  return (
    <View style={[themedStyles.container, { paddingTop: insets.top + 12, paddingBottom: insets.bottom }]}>
      <View style={themedStyles.header}>
        <TouchableOpacity style={themedStyles.iconTouchable} onPress={() => router.back()}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 18l-6-6 6-6" />
          </Svg>
        </TouchableOpacity>
        <Text style={themedStyles.headerTitle}>Media, links, and docs</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={themedStyles.tabRow}>
        {(['media', 'links', 'docs'] as Tab[]).map((t) => (
          <TouchableOpacity key={t} style={[themedStyles.tab, tab === t && themedStyles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[themedStyles.tabLabel, tab === t && themedStyles.tabLabelActive]}>{t[0].toUpperCase() + t.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.brand500} style={{ marginTop: 24 }} />
      ) : tab === 'media' ? (
        <FlatList
          data={media}
          numColumns={3}
          keyExtractor={(item) => item.messageId}
          contentContainerStyle={{ padding: 2 }}
          renderItem={({ item }) => <MediaTile objectKey={item.mediaObjectKey} />}
          ListEmptyComponent={<Text style={themedStyles.empty}>No media shared yet.</Text>}
        />
      ) : tab === 'links' ? (
        <FlatList
          data={links}
          keyExtractor={(item, i) => item.messageId + i}
          renderItem={({ item }) => (
            <TouchableOpacity style={themedStyles.listRow} onPress={() => Linking.openURL(item.url)}>
              <Text style={themedStyles.linkText} numberOfLines={1}>{item.url}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={themedStyles.empty}>No links shared yet.</Text>}
        />
      ) : (
        <FlatList
          data={docs}
          keyExtractor={(item) => item.messageId}
          renderItem={({ item }) => (
            <View style={themedStyles.listRow}>
              <Text style={themedStyles.linkText} numberOfLines={1}>{item.mediaFileName || 'Document'}</Text>
            </View>
          )}
          ListEmptyComponent={<Text style={themedStyles.empty}>No documents shared yet.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { width: '33.33%', aspectRatio: 1, borderWidth: 1, borderColor: '#fff' },
});

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 20 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    iconTouchable: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontFamily: fonts.sansSemiBold, fontSize: 16.5, color: colors.textPrimary },
    tabRow: { flexDirection: 'row', backgroundColor: colors.tint1, borderRadius: 12, padding: 3, marginBottom: 10 },
    tab: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
    tabActive: { backgroundColor: colors.surface },
    tabLabel: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.textMuted },
    tabLabelActive: { color: colors.brand600 },
    empty: { fontFamily: fonts.sans, fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: 30 },
    listRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.hairline },
    linkText: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.brand600 },
  });
}
