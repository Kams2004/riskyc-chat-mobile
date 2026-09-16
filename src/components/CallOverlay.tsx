import { useEffect, useState } from 'react';
import { Alert, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RTCView } from 'react-native-webrtc';
import Svg, { Path } from 'react-native-svg';

import { useCall } from '../features/calls/CallContext';
import { UNRESOLVED_PERSON_PLACEHOLDER } from '../features/messaging/conversationId';
import { getUser } from '../features/users/api';
import { useTheme } from '../features/theme/ThemeContext';
import { fonts } from '../theme';
import { Avatar } from './Avatar';
import { ChatWallpaper } from './ChatWallpaper';

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function IconButton({
  onPress,
  color,
  children,
}: {
  onPress: () => void;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <TouchableOpacity style={[styles.controlButton, { backgroundColor: color }]} onPress={onPress}>
      {children}
    </TouchableOpacity>
  );
}

export function CallOverlay() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    callState,
    incomingCall,
    outgoingCall,
    callType,
    localStream,
    remoteStream,
    isMuted,
    isCameraOff,
    isSpeakerOn,
    connectedAt,
    acceptIncoming,
    declineIncoming,
    endCall,
    toggleMute,
    toggleCamera,
    toggleSpeaker,
    minimizeCall,
  } = useCall();

  const [callerName, setCallerName] = useState<string | null>(null);
  const [callerAvatar, setCallerAvatar] = useState<string | null>(null);
  // Outgoing calls previously never fetched the other party's avatar at all
  // (only incoming calls did, via callerAvatar above) — always showing
  // initials until the call was answered. Fetched symmetrically here, same
  // shape as the incoming-call effect below, rather than threading avatar
  // data through startCall/CallContext (a UI-only concern).
  const [outgoingAvatar, setOutgoingAvatar] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!incomingCall) {
      setCallerName(null);
      setCallerAvatar(null);
      return;
    }
    getUser(incomingCall.fromUserId)
      .then((user) => {
        setCallerName(user.displayName || UNRESOLVED_PERSON_PLACEHOLDER);
        setCallerAvatar(user.avatarObjectKey);
      })
      .catch(() => setCallerName(UNRESOLVED_PERSON_PLACEHOLDER));
  }, [incomingCall]);

  useEffect(() => {
    if (!outgoingCall) {
      setOutgoingAvatar(null);
      return;
    }
    getUser(outgoingCall.toUserId)
      .then((user) => setOutgoingAvatar(user.avatarObjectKey))
      .catch(() => setOutgoingAvatar(null));
  }, [outgoingCall]);

  useEffect(() => {
    if (!connectedAt) {
      setElapsed(0);
      return;
    }
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - connectedAt) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [connectedAt]);

  // 'minimized' renders nothing here — MinimizedCallBubble (mounted
  // alongside this component at the app root) takes over instead.
  if (callState === 'idle' || callState === 'minimized') return null;

  const otherName = incomingCall ? callerName : outgoingCall?.toUserName ?? '';
  const otherAvatar = incomingCall ? callerAvatar : outgoingAvatar;
  const isVideo = callType === 'VIDEO';

  return (
    <Modal visible transparent={false} animationType="slide">
      <ChatWallpaper dark>
        <View style={styles.container}>
        {callState === 'connected' && (
          <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
            <TouchableOpacity style={styles.topBarButton} onPress={minimizeCall}>
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M6 9l6 6 6-6" />
              </Svg>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.topBarButton}
              onPress={() => Alert.alert('Group calls', 'Adding participants mid-call is coming soon.')}
            >
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <Path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
                <Path d="M19 8v6M22 11h-6" />
              </Svg>
            </TouchableOpacity>
          </View>
        )}
        {isVideo && callState === 'connected' && remoteStream ? (
          <RTCView streamURL={remoteStream.toURL()} style={StyleSheet.absoluteFill} objectFit="cover" />
        ) : null}

        {isVideo && callState === 'connected' && localStream && !isCameraOff ? (
          <View style={styles.pip}>
            <RTCView streamURL={localStream.toURL()} style={StyleSheet.absoluteFill} objectFit="cover" mirror />
          </View>
        ) : null}

        {(!isVideo || callState !== 'connected' || !remoteStream) && (
          <View style={styles.centerInfo}>
            <Avatar objectKey={otherAvatar} label={otherName || '?'} size={110} />
            <Text style={styles.name}>{otherName}</Text>
            <Text style={styles.status}>
              {callState === 'incoming-ringing' && `Incoming ${isVideo ? 'video' : 'voice'} call`}
              {callState === 'outgoing-ringing' && 'Ringing…'}
              {callState === 'connected' && formatDuration(elapsed)}
            </Text>
          </View>
        )}

        {callState === 'connected' && isVideo && remoteStream && (
          <Text style={styles.overlayTimer}>{formatDuration(elapsed)}</Text>
        )}

        <View style={[styles.controls, { paddingBottom: insets.bottom + 24 }]}>
          {callState === 'incoming-ringing' && (
            <>
              <IconButton onPress={declineIncoming} color="#e53935">
                <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.902.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.908.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                  <Path d="M2 2l20 20" />
                </Svg>
              </IconButton>
              <IconButton onPress={acceptIncoming} color="#43a047">
                <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.902.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.908.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                </Svg>
              </IconButton>
            </>
          )}

          {callState === 'outgoing-ringing' && (
            <IconButton onPress={endCall} color="#e53935">
              <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.902.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.908.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                <Path d="M2 2l20 20" />
              </Svg>
            </IconButton>
          )}

          {callState === 'connected' && (
            <>
              <IconButton onPress={toggleMute} color={isMuted ? '#ffffff' : 'rgba(255,255,255,0.2)'}>
                <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={isMuted ? '#1a0d10' : '#fff'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <Path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  {isMuted && <Path d="M2 2l20 20" />}
                </Svg>
              </IconButton>
              <IconButton onPress={toggleSpeaker} color={isSpeakerOn ? '#ffffff' : 'rgba(255,255,255,0.2)'}>
                <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={isSpeakerOn ? '#1a0d10' : '#fff'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M11 5L6 9H2v6h4l5 4V5z" />
                  <Path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
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
              <IconButton onPress={endCall} color="#e53935">
                <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.902.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.908.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                  <Path d="M2 2l20 20" />
                </Svg>
              </IconButton>
            </>
          )}
        </View>
        </View>
      </ChatWallpaper>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center' },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    zIndex: 10,
  },
  topBarButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  centerInfo: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  name: { fontFamily: fonts.sansSemiBold, fontSize: 22, color: '#ffffff', marginTop: 8 },
  status: { fontFamily: fonts.sans, fontSize: 15, color: 'rgba(255,255,255,0.7)' },
  overlayTimer: {
    position: 'absolute',
    top: 56,
    alignSelf: 'center',
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: '#ffffff',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pip: {
    position: 'absolute',
    top: 56,
    right: 20,
    width: 100,
    height: 150,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  // Anchored absolutely, not via flex flow — during an active video call
  // centerInfo isn't rendered at all (the video fills the screen instead),
  // which would otherwise leave this as the container's only flex child and
  // collapse it to the top instead of the bottom. Always-bottom regardless
  // of what else is on screen, and insets.bottom keeps it clear of the
  // system nav bar.
  controls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 24,
    paddingTop: 16,
    justifyContent: 'center',
    width: '100%',
  },
  controlButton: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
});
