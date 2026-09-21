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
import { MicIcon, VideoIcon, PhoneIcon } from './icons';

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
      <ChatWallpaper dark variant="dots">
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
              <View>
                <MicIcon size={22} color={isMuted ? '#1a0d10' : '#fff'} />
                {isMuted && (
                  <Svg width={22} height={22} viewBox="0 0 24 24" style={StyleSheet.absoluteFill}>
                    <Path d="M2 2l20 20" stroke="#1a0d10" strokeWidth={2} strokeLinecap="round" />
                  </Svg>
                )}
              </View>
            </IconButton>
            {isVideo && (
              <IconButton onPress={toggleCamera} color={isCameraOff ? '#ffffff' : 'rgba(255,255,255,0.2)'}>
                <View>
                  <VideoIcon size={22} color={isCameraOff ? '#1a0d10' : '#fff'} />
                  {isCameraOff && (
                    <Svg width={22} height={22} viewBox="0 0 24 24" style={StyleSheet.absoluteFill}>
                      <Path d="M2 2l20 20" stroke="#1a0d10" strokeWidth={2} strokeLinecap="round" />
                    </Svg>
                  )}
                </View>
              </IconButton>
            )}
            <IconButton onPress={leaveGroupCall} color="#e53935">
              <View>
                <PhoneIcon size={26} color="#fff" />
                <Svg width={26} height={26} viewBox="0 0 24 24" style={StyleSheet.absoluteFill}>
                  <Path d="M2 2l20 20" stroke="#fff" strokeWidth={2} strokeLinecap="round" />
                </Svg>
              </View>
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
