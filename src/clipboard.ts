// Copy and paste of images.
//
// Paste (Ctrl/Cmd+V) turns whatever picture is on the clipboard into an image
// node: a marmerlade image node copied earlier (exact size and label), an image
// file (screenshot, "Copy image"), an <img> from a copied web page, or a bare
// image URL. Copy (Ctrl/Cmd+C) puts a selected image node on the clipboard as
// HTML carrying the node, plain text, and, where the browser allows, a PNG so
// other apps get the picture itself.

import type { NodeImage } from './types.ts';
import { asImageSrc, isDataUri, looksLikeImageUrl, readImageFile, sizedImage } from './imageUpload.ts';

/** what a pasted picture becomes */
export interface ClipImage {
  image: NodeImage;
  label: string;
}

/** marks an <img> as a copied marmerlade node; holds the node minus its src */
const MF_ATTR = 'data-marmerlade';

const escAttr = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The HTML an image node is copied as. */
export function imageNodeHtml(image: NodeImage, label: string): string {
  const { src, ...rest } = image;
  const meta = escAttr(JSON.stringify({ image: rest, label }));
  return `<img src="${escAttr(src)}" alt="${escAttr(label)}" ${MF_ATTR}="${meta}">`;
}

/**
 * The clipboard's picture candidates, read synchronously: a DataTransfer is
 * emptied once the paste event returns. Null when it holds no picture, so
 * ordinary text pastes are left alone.
 */
export interface ClipSnapshot {
  html: string;
  text: string;
  files: File[];
}
const hasPicture = ({ html, text, files }: ClipSnapshot) =>
  files.length > 0 || /<img\b/i.test(html) || looksLikeImageUrl(text);

export function snapshotClipboard(data: DataTransfer): ClipSnapshot | null {
  const clip = {
    html: data.getData('text/html'),
    text: data.getData('text/plain').trim(),
    files: [...data.files].filter((f) => f.type.startsWith('image/')),
  };
  return hasPicture(clip) ? clip : null;
}

/**
 * Read the system clipboard on demand (a toolbar button rather than a paste
 * event). Throws when the browser blocks clipboard access.
 */
export async function readSystemClipboard(): Promise<ClipSnapshot | null> {
  if (!navigator.clipboard?.read) throw new Error('this browser can’t read the clipboard here');
  const clip: ClipSnapshot = { html: '', text: '', files: [] };
  for (const item of await navigator.clipboard.read()) {
    for (const type of item.types) {
      const blob = await item.getType(type);
      if (type.startsWith('image/')) clip.files.push(new File([blob], 'clipboard', { type }));
      else if (type === 'text/html') clip.html ||= await blob.text();
      else if (type === 'text/plain') clip.text ||= (await blob.text()).trim();
    }
  }
  return hasPicture(clip) ? clip : null;
}

/** Turn a clipboard snapshot into the image nodes to create (may be empty). */
export async function imagesFromClipboard(clip: ClipSnapshot): Promise<ClipImage[]> {
  const img = clip.html ? new DOMParser().parseFromString(clip.html, 'text/html').querySelector('img') : null;
  const src = img?.getAttribute('src') ?? '';

  // 1. a node copied from marmerlade comes back exactly as it was
  const meta = img?.getAttribute(MF_ATTR);
  if (meta && asImageSrc(src)) {
    try {
      const m = JSON.parse(meta) as { image?: Omit<NodeImage, 'src'>; label?: string };
      return [{ image: { ...m.image, src }, label: m.label ?? '' }];
    } catch {
      // malformed: fall through to the picture itself
    }
  }
  // 2. image files: what the user actually sees (screenshots, "Copy image")
  if (clip.files.length > 0) {
    return Promise.all(clip.files.map(async (f) => ({ image: await readImageFile(f), label: '' })));
  }
  // 3. an <img> from a copied web page, then 4. a bare image URL
  const url = asImageSrc(src) ?? (looksLikeImageUrl(clip.text) ? asImageSrc(clip.text) : null);
  return url ? [{ image: await sizedImage(url), label: '' }] : [];
}

/** Render `src` to a PNG blob (fails for cross-origin images without CORS). */
async function pngBlob(src: string): Promise<Blob> {
  const img = new Image();
  if (!isDataUri(src)) img.crossOrigin = 'anonymous';
  img.src = src;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext('2d')!.drawImage(img, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('could not encode png'))), 'image/png'),
  );
}

/** Put an image node on the clipboard from inside a `copy` event. */
export function copyImageNode(e: ClipboardEvent, image: NodeImage, label: string) {
  const html = imageNodeHtml(image, label);
  // an embedded image's text form would be a wall of base64; use the label
  const text = isDataUri(image.src) ? label || 'image' : image.src;
  e.preventDefault();
  e.clipboardData?.setData('text/html', html);
  e.clipboardData?.setData('text/plain', text);
  // also offer the picture itself to other apps. This async write replaces
  // the data above only if it succeeds, so a CORS-blocked image still copies.
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return;
  navigator.clipboard
    .write([
      new ClipboardItem({
        'image/png': pngBlob(image.src),
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      }),
    ])
    .catch(() => {});
}
