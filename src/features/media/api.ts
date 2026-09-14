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
export async function uploadToPresignedUrl(uploadUrl: string, fileUri: string, contentType: string) {
  const file = new File(fileUri);
  const response = await file.upload(uploadUrl, { httpMethod: 'PUT', mimeType: contentType });
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
