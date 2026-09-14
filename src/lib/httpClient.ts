import { session } from './secureStore';

/**
 * Thin fetch wrapper shared by every feature module's api.ts. Attaches the
 * bearer token when one exists in SecureStore and throws on non-2xx so
 * callers can just await + catch instead of checking res.ok everywhere.
 */
export async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const stored = await session.load();
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (stored?.accessToken) {
    headers.set('Authorization', `Bearer ${stored.accessToken}`);
  }

  const response = await fetch(url, { ...init, headers });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Request to ${url} failed: ${response.status} ${text}`);
  }
  // Empty-body success responses (202 Accepted, 204 No Content, ...) have
  // nothing for JSON.parse to read — response.json() throws on those.
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}
