import { useMemo } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MediaStream, RTCView } from 'react-native-webrtc';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { useGroupCall, type GroupCallParticipant } from '../features/calls/GroupCallContext';
import { useTheme } from '../features/theme/ThemeContext';
import { fonts } from '../theme';
import { Avatar } from './Avatar';
import { ChatWallpaper } from './ChatWallpaper';

function IconButton({ onPress, color, children }: { onPress: () => void; color: string; children: React.ReactNode }) {
  return (
    <TouchableOpacity style={[styles.controlButton, { backgroundColor: color }]} onPress={onPress}>
      {children}
    </TouchableOpacity>
  );
}

/** One participant's tile — video fills it when available, otherwise an avatar placeholder (audio-only calls, or camera off). */
function ParticipantTile({ participant, isVideo }: { participant: GroupCallParticipant; isVideo: boolean }) {
  // A fresh MediaStream per render would churn RTCView's underlying stream
  // URL constantly — memoized so it's only rebuilt when the actual track
  // reference changes (a new track means a genuinely new/replaced producer).
  const videoStream = useMemo(
    () => (participant.videoTrack ? new MediaStream([participant.videoTrack]) : null),
    [participant.videoTrack]
  );

  return (
    <View style={styles.tile}>
      {isVideo && videoStream ? (
        <RTCView streamURL={videoStream.toURL()} style={StyleSheet.absoluteFill} objectFit="cover" />
      ) : (
        <View style={styles.tilePlaceholder}>
          <Avatar label={participant.displayName || '?'} size={56} />
        </View>
      )}
      <Text style={styles.tileName} numberOfLines={1}>
        {participant.displayName}
      </Text>
    </View>
  );
}

export function GroupCallOverlay() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    groupCallState,
    groupName,
    callType,
    localStream,
    participants,
    isMuted,
    isCameraOff,
    leaveGroupCall,
    toggleMute,
    toggleCamera,
  } = useGroupCall();
  const { t } = useTranslation('calls');

  if (groupCallState === 'idle') return null;

  const isVideo = callType === 'VIDEO';
  const localVideoStream = isVideo && localStream ? localStream : null;

  return (
    <Modal visible transparent={false} animationType="slide">
      <ChatWallpaper dark>
        <View style={styles.container}>
          <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
            <Text style={styles.topBarTitle} numberOfLines={1}>
              {groupName ?? t('groupOverlay.fallbackTitle')}
            </Text>
            <Text style={styles.topBarSubtitle}>
              {groupCallState === 'connecting' ? t('groupOverlay.connecting') : t('groupOverlay.inCall', { count: participants.length + 1 })}
            </Text>
          </View>

          <View style={styles.grid}>
            {isVideo && localVideoStream && !isCameraOff && (
              <View style={styles.tile}>
                <RTCView streamURL={localVideoStream.toURL()} style={StyleSheet.absoluteFill} objectFit="cover" mirror />
                <Text style={styles.tileName}>{t('groupOverlay.you')}</Text>
              </View>
            )}
            {(!isVideo || !localVideoStream || isCameraOff) && (
              <View style={styles.tile}>
                <View style={styles.tilePlaceholder}>
                  <Avatar label={t('groupOverlay.you')} size={56} />
                </View>
                <Text style={styles.tileName}>{isMuted ? t('groupOverlay.youMuted') : t('groupOverlay.you')}</Text>
              </View>
            )}
            {participants.map((p) => (
              <ParticipantTile key={p.peerId} participant={p} isVideo={isVideo} />
            ))}
          </View>

          <View style={[styles.controls, { paddingBottom: insets.bottom + 24 }]}>
            <IconButton onPress={toggleMute} color={isMuted ? '#ffffff' : 'rgba(255,255,255,0.2)'}>
              <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={isMuted ? '#1a0d10' : '#fff'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <Path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                {isMuted && <Path d="M2 2l20 20" />}
              </Svg>
            </IconButton>
            {isVideo && (
              <IconButton onPress={toggleCamera} color={isCameraOff ? '#ffffff' : 'rgba(255,255,255,0.2)'}>
                <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={isCameraOff ? '#1a0d10' : '#fff'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M23 7l-7 5 7 5V7z" />
                  <Path d="M16 5H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" />
                  {isCameraOff && <Path d="M2 2l20 20" />}
                </Svg>
              </IconButton>
            )}
            <IconButton onPress={leaveGroupCall} color="#e53935">
              <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.902.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.908.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                <Path d="M2 2l20 20" />
              </Svg>
            </IconButton>
          </View>
        </View>
      </ChatWallpaper>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { paddingHorizontal: 20, paddingBottom: 12, alignItems: 'center' },
  topBarTitle: { fontFamily: fonts.sansSemiBold, fontSize: 17, color: '#ffffff' },
  topBarSubtitle: { fontFamily: fonts.sans, fontSize: 12.5, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  grid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignContent: 'flex-start',
    paddingHorizontal: 6,
  },
  tile: {
    width: '50%',
    aspectRatio: 3 / 4,
    padding: 6,
  },
  tilePlaceholder: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileName: {
    position: 'absolute',
    left: 14,
    bottom: 10,
    fontFamily: fonts.sansMedium,
    fontSize: 12.5,
    color: '#ffffff',
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  controls: {
    flexDirection: 'row',
    gap: 24,
    paddingTop: 16,
    justifyContent: 'center',
    width: '100%',
  },
  controlButton: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
});
