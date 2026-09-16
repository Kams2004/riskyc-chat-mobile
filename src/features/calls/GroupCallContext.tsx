import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { mediaDevices, MediaStream, MediaStreamTrack, registerGlobals } from 'react-native-webrtc';
import { Device } from 'mediasoup-client';
import type {
  Consumer,
  ConsumerOptions,
  Producer,
  Transport,
  TransportOptions,
} from 'mediasoup-client/types';

import { useAuth } from '../auth/AuthContext';
import { config } from '../../lib/config';
import { setSpeakerphoneEnabled } from '../../lib/sounds';
import { GroupCallSignalingSocket, type GroupCallType } from './groupCallSignaling';

// Required once, before any mediasoup-client Device is constructed — exposes
// RTCPeerConnection/MediaStream etc. in the global scope for mediasoup-client's
// ReactNative handler to find (see mediasoup.org/documentation/v3/mediasoup-client/react-native/).
registerGlobals();

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: config.turnServerUrl, username: config.turnUsername, credential: config.turnCredential },
];

export type GroupCallParticipant = {
  peerId: string;
  displayName: string;
  audioTrack: MediaStreamTrack | null;
  videoTrack: MediaStreamTrack | null;
};

export type GroupCallState = 'idle' | 'connecting' | 'in-call';

type GroupCallContextValue = {
  groupCallState: GroupCallState;
  groupId: string | null;
  groupName: string | null;
  callType: GroupCallType | null;
  localStream: MediaStream | null;
  participants: GroupCallParticipant[];
  isMuted: boolean;
  isCameraOff: boolean;
  /** Starting client's own action — joins (creating the room if needed) AND fans out invites to the rest of the group. */
  startGroupCall: (groupId: string, groupName: string, memberIds: string[], callType: GroupCallType) => Promise<void>;
  /** Responding to an invite or tapping into an already-ongoing call — joins without re-inviting anyone. */
  joinGroupCall: (groupId: string, groupName: string, callType: GroupCallType) => Promise<void>;
  leaveGroupCall: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
};

const GroupCallContext = createContext<GroupCallContextValue | null>(null);

export function useGroupCall(): GroupCallContextValue {
  const ctx = useContext(GroupCallContext);
  if (!ctx) throw new Error('useGroupCall must be used within GroupCallProvider');
  return ctx;
}

export function GroupCallProvider({ children }: { children: React.ReactNode }) {
  const { userId, accessToken, displayName } = useAuth();

  const socketRef = useRef<GroupCallSignalingSocket | null>(null);
  const deviceRef = useRef<Device | null>(null);
  const sendTransportRef = useRef<Transport | null>(null);
  const recvTransportRef = useRef<Transport | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const producersRef = useRef<Producer[]>([]);
  const consumersRef = useRef<Map<string, Consumer>>(new Map());
  // producerId -> peerId, so a producerClosed notification (which only carries producerId) can find which participant to update.
  const producerOwnerRef = useRef<Map<string, string>>(new Map());

  const [groupCallState, setGroupCallState] = useState<GroupCallState>('idle');
  const [groupId, setGroupId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState<string | null>(null);
  const [callType, setCallType] = useState<GroupCallType | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [participants, setParticipants] = useState<Map<string, GroupCallParticipant>>(new Map());
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);

  const upsertParticipant = useCallback((peerId: string, patch: Partial<GroupCallParticipant>) => {
    setParticipants((prev) => {
      const next = new Map(prev);
      const existing = next.get(peerId) ?? { peerId, displayName: peerId, audioTrack: null, videoTrack: null };
      next.set(peerId, { ...existing, ...patch });
      return next;
    });
  }, []);

  const resetState = useCallback(() => {
    setSpeakerphoneEnabled(false);
    for (const consumer of consumersRef.current.values()) consumer.close();
    consumersRef.current.clear();
    producerOwnerRef.current.clear();
    for (const producer of producersRef.current) producer.close();
    producersRef.current = [];
    sendTransportRef.current?.close();
    sendTransportRef.current = null;
    recvTransportRef.current?.close();
    recvTransportRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    deviceRef.current = null;
    socketRef.current?.disconnect();
    socketRef.current = null;
    setGroupCallState('idle');
    setGroupId(null);
    setGroupName(null);
    setCallType(null);
    setLocalStream(null);
    setParticipants(new Map());
    setIsMuted(false);
    setIsCameraOff(false);
  }, []);

  const consumeProducer = useCallback(
    async (peerId: string, displayNameForPeer: string, producerId: string, kind: 'audio' | 'video') => {
      const socket = socketRef.current;
      const device = deviceRef.current;
      const recvTransport = recvTransportRef.current;
      if (!socket || !device || !recvTransport) return;

      producerOwnerRef.current.set(producerId, peerId);
      const response = await socket.request('consume', { producerId, rtpCapabilities: device.recvRtpCapabilities });
      const consumer = await recvTransport.consume(response as unknown as ConsumerOptions);
      const track = consumer.track as unknown as MediaStreamTrack;
      consumersRef.current.set(consumer.id, consumer);
      await socket.request('resumeConsumer', { consumerId: consumer.id });

      upsertParticipant(peerId, {
        displayName: displayNameForPeer,
        ...(kind === 'audio' ? { audioTrack: track } : { videoTrack: track }),
      });
    },
    [upsertParticipant]
  );

  const doJoin = useCallback(
    async (targetGroupId: string, targetGroupName: string, targetCallType: GroupCallType, memberIdsToInvite: string[] | null) => {
      if (!userId || groupCallState !== 'idle') return;
      setGroupCallState('connecting');
      setGroupId(targetGroupId);
      setGroupName(targetGroupName);
      setCallType(targetCallType);

      const socket = new GroupCallSignalingSocket();
      socketRef.current = socket;

      await new Promise<void>((resolve, reject) => {
        socket.connect(
          accessToken,
          targetGroupId,
          displayName ?? 'Someone',
          targetCallType,
          {
            onPeerJoined: (data) => upsertParticipant(data.peerId, { displayName: data.displayName }),
            onPeerLeft: (data) => {
              setParticipants((prev) => {
                const next = new Map(prev);
                next.delete(data.peerId);
                return next;
              });
            },
            onNewProducer: (data) => {
              void consumeProducer(data.peerId, data.displayName, data.producerId, data.kind);
            },
            onProducerClosed: (data) => {
              const peerId = producerOwnerRef.current.get(data.producerId);
              producerOwnerRef.current.delete(data.producerId);
              if (!peerId) return;
              upsertParticipant(peerId, { audioTrack: null });
            },
          },
          resolve,
          (reason) => {
            console.warn('[GroupCallContext] signaling disconnected', reason);
            if (groupCallState !== 'idle') resetState();
          }
        );
        setTimeout(() => reject(new Error('Connection timed out')), 10000);
      });

      const capsResponse = await socket.request('getRouterRtpCapabilities');
      const device = new Device();
      await device.load({ routerRtpCapabilities: capsResponse.rtpCapabilities as Parameters<Device['load']>[0]['routerRtpCapabilities'] });
      deviceRef.current = device;

      const sendTransportResponse = await socket.request('createWebRtcTransport', { direction: 'send' });
      const sendTransport = device.createSendTransport({
        ...(sendTransportResponse as unknown as TransportOptions),
        iceServers: ICE_SERVERS,
      });
      sendTransportRef.current = sendTransport;
      sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
        socket.request('connectWebRtcTransport', { transportId: sendTransport.id, dtlsParameters }).then(() => callback()).catch(errback);
      });
      sendTransport.on('produce', ({ kind, rtpParameters }, callback, errback) => {
        socket
          .request('produce', { transportId: sendTransport.id, kind, rtpParameters })
          .then((data) => callback({ id: data.id as string }))
          .catch(errback);
      });

      const recvTransportResponse = await socket.request('createWebRtcTransport', { direction: 'recv' });
      const recvTransport = device.createRecvTransport({
        ...(recvTransportResponse as unknown as TransportOptions),
        iceServers: ICE_SERVERS,
      });
      recvTransportRef.current = recvTransport;
      recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
        socket.request('connectWebRtcTransport', { transportId: recvTransport.id, dtlsParameters }).then(() => callback()).catch(errback);
      });

      const stream = await mediaDevices.getUserMedia({ audio: true, video: targetCallType === 'VIDEO' });
      localStreamRef.current = stream;
      setLocalStream(stream);

      // mediasoup-client's ProducerOptions.track is typed against the DOM lib's
      // MediaStreamTrack (addEventListener/removeEventListener/etc.), which
      // react-native-webrtc's own MediaStreamTrack class doesn't structurally
      // match even though it's functionally what mediasoup-client's
      // ReactNative handler actually expects at runtime (same class of gap
      // CallContext.tsx already documents for RTCPeerConnection's own event
      // typing) — cast, not a real type mismatch.
      for (const track of stream.getAudioTracks()) {
        const producer = await sendTransport.produce({ track: track as unknown as globalThis.MediaStreamTrack });
        producersRef.current.push(producer);
      }
      if (targetCallType === 'VIDEO') {
        for (const track of stream.getVideoTracks()) {
          // Basic simulcast (see backend/sfu-service's mediasoupConfig.ts
          // comment) so weaker-connection participants get a lower layer
          // instead of everyone being forced to the sender's own bitrate.
          const producer = await sendTransport.produce({
            track: track as unknown as globalThis.MediaStreamTrack,
            encodings: [
              { maxBitrate: 100_000, scalabilityMode: 'S1T3' },
              { maxBitrate: 300_000, scalabilityMode: 'S1T3' },
              { maxBitrate: 900_000, scalabilityMode: 'S1T3' },
            ],
          });
          producersRef.current.push(producer);
        }
      }

      const existing = await socket.request('getExistingProducers');
      const existingProducers = (existing.producers as Array<{ peerId: string; displayName: string; producerId: string; kind: 'audio' | 'video' }>) ?? [];
      for (const p of existingProducers) {
        await consumeProducer(p.peerId, p.displayName, p.producerId, p.kind);
      }

      if (memberIdsToInvite && memberIdsToInvite.length > 0) {
        socket
          .request('notifyInvite', { memberIds: memberIdsToInvite, callerName: displayName ?? 'Someone', callType: targetCallType })
          .catch((e) => console.warn('[GroupCallContext] notifyInvite failed', e));
      }

      setSpeakerphoneEnabled(targetCallType === 'VIDEO');
      setGroupCallState('in-call');
    },
    [accessToken, consumeProducer, displayName, groupCallState, resetState, upsertParticipant, userId]
  );

  const startGroupCall = useCallback(
    (targetGroupId: string, targetGroupName: string, memberIds: string[], targetCallType: GroupCallType) =>
      doJoin(targetGroupId, targetGroupName, targetCallType, memberIds),
    [doJoin]
  );

  const joinGroupCall = useCallback(
    (targetGroupId: string, targetGroupName: string, targetCallType: GroupCallType) =>
      doJoin(targetGroupId, targetGroupName, targetCallType, null),
    [doJoin]
  );

  const leaveGroupCall = useCallback(() => {
    resetState();
  }, [resetState]);

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

  // Teardown on unmount (e.g. sign-out) — not on every render, deliberately empty deps.
  useEffect(() => {
    return () => {
      resetState();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: GroupCallContextValue = {
    groupCallState,
    groupId,
    groupName,
    callType,
    localStream,
    participants: [...participants.values()],
    isMuted,
    isCameraOff,
    startGroupCall,
    joinGroupCall,
    leaveGroupCall,
    toggleMute,
    toggleCamera,
  };

  return <GroupCallContext.Provider value={value}>{children}</GroupCallContext.Provider>;
}
