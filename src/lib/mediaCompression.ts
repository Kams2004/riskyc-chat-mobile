import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** Hard cap on anything sent as a chat attachment — large files slow everyone down and bloat device storage long after the chat moves on. */
export const MAX_MEDIA_BYTES = 200 * 1024 * 1024;

/** Longest edge an outgoing chat image is resized to — well above anything a phone screen or this app's media viewer actually needs, but small enough to meaningfully cut upload size/memory for anything larger (e.g. a modern phone's 12MP+ camera output). */
const MAX_IMAGE_DIMENSION = 1920;
const IMAGE_COMPRESS_QUALITY = 0.72;

/** Best-effort file size lookup for whenever the picker itself didn't report one (expo-image-picker/document-picker usually do, but not on every platform/asset type). Returns null rather than throwing — callers should treat null as "unknown size", not "too big". */
export async function statFileSize(uri: string): Promise<number | null> {
  try {
    const file = new File(uri);
    return file.exists ? file.size : null;
  } catch (e) {
    console.warn('[mediaCompression] failed to stat file size', uri, e);
    return null;
  }
}

export function exceedsMediaSizeLimit(bytes: number | null | undefined): boolean {
  return typeof bytes === 'number' && bytes > MAX_MEDIA_BYTES;
}

/**
 * Resizes (if larger than MAX_IMAGE_DIMENSION on its longest edge) and
 * re-compresses a picked image before it ever reaches the upload step —
 * run on every picked image, not just camera shots, since a gallery photo
 * can be just as large (a modern phone's camera roll is full of 4000px+,
 * multi-MB originals). Local-only (expo-image-manipulator runs entirely on
 * device, no network round trip), so this stays fast — a single resize+
 * re-encode pass is milliseconds to low-hundreds-of-ms even on a large
 * photo, nothing a user would perceive as a stall.
 *
 * Falls back to the original uri/size on any manipulation failure (a
 * corrupt/unusual source file, a manipulator edge case) — compression is a
 * size optimization, never something that should block a send that would
 * otherwise have worked fine uncompressed.
 */
export async function compressImageForSend(
  uri: string,
  knownWidth?: number | null,
  knownHeight?: number | null
): Promise<{ uri: string; size: number | null }> {
  try {
    const needsResize =
      typeof knownWidth === 'number' && typeof knownHeight === 'number'
        ? Math.max(knownWidth, knownHeight) > MAX_IMAGE_DIMENSION
        : true; // Unknown dimensions — resize is a no-op (capped, not upscaled) if the image is already smaller.

    const context = ImageManipulator.manipulate(uri);
    if (needsResize) {
      const isLandscape = !knownHeight || (knownWidth ?? 0) >= knownHeight;
      context.resize(isLandscape ? { width: MAX_IMAGE_DIMENSION } : { height: MAX_IMAGE_DIMENSION });
    }
    const rendered = await context.renderAsync();
    const result = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: IMAGE_COMPRESS_QUALITY });
    const size = await statFileSize(result.uri);
    return { uri: result.uri, size };
  } catch (e) {
    console.warn('[mediaCompression] image compression failed, sending original', uri, e);
    return { uri, size: await statFileSize(uri) };
  }
}
