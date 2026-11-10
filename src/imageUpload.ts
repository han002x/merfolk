// Local image files -> embedded `data:` URIs for image nodes, and the size a
// new image node is drawn at.
//
// An embedded image lives inside the Mermaid text and the localStorage
// autosave (~5 MB, and `persist.ts` drops writes silently once it is full), so
// raster files are downscaled and re-encoded before they are embedded.

/** longest side, in px, of an embedded raster image */
export const EMBED_MAX_SIDE = 512;
/** largest data: URI we embed, in characters (~bytes) */
export const EMBED_MAX_CHARS = 200_000;

import type { NodeImage } from './types.ts';

/** longest side, in px, a new image node is drawn at (smaller images stay put) */
export const NEW_IMAGE_MAX = 128;

/** Node size for a picture of natural size `w` x `h`: aspect kept, longest side capped. */
export function fitImage(w: number, h: number, max = NEW_IMAGE_MAX): { w: number; h: number } {
  if (!(w > 0 && h > 0)) return { w: max, h: max };
  const scale = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(16, Math.round(w * scale)), h: Math.max(16, Math.round(h * scale)) };
}

/** Load `src` to learn its natural size; null when it can't load in time. */
function naturalSize(src: string, timeoutMs = 3000): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = window.setTimeout(() => resolve(null), timeoutMs);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    img.src = src;
  });
}

/** A new image node for `src`, sized to the picture when it loads. */
export async function sizedImage(src: string, max = NEW_IMAGE_MAX): Promise<NodeImage> {
  const size = await naturalSize(src);
  return size ? { src, ...fitImage(size.w, size.h, max) } : { src };
}

const readAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('could not read the file'));
    reader.readAsDataURL(blob);
  });

async function downscale(file: File): Promise<{ src: string; w: number; h: number }> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('not a readable image');
  });
  const natural = { w: bitmap.width, h: bitmap.height };
  const scale = Math.min(1, EMBED_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  // webp keeps transparency and is far smaller than png; browsers without a
  // webp encoder hand back png, which is still valid
  return { src: canvas.toDataURL('image/webp', 0.85), ...natural };
}

/**
 * Read an image file as an embedded image node (a data: URI, sized to the
 * picture with `max` as its longest side), or throw a readable error.
 */
export async function readImageFile(file: File, max = NEW_IMAGE_MAX): Promise<NodeImage> {
  if (!file.type.startsWith('image/')) throw new Error('not an image file');
  let image: NodeImage;
  if (file.type === 'image/svg+xml') {
    // vector art stays as-is: it is usually tiny and scales without loss
    image = await sizedImage(await readAsDataUrl(file), max);
  } else {
    const { src, w, h } = await downscale(file);
    image = { src, ...fitImage(w, h, max) };
  }
  if (image.src.length > EMBED_MAX_CHARS) {
    throw new Error(`image is too large to embed (${kb(image.src)} KB, max ${Math.round(EMBED_MAX_CHARS / 1024)} KB)`);
  }
  return image;
}

/** approximate size in KB of a data: URI (or any string) */
export const kb = (s: string) => Math.max(1, Math.round(s.length / 1024));

export const isDataUri = (src: string) => src.startsWith('data:');

/** Text that is plainly a picture: a data:image URI or a URL to an image file. */
export function looksLikeImageUrl(text: string): boolean {
  const src = asImageSrc(text);
  if (!src) return false;
  if (src.startsWith('data:')) return true;
  return /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i.test(new URL(src).pathname);
}

/** A usable image source typed by the user: an http(s) URL or a data: URI. */
export function asImageSrc(text: string): string | null {
  const t = text.trim();
  if (/^data:image\//i.test(t)) return t;
  try {
    const u = new URL(t);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}
