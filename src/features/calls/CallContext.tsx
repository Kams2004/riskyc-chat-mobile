import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  mediaDevices,
  MediaStream,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
} from 'react-native-webrtc';

import { useAuth } from '../auth/AuthContext';
import { playRingtone, stopRingtone } from '../../lib/sounds';
import { CallSignalingSocket, type CallIceCandidate, type CallInvite, type CallType } from './signaling';

// Public STUN only (see plan) — no self-hosted TURN relay yet, so calls
// across genuinely different networks may not connect reliably. Purely
// additive infrastructure to fix later; no call-logic changes needed.
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

export type CallState = 'idle' | 'outgoing-ringing' | 'incoming-ringing' | 'connected';

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
  connectedAt: number | null;
  startCall: (recipientId: string, recipientName: string, type: CallType) => Promise<void>;
  acceptIncoming: () => Promise<void>;
  declineIncoming: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
};

const CallContext = createContext<CallContextValue | null>(null);

export function useCall(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used within CallProvider');
  return ctx;
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { userId, accessToken } = useAuth();
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
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);

  const resetCallState = useCallback(() => {
    stopRingtone();
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
        setCallState('connected');
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

      socketRef.current.sendInvite({ callId, toUserId: recipientId, type, sdpOffer: offer.sdp ?? '' });
    },
    [callState, createPeerConnection, userId]
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
  }, [createPeerConnection, flushPendingIce]);

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

  useEffect(() => {
    if (!userId || !accessToken) return;

    const socket = new CallSignalingSocket(accessToken);
    socketRef.current = socket;

    socket.connect({
      onInvite: (invite) => {
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
    connectedAt,
    startCall,
    acceptIncoming,
    declineIncoming,
    endCall,
    toggleMute,
    toggleCamera,
  };

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}
