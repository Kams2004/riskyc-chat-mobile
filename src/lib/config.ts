/**
 * Base URLs for the backend services (see /backend). Each is a separate
 * Spring Boot service, reached through chat.riskycfashion.com's nginx —
 * see backend/nginx-chat.riskycfashion.com.conf's own path table
 * (/auth/, /messaging/, /media/, /presence/, /sfu/), which strips each
 * prefix and forwards the rest to that service's own root, exactly
 * matching the absolute /api/... paths every call site here already uses.
 *
 * Real HTTPS/WSS now that the domain's cert is fixed — this used to point
 * straight at the VPS's raw IP:port over plain HTTP/WS (no TLS-terminating
 * proxy in front), which needed Android's cleartext-traffic block worked
 * around via app.json's usesCleartextTraffic stopgap. That flag is now
 * only there for MinIO's own file-serving endpoint (RISKYC_MINIO_PUBLIC_ENDPOINT
 * on the VPS — deliberately NOT proxied here, see that nginx conf's own
 * comment), not for anything in this file — drop it too once that's HTTPS.
 *
 * EXPO_PUBLIC_* vars are inlined at build time by Metro and are visible in
 * the shipped app bundle, so never put secrets here, only base URLs. For
 * local backend development, copy .env.example to .env.local and point
 * these at localhost instead.
 */
export const config = {
  authServiceUrl: process.env.EXPO_PUBLIC_AUTH_SERVICE_URL ?? 'https://chat.riskycfashion.com/auth',
  messagingServiceUrl: process.env.EXPO_PUBLIC_MESSAGING_SERVICE_URL ?? 'https://chat.riskycfashion.com/messaging',
  mediaServiceUrl: process.env.EXPO_PUBLIC_MEDIA_SERVICE_URL ?? 'https://chat.riskycfashion.com/media',
  presenceServiceUrl: process.env.EXPO_PUBLIC_PRESENCE_SERVICE_URL ?? 'https://chat.riskycfashion.com/presence',
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
  sfuServiceUrl: process.env.EXPO_PUBLIC_SFU_SERVICE_URL ?? 'https://chat.riskycfashion.com/sfu',
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
  // Trailing slash matters here: nginx's `location /sfu/ { proxy_pass
  // http://127.0.0.1:8095/; }` only strips the /sfu/ prefix for requests
  // that actually match that trailing slash — a query string with no path
  // segment after /sfu (e.g. /sfu?token=...) doesn't match it at all.
  return `${base}/?${params.toString()}`;
}
