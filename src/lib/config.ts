/**
 * Base URLs for the backend services (see /backend). Each is a separate
 * Spring Boot service behind its own port; put a single gateway/reverse-proxy
 * in front of them and collapse this to one host before shipping past the
 * MVP phase.
 *
 * Defaults point at the deployed VPS (167.86.120.214) so a fresh clone works
 * against the real backend without any setup. For local backend development,
 * copy .env.example to .env.local and point these at localhost instead —
 * EXPO_PUBLIC_* vars are inlined at build time by Metro and are visible in
 * the shipped app bundle, so never put secrets here, only base URLs.
 *
 * Plain HTTP/WS, not HTTPS/WSS: the VPS docker-compose exposes the Spring
 * Boot services directly with no TLS-terminating reverse proxy in front yet.
 * Traffic (including JWTs) is unencrypted on the wire until that's added.
 * Android additionally blocks cleartext HTTP by default (API 28+) — app.json
 * sets usesCleartextTraffic via expo-build-properties to allow it, which is
 * a stopgap for this pre-TLS deploy stage, not something to keep once a
 * reverse proxy with a real cert is in front of these services.
 *
 * Ports are 8091/8092 (not the "usual" 8081/8082) because the VPS already
 * runs other stacks (riskyc-backend, nguon-app, jitsi) on those — see
 * backend/docker-compose.yml's port defaults, which these must match.
 */
export const config = {
  authServiceUrl: process.env.EXPO_PUBLIC_AUTH_SERVICE_URL ?? 'http://167.86.120.214:8091',
  messagingServiceUrl: process.env.EXPO_PUBLIC_MESSAGING_SERVICE_URL ?? 'http://167.86.120.214:8092',
  mediaServiceUrl: process.env.EXPO_PUBLIC_MEDIA_SERVICE_URL ?? 'http://167.86.120.214:8083',
  presenceServiceUrl: process.env.EXPO_PUBLIC_PRESENCE_SERVICE_URL ?? 'http://167.86.120.214:8084',
  /**
   * Self-hosted TURN relay (see backend/docker-compose.yml's coturn
   * service) — public STUN alone frequently can't find a working P2P media
   * path once caller/callee are on genuinely different networks (mobile
   * data behind carrier-grade NAT is the classic failure: the call
   * "connects" at the signaling layer, but no audio/video ever arrives).
   * Static credential, matching coturn's config — see that file's comment
   * for why a long-lived one is an acceptable tradeoff for now.
   */
  turnServerUrl: process.env.EXPO_PUBLIC_TURN_SERVER_URL ?? 'turn:167.86.120.214:3478',
  turnUsername: process.env.EXPO_PUBLIC_TURN_USERNAME ?? 'riskyc',
  turnCredential: process.env.EXPO_PUBLIC_TURN_CREDENTIAL ?? 'riskyc-turn-secret',
  /**
   * The deployed web app's public domain (see web/README.md) — its /invite
   * page is what "Invite a friend" shares a link to. Deliberately the real
   * domain, not the raw VPS IP:port every other URL in this file uses —
   * an invite link is meant to be shared/clicked by someone who has never
   * touched this app before, so it needs to look trustworthy and survive
   * the VPS's IP ever changing.
   */
  webAppUrl: process.env.EXPO_PUBLIC_WEB_APP_URL ?? 'https://chat.riskycfashion.com',
  /** Group-calling SFU (backend/sfu-service) — separate service/port from messaging-service's 1:1 call signaling. */
  sfuServiceUrl: process.env.EXPO_PUBLIC_SFU_SERVICE_URL ?? 'http://167.86.120.214:8095',
} as const;

/**
 * WebSocket has no way to attach a custom Authorization header at handshake
 * time, so the access token — when the caller has one — rides along as a
 * query param instead; messaging-service's WebSocketAuthInterceptor reads it
 * from there to attach a Principal to the session.
 */
export function messagingWebSocketUrl(accessToken?: string | null): string {
  const base = `${config.messagingServiceUrl.replace(/^http/, 'ws')}/ws`;
  return accessToken ? `${base}?token=${encodeURIComponent(accessToken)}` : base;
}

/**
 * sfu-service's protoo-wire signaling endpoint — auth + room-join all happen
 * in this one handshake (see backend/sfu-service/src/signaling/protooServer.ts),
 * unlike messagingWebSocketUrl which only carries the token.
 */
export function sfuWebSocketUrl(
  accessToken: string | null | undefined,
  groupId: string,
  displayName: string,
  callType: 'AUDIO' | 'VIDEO'
): string {
  const base = config.sfuServiceUrl.replace(/^http/, 'ws');
  const params = new URLSearchParams({
    token: accessToken ?? '',
    groupId,
    displayName,
    callType,
  });
  return `${base}?${params.toString()}`;
}
