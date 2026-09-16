import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCall } from '../features/calls/CallContext';
import { UNRESOLVED_PERSON_PLACEHOLDER } from '../features/messaging/conversationId';
import { getUser } from '../features/users/api';
import { fonts } from '../theme';
import { Avatar } from './Avatar';

/**
 * Small floating bubble shown instead of CallOverlay's full-screen Modal
 * while callState === 'minimized' — rendered once at the app root (like
 * CallOverlay itself), so it stays visible while navigating chats/settings
 * with the call still connected underneath. Tapping it restores the full
 * call screen; there's no drag-to-reposition here, just a fixed corner spot,
 * which is enough to satisfy "go and be chatting while having the call"
 * without the extra complexity of a fully draggable widget.
 */
export function MinimizedCallBubble() {
  const insets = useSafeAreaInsets();
  const { callState, incomingCall, outgoingCall, restoreCall } = useCall();
  const [name, setName] = useState<string | null>(null);

  const otherUserId = incomingCall?.fromUserId ?? outgoingCall?.toUserId ?? null;

  useEffect(() => {
    if (!otherUserId) {
      setName(null);
      return;
    }
    getUser(otherUserId)
      .then((user) => setName(user.displayName || UNRESOLVED_PERSON_PLACEHOLDER))
      .catch(() => setName(UNRESOLVED_PERSON_PLACEHOLDER));
  }, [otherUserId]);

  if (callState !== 'minimized') return null;

  return (
    <TouchableOpacity
      style={[styles.bubble, { top: insets.top + 12 }]}
      onPress={restoreCall}
      activeOpacity={0.85}
    >
      <Avatar label={name || outgoingCall?.toUserName || '?'} size={36} />
      <Text style={styles.label} numberOfLines={1}>
        {name || outgoingCall?.toUserName || 'Call'}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  bubble: {
    position: 'absolute',
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(20,12,14,0.92)',
    borderRadius: 999,
    paddingVertical: 6,
    paddingRight: 14,
    paddingLeft: 6,
    zIndex: 1000,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  label: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: '#ffffff', maxWidth: 120 },
});
