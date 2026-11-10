// Toolbar button + popover for image nodes: a URL, an uploaded file, or what
// is on the clipboard. Each arms the image for placement like a shape tool;
// Ctrl/Cmd+V on the canvas skips the popover and drops it straight away.
import { useRef, useState } from 'react';
import type { NodeImage } from '../types';
import { asImageSrc, readImageFile, sizedImage } from '../imageUpload';
import { imagesFromClipboard, readSystemClipboard } from '../clipboard';
import { Icon } from './Icon';
import { usePopover, type Placement } from './ShapePicker';

const PASTE_KEY = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘V' : 'Ctrl+V';

export function ImagePicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (p: Placement) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  usePopover(open, onOpenChange, wrap);

  const pick = (p: Placement) => {
    onOpenChange(false);
    onPick(p);
  };

  return (
    <div className="mf-menu-wrap" ref={wrap}>
      <button
        className={open ? 'mf-tool is-active' : 'mf-tool'}
        aria-label="Image"
        aria-expanded={open}
        title="Image  ·  I"
        onClick={() => onOpenChange(!open)}
      >
        <Icon name="image" />
      </button>
      {open && <ImagePanel onPick={pick} />}
    </div>
  );
}

/** The open popover: mounted fresh on every open, so it starts empty. */
function ImagePanel({ onPick }: { onPick: (p: Placement) => void }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const place = (image: NodeImage) => onPick({ shape: 'rect', image });
  // run one source at a time, turning failures into the inline message
  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitUrl = () =>
    run(async () => {
      const src = asImageSrc(url);
      if (!src) throw new Error('enter an http(s) image URL');
      place(await sizedImage(src));
    });

  const pasteClipboard = () =>
    run(async () => {
      const clip = await readSystemClipboard().catch(() => {
        throw new Error(`clipboard access was blocked; press ${PASTE_KEY} on the canvas instead`);
      });
      const [first] = clip ? await imagesFromClipboard(clip) : [];
      if (!first) throw new Error('no image on the clipboard');
      place(first.image);
    });

  return (
    <div className="mf-menu mf-image-picker">
      <input
        autoFocus
        className="mf-picker-filter"
        placeholder="Paste image URL…"
        aria-label="Image URL"
        value={url}
        onChange={(e) => {
          setUrl(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submitUrl();
        }}
      />
      <button className="mf-menu-item" disabled={busy} onClick={() => file.current?.click()}>
        <Icon name="import" />
        Upload file…
      </button>
      <button className="mf-menu-item" disabled={busy} onClick={pasteClipboard}>
        <Icon name="image" />
        From clipboard
      </button>
      <input
        ref={file}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) run(async () => place(await readImageFile(f)));
        }}
      />
      {error ? (
        <p className="mf-picker-error">{error}</p>
      ) : (
        <p className="mf-style-hint">Tip: {PASTE_KEY} on the canvas pastes an image right away.</p>
      )}
    </div>
  );
}
