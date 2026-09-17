import { useEffect, useState } from 'react';
import { Image, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { fetchLinkPreview, type LinkPreview } from '../features/messaging/api';
import { fonts } from '../theme';

const URL_PATTERN = /https?:\/\/[^\s]+/i;

/** First URL in a message's text, or null — used to decide whether to even attempt a preview fetch. */
export function firstUrlIn(text: string): string | null {
  const match = text.match(URL_PATTERN);
  return match ? match[0] : null;
}

// Module-level, not per-component-instance: the same link pasted into many
// messages (or the same message re-rendered as the list scrolls) should
// only ever be fetched once per app session.
const previewCache = new Map<string, LinkPreview | 'loading' | 'failed'>();

/** WhatsApp-style link preview card, rendered below a message's own text when it contains a URL. */
export function LinkPreviewCard({ url, tintColor, isMine }: { url: string; tintColor: string; isMine: boolean }) {
  const [preview, setPreview] = useState<LinkPreview | 'loading' | 'failed'>(previewCache.get(url) ?? 'loading');

  useEffect(() => {
    const cached = previewCache.get(url);
    if (cached) {
      setPreview(cached);
      return;
    }
    let cancelled = false;
    previewCache.set(url, 'loading');
    fetchLinkPreview(url)
      .then((result) => {
        // A page with none of title/description/image extracted isn't
        // worth a card at all — same "failed" bucket either way.
        const resolved = result.title || result.description || result.imageUrl ? result : 'failed';
        previewCache.set(url, resolved);
        if (!cancelled) setPreview(resolved);
      })
      .catch(() => {
        previewCache.set(url, 'failed');
        if (!cancelled) setPreview('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (preview === 'loading' || preview === 'failed') return null;

  return (
    <TouchableOpacity
      style={[styles.card, { borderColor: isMine ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.08)' }]}
      onPress={() => Linking.openURL(url)}
      activeOpacity={0.85}
    >
      {!!preview.imageUrl && <Image source={{ uri: preview.imageUrl }} style={styles.image} resizeMode="cover" />}
      <View style={styles.textWrap}>
        {!!preview.siteName && (
          <Text style={[styles.siteName, { color: tintColor }]} numberOfLines={1}>
            {preview.siteName.toUpperCase()}
          </Text>
        )}
        {!!preview.title && (
          <Text style={[styles.title, { color: isMine ? '#ffffff' : '#000000' }]} numberOfLines={2}>
            {preview.title}
          </Text>
        )}
        {!!preview.description && (
          <Text style={[styles.description, { color: isMine ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.6)' }]} numberOfLines={2}>
            {preview.description}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 10, borderWidth: 1, overflow: 'hidden', marginTop: 6, maxWidth: 240 },
  image: { width: '100%', height: 120 },
  textWrap: { padding: 8, gap: 2 },
  siteName: { fontFamily: fonts.sansSemiBold, fontSize: 10, letterSpacing: 0.5 },
  title: { fontFamily: fonts.sansSemiBold, fontSize: 13 },
  description: { fontFamily: fonts.sans, fontSize: 12 },
});
