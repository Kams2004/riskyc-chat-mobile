import { session } from './secureStore';

const REQUEST_TIMEOUT_MS = 20000;

/**
 * A dropped/firewalled port produces no response at all — no error, no
 * refused connection, nothing — so plain fetch() just hangs forever with no
 * way for the UI to know anything went wrong (this is what a stuck "Save"
 * spinner turned out to be: the request itself never settled). AbortController
 * turns that into an actual rejection after a bounded wait, so every caller's
 * existing catch block gets a chance to run instead of spinning indefinitely.
 */
export async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const stored = await session.load();
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (stored?.accessToken) {
    headers.set('Authorization', `Bearer ${stored.accessToken}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, { ...init, headers, signal: controller.signal });
  } catch (e) {
    if (controller.signal.aborted) {
      throw new Error(`Request to ${url} timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
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
