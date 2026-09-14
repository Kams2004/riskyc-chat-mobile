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
