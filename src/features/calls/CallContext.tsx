import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  mediaDevices,
  MediaStream,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
} from 'react-native-webrtc';

import { useAuth } from '../auth/AuthContext';
import { config } from '../../lib/config';
import { ApiError } from '../../lib/httpClient';
import { playRingtone, setSpeakerphoneEnabled, stopRingtone } from '../../lib/sounds';
import { getCallSnapshot } from './api';
import { CallSignalingSocket, type CallIceCandidate, type CallInvite, type CallType, type GroupCallInviteMessage } from './signaling';

// STUN first (free, no relay bandwidth) with the self-hosted TURN server as
// fallback for when caller/callee are on genuinely different networks and a
// direct P2P path can't be found — see config.ts's turnServerUrl comment.
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: config.turnServerUrl, username: config.turnUsername, credential: config.turnCredential },
];

// 'minimized' is a pure UI-presentation state layered on top of 'connected'
// — the peer connection, streams and timers are all untouched by it, only
// which component renders changes (CallOverlay's full Modal vs the small
// MinimizedCallBubble). Restoring just flips it back to 'connected'.
export type CallState = 'idle' | 'outgoing-ringing' | 'incoming-ringing' | 'connected' | 'minimized';

export type IncomingCallInfo = { callId: string; fromUserId: string; type: CallType };
export type OutgoingCallInfo = { callId: string; toUserId: string; toUserName: string; type: CallType };

type CallContextValue = {
  callState: CallState;
  incomingCall: IncomingCallInfo | null;
  outgoingCall: OutgoingCallInfo | null;
  callType: CallType | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isCameraOff: boolean;
  isSpeakerOn: boolean;
  connectedAt: number | null;
  startCall: (recipientId: string, recipientName: string, type: CallType) => Promise<void>;
  acceptIncoming: () => Promise<void>;
  declineIncoming: () => void;
  endCall: () => void;
  /** Called from a notification Answer/Decline action tap — fetches the call fresh via REST (see CallController#getCall) and seeds state as if the live invite had just arrived, since the socket may not have reconnected yet. Returns false if the call is no longer reachable (already ended/answered elsewhere). */
  seedIncomingCallFromNotification: (callId: string) => Promise<boolean>;
  toggleMute: () => void;
  toggleCamera: () => void;
  toggleSpeaker: () => void;
  minimizeCall: () => void;
  restoreCall: () => void;
  /** A group-call invite arrived on this same persistent /queue/calls channel — see GroupCallInviteMessage. Consumed by IncomingGroupCallBanner (app root), which is also the only place that knows about GroupCallContext. */
  pendingGroupInvite: GroupCallInviteMessage | null;
  dismissGroupInvite: () => void;
};

const CallContext = createContext<CallContextValue | null>(null);

export function useCall(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used within CallProvider');
  return ctx;
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { userId, accessToken, displayName } = useAuth();
  const socketRef = useRef<CallSignalingSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const activeCallIdRef = useRef<string | null>(null);
  const otherUserIdRef = useRef<string | null>(null);
  const pendingIceRef = useRef<CallIceCandidate[]>([]);
  const remoteDescriptionSetRef = useRef(false);
  const pendingInviteRef = useRef<CallInvite | null>(null);

  const [callState, setCallState] = useState<CallState>('idle');
  const callStateRef = useRef<CallState>('idle');
  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);
  const [incomingCall, setIncomingCall] = useState<IncomingCallInfo | null>(null);
  const [outgoingCall, setOutgoingCall] = useState<OutgoingCallInfo | null>(null);
  const [callType, setCallType] = useState<CallType | null>(null);
  const callTypeRef = useRef<CallType | null>(null);
  useEffect(() => {
    callTypeRef.current = callType;
  }, [callType]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [pendingGroupInvite, setPendingGroupInvite] = useState<GroupCallInviteMessage | null>(null);
  const dismissGroupInvite = useCallback(() => setPendingGroupInvite(null), []);

  const resetCallState = useCallback(() => {
    stopRingtone();
    setSpeakerphoneEnabled(false);
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    activeCallIdRef.current = null;
    otherUserIdRef.current = null;
    pendingIceRef.current = [];
    remoteDescriptionSetRef.current = false;
    pendingInviteRef.current = null;
    setCallState('idle');
    setIncomingCall(null);
    setOutgoingCall(null);
    setCallType(null);
    setLocalStream(null);
    setRemoteStream(null);
    setIsMuted(false);
    setIsCameraOff(false);
    setIsSpeakerOn(false);
    setConnectedAt(null);
  }, []);

  const createPeerConnection = useCallback((toUserId: string) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // react-native-webrtc@124's published lib/typescript is missing the
    // vendor/event-target-shim declaration file its own .d.ts imports from,
    // which breaks the typed addEventListener overloads (skipLibCheck lets
    // the package still build, but the inherited EventTarget members don't
    // resolve). The onXxx setters are declared directly on the class body
    // instead, unaffected by that missing import, so those are used here.
    pc.onicecandidate = (event: any) => {
      if (!event.candidate || !activeCallIdRef.current) return;
      socketRef.current?.sendIce({
        callId: activeCallIdRef.current,
        candidate: event.candidate.candidate,
        sdpMid: event.candidate.sdpMid,
        sdpMLineIndex: event.candidate.sdpMLineIndex,
      });
    };

    pc.ontrack = (event: any) => {
      const stream = event.streams?.[0];
      if (stream) setRemoteStream(stream);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        // Guard against clobbering 'minimized' back to 'connected' — this
        // can refire on ICE renegotiation well after the call was minimized,
        // and a minimized call reappearing full-screen on its own would be a
        // jarring surprise mid-conversation.
        if (callStateRef.current !== 'minimized') {
          setCallState('connected');
        }
        setConnectedAt((prev) => prev ?? Date.now());
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        // Remote side dropped without a clean call.end (network loss, app kill).
      }
    };

    pcRef.current = pc;
    otherUserIdRef.current = toUserId;
    return pc;
  }, []);

  const flushPendingIce = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    const queued = pendingIceRef.current;
    pendingIceRef.current = [];
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(
          new RTCIceCandidate({ candidate: candidate.candidate, sdpMid: candidate.sdpMid, sdpMLineIndex: candidate.sdpMLineIndex })
        );
      } catch (e) {
        console.warn('[CallContext] failed to add queued ICE candidate', e);
      }
    }
  }, []);

  const startCall = useCallback(
    async (recipientId: string, recipientName: string, type: CallType) => {
      if (!socketRef.current || callState !== 'idle') return;
      const callId = `${userId}-${Date.now()}`;
      const stream = await mediaDevices.getUserMedia({ audio: true, video: type === 'VIDEO' });
      localStreamRef.current = stream;
      setLocalStream(stream);

      const pc = createPeerConnection(recipientId);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      activeCallIdRef.current = callId;
      setCallType(type);
      setOutgoingCall({ callId, toUserId: recipientId, toUserName: recipientName, type });
      setCallState('outgoing-ringing');

      const offer = await pc.createOffer({});
      await pc.setLocalDescription(offer);

      socketRef.current.sendInvite({ callId, toUserId: recipientId, type, sdpOffer: offer.sdp ?? '', callerName: displayName });
    },
    [callState, createPeerConnection, displayName, userId]
  );

  const acceptIncoming = useCallback(async () => {
    const invite = pendingInviteRef.current;
    if (!invite || !socketRef.current) return;
    stopRingtone();

    const stream = await mediaDevices.getUserMedia({ audio: true, video: invite.type === 'VIDEO' });
    localStreamRef.current = stream;
    setLocalStream(stream);

    const pc = createPeerConnection(invite.fromUserId);
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: invite.sdpOffer }));
    remoteDescriptionSetRef.current = true;
    await flushPendingIce();

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socketRef.current.sendAnswer({ callId: invite.callId, sdpAnswer: answer.sdp ?? '' });
    setIncomingCall(null);
    setCallState('connected');
    setConnectedAt(Date.now());
    // Video defaults to speaker (you're looking at the screen, not holding
    // it to your ear); voice defaults to earpiece, same as a normal call.
    const speakerDefault = invite.type === 'VIDEO';
    setSpeakerphoneEnabled(speakerDefault);
    setIsSpeakerOn(speakerDefault);
  }, [createPeerConnection, flushPendingIce]);

  const seedIncomingCallFromNotification = useCallback(
    async (callId: string): Promise<boolean> => {
      // Already handling this exact call — the live invite beat the
      // notification-triggered fetch to it (a brief background, not a cold
      // start). Nothing more to seed; report success either way.
      if (activeCallIdRef.current === callId) {
        return true;
      }
      if (callStateRef.current !== 'idle') {
        return false;
      }
      try {
        const snapshot = await getCallSnapshot(callId);
        pendingInviteRef.current = {
          callId: snapshot.callId,
          fromUserId: snapshot.fromUserId,
          toUserId: userId ?? '',
          type: snapshot.type,
          sdpOffer: snapshot.sdpOffer,
          callerName: snapshot.callerName,
        };
        activeCallIdRef.current = snapshot.callId;
        otherUserIdRef.current = snapshot.fromUserId;
        setCallType(snapshot.type);
        setIncomingCall({ callId: snapshot.callId, fromUserId: snapshot.fromUserId, type: snapshot.type });
        setCallState('incoming-ringing');
        playRingtone();
        return true;
      } catch (e) {
        // 410 means the call already ended/was answered elsewhere before
        // this action got processed — a stale notification, not an error.
        if (e instanceof ApiError && e.status === 410) {
          console.log('[CallContext] notification call no longer ringing', callId);
        } else {
          console.warn('[CallContext] could not seed call from notification', e);
        }
        return false;
      }
    },
    [userId]
  );

  const declineIncoming = useCallback(() => {
    const invite = pendingInviteRef.current;
    if (invite) {
      socketRef.current?.sendEnd({ callId: invite.callId, reason: 'declined' });
    }
    resetCallState();
  }, [resetCallState]);

  const endCall = useCallback(() => {
    if (activeCallIdRef.current) {
      socketRef.current?.sendEnd({ callId: activeCallIdRef.current, reason: 'hangup' });
    }
    resetCallState();
  }, [resetCallState]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !isMuted;
    stream.getAudioTracks().forEach((track) => (track.enabled = !next));
    setIsMuted(next);
  }, [isMuted]);

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !isCameraOff;
    stream.getVideoTracks().forEach((track) => (track.enabled = !next));
    setIsCameraOff(next);
  }, [isCameraOff]);

  const toggleSpeaker = useCallback(() => {
    const next = !isSpeakerOn;
    setSpeakerphoneEnabled(next);
    setIsSpeakerOn(next);
  }, [isSpeakerOn]);

  /** Only meaningful mid-call — minimizing before connecting would just hide the ringing/incoming UI with no way back in. */
  const minimizeCall = useCallback(() => {
    if (callStateRef.current === 'connected') setCallState('minimized');
  }, []);

  const restoreCall = useCallback(() => {
    if (callStateRef.current === 'minimized') setCallState('connected');
  }, []);

  useEffect(() => {
    if (!userId || !accessToken) return;

    const socket = new CallSignalingSocket(accessToken);
    socketRef.current = socket;

    socket.connect({
      onInvite: (invite) => {
        // Already being handled — a notification Answer/Decline tap already
        // seeded this exact call (see seedIncomingCallFromNotification)
        // before this live invite caught up over the socket. Not "busy":
        // silently ignore rather than declining a call already in progress.
        if (invite.callId === activeCallIdRef.current) {
          return;
        }
        // Busy: already on a call — decline immediately, same as a phone.
        if (callStateRef.current !== 'idle') {
          socket.sendEnd({ callId: invite.callId, reason: 'declined' });
          return;
        }
        pendingInviteRef.current = invite;
        activeCallIdRef.current = invite.callId;
        otherUserIdRef.current = invite.fromUserId;
        setCallType(invite.type);
        setIncomingCall({ callId: invite.callId, fromUserId: invite.fromUserId, type: invite.type });
        setCallState('incoming-ringing');
        playRingtone();
      },
      onAnswer: async (answer) => {
        const pc = pcRef.current;
        if (!pc || answer.callId !== activeCallIdRef.current) return;
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: answer.sdpAnswer }));
        remoteDescriptionSetRef.current = true;
        await flushPendingIce();
        setOutgoingCall(null);
        setCallState('connected');
        setConnectedAt(Date.now());
        const speakerDefault = callTypeRef.current === 'VIDEO';
        setSpeakerphoneEnabled(speakerDefault);
        setIsSpeakerOn(speakerDefault);
      },
      onIce: async (ice) => {
        if (ice.callId !== activeCallIdRef.current) return;
        if (!remoteDescriptionSetRef.current || !pcRef.current) {
          pendingIceRef.current.push(ice);
          return;
        }
        try {
          await pcRef.current.addIceCandidate(
            new RTCIceCandidate({ candidate: ice.candidate, sdpMid: ice.sdpMid, sdpMLineIndex: ice.sdpMLineIndex })
          );
        } catch (e) {
          console.warn('[CallContext] failed to add ICE candidate', e);
        }
      },
      onEnd: (end) => {
        if (end.callId !== activeCallIdRef.current) return;
        resetCallState();
      },
      onGroupInvite: (invite) => {
        // Own invite echoing back (the starting client is also a group
        // member) — never show yourself your own "incoming call" prompt.
        if (invite.callerId === userId) return;
        setPendingGroupInvite(invite);
      },
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, userId]);

  const value: CallContextValue = {
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
    startCall,
    acceptIncoming,
    declineIncoming,
    endCall,
    toggleMute,
    toggleCamera,
    toggleSpeaker,
    minimizeCall,
    restoreCall,
    seedIncomingCallFromNotification,
    pendingGroupInvite,
    dismissGroupInvite,
  };

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}
