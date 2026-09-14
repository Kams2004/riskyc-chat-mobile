import { File } from 'expo-file-system';

import { config } from '../../lib/config';
import { apiFetch } from '../../lib/httpClient';

export type UploadUrlResponse = { objectKey: string; uploadUrl: string };
export type DownloadUrlResponse = { downloadUrl: string };

export function createUploadUrl(): Promise<UploadUrlResponse> {
  return apiFetch(`${config.mediaServiceUrl}/api/media/upload-url`, { method: 'POST' });
}

export function createDownloadUrl(objectKey: string): Promise<DownloadUrlResponse> {
  return apiFetch(`${config.mediaServiceUrl}/api/media/${objectKey}/download-url`);
}

/**
 * Uploads bytes directly to MinIO via the pre-signed URL — never through our
 * own servers. Deliberately NOT `fetch(fileUri).blob()` then `fetch(url, {
 * body: blob })`: that pattern is unreliable for local content:// URIs on
 * Android (expo-image-picker's own output) — it can silently "succeed" while
 * actually reading nothing useful, uploading a tiny error placeholder instead
 * of the image. File#upload() reads the local file directly and is the
 * platform-native upload path.
 */
const UPLOAD_TIMEOUT_MS = 30000;

export async function uploadToPresignedUrl(uploadUrl: string, fileUri: string, contentType: string) {
  const file = new File(fileUri);
  // File#upload() has no built-in timeout/cancellation, and a dropped
  // (vs. refused) port on the MinIO host produces no response at all — the
  // native upload would otherwise hang forever with no way for the caller's
  // spinner to ever resolve. Racing it against a timeout at least turns
  // that into a visible, retryable error instead of an infinite spin.
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Upload to ${uploadUrl} timed out after ${UPLOAD_TIMEOUT_MS / 1000}s`)), UPLOAD_TIMEOUT_MS)
  );
  const response = await Promise.race([file.upload(uploadUrl, { httpMethod: 'PUT', mimeType: contentType }), timeout]);
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Upload failed: ${response.status}`);
  }
}

/**
 * Uploads any locally-picked file (avatar photo, chat image/document/voice
 * note) and returns its MinIO object key — not avatar-specific despite the
 * name, kept for the existing avatar-upload call site.
 */
export async function uploadImage(localUri: string, contentType = 'image/jpeg'): Promise<string> {
  const { objectKey, uploadUrl } = await createUploadUrl();
  await uploadToPresignedUrl(uploadUrl, localUri, contentType);
  return objectKey;
}

/** Same as uploadImage, named for chat-attachment call sites (images, documents, voice notes). */
export const uploadMedia = uploadImage;
